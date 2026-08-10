import { tool } from "ai";
import { z } from "zod";
import { IMPORT_RDF_TOOL_DESCRIPTION } from "./descriptions.ts";

export interface ImportRdfClientInterface {
  importRdf?(request: {
    content: string;
    format?: string;
    graphUri?: string;
  }): Promise<unknown>;
  sparql?(request: { query: string }): Promise<unknown>;
}

export function createImportRdfTool(client: ImportRdfClientInterface) {
  return tool({
    description: IMPORT_RDF_TOOL_DESCRIPTION,
    parameters: z.object({
      content: z.string().describe(
        "RDF content payload to import into the graph.",
      ),
      format: z
        .enum(["turtle", "ntriples", "nquads", "json-ld"])
        .default("turtle")
        .describe("Format of the RDF payload."),
      graphUri: z.string().optional().describe("Target named graph URI."),
    }),
    execute: async (request) => {
      try {
        if (typeof client.importRdf === "function") {
          const res = await client.importRdf(request);
          return { success: true, data: res };
        }
        if (typeof client.sparql === "function") {
          const graphClause = request.graphUri
            ? `INTO GRAPH <${request.graphUri}>`
            : "";
          const query = `INSERT DATA { ${graphClause} { ${request.content} } }`;
          const res = await client.sparql({ query });
          return { success: true, data: res };
        }
        throw new Error(
          "Client does not support RDF import or SPARQL updates.",
        );
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });
}
