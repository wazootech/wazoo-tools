import { cosineSimilarity, normalizeName } from "./entity-similarity.ts";
import type {
  EntityInput,
  EntityResolverOptions,
  StoredEntity,
} from "./entity-types.ts";

export interface EntityMatch {
  entity: StoredEntity;
  score: number;
}

/** Best stored entity clearing the guards and threshold, if any. */
export function findBestMatch(
  entities: StoredEntity[],
  input: EntityInput,
  normalized: string,
  options: Required<EntityResolverOptions>,
): EntityMatch | undefined {
  let best: EntityMatch | undefined;
  for (const entity of entities) {
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
        ? options.stringThreshold
        : undefined;
    }
    if (score === undefined || score < options.threshold) continue;
    if (!best || score > best.score) best = { entity, score };
  }
  return best;
}
