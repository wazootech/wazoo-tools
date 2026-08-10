import { tool } from "ai";
import { z } from "zod";
import { EXECUTE_SPARQL_TOOL_DESCRIPTION } from "./descriptions.ts";

export interface SparqlClientInterface {
  sparql(
    request: { query: string; baseIri?: string; timeoutMs?: number },
  ): Promise<{
    kind: string;
    data?: unknown;
  }>;
}

export interface ExecuteSparqlOptions {
  /**
   * allowUpdates controls whether the tool permits SPARQL UPDATE operations (e.g., INSERT, DELETE).
   * @default false
   */
  allowUpdates?: boolean;
}

export function createExecuteSparqlTool(
  client: SparqlClientInterface,
  options?: ExecuteSparqlOptions,
) {
  return tool({
    description: EXECUTE_SPARQL_TOOL_DESCRIPTION,
    parameters: z.object({
      query: z.string().describe(
        "The SPARQL query string to execute. By default, only read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE) are allowed.",
      ),
      baseIri: z.string().optional().describe("Base IRI for query execution."),
      timeoutMs: z.number().optional().describe(
        "Query timeout in milliseconds.",
      ),
    }),
    execute: async (request) => {
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
          data: response.kind === "void" ? null : response.data,
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
