import type { SparqlResponse } from "@worlds/sdk/sparql-engine";
import type { StoredEntity } from "./entity-types.ts";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SCHEMA = "http://schema.org/";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const IDENTITY = "https://wazoo.dev/identity#";

export const PREFIXES = [
  `@prefix rdf: <${RDF}> .`,
  `@prefix schema: <${SCHEMA}> .`,
  `@prefix skos: <${SKOS}> .`,
  `@prefix identity: <${IDENTITY}> .`,
].join("\n");

export function escapeLiteral(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

export function safeIri(value: string): string {
  if (!value || /[<>\s]/.test(value)) {
    throw new Error(`Invalid RDF IRI: ${value}`);
  }
  return `<${value}>`;
}

export type Binding = Record<string, { value?: string }>;

export function bindings(response: SparqlResponse): Binding[] {
  if (response.kind !== "select") return [];
  return (response as { kind: "select"; bindings?: Binding[] }).bindings ?? [];
}

export function value(binding: Binding, key: string): string | undefined {
  return binding[key]?.value;
}

export function entityFromBindings(id: string, rows: Binding[]): StoredEntity {
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
