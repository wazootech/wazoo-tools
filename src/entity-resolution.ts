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

import { InMemoryEntityStore, newEntity } from "./entity-store.ts";
import { withDefaults } from "./entity-options.ts";
import { findBestMatch } from "./entity-matching.ts";
import { normalizeName } from "./entity-similarity.ts";
import type {
  EntityInput,
  EntityResolverOptions,
  EntityStore,
  ResolvedEntity,
} from "./entity-types.ts";

export { InMemoryEntityStore } from "./entity-store.ts";
export { cosineSimilarity, normalizeName } from "./entity-similarity.ts";
export type {
  CanonicalIdGenerator,
  EmbeddingFn,
  EntityInput,
  EntityResolverOptions,
  EntityStore,
  ResolvedEntity,
  StoredEntity,
} from "./entity-types.ts";

export class EntityResolver {
  readonly #store: EntityStore;
  readonly #options: Required<EntityResolverOptions>;

  constructor(
    store: EntityStore = new InMemoryEntityStore(),
    options?: EntityResolverOptions,
  ) {
    this.#store = store;
    this.#options = withDefaults(options);
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

    const best = findBestMatch(
      await this.#store.list(),
      input,
      normalized,
      this.#options,
    );

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
    const entity = newEntity(id, input);
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
