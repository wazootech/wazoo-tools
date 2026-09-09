import type { SparqlRequest, SparqlResponse } from "@worlds/sdk/sparql-engine";
import { type WorldsTool, worldsTool } from "./tool-result.ts";
import { EXECUTE_SPARQL_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * ExecuteSparqlOptions defines the configuration options for the executeSparql tool.
 */
export interface ExecuteSparqlOptions {
  /**
   * allowUpdates controls whether the tool permits SPARQL UPDATE operations (e.g., INSERT, DELETE).
   * @default false
   */
  allowUpdates?: boolean;
}

/**
 * createExecuteSparqlTool creates an AI SDK tool for executing SPARQL queries
 * against a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @param options Configuration options for the tool.
 * @returns An AI SDK tool for executing SPARQL queries.
 */
export interface ExecuteSparqlInput {
  query: string;
  baseIri?: string;
  timeoutMs?: number;
}

const ExecuteSparqlInput: z.ZodType<ExecuteSparqlInput, ExecuteSparqlInput> = z
  .object({
    query: z.string().describe(
      "The SPARQL query string to execute. Read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE) are allowed by default.",
    ),
    baseIri: z.string().optional().describe("Base IRI for query execution."),
    timeoutMs: z.number().optional().describe(
      "Query timeout in milliseconds.",
    ),
  });

export function createExecuteSparqlTool(
  client: { sparql(request: SparqlRequest): Promise<SparqlResponse> },
  options?: ExecuteSparqlOptions,
): WorldsTool<ExecuteSparqlInput> {
  return worldsTool({
    description: EXECUTE_SPARQL_TOOL_DESCRIPTION,
    inputSchema: ExecuteSparqlInput,
    execute: async (request: ExecuteSparqlInput) => {
      const allowUpdates = options?.allowUpdates ?? false;
      if (!allowUpdates) {
        if (/\b(INSERT|DELETE|DROP|CLEAR|LOAD|CREATE)\b/i.test(request.query)) {
          return {
            success: false,
            error:
              "SPARQL updates are disabled for this agent tool. Please execute read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE).",
          };
        }
      }

      try {
        const response = await client.sparql(request);
        return {
          success: true,
          data: response.kind === "void"
            ? null
            : (response as { data?: unknown }).data,
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
