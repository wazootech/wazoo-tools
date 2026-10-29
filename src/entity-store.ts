import type { EntityInput, EntityStore, StoredEntity } from "./entity-types.ts";

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

/** A brand-new canonical entity record for a candidate that matched nothing. */
export function newEntity(id: string, input: EntityInput): StoredEntity {
  return {
    id,
    name: input.name.trim(),
    classIri: input.classIri,
    embedding: input.embedding,
    aliases: new Map(),
    sessions: new Set(input.sessionId ? [input.sessionId] : []),
    metadata: input.metadata,
  };
}
