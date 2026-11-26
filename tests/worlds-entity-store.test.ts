import assert from "node:assert/strict";
import test from "node:test";
import type { WorldsSdkInterface } from "@worlds/sdk";
import { WorldsEntityStore } from "../src/mod.ts";

test("WorldsEntityStore persists canonical entities and co-reference links as RDF", async () => {
  const imports: string[] = [];
  const client = {
    import: (request: { source: { data: string } }) => {
      imports.push(request.source.data);
      return Promise.resolve();
    },
    sparql: () =>
      Promise.resolve({
        kind: "select",
        bindings: [
          {
            name: { type: "literal", value: "Melanie" },
            class: { type: "uri", value: "http://schema.org/Person" },
            alias: { type: "literal", value: "melanie" },
            aliasUrn: { type: "uri", value: "urn:person:s1/melanie" },
            session: { type: "literal", value: "s1" },
          },
        ],
      }),
  } as unknown as WorldsSdkInterface;

  const store = new WorldsEntityStore(client);
  await store.put({
    id: "urn:entity:generated-1",
    name: "Melanie",
    classIri: "http://schema.org/Person",
    aliases: new Map([["melanie", "urn:person:s1/melanie"]]),
    sessions: new Set(["s1"]),
  });
  await store.recordLink(
    "urn:entity:generated-1",
    "urn:person:s1/melanie",
    "http://www.w3.org/2004/02/skos/core#exactMatch",
  );

  assert.deepStrictEqual(imports.length, 2);
  assert.ok(imports[0].includes("identity:CanonicalEntity"));
  assert.ok(imports[0].includes("urn:entity:generated-1"));
  assert.ok(
    imports[1].includes("http://www.w3.org/2004/02/skos/core#exactMatch"),
  );

  const found = await store.get("urn:entity:generated-1");
  assert.deepStrictEqual(found?.name, "Melanie");
  assert.deepStrictEqual(found?.classIri, "http://schema.org/Person");
  assert.deepStrictEqual(found?.sessions.has("s1"), true);
});
