import type { WorldsSdkInterface } from "@worlds/sdk";
import type { EntityResolver } from "./entity-resolution.ts";
import type { WorldsTool } from "./tool-result.ts";
import { createExecuteSparqlTool } from "./sparql.ts";
import type { ExecuteSparqlInput } from "./sparql.ts";
import { createSearchWorldTool } from "./search.ts";
import type { SearchToolInput } from "./search.ts";
import { createImportRdfTool } from "./import.ts";
import type { ImportRdfInput } from "./import.ts";
import { createExportRdfTool } from "./export.ts";
import type { ExportRdfInput } from "./export.ts";
import { createReindexWorldTool } from "./reindex.ts";
import type { ReindexWorldInput } from "./reindex.ts";
import { createResolveEntityTool } from "./entity-resolution-tool.ts";
import type { ResolveEntityInput } from "./entity-resolution-tool.ts";

export { createExecuteSparqlTool } from "./sparql.ts";
export { createSearchWorldTool } from "./search.ts";
export { createImportRdfTool } from "./import.ts";
export { createExportRdfTool } from "./export.ts";
export { createReindexWorldTool } from "./reindex.ts";
export { createResolveEntityTool } from "./entity-resolution-tool.ts";
export { WorldsEntityStore } from "./worlds-entity-store.ts";
export {
  cosineSimilarity,
  EntityResolver,
  InMemoryEntityStore,
  normalizeName,
} from "./entity-resolution.ts";
export type {
  CanonicalIdGenerator,
  EmbeddingFn,
  EntityInput,
  EntityResolverOptions,
  EntityStore,
  ResolvedEntity,
  StoredEntity,
} from "./entity-resolution.ts";
export * from "./descriptions.ts";

export interface CreateToolsConfig {
  client?: WorldsSdkInterface;
  sparqlOptions?: { allowUpdates?: boolean };
  entityResolver?: EntityResolver;
}

export interface RecallToolsResult {
  executeSparql: WorldsTool<ExecuteSparqlInput>;
  searchWorld: WorldsTool<SearchToolInput>;
}

export interface IngestToolsResult {
  executeSparql: WorldsTool<ExecuteSparqlInput>;
  importRdf: WorldsTool<ImportRdfInput>;
  exportRdf: WorldsTool<ExportRdfInput>;
  resolveEntity?: WorldsTool<ResolveEntityInput>;
}

export interface AdministrativeToolsResult {
  executeSparql: WorldsTool<ExecuteSparqlInput>;
  importRdf: WorldsTool<ImportRdfInput>;
  exportRdf: WorldsTool<ExportRdfInput>;
  reindexWorld: WorldsTool<ReindexWorldInput>;
  resolveEntity?: WorldsTool<ResolveEntityInput>;
}

export interface CreateToolsResult
  extends RecallToolsResult, IngestToolsResult, AdministrativeToolsResult {}

function requireClient(config: CreateToolsConfig): WorldsSdkInterface {
  if (!config.client) {
    throw new Error(
      "createTools requires a 'client' property of type WorldsSdkInterface.",
    );
  }
  return config.client;
}

function entityTool(config: CreateToolsConfig):
  | { resolveEntity: WorldsTool<ResolveEntityInput> }
  | Record<string, never> {
  return config.entityResolver
    ? { resolveEntity: createResolveEntityTool(config.entityResolver) }
    : {};
}

export function createTools(config: CreateToolsConfig): CreateToolsResult {
  const client = requireClient(config);
  const executeSparql = createExecuteSparqlTool(client, config.sparqlOptions);
  const searchWorld = createSearchWorldTool(client);
  const importRdf = createImportRdfTool(client);
  const exportRdf = createExportRdfTool(client);
  const reindexWorld = createReindexWorldTool(client);
  return {
    executeSparql,
    searchWorld,
    importRdf,
    exportRdf,
    reindexWorld,
    ...entityTool(config),
  };
}

export function createRecallTools(
  config: CreateToolsConfig,
): RecallToolsResult {
  const client = requireClient(config);
  return {
    executeSparql: createExecuteSparqlTool(client, { allowUpdates: false }),
    searchWorld: createSearchWorldTool(client),
  };
}

export function createIngestTools(
  config: CreateToolsConfig,
): IngestToolsResult {
  const client = requireClient(config);
  return {
    executeSparql: createExecuteSparqlTool(client, { allowUpdates: false }),
    importRdf: createImportRdfTool(client),
    exportRdf: createExportRdfTool(client),
    ...entityTool(config),
  };
}

export function createAdministrativeTools(
  config: CreateToolsConfig,
): AdministrativeToolsResult {
  const client = requireClient(config);
  return {
    executeSparql: createExecuteSparqlTool(client, {
      ...config.sparqlOptions,
      allowUpdates: config.sparqlOptions?.allowUpdates ?? true,
    }),
    importRdf: createImportRdfTool(client),
    exportRdf: createExportRdfTool(client),
    reindexWorld: createReindexWorldTool(client),
    ...entityTool(config),
  };
}
