import { assertEquals, assertThrows } from "@std/assert";
import {
  createExecuteSparqlTool,
  createTools,
  EntityResolver,
  InMemoryEntityStore,
} from "../src/mod.ts";
import type { WorldsSdkInterface } from "@worlds/sdk";
import type { SparqlResponse } from "@worlds/sdk/sparql-engine";
import type {
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "@worlds/sdk/search-index";
import { createSearchWorldTool, SearchToolInput } from "../src/search.ts";

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

/**
 * A minimal search-result fixture: the SDK's SearchResult contract is
 * { id, subject, predicate, graph, text, score, scoreType? }.
 */
function searchResult(id: string, text: string, score: number): SearchResult {
  return {
    id,
    subject: `urn:ex:${id}`,
    predicate: "schema:name",
    graph: "urn:ex:g",
    text,
    score,
  };
}

/** A mock Worlds SDK search surface that records incoming requests. */
function mockSearchClient(results: SearchResult[]): {
  client: Parameters<typeof createSearchWorldTool>[0];
  requests: Array<Record<string, unknown>>;
} {
  const requests: Array<Record<string, unknown>> = [];
  const client = {
    search: (request: SearchRequest) => {
      requests.push({ ...request });
      return Promise.resolve({ results } satisfies SearchResponse);
    },
  };
  return {
    client: client as Parameters<typeof createSearchWorldTool>[0],
    requests,
  };
}

Deno.test(
  "searchWorld passes the request and raw response through",
  async () => {
    const { client, requests } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
    ]);
    const searchTool = createSearchWorldTool(client);
    const res = (await searchTool.execute!(
      { query: "hello" },
      { toolCallId: "r0", messages: [], context: {} },
    )) as { success: boolean; data?: SearchResponse; warning?: string };
    assertEquals(res.success, true);
    assertEquals(res.data, {
      results: [
        searchResult("a", "a-doc", 0.9),
        searchResult("b", "b-doc", 0.5),
      ],
    });
    assertEquals(res.warning, undefined);
    // Passthrough must not inject a topK into the request.
    assertEquals(requests, [{ query: "hello" }]);
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
});

Deno.test("barrel re-exports the entity-resolution surface", () => {
  assertEquals(typeof EntityResolver, "function");
  assertEquals(typeof InMemoryEntityStore, "function");
});

Deno.test("searchWorld input schema exposes topK/minScore to callers", () => {
  const parsed = SearchToolInput.parse({
    query: "q",
    topK: 10,
    minScore: 0.5,
    include: { predicates: ["schema:name"] },
  });
  assertEquals(parsed.topK, 10);
  assertEquals(parsed.minScore, 0.5);
  assertEquals(parsed.include, { predicates: ["schema:name"] });
});

Deno.test("searchWorld passes topK/minScore through to the SDK request", async () => {
  const { client, requests } = mockSearchClient([
    searchResult("a", "a-doc", 0.9),
    searchResult("b", "b-doc", 0.5),
  ]);
  const searchTool = createSearchWorldTool(client);
  await searchTool.execute!(
    { query: "q", topK: 10, minScore: 0.5 },
    { toolCallId: "r6", messages: [], context: {} },
  );
  assertEquals(requests, [{ query: "q", topK: 10, minScore: 0.5 }]);
});
