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
