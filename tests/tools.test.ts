import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createExecuteSparqlTool, createTools } from "../src/mod.ts";

Deno.test("createExecuteSparqlTool rejects update queries when allowUpdates is false", async () => {
  const mockClient = {
    sparql: async () => ({ kind: "bindings", data: [] }),
  };

  const sparqlTool = createExecuteSparqlTool(mockClient, { allowUpdates: false });
  // @ts-ignore testing tool execution directly
  const res = (await sparqlTool.execute!({ query: "DELETE WHERE { ?s ?p ?o }" }, { toolCallId: "1", messages: [] })) as { success: boolean; error?: string };
  assertEquals(res.success, false);
  assertEquals(
    res.error,
    "SPARQL updates are disabled for this agent tool. Please execute read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE).",
  );
});

Deno.test("createExecuteSparqlTool executes SELECT queries successfully", async () => {
  const mockClient = {
    sparql: async (_req: { query: string }) => ({
      kind: "bindings",
      data: [{ s: "http://example.org/1" }],
    }),
  };

  const sparqlTool = createExecuteSparqlTool(mockClient);
  // @ts-ignore testing tool execution directly
  const res = (await sparqlTool.execute!({ query: "SELECT * WHERE { ?s ?p ?o }" }, { toolCallId: "2", messages: [] })) as { success: boolean; data?: unknown };
  assertEquals(res.success, true);
  assertEquals(res.data, [{ s: "http://example.org/1" }]);
});

Deno.test("createTools throws error if client is missing", () => {
  // @ts-ignore testing invalid setup
  assertRejects(async () => createTools({}));
});

Deno.test("createTools initializes all AI SDK tools with client", () => {
  const mockClient = {
    sparql: async () => ({ kind: "bindings", data: [] }),
    search: async () => ({ results: [] }),
  };

  const tools = createTools({ client: mockClient, sources: ["test-world"] });
  assertEquals(typeof tools.executeSparql, "object");
  assertEquals(typeof tools.searchWorld, "object");
  assertEquals(typeof tools.discoverSchema, "object");
  assertEquals(typeof tools.importRdf, "object");
  assertEquals(typeof tools.exportRdf, "object");
});
