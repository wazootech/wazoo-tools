import { tool } from "ai";
import type { SparqlRequest } from "@wazoo/sparql-engine";
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
export function createDiscoverSchemaTool(
  client: WorldsSdkInterface,
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
    execute: async (request: { graphUri?: string }) => {
      const query = `
        SELECT DISTINCT ?type ?predicate WHERE {
          ${request.graphUri ? `GRAPH <${request.graphUri}> {` : ""}
          ?subject a ?type ;
                   ?predicate ?object .
          ${request.graphUri ? "" : ""}
          ${request.graphUri ? "}" : ""}
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
