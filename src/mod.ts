import {
  createExecuteSparqlTool,
  type ExecuteSparqlOptions,
  type SparqlClientInterface,
} from "./sparql.ts";
import { createSearchWorldTool, type SearchClientInterface } from "./search.ts";
import {
  createDiscoverSchemaTool,
  type DiscoverSchemaOptions,
} from "./schema.ts";
import {
  createImportRdfTool,
  type ImportRdfClientInterface,
} from "./import.ts";
import { createResolveEntityTool } from "./entity-resolution-tool.ts";
import { type EntityResolver } from "./entity-resolution.ts";
import {
  createExportRdfTool,
  type ExportRdfClientInterface,
} from "./export.ts";

export * from "./descriptions.ts";
export * from "./sparql.ts";
export * from "./search.ts";
export * from "./schema.ts";
export * from "./import.ts";
export * from "./export.ts";
export * from "./entity-resolution.ts";
export { createResolveEntityTool } from "./entity-resolution-tool.ts";

export interface CreateToolsConfig {
  client?:
    & SparqlClientInterface
    & SearchClientInterface
    & ImportRdfClientInterface
    & ExportRdfClientInterface;
  worlds?:
    & SparqlClientInterface
    & SearchClientInterface
    & ImportRdfClientInterface
    & ExportRdfClientInterface;
  sources?: string[];
  sparqlOptions?: ExecuteSparqlOptions;
  schemaOptions?: DiscoverSchemaOptions;
  /** When provided alongside `client`/`worlds`, a resolveEntity tool is added. */
  entityResolver?: EntityResolver;
}

/**
 * Factory function creating a full suite of Vercel AI SDK compatible tools
 * for interacting with Wazoo/Worlds knowledge graphs.
 */
export function createTools(config: CreateToolsConfig) {
  const targetClient = config.client ?? config.worlds;
  if (!targetClient) {
    throw new Error(
      "createTools requires either a 'client' or 'worlds' client instance.",
    );
  }

  return {
    executeSparql: createExecuteSparqlTool(targetClient, config.sparqlOptions),
    searchWorld: createSearchWorldTool(targetClient),
    searchEntities: createSearchWorldTool(targetClient),
    discoverSchema: createDiscoverSchemaTool(targetClient, {
      sources: config.sources,
      ...config.schemaOptions,
    }),
    importRdf: createImportRdfTool(targetClient),
    exportRdf: createExportRdfTool(targetClient),
    ...(config.entityResolver
      ? { resolveEntity: createResolveEntityTool(config.entityResolver) }
      : {}),
  };
}
