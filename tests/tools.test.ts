import { assertEquals, assertThrows } from "@std/assert";
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

Deno.test(
  "createExecuteSparqlTool rejects update queries when allowUpdates is false",
  async () => {
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
    assertEquals(res.success, false);
    assertEquals(
      res.error,
      "SPARQL updates are disabled for this agent tool. Please execute read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE).",
    );
  },
);

Deno.test(
  "createExecuteSparqlTool executes SELECT queries successfully",
  async () => {
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
    assertEquals(res.success, true);
    assertEquals(res.data, {
      head: { vars: ["s"] },
      results: {
        bindings: [{ s: { type: "uri", value: "http://example.org/1" } }],
      },
    });
  },
);

Deno.test("createTools throws error if client is missing", () => {
  assertThrows(
    () => createTools({} as unknown as Parameters<typeof createTools>[0]),
  );
});

Deno.test("createTools initializes all AI SDK tools with client", () => {
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
  assertEquals(typeof tools.executeSparql, "object");
  assertEquals(typeof tools.searchWorld, "object");
  assertEquals(typeof tools.importRdf, "object");
  assertEquals(typeof tools.exportRdf, "object");
  assertEquals(typeof tools.reindexWorld, "object");
});

Deno.test("barrel re-exports the entity-resolution surface", () => {
  assertEquals(typeof EntityResolver, "function");
  assertEquals(typeof InMemoryEntityStore, "function");
});

Deno.test("phase profiles expose only the capabilities for that phase", () => {
  const client = asClient<WorldsSdkInterface>({
    sparql: () => Promise.resolve({ kind: "void" } as SparqlResponse),
    search: () => Promise.resolve({ results: [] } as never),
    import: () => Promise.resolve(),
    export: () =>
      Promise.resolve(
        { kind: "serialized", data: "", contentType: "text/turtle" } as never,
      ),
    reindex: () =>
      Promise.resolve({ processedQuadCount: 0, chunkRowCount: 0 } as never),
  });
  assertEquals(Object.keys(createRecallTools({ client })).sort(), [
    "executeSparql",
    "searchWorld",
  ]);
  assertEquals(Object.keys(createIngestTools({ client })).sort(), [
    "executeSparql",
    "exportRdf",
    "importRdf",
  ]);
  assertEquals(Object.keys(createAdministrativeTools({ client })).sort(), [
    "executeSparql",
    "exportRdf",
    "importRdf",
    "reindexWorld",
  ]);
});
