import { rerank } from "ai";
import type { RerankingModel } from "ai";
import { type WorldsTool, worldsTool } from "./tool-result.ts";
import type { SearchRequest, SearchResponse } from "@worlds/sdk/search-index";
import { SEARCH_WORLD_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/** Candidates fetched for reranking when neither recall nor the request's topK is set. */
const DEFAULT_RECALL = 50;

/**
 * SearchWorldRerankOptions configures the optional two-stage retrieval pass:
 * recall generously via the SDK search index, reorder with a cross-encoder,
 * then cut to topN before the tool returns.
 *
 * The reranking model is caller-supplied (e.g. `cohere.reranking("rerank-v3.5")`),
 * so no provider dependency is bundled here. A reranker failure degrades
 * ordering, not the tool call: results fall back to recall order with a
 * non-fatal warning.
 */
export interface SearchWorldRerankOptions {
  /**
   * The reranking model to reorder recalled candidates with. Caller-supplied
   * via the AI SDK's `RerankingModel` (e.g. `cohere.reranking("rerank-v3.5")`).
   */
  model: RerankingModel;

  /**
   * Candidates fetched for reranking. Defaults to the request's topK or 50 —
   * recall generously so the reranker has room to reorder.
   */
  recall?: number;

  /**
   * Results returned to the agent after reranking. Defaults to no cut
   * (all recalled candidates, reordered).
   */
  topN?: number;
}

/**
 * SearchWorldOptions defines the configuration options for the search tools.
 */
export interface SearchWorldOptions {
  /**
   * When provided, results are recalled generously via the SDK search index
   * (topK), reordered by the reranking model, and cut to topN before the tool
   * returns. Omit to keep the plain pass-through behavior.
   */
  rerank?: SearchWorldRerankOptions;
}

/**
 * createSearchWorldTool creates an AI SDK tool for searching a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @param options Optional configuration; `options.rerank` enables two-stage retrieval.
 * @returns An AI SDK tool for searching the graph.
 */
export interface SearchToolInput {
  query: string;
  include?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
  exclude?: { subjects?: string[]; predicates?: string[]; graphs?: string[] };
  topK?: number;
  minScore?: number;
}

const SearchToolInput: z.ZodType<SearchToolInput, SearchToolInput> = z.object({
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
});

export function createSearchWorldTool(
  client: { search(request: SearchRequest): Promise<SearchResponse> },
  options?: SearchWorldOptions,
): WorldsTool<SearchToolInput> {
  const rerankOptions = options?.rerank;
  return worldsTool({
    description: SEARCH_WORLD_TOOL_DESCRIPTION,
    inputSchema: SearchToolInput,
    execute: async (request: SearchToolInput) => {
      try {
        // Recall stage: when reranking, fetch generously (recall ?? topK ?? 50)
        // so the reranker has room to reorder. include/exclude filters apply at
        // recall time — the reranker never sees filtered-out results.
        const response = await client.search(
          rerankOptions
            ? {
              ...request,
              topK: rerankOptions.recall ?? request.topK ?? DEFAULT_RECALL,
            }
            : request,
        );

        // Pass-through: no rerank option, byte-for-byte today's behavior.
        if (!rerankOptions) {
          return { success: true, data: response };
        }

        const results = response.results ?? [];
        // Nothing (or one result) to reorder — skip the model call entirely.
        if (results.length < 2) {
          return { success: true, data: response };
        }

        try {
          const reranked = await rerank({
            model: rerankOptions.model,
            documents: results.map((result) => result.text),
            query: request.query,
            topN: rerankOptions.topN,
          });
          // Map the reranker's ranking back onto the recalled results and
          // annotate each with its cross-encoder score. The SDK's `score`
          // field keeps its recall-time meaning (contract D8: retrieval
          // relevance only) — the reranker score rides alongside it.
          const rerankedResults = reranked.ranking.map(
            ({ originalIndex, score }) => ({
              ...results[originalIndex],
              rerankScore: score,
            }),
          );
          return {
            success: true,
            data: { ...response, results: rerankedResults },
          };
        } catch (rerankError) {
          // Graceful degradation: a reranker outage should degrade ordering,
          // not break the agent's tool call.
          const message = rerankError instanceof Error
            ? rerankError.message
            : "Unknown rerank error";
          return {
            success: true,
            data: response,
            warning: `rerank failed; returning un-reranked results: ${message}`,
          };
        }
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
