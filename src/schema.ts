import { tool } from "ai";
import { z } from "zod";
import { DISCOVER_SCHEMA_TOOL_DESCRIPTION } from "./descriptions.ts";
import type { SparqlClientInterface } from "./sparql.ts";

export interface DiscoverSchemaOptions {
  sources?: string[];
}

export function createDiscoverSchemaTool(
  client: SparqlClientInterface,
  options?: DiscoverSchemaOptions,
) {
  return tool({
    description: DISCOVER_SCHEMA_TOOL_DESCRIPTION,
    parameters: z.object({
      graphUri: z
        .string()
        .optional()
        .describe("Optional target graph URI to introspect."),
    }),
    execute: async (request) => {
      const query = `
        SELECT DISTINCT ?type ?predicate WHERE {
          ${request.graphUri ? `GRAPH <${request.graphUri}> {` : ""}
          ?subject a ?type ;
                   ?predicate ?object .
          ${request.graphUri ? "}" : ""}
        } LIMIT 100
      `;

      try {
        const response = await client.sparql({ query });
        return {
          success: true,
          sources: options?.sources ?? [],
          data: response.data,
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
