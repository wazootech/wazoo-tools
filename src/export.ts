import { tool } from "ai";
import type { ExportRequest, ExportResponse } from "@worlds/sdk/quad-store";
import { EXPORT_RDF_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * createExportRdfTool creates an AI SDK tool for exporting RDF data from a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @returns An AI SDK tool for exporting RDF data.
 */
export function createExportRdfTool(
  client: { export(request: ExportRequest): Promise<ExportResponse> },
) {
  return tool({
    description: EXPORT_RDF_TOOL_DESCRIPTION,
    inputSchema: z.object({
      format: z.object({
        kind: z.literal("serialized").describe("Desired output format."),
        contentType: z.string().optional().describe(
          "The MIME type of the exported data. Usually 'text/turtle' or 'application/n-triples'.",
        ),
      }),
    }),
    execute: async (
      request: { format: { kind: "serialized"; contentType?: string } },
    ) => {
      try {
        const exportRequest: ExportRequest = {
          format: {
            kind: "serialized",
            contentType: request.format.contentType,
          },
        };
        const response = await client.export(exportRequest);
        return {
          success: true,
          data: response.kind === "serialized" ? response.data : null,
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
