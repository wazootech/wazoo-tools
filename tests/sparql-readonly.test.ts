import { assertEquals } from "@std/assert";
import { createExecuteSparqlTool } from "../src/mod.ts";
import type { SparqlResponse } from "@worlds/sdk/sparql-engine";

async function run(query: string) {
  const calls = { forwarded: 0 };
  const client = {
    sparql: (_req: { query: string }) => {
      calls.forwarded++;
      return Promise.resolve({ kind: "void" } as SparqlResponse);
    },
  };
  const tool = createExecuteSparqlTool(client);
  const res = await tool.execute!(
    { query },
    { toolCallId: "t", messages: [], context: {} },
  );
  return {
    res: res as { success: boolean; error?: string },
    forwarded: calls.forwarded,
  };
}

const REJECTED: Record<string, string> = {
  COPY: "COPY SILENT GRAPH <urn:test:empty> TO DEFAULT",
  MOVE: "MOVE DEFAULT TO <urn:test:x>",
  ADD: "ADD <urn:test:a> TO <urn:test:b>",
  INSERT: "INSERT DATA { <urn:test:s> <urn:test:p> <urn:test:o> }",
  DELETE: "DELETE WHERE { ?s ?p ?o }",
  LOAD: "LOAD <urn:test:doc> INTO GRAPH <urn:test:g>",
  CLEAR: "CLEAR ALL",
  CREATE: "CREATE GRAPH <urn:test:g>",
  DROP: "DROP GRAPH <urn:test:g>",
  "lowercase copy": "copy default to <urn:test:x>",
  "comment before update": "# SELECT\nMOVE DEFAULT TO <urn:test:x>",
  "prefix then update": "PREFIX t: <urn:test:>\nCOPY t:a TO t:b",
  "multi-operation": "SELECT * WHERE { ?s ?p ?o } ; DROP ALL",
  "unparseable": "this is not sparql",
  "empty": "",
};

for (const [name, query] of Object.entries(REJECTED)) {
  Deno.test(`read-only executeSparql rejects ${name}`, async () => {
    const { res, forwarded } = await run(query);
    assertEquals(res.success, false);
    assertEquals(forwarded, 0);
  });
}

const ACCEPTED: Record<string, string> = {
  SELECT: "SELECT * WHERE { ?s ?p ?o } LIMIT 5",
  ASK: "ASK { ?s ?p ?o }",
  CONSTRUCT: "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o } LIMIT 5",
  DESCRIBE: "DESCRIBE <urn:test:s>",
  "comments and prefixes":
    "# COPY DROP ALL\nPREFIX t: <urn:test:>\nSELECT ?s WHERE { ?s t:p ?o } LIMIT 5",
  "subquery":
    "SELECT ?s WHERE { { SELECT ?s WHERE { ?s ?p ?o } LIMIT 3 } } LIMIT 3",
  "keywords in string literals":
    'SELECT ?s WHERE { ?s ?p "COPY MOVE ADD INSERT DELETE DROP" } LIMIT 5',
  "keywords in IRIs": "SELECT ?o WHERE { <urn:test:copy:move:add> ?p ?o }",
  "keyword-named prefix":
    "PREFIX load: <urn:test:load#>\nSELECT ?o WHERE { ?s load:clear ?o }",
};

for (const [name, query] of Object.entries(ACCEPTED)) {
  Deno.test(`read-only executeSparql accepts ${name}`, async () => {
    const { res, forwarded } = await run(query);
    assertEquals(res.success, true);
    assertEquals(forwarded, 1);
  });
}

Deno.test("allowUpdates true still forwards updates", async () => {
  let forwarded = 0;
  const tool = createExecuteSparqlTool({
    sparql: () => {
      forwarded++;
      return Promise.resolve({ kind: "void" } as SparqlResponse);
    },
  }, { allowUpdates: true });
  await tool.execute!(
    { query: REJECTED.COPY },
    { toolCallId: "t", messages: [], context: {} },
  );
  assertEquals(forwarded, 1);
});
