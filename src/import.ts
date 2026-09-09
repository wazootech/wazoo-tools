import type { ImportRequest } from "@worlds/sdk/quad-store";
import { type WorldsTool, worldsTool } from "./tool-result.ts";
import { IMPORT_RDF_TOOL_DESCRIPTION } from "./descriptions.ts";
import { z } from "zod";

/**
 * createImportRdfTool creates an AI SDK tool for importing RDF data into a Worlds SDK client.
 *
 * @param client The Worlds SDK client instance.
 * @returns An AI SDK tool for importing RDF data.
 */
export interface ImportRdfInput {
  mode?: "merge" | "replace";
  source: { kind: "serialized"; data: string; contentType?: string };
}

const ImportRdfInput: z.ZodType<ImportRdfInput, ImportRdfInput> = z.object({
  mode: z.enum(["merge", "replace"]).optional().describe(
    "Mode of import (defaults to 'merge').",
  ),
  source: z.object({
    kind: z.literal("serialized").describe(
      "The kind of data source. Always use 'serialized'.",
    ),
    data: z.string().describe("The serialized RDF data to import."),
    contentType: z.string().optional().describe(
      "The MIME type of the data. Usually 'text/turtle' or 'application/n-triples'.",
    ),
  }),
});

export function createImportRdfTool(
  client: { import(request: ImportRequest): Promise<void> },
): WorldsTool<ImportRdfInput> {
  return worldsTool({
    description: IMPORT_RDF_TOOL_DESCRIPTION,
    inputSchema: ImportRdfInput,
    execute: async (request: ImportRdfInput) => {
      try {
        const importRequest: ImportRequest = {
          mode: request.mode ?? "merge",
          source: {
            kind: "serialized",
            data: request.source.data,
            contentType: request.source.contentType,
          },
        };
        await client.import(importRequest);
        return {
          success: true,
          message: "Data imported successfully.",
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
