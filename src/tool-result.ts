import type { Tool } from "ai";

/**
 * ToolResult is the uniform envelope every tool factory returns from
 * execute(): a success flag, optional payload, and an error/warning channel.
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  warning?: string;
}

/**
 * worldsTool wraps the AI SDK's tool() so every Worlds tool shares the
 * ToolResult envelope while keeping full input-type inference from the zod
 * schema. It exists so public tool factories can carry an explicit return
 * type (a JSR requirement) without hand-duplicating zod's inferred types.
 */
export function worldsTool<INPUT, OUTPUT = ToolResult>(
  t: Tool<INPUT, OUTPUT>,
): Tool<INPUT, ToolResult> {
  return t as Tool<INPUT, ToolResult>;
}

/**
 * WorldsTool is the AI SDK Tool type specialized to the ToolResult envelope,
 * with the input generic filled per tool factory (z.infer of the hoisted
 * schema const).
 */
export type WorldsTool<INPUT> = Tool<INPUT, ToolResult>;
