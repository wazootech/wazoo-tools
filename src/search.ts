import { tool } from "ai";
import type { SearchRequest } from "@worlds/sdk/search-index";
import { SEARCH_WORLD_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * createSearchWorldTool creates an AI SDK tool for searching a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @returns An AI SDK tool for searching the graph.
 */
export function createSearchWorldTool(
  client: { search(request: SearchRequest): Promise<unknown> },
) {
  return tool({
    description: SEARCH_WORLD_TOOL_DESCRIPTION,
    inputSchema: z.object({
      query: z.string().describe(
        "Keyword, label, or natural-language query to search within the graph.",
      ),
      include: z
        .object({
          subjects: z.array(z.string()).optional(),
          predicates: z.array(z.string()).optional(),
          graphs: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Positive constraints for matching."),
      exclude: z
        .object({
          subjects: z.array(z.string()).optional(),
          predicates: z.array(z.string()).optional(),
          graphs: z.array(z.string()).optional(),
        })
        .optional()
        .describe("Negative constraints to filter out matching triples."),
    }),
    execute: async (request: SearchRequest) => {
      try {
        const response = await client.search(request);
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
