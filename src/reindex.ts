import type { ReindexRequest, ReindexResponse } from "@worlds/sdk/search-index";
import { z } from "zod";
import { REINDEX_WORLD_TOOL_DESCRIPTION } from "./descriptions.ts";
import { type WorldsTool, worldsTool } from "./tool-result.ts";

export interface ReindexWorldInput {
  readPageSize?: number;
}

const ReindexWorldInput: z.ZodType<ReindexWorldInput, ReindexWorldInput> = z
  .object({
    readPageSize: z.number().int().positive().max(10000).optional().describe(
      "Number of durable quads to scan per page.",
    ),
  });

export function createReindexWorldTool(
  client: {
    reindex(request?: ReindexRequest): Promise<ReindexResponse>;
  },
): WorldsTool<ReindexWorldInput> {
  return worldsTool({
    description: REINDEX_WORLD_TOOL_DESCRIPTION,
    inputSchema: ReindexWorldInput,
    execute: async (request: ReindexWorldInput) => {
      try {
        const result = await client.reindex(request);
        return {
          success: true,
          data: result,
          message: "Derived search structures rebuilt from the durable graph.",
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
