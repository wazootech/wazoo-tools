import { tool } from "ai";
import { z } from "zod";
import { SEARCH_WORLD_TOOL_DESCRIPTION } from "./descriptions.ts";

export interface SearchClientInterface {
  search(request: {
    query: string;
    include?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
    exclude?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
  }): Promise<unknown>;
}

export function createSearchWorldTool(client: SearchClientInterface) {
  return tool({
    description: SEARCH_WORLD_TOOL_DESCRIPTION,
    parameters: z.object({
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
    execute: async (request) => {
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
