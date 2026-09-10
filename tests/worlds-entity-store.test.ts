import { assertEquals, assertStringIncludes } from "@std/assert";
import type { WorldsSdkInterface } from "@worlds/sdk";
import { WorldsEntityStore } from "../src/mod.ts";

Deno.test("WorldsEntityStore persists canonical entities and co-reference links as RDF", async () => {
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

  assertEquals(imports.length, 2);
  assertStringIncludes(imports[0], "identity:CanonicalEntity");
  assertStringIncludes(imports[0], "urn:entity:generated-1");
  assertStringIncludes(
    imports[1],
    "http://www.w3.org/2004/02/skos/core#exactMatch",
  );

  const found = await store.get("urn:entity:generated-1");
  assertEquals(found?.name, "Melanie");
  assertEquals(found?.classIri, "http://schema.org/Person");
  assertEquals(found?.sessions.has("s1"), true);
});
