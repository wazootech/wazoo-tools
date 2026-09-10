import type { WorldsSdkInterface } from "@worlds/sdk";
import type { SparqlResponse } from "@worlds/sdk/sparql-engine";
import type { EntityStore, StoredEntity } from "./entity-resolution.ts";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA = "http://schema.org/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const IDENTITY = "https://wazoo.dev/identity#";

const PREFIXES = [
  `@prefix rdf: <${RDF}> .`,
  `@prefix schema: <${SCHEMA}> .`,
  `@prefix skos: <${SKOS}> .`,
  `@prefix identity: <${IDENTITY}> .`,
].join("\n");

function escapeLiteral(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

function safeIri(value: string): string {
  if (!value || /[<>\s]/.test(value)) {
    throw new Error(`Invalid RDF IRI: ${value}`);
  }
  return `<${value}>`;
}

type Binding = Record<string, { value?: string }>;

function bindings(response: SparqlResponse): Binding[] {
  if (response.kind !== "select") return [];
  return (response as { kind: "select"; bindings?: Binding[] }).bindings ?? [];
}

function value(binding: Binding, key: string): string | undefined {
  return binding[key]?.value;
}

function entityFromBindings(id: string, rows: Binding[]): StoredEntity {
  const first = rows[0] ?? {};
  const aliases = new Map<string, string>();
  const sessions = new Set<string>();
  for (const row of rows) {
    const alias = value(row, "alias");
    if (alias) aliases.set(alias, value(row, "aliasUrn") ?? "");
    const session = value(row, "session");
    if (session) sessions.add(session);
  }
  const embeddingJson = value(first, "embedding");
  const metadataJson = value(first, "metadata");
  let embedding: number[] | undefined;
  let metadata: Record<string, unknown> | undefined;
  try {
    if (embeddingJson) embedding = JSON.parse(embeddingJson);
    if (metadataJson) metadata = JSON.parse(metadataJson);
  } catch {
    throw new Error(`Invalid persisted identity metadata for ${id}`);
  }
  return {
    id,
    name: value(first, "name") ?? id,
    classIri: value(first, "class"),
    embedding,
    aliases,
    sessions,
    metadata,
  };
}

export class WorldsEntityStore implements EntityStore {
  constructor(private readonly client: WorldsSdkInterface) {}

  async get(id: string): Promise<StoredEntity | undefined> {
    const entity = safeIri(id);
    const response = await this.client.sparql({
      query:
        `${PREFIXES}\nSELECT ?name ?class ?alias ?aliasUrn ?session ?embedding ?metadata WHERE {
        ${entity} a identity:CanonicalEntity ; schema:name ?name .
        OPTIONAL { ${entity} a ?class . FILTER(?class != identity:CanonicalEntity) }
        OPTIONAL { ${entity} skos:altLabel ?alias . OPTIONAL { ${entity} identity:aliasUrn ?aliasUrn } }
        OPTIONAL { ${entity} identity:observedIn ?session }
        OPTIONAL { ${entity} identity:embeddingJson ?embedding }
        OPTIONAL { ${entity} identity:metadataJson ?metadata }
      }`,
    });
    const rows = bindings(response);
    return rows.length === 0 ? undefined : entityFromBindings(id, rows);
  }

  async list(): Promise<StoredEntity[]> {
    const response = await this.client.sparql({
      query:
        `${PREFIXES}\nSELECT ?entity WHERE { ?entity a identity:CanonicalEntity }`,
    });
    const ids = [
      ...new Set(bindings(response).map((row) => value(row, "entity"))),
    ]
      .filter((id): id is string => Boolean(id));
    const entities = await Promise.all(ids.map((id) => this.get(id)));
    return entities.filter((entity): entity is StoredEntity => Boolean(entity));
  }

  async put(entity: StoredEntity): Promise<void> {
    const lines = [
      `${safeIri(entity.id)} a identity:CanonicalEntity ; schema:name "${
        escapeLiteral(entity.name)
      }" .`,
    ];
    if (entity.classIri) {
      lines.push(`${safeIri(entity.id)} a ${safeIri(entity.classIri)} .`);
    }
    for (const [alias, scopedUrn] of entity.aliases) {
      lines.push(
        `${safeIri(entity.id)} skos:altLabel "${
          escapeLiteral(alias)
        }" ; identity:aliasUrn ${safeIri(scopedUrn || alias)} .`,
      );
    }
    for (const session of entity.sessions) {
      lines.push(
        `${safeIri(entity.id)} identity:observedIn "${
          escapeLiteral(session)
        }" .`,
      );
    }
    if (entity.embedding) {
      lines.push(
        `${safeIri(entity.id)} identity:embeddingJson "${
          escapeLiteral(JSON.stringify(entity.embedding))
        }" .`,
      );
    }
    if (entity.metadata) {
      lines.push(
        `${safeIri(entity.id)} identity:metadataJson "${
          escapeLiteral(JSON.stringify(entity.metadata))
        }" .`,
      );
    }
    await this.client.import({
      source: {
        kind: "serialized",
        data: `${PREFIXES}\n${lines.join("\n")}`,
        contentType: "text/turtle",
      },
    });
  }

  async recordLink(
    canonicalId: string,
    scopedUrn: string,
    predicateIri: string,
  ): Promise<void> {
    await this.client.import({
      source: {
        kind: "serialized",
        data: `${PREFIXES}\n${safeIri(scopedUrn)} ${safeIri(predicateIri)} ${
          safeIri(canonicalId)
        } .`,
        contentType: "text/turtle",
      },
    });
  }
}
