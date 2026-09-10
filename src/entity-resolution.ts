/**
 * Cross-session entity resolution for name-keyed, session-scoped entity URNs.
 *
 * The memorybench extraction emitter mints session-scoped URNs such as
 * `urn:person:{sessionId}/melanie`. Across sessions, "the same Melanie"
 * produces distinct URNs, and aliases ("Mel" vs "Melanie", "Harborview" vs
 * "Harborview Medical Center") defeat string-keyed identity entirely. This
 * module provides the resolution layer:
 *
 * 1. {@linkcode EntityResolver.resolve} — map a candidate (name + optional
 *    embedding + class + home session) to a canonical entity ID, absorbing
 *    it into the store as a new canonical entity when no existing one clears
 *    the match threshold.
 * 2. {@linkcode EntityResolver.link} — record typed co-reference edges
 *    (skos:exactMatch | skos:closeMatch) between session-scoped URNs and
 *    canonical IDs so graphs stay queryable both ways.
 * 3. {@linkcode createResolveEntityTool} (entity-resolution-tool.ts) — a
 *    Vercel AI SDK tool exposing lookup/merge/stats to agents.
 *
 * Matching is embedding cosine similarity when an embedding is supplied,
 * falling back to normalized string containment — cheap, deterministic, and
 * safe defaults for a layer consumers can tighten with their own store.
 *
 * Deterministic guards run before similarity so high-dimensional vectors
 * cannot silently merge distinct real-world entities:
 * - `classGuard`: Person never merges with Organization, etc.
 * - `sameSessionGuard`: two distinct URNs minted inside one extraction
 *   session are different entities by construction, never merged.
 */

/** Embedding function contract satisfied by Worlds/OpenAI embedding services. */
export type EmbeddingFn = (input: string) => Promise<number[]>;

export type CanonicalIdGenerator = () => string;

/** Optional deterministic guards evaluated before any similarity scoring. */
export interface EntityResolverOptions {
  /** Cosine threshold above which two candidates are the same entity (0–1). */
  threshold?: number;
  /**
   * Normalized string-containment score for the no-embedding fallback.
   * Must be >= threshold for containment matches to merge; defaults to
   * 0.9 so alias containment ("Harborview" ⊂ "Harborview Medical Center")
   * passes the default 0.9 resolution gate.
   */
  stringThreshold?: number;
  /** Co-ref predicate for confirmed merges (default skos:exactMatch). */
  exactMatchIri?: string;
  /** Co-ref predicate for near matches (default skos:closeMatch). */
  closeMatchIri?: string;
  /** Generates a fresh canonical identifier. IDs are never derived from mutable entity attributes. */
  canonicalIdGenerator?: CanonicalIdGenerator;
}

export interface EntityInput {
  /** Display name of the candidate entity ("Melanie", "Harborview"). */
  name: string;
  /** Entity class IRI (schema:Person, schema:Organization, …). */
  classIri?: string;
  /** Precomputed embedding for the name; resolution falls back to strings. */
  embedding?: number[];
  /** Session-scoped URN this candidate was minted under, if any. */
  scopedUrn?: string;
  /** Session the candidate was extracted from (sameSessionGuard input). */
  sessionId?: string;
  /** Free-form provider metadata persisted verbatim on the entity. */
  metadata?: Record<string, unknown>;
}

export interface ResolvedEntity {
  /** Stable canonical ID generated once and persisted with the entity. */
  id: string;
  /** Best-known display name for the canonical entity. */
  name: string;
  /** Entity class IRI, when known. */
  classIri?: string;
  /** true when an existing canonical entity absorbed this candidate. */
  matched: boolean;
  /** Cosine/string score of the match; undefined for brand-new entities. */
  score?: number;
  /** skos predicate IRI recorded for the co-reference edge, if any. */
  matchPredicate?: string;
}

/** Durable canonical entity record used by graph-backed stores. */
export interface StoredEntity {
  id: string;
  name: string;
  classIri?: string;
  embedding?: number[];
  /** Normalized alias -> scoped URN or canonical ID. */
  aliases: Map<string, string>;
  /** Session IDs this entity was observed in. */
  sessions: Set<string>;
  metadata?: Record<string, unknown>;
}

export interface EntityStore {
  get(id: string): Promise<StoredEntity | undefined>;
  put(entity: StoredEntity): Promise<void>;
  /** All stored entities (implementations may page; correctness > scale here). */
  list(): Promise<StoredEntity[]>;
  /** Persist a typed co-reference edge when the store supports graph links. */
  recordLink?(
    canonicalId: string,
    scopedUrn: string,
    predicateIri: string,
  ): Promise<void>;
}

/** In-memory EntityStore — default for tests and single-process usage. */
export class InMemoryEntityStore implements EntityStore {
  #entities = new Map<string, StoredEntity>();

  get(id: string): Promise<StoredEntity | undefined> {
    return Promise.resolve(this.#entities.get(id));
  }

  put(entity: StoredEntity): Promise<void> {
    this.#entities.set(entity.id, entity);
    return Promise.resolve();
  }

  list(): Promise<StoredEntity[]> {
    return Promise.resolve([...this.#entities.values()]);
  }
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Cosine similarity of two equal- or different-length numeric vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class EntityResolver {
  readonly #store: EntityStore;
  readonly #options: Required<EntityResolverOptions>;

  constructor(
    store: EntityStore = new InMemoryEntityStore(),
    options?: EntityResolverOptions,
  ) {
    this.#store = store;
    this.#options = {
      threshold: options?.threshold ?? 0.9,
      stringThreshold: options?.stringThreshold ?? 0.9,
      exactMatchIri: options?.exactMatchIri ??
        "http://www.w3.org/2004/02/skos/core#exactMatch",
      closeMatchIri: options?.closeMatchIri ??
        "http://www.w3.org/2004/02/skos/core#closeMatch",
      canonicalIdGenerator: options?.canonicalIdGenerator ??
        (() => `urn:entity:${crypto.randomUUID()}`),
    };
  }

  /**
   * Resolve a candidate to a canonical entity ID. When a stored entity
   * clears the deterministic guards and the similarity threshold, the
   * candidate is absorbed (name kept as an alias, scoped URN linked);
   * otherwise a new canonical entity is minted with a content-hash ID.
   */
  async resolve(input: EntityInput): Promise<ResolvedEntity> {
    const normalized = normalizeName(input.name);
    if (!normalized) throw new Error("EntityInput.name must be non-empty");

    let best: { entity: StoredEntity; score: number } | undefined;

    for (const entity of await this.#store.list()) {
      if (
        input.classIri && entity.classIri && input.classIri !== entity.classIri
      ) {
        continue; // classGuard: never merge across schema classes
      }
      if (
        input.sessionId && entity.sessions.size === 1 &&
        entity.sessions.has(input.sessionId)
      ) {
        continue; // sameSessionGuard: one session never holds two entities
      }

      let score: number | undefined;
      if (input.embedding && entity.embedding) {
        score = cosineSimilarity(input.embedding, entity.embedding);
      } else {
        const a = normalized;
        const b = normalizeName(entity.name);
        score = a === b
          ? 1
          : a.includes(b) || b.includes(a)
          ? this.#options.stringThreshold
          : undefined;
      }
      if (score === undefined || score < this.#options.threshold) continue;
      if (!best || score > best.score) best = { entity, score };
    }

    if (best) {
      const { entity, score } = best;
      if (input.embedding && !entity.embedding) {
        entity.embedding = input.embedding;
      }
      if (input.classIri && !entity.classIri) entity.classIri = input.classIri;
      if (input.sessionId) entity.sessions.add(input.sessionId);
      if (input.scopedUrn) entity.aliases.set(normalized, input.scopedUrn);
      const predicate = score >= 0.99
        ? this.#options.exactMatchIri
        : this.#options.closeMatchIri;
      await this.#store.put(entity);
      if (input.scopedUrn && this.#store.recordLink) {
        await this.#store.recordLink(entity.id, input.scopedUrn, predicate);
      }
      return {
        id: entity.id,
        name: entity.name,
        classIri: entity.classIri,
        matched: true,
        score,
        matchPredicate: predicate,
      };
    }

    // No stored entity cleared the guards, so this candidate is a NEW
    // canonical entity even if a same-named one exists (different class,
    // or same name with a divergent embedding). Generate a fresh ID rather
    // than deriving one from mutable names or ontology attributes.
    const baseId = this.#options.canonicalIdGenerator();
    let id = baseId;
    for (let n = 2; await this.#store.get(id); n++) {
      id = `${baseId}:${n}`;
    }
    const entity: StoredEntity = {
      id,
      name: input.name.trim(),
      classIri: input.classIri,
      embedding: input.embedding,
      aliases: new Map(),
      sessions: new Set(input.sessionId ? [input.sessionId] : []),
      metadata: input.metadata,
    };
    if (input.scopedUrn) entity.aliases.set(normalized, input.scopedUrn);
    await this.#store.put(entity);
    if (input.scopedUrn && this.#store.recordLink) {
      await this.#store.recordLink(
        entity.id,
        input.scopedUrn,
        this.#options.exactMatchIri,
      );
    }
    return { id, name: entity.name, classIri: entity.classIri, matched: false };
  }

  /**
   * Record a co-reference edge between a session-scoped URN and the
   * canonical entity it resolves to, using the skos predicate matching the
   * confidence. Returns the canonical ID.
   */
  async link(
    canonicalId: string,
    scopedUrn: string,
    confidence: number,
  ): Promise<string> {
    const entity = await this.#store.get(canonicalId);
    if (!entity) throw new Error(`Unknown canonical entity: ${canonicalId}`);
    entity.aliases.set(normalizeName(entity.name), scopedUrn);
    await this.#store.put(entity);
    const predicate = confidence >= 0.99
      ? this.#options.exactMatchIri
      : this.#options.closeMatchIri;
    if (this.#store.recordLink) {
      await this.#store.recordLink(canonicalId, scopedUrn, predicate);
    }
    return predicate;
  }

  /** Lookup a canonical entity by ID, including its alias table. */
  async lookup(
    id: string,
  ): Promise<{ id: string; name: string; aliases: string[] } | undefined> {
    const entity = await this.#store.get(id);
    if (!entity) return undefined;
    return {
      id: entity.id,
      name: entity.name,
      aliases: [...entity.aliases.keys()],
    };
  }

  /** Merge two canonical entities; the surviving ID is the first argument. */
  async merge(sourceId: string, targetId: string): Promise<string> {
    if (sourceId === targetId) return sourceId;
    const source = await this.#store.get(sourceId);
    const target = await this.#store.get(targetId);
    if (!source || !target) {
      throw new Error(
        `merge requires both entities to exist: ${sourceId}, ${targetId}`,
      );
    }
    for (const [alias, urn] of target.aliases) {
      source.aliases.set(alias, urn);
    }
    for (const session of target.sessions) {
      source.sessions.add(session);
    }
    await this.#store.put(source);
    return sourceId;
  }

  /** Summary statistics for the resolver tool. */
  async stats(): Promise<{ entities: number; aliased: number }> {
    const all = await this.#store.list();
    return {
      entities: all.length,
      aliased: all.filter((e) => e.aliases.size > 0).length,
    };
  }
}
