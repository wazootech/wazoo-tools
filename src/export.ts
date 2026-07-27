import { tool } from "ai";
import { z } from "zod";
import { EXPORT_RDF_TOOL_DESCRIPTION } from "./descriptions.ts";

export interface ExportRdfClientInterface {
  exportRdf?(request: {
    format?: string;
    graphUri?: string;
  }): Promise<unknown>;
  sparql?(request: { query: string }): Promise<{ data?: unknown }>;
}

export function createExportRdfTool(client: ExportRdfClientInterface) {
  return tool({
    description: EXPORT_RDF_TOOL_DESCRIPTION,
    parameters: z.object({
      format: z
        .enum(["turtle", "ntriples", "nquads", "json-ld"])
        .default("turtle")
        .describe("Requested export format."),
      graphUri: z.string().optional().describe("Target named graph URI to export."),
    }),
    execute: async (request) => {
      try {
        if (typeof client.exportRdf === "function") {
          const res = await client.exportRdf(request);
          return { success: true, data: res };
        }
        if (typeof client.sparql === "function") {
          const graphClause = request.graphUri ? `FROM <${request.graphUri}>` : "";
          const query = `CONSTRUCT { ?s ?p ?o } ${graphClause} WHERE { ?s ?p ?o }`;
          const res = await client.sparql({ query });
          return { success: true, data: res.data };
        }
        throw new Error("Client does not support RDF export.");
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
