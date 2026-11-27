import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdministrativeTools,
  createExecuteSparqlTool,
  createIngestTools,
  createRecallTools,
  createTools,
  EntityResolver,
  InMemoryEntityStore,
} from "../src/mod.ts";
import type { WorldsSdkInterface } from "@worlds/sdk";
import type { SparqlResponse } from "@worlds/sdk/sparql-engine";

/**
 * The tests exercise the tool factories against minimal mock clients. They
 * intentionally implement only the surface each factory touches — typed via
 * structural casts so the compiler still checks the real call sites.
 */
function asClient<T>(mock: unknown): T {
  return mock as T;
}

test("createExecuteSparqlTool rejects update queries when allowUpdates is false", async () => {
  const mockClient = asClient<{
    sparql(request: { query: string }): Promise<SparqlResponse>;
  }>({
    sparql: () => Promise.resolve({ kind: "void" } as SparqlResponse),
  });

  const sparqlTool = createExecuteSparqlTool(mockClient, {
    allowUpdates: false,
  });
  const res = (await sparqlTool.execute!(
    { query: "DELETE WHERE { ?s ?p ?o }" },
    { toolCallId: "1", messages: [], context: {} },
  )) as { success: boolean; error?: string };
  assert.deepStrictEqual(res.success, false);
  assert.deepStrictEqual(
    res.error,
    "SPARQL updates are disabled for this agent tool. Please execute read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE).",
  );
});

test("createExecuteSparqlTool executes SELECT queries successfully", async () => {
  const mockClient = asClient<{
    sparql(request: { query: string }): Promise<SparqlResponse>;
  }>({
    sparql: (_req: { query: string }) =>
      Promise.resolve({
        kind: "select",
        data: {
          head: { vars: ["s"] },
          results: {
            bindings: [{ s: { type: "uri", value: "http://example.org/1" } }],
          },
        },
      } as unknown as SparqlResponse),
  });

  const sparqlTool = createExecuteSparqlTool(mockClient);
  const res = (await sparqlTool.execute!(
    { query: "SELECT * WHERE { ?s ?p ?o }" },
    { toolCallId: "2", messages: [], context: {} },
  )) as { success: boolean; data?: unknown };
  assert.deepStrictEqual(res.success, true);
  assert.deepStrictEqual(res.data, {
    head: { vars: ["s"] },
    results: {
      bindings: [{ s: { type: "uri", value: "http://example.org/1" } }],
    },
  });
});

test("createTools throws error if client is missing", () => {
  assert.throws(() =>
    createTools({} as unknown as Parameters<typeof createTools>[0]),
  );
});

test("createTools initializes all AI SDK tools with client", () => {
  const mockClient = asClient<WorldsSdkInterface>({
    sparql: () => Promise.resolve({ kind: "void" } as SparqlResponse),
    search: () => Promise.resolve({ results: [] } as never),
    import: () => Promise.resolve(),
    export: () =>
      Promise.resolve({
        kind: "serialized",
        data: "",
        contentType: "text/turtle",
      } as never),
    reindex: () =>
      Promise.resolve({ processedQuadCount: 0, chunkRowCount: 0 } as never),
  });

  const tools = createTools({ client: mockClient });
  assert.deepStrictEqual(typeof tools.executeSparql, "object");
  assert.deepStrictEqual(typeof tools.searchWorld, "object");
  assert.deepStrictEqual(typeof tools.importRdf, "object");
  assert.deepStrictEqual(typeof tools.exportRdf, "object");
  assert.deepStrictEqual(typeof tools.reindexWorld, "object");
});

test("barrel re-exports the entity-resolution surface", () => {
  assert.deepStrictEqual(typeof EntityResolver, "function");
  assert.deepStrictEqual(typeof InMemoryEntityStore, "function");
});

test("phase profiles expose only the capabilities for that phase", () => {
  const client = asClient<WorldsSdkInterface>({
    sparql: () => Promise.resolve({ kind: "void" } as SparqlResponse),
    search: () => Promise.resolve({ results: [] } as never),
    import: () => Promise.resolve(),
    export: () =>
      Promise.resolve({
        kind: "serialized",
        data: "",
        contentType: "text/turtle",
      } as never),
    reindex: () =>
      Promise.resolve({ processedQuadCount: 0, chunkRowCount: 0 } as never),
  });
  assert.deepStrictEqual(Object.keys(createRecallTools({ client })).sort(), [
    "executeSparql",
    "searchWorld",
  ]);
  assert.deepStrictEqual(Object.keys(createIngestTools({ client })).sort(), [
    "executeSparql",
    "exportRdf",
    "importRdf",
  ]);
  assert.deepStrictEqual(
    Object.keys(createAdministrativeTools({ client })).sort(),
    ["executeSparql", "exportRdf", "importRdf", "reindexWorld"],
  );
});
