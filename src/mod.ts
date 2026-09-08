import type { WorldsSdkInterface } from "@worlds/sdk";
import type { EntityResolver } from "./entity-resolution.ts";
import type { WorldsTool } from "./tool-result.ts";
import { createExecuteSparqlTool } from "./sparql.ts";
import type { ExecuteSparqlInput } from "./sparql.ts";
import { createSearchWorldTool } from "./search.ts";
import type { SearchToolInput, SearchWorldOptions } from "./search.ts";
import { createDiscoverSchemaTool } from "./schema.ts";
import type { DiscoverSchemaInput } from "./schema.ts";
import { createImportRdfTool } from "./import.ts";
import type { ImportRdfInput } from "./import.ts";
import { createExportRdfTool } from "./export.ts";
import type { ExportRdfInput } from "./export.ts";
import { createResolveEntityTool } from "./entity-resolution-tool.ts";
import type { ResolveEntityInput } from "./entity-resolution-tool.ts";

export { createExecuteSparqlTool } from "./sparql.ts";
export { createSearchWorldTool } from "./search.ts";
export type { SearchWorldOptions, SearchWorldRerankOptions } from "./search.ts";
export {
  createDiscoverSchemaTool,
  type DiscoverSchemaOptions,
} from "./schema.ts";
export { createImportRdfTool } from "./import.ts";
export { createExportRdfTool } from "./export.ts";
export { createResolveEntityTool } from "./entity-resolution-tool.ts";

/**
 * CreateToolsConfig defines the configuration options for the AI SDK tools.
 */
export interface CreateToolsConfig {
  /**
   * client is the Worlds SDK client instance to use for all tools.
   */
  client?: WorldsSdkInterface;

  /**
   * sparqlOptions defines configuration overrides for the executeSparql tool.
   */
  sparqlOptions?: { allowUpdates?: boolean };

  /**
   * sources defines the list of graph URIs to introspect for the discoverSchema tool.
   */
  sources?: string[];

  /**
   * searchOptions defines configuration overrides for the searchWorld/searchEntities tools,
   * including optional two-stage retrieval (rerank) settings.
   */
  searchOptions?: SearchWorldOptions;

  /**
   * entityResolver defines the entity resolution layer to use for the resolveEntity tool.
   */
  entityResolver?: EntityResolver;
}

/**
 * CreateToolsResult is the tool set createTools returns. resolveEntity is
 * present only when config.entityResolver is supplied.
 */
export interface CreateToolsResult {
  executeSparql: WorldsTool<ExecuteSparqlInput>;
  searchWorld: WorldsTool<SearchToolInput>;
  searchEntities: WorldsTool<SearchToolInput>;
  discoverSchema: WorldsTool<DiscoverSchemaInput>;
  importRdf: WorldsTool<ImportRdfInput>;
  exportRdf: WorldsTool<ExportRdfInput>;
  resolveEntity?: WorldsTool<ResolveEntityInput>;
}

/**
 * createTools creates AI SDK compatible tools that interact with a Worlds SDK client.
 *
 * @param config The configuration for the tools.
 * @returns An object containing the AI SDK tools.
 */
export function createTools(config: CreateToolsConfig): CreateToolsResult {
  const client = config.client;
  if (!client) {
    throw new Error(
      "createTools requires a 'client' property of type WorldsSdkInterface.",
    );
  }

  return {
    executeSparql: createExecuteSparqlTool(client, config.sparqlOptions),
    searchWorld: createSearchWorldTool(client, config.searchOptions),
    searchEntities: createSearchWorldTool(client, config.searchOptions),
    discoverSchema: createDiscoverSchemaTool(client, {
      sources: config.sources,
    }),
    importRdf: createImportRdfTool(client),
    exportRdf: createExportRdfTool(client),
    ...(config.entityResolver
      ? { resolveEntity: createResolveEntityTool(config.entityResolver) }
      : {}),
  };
}
