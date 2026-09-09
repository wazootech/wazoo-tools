import { type WorldsTool, worldsTool } from "./tool-result.ts";
import type { SearchRequest, SearchResponse } from "@worlds/sdk/search-index";
import { SEARCH_WORLD_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * createSearchWorldTool creates an AI SDK tool for searching a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @returns An AI SDK tool for searching the graph.
 */
export interface SearchToolInput {
  query: string;
  include?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
  exclude?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
  topK?: number;
  minScore?: number;
}

export const SearchToolInput: z.ZodType<SearchToolInput, SearchToolInput> = z
  .object({
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
    topK: z.number().optional().describe(
      "Maximum number of results to return.",
    ),
    minScore: z.number().optional().describe(
      "Minimum relevance score a result must meet to be included.",
    ),
  });

export function createSearchWorldTool(
  client: { search(request: SearchRequest): Promise<SearchResponse> },
): WorldsTool<SearchToolInput> {
  return worldsTool({
    description: SEARCH_WORLD_TOOL_DESCRIPTION,
    inputSchema: SearchToolInput,
    execute: async (request: SearchToolInput) => {
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

export const createSearchEntitiesTool = createSearchWorldTool;
