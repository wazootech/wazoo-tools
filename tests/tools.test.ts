import { assertEquals, assertThrows } from "@std/assert";
import {
  createDiscoverSchemaTool,
  createExecuteSparqlTool,
  createSearchEntitiesTool,
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
import type { RerankingModel } from "ai";
import type {
  RerankingModelV3,
  RerankingModelV3CallOptions,
} from "@ai-sdk/provider";
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

/**
 * A mock reranking model implementing the AI SDK's RerankingModelV3 provider
 * interface. `order` lists document indices in descending relevance; `scores`
 * pairs with `order` positionally. The mock records the documents and query it
 * was called with so tests can assert what the reranker actually saw.
 */
function mockRerankModel(order: number[], scores: number[]): {
  model: RerankingModel;
  calls: Array<
    { documents: string[]; query: string; topN: number | undefined }
  >;
} {
  const calls: Array<{
    documents: string[];
    query: string;
    topN: number | undefined;
  }> = [];
  const v3: RerankingModelV3 = {
    specificationVersion: "v3",
    provider: "test",
    modelId: "test-reranker",
    doRerank: (options: RerankingModelV3CallOptions) => {
      const documents = options.documents.type === "text"
        ? options.documents.values
        : options.documents.values.map((v) => JSON.stringify(v));
      calls.push({ documents, query: options.query, topN: options.topN });
      return Promise.resolve({
        ranking: order.map((index, i) => ({
          index,
          relevanceScore: scores[i] ?? 0,
        })),
      });
    },
  };
  return { model: v3 as RerankingModel, calls };
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

/** The rerank path annotates each result with its cross-encoder score. */
interface RerankedSearchResult extends SearchResult {
  rerankScore?: number;
}

function resultIds(
  res: { data?: { results?: Array<{ id: string }> } },
): string[] {
  return (res.data?.results ?? []).map((r) => r.id);
}

Deno.test(
  "searchWorld passes the raw response through when no rerank option is given",
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
    // Pass-through must not inject a topK into the request.
    assertEquals(requests, [{ query: "hello" }]);
  },
);

Deno.test(
  "searchWorld reranks and annotates results when configured",
  async () => {
    const { client } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
      searchResult("c", "c-doc", 0.3),
    ]);
    const { model, calls } = mockRerankModel([2, 0, 1], [0.95, 0.6, 0.2]);
    const searchTool = createSearchWorldTool(client, { rerank: { model } });
    const res = (await searchTool.execute!(
      { query: "who works here" },
      { toolCallId: "r1", messages: [], context: {} },
    )) as {
      success: boolean;
      data?: { results?: RerankedSearchResult[] };
    };
    assertEquals(res.success, true);
    assertEquals(resultIds(res), ["c", "a", "b"]);
    assertEquals(
      (res.data?.results ?? []).map((r) => r.rerankScore),
      [0.95, 0.6, 0.2],
    );
    // The reranker saw the literal texts as documents, plus the query.
    assertEquals(calls.length, 1);
    assertEquals(calls[0].documents, ["a-doc", "b-doc", "c-doc"]);
    assertEquals(calls[0].query, "who works here");
  },
);

Deno.test(
  "searchWorld cuts results to topN after reranking",
  async () => {
    const { client } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
      searchResult("c", "c-doc", 0.3),
    ]);
    const { model } = mockRerankModel([1, 2], [0.8, 0.7]);
    const searchTool = createSearchWorldTool(client, {
      rerank: { model, topN: 2 },
    });
    const res = (await searchTool.execute!(
      { query: "q" },
      { toolCallId: "r2", messages: [], context: {} },
    )) as { success: boolean; data?: SearchResponse };
    assertEquals(res.success, true);
    assertEquals(resultIds(res), ["b", "c"]);
  },
);

Deno.test(
  "searchWorld recalls generously via topK when rerank.recall is set",
  async () => {
    const { client, requests } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
    ]);
    const { model, calls } = mockRerankModel([0, 1], [1, 0.4]);
    const searchTool = createSearchWorldTool(client, {
      rerank: { model, recall: 25 },
    });
    await searchTool.execute!(
      { query: "q" },
      { toolCallId: "r3", messages: [], context: {} },
    );
    // Recall topK is injected into the search request; filters pass through.
    assertEquals(requests, [{ query: "q", topK: 25 }]);
    assertEquals(calls.length, 1);
  },
);

Deno.test(
  "searchWorld falls back to un-reranked results when the reranker fails",
  async () => {
    const { client } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
    ]);
    const failing: RerankingModelV3 = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "failing-reranker",
      doRerank: () => Promise.reject(new Error("reranker outage")),
    };
    const searchTool = createSearchWorldTool(client, {
      rerank: { model: failing as RerankingModel },
    });
    const res = (await searchTool.execute!(
      { query: "q" },
      { toolCallId: "r4", messages: [], context: {} },
    )) as { success: boolean; data?: SearchResponse; warning?: string };
    // Graceful degradation: the tool call still succeeds, ordering is
    // un-reranked, and a non-fatal warning explains what happened.
    assertEquals(res.success, true);
    assertEquals(resultIds(res), ["a", "b"]);
    assertEquals(
      res.warning,
      "rerank failed; returning un-reranked results: reranker outage",
    );
  },
);

Deno.test(
  "searchWorld skips the rerank call for short result sets",
  async () => {
    const { client } = mockSearchClient([searchResult("a", "a-doc", 0.9)]);
    const { model, calls } = mockRerankModel([0], [1]);
    const searchTool = createSearchWorldTool(client, { rerank: { model } });
    const res = (await searchTool.execute!(
      { query: "q" },
      { toolCallId: "r5", messages: [], context: {} },
    )) as { success: boolean; data?: SearchResponse; warning?: string };
    assertEquals(res.success, true);
    assertEquals(calls.length, 0);
    assertEquals(resultIds(res), ["a"]);
    assertEquals(res.warning, undefined);
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

  const tools = createTools({ client: mockClient, sources: ["test-world"] });
  assertEquals(typeof tools.executeSparql, "object");
  assertEquals(typeof tools.searchWorld, "object");
  assertEquals(typeof tools.discoverSchema, "object");
  assertEquals(typeof tools.importRdf, "object");
  assertEquals(typeof tools.exportRdf, "object");
});

Deno.test("discoverSchema unwraps the select response envelope", async () => {
  const mockClient = asClient<WorldsSdkInterface>({
    sparql: () =>
      Promise.resolve({
        kind: "select",
        data: {
          head: { vars: ["type", "predicate"] },
          results: {
            bindings: [
              { type: { type: "uri", value: "http://schema.org/Person" } },
            ],
          },
        },
      } as SparqlResponse),
  });

  const schemaTool = createDiscoverSchemaTool(mockClient, { sources: ["g"] });
  const res = (await schemaTool.execute!(
    {},
    { toolCallId: "d1", messages: [], context: {} },
  )) as { success: boolean; data?: unknown };
  assertEquals(res.success, true);
  assertEquals(res.data, {
    head: { vars: ["type", "predicate"] },
    results: {
      bindings: [{ type: { type: "uri", value: "http://schema.org/Person" } }],
    },
  });
});

Deno.test("barrel re-exports the entity-resolution and searchEntities surface", () => {
  assertEquals(typeof createSearchEntitiesTool, "function");
  assertEquals(typeof EntityResolver, "function");
  assertEquals(typeof InMemoryEntityStore, "function");
});

Deno.test(
  "searchWorld input schema passes topK/minScore through to recall",
  () => {
    const parsed = SearchToolInput.parse({
      query: "q",
      topK: 10,
      minScore: 0.5,
      include: { predicates: ["schema:name"] },
    });
    assertEquals(parsed.topK, 10);
    assertEquals(parsed.minScore, 0.5);
    assertEquals(parsed.include, { predicates: ["schema:name"] });
  },
);

Deno.test(
  "searchWorld falls back to the request topK when rerank.recall is unset",
  async () => {
    const { client, requests } = mockSearchClient([
      searchResult("a", "a-doc", 0.9),
      searchResult("b", "b-doc", 0.5),
    ]);
    const { model } = mockRerankModel([0, 1], [1, 0.4]);
    const searchTool = createSearchWorldTool(client, {
      rerank: { model },
    });
    await searchTool.execute!(
      { query: "q", topK: 10 },
      { toolCallId: "r6", messages: [], context: {} },
    );
    assertEquals(requests, [{ query: "q", topK: 10 }]);
  },
);
