import { z } from "zod";
import { type WorldsTool, worldsTool } from "./tool-result.ts";
import { ENTITY_RESOLUTION_TOOL_DESCRIPTION } from "./descriptions.ts";
import { type EntityResolver, normalizeName } from "./entity-resolution.ts";

/**
 * Vercel AI SDK tool exposing entity resolution operations (resolve, lookup,
 * merge, stats) to agents. Read/write scope follows the resolver's store.
 */
export interface ResolveEntityInput {
  operation: "resolve" | "lookup" | "merge" | "stats";
  name?: string;
  classIri?: string;
  embedding?: number[];
  scopedUrn?: string;
  sessionId?: string;
  id?: string;
  sourceId?: string;
  targetId?: string;
}

const ResolveEntityInput: z.ZodType<ResolveEntityInput, ResolveEntityInput> = z
  .object({
    operation: z.enum(["resolve", "lookup", "merge", "stats"]).describe(
      "Resolution operation to perform.",
    ),
    name: z.string().optional().describe(
      "Candidate entity display name (required for resolve).",
    ),
    classIri: z.string().optional().describe(
      "Entity class IRI, e.g. schema:Person (resolve only).",
    ),
    embedding: z.array(z.number()).optional().describe(
      "Precomputed embedding of the name (resolve only; string fallback applies when omitted).",
    ),
    scopedUrn: z.string().optional().describe(
      "Session-scoped URN to link to the canonical entity (resolve only).",
    ),
    sessionId: z.string().optional().describe(
      "Extraction session ID (resolve only; enables the same-session guard).",
    ),
    id: z.string().optional().describe(
      "Canonical entity ID (required for lookup; merge target).",
    ),
    sourceId: z.string().optional().describe(
      "Canonical entity ID to merge away (required for merge).",
    ),
    targetId: z.string().optional().describe(
      "Canonical entity ID to merge into (required for merge).",
    ),
  });

export function createResolveEntityTool(
  resolver: EntityResolver,
): WorldsTool<ResolveEntityInput> {
  return worldsTool({
    description: ENTITY_RESOLUTION_TOOL_DESCRIPTION,
    inputSchema: ResolveEntityInput,
    execute: async (input) => {
      try {
        switch (input.operation) {
          case "resolve": {
            if (!input.name) {
              return { success: false, error: "resolve requires 'name'." };
            }
            const result = await resolver.resolve({
              name: input.name,
              classIri: input.classIri,
              embedding: input.embedding,
              scopedUrn: input.scopedUrn,
              sessionId: input.sessionId,
            });
            return { success: true, data: result };
          }
          case "lookup": {
            if (!input.id) {
              return { success: false, error: "lookup requires 'id'." };
            }
            const result = await resolver.lookup(input.id);
            if (!result) {
              return {
                success: false,
                error: `Unknown canonical entity: ${input.id}`,
              };
            }
            return { success: true, data: result };
          }
          case "merge": {
            if (!input.sourceId || !input.targetId) {
              return {
                success: false,
                error: "merge requires 'sourceId' and 'targetId'.",
              };
            }
            const merged = await resolver.merge(input.sourceId, input.targetId);
            const entity = await resolver.lookup(merged);
            return { success: true, data: entity };
          }
          case "stats": {
            return { success: true, data: await resolver.stats() };
          }
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

/** Convenience re-export so consumers only import one module for ER. */
export { normalizeName };
