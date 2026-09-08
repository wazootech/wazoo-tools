import type { SparqlRequest } from "@worlds/sdk/sparql-engine";
import { type WorldsTool, worldsTool } from "./tool-result.ts";
import type { WorldsSdkInterface } from "@worlds/sdk";
import { DISCOVER_SCHEMA_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * DiscoverSchemaOptions defines the configuration options for the discoverSchema tool.
 */
export interface DiscoverSchemaOptions {
  /**
   * sources defines the list of graph URIs to introspect.
   */
  sources?: string[];
}

/**
 * createDiscoverSchemaTool creates an AI SDK tool for discovering the schema of a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @param options Configuration options for the tool.
 * @returns An AI SDK tool for discovering the schema.
 */
export interface DiscoverSchemaInput {
  graphUri?: string;
}

const DiscoverSchemaInput: z.ZodType<DiscoverSchemaInput, DiscoverSchemaInput> =
  z.object({
    graphUri: z
      .string()
      .optional()
      .describe("Optional target graph URI to introspect."),
  });

export function createDiscoverSchemaTool(
  client: WorldsSdkInterface,
  options?: DiscoverSchemaOptions,
): WorldsTool<DiscoverSchemaInput> {
  const graphUris = options?.sources ?? [];
  return worldsTool({
    description: DISCOVER_SCHEMA_TOOL_DESCRIPTION,
    inputSchema: DiscoverSchemaInput,
    execute: async (request: DiscoverSchemaInput) => {
      const graphUri = request.graphUri ?? graphUris[0];
      const graphClause = graphUri ? `GRAPH <${graphUri}> {` : "";
      const graphClose = graphUri ? "}" : "";
      const query = `
        SELECT DISTINCT ?type ?predicate WHERE {
          ${graphClause}
          ?subject a ?type ;
                   ?predicate ?object .
          ${graphClose}
        } LIMIT 100
      `;
      try {
        const response = await client.sparql({ query } as SparqlRequest);
        return {
          success: true,
          data: response,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
