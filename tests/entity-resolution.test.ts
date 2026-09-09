import { assertAlmostEquals, assertEquals } from "@std/assert";
import { createResolveEntityTool } from "../src/entity-resolution-tool.ts";
import {
  cosineSimilarity,
  EntityResolver,
  InMemoryEntityStore,
  normalizeName,
} from "../src/mod.ts";
import { createTools } from "../src/mod.ts";

Deno.test("normalizeName lowercases and collapses whitespace", () => {
  assertEquals(
    normalizeName("  Harborview   Medical  Center "),
    "harborview medical center",
  );
});

Deno.test("cosineSimilarity is 1 for identical vectors and 0 for orthogonal ones", () => {
  assertAlmostEquals(cosineSimilarity([1, 0, 1], [1, 0, 1]), 1, 1e-12);
  assertEquals(cosineSimilarity([1, 0], [0, 1]), 0);
});

Deno.test("resolve mints a stable content-hash ID and absorbs the same name", async () => {
  const resolver = new EntityResolver();
  const first = await resolver.resolve({
    name: "Melanie",
    classIri: "schema:Person",
    scopedUrn: "urn:person:s1/melanie",
    sessionId: "s1",
  });
  const second = await resolver.resolve({
    name: "Melanie",
    classIri: "schema:Person",
    scopedUrn: "urn:person:s2/melanie",
    sessionId: "s2",
  });

  assertEquals(first.matched, false);
  assertEquals(second.matched, true);
  assertEquals(second.id, first.id);
  const entity = await resolver.lookup(first.id);
  assertEquals(entity!.name, "Melanie");
  assertEquals(entity!.aliases.length, 1); // aliases keyed by normalized name
});

Deno.test("alias containment merges 'Harborview' into 'Harborview Medical Center'", async () => {
  const resolver = new EntityResolver();
  const org = await resolver.resolve({
    name: "Harborview Medical Center",
    classIri: "schema:Organization",
  });
  const short = await resolver.resolve({
    name: "Harborview",
    classIri: "schema:Organization",
  });

  assertEquals(short.matched, true);
  assertEquals(short.id, org.id);
  assertEquals(short.score, 0.9); // containment fallback score
});

Deno.test("classGuard prevents merging entities across schema classes", async () => {
  const resolver = new EntityResolver();
  const person = await resolver.resolve({
    name: "Harborview",
    classIri: "schema:Person",
  });
  const org = await resolver.resolve({
    name: "Harborview",
    classIri: "schema:Organization",
  });

  // The candidate must NOT be reported as a match, and its ID must be
  // fresh (collision-disambiguated, not the existing entity's ID).
  assertEquals(org.matched, false);
  assertEquals(org.id !== person.id, true);
});

Deno.test("sameSessionGuard prevents merging two entities from one session", async () => {
  const resolver = new EntityResolver();
  // Two distinct names that both contain "harborview", extracted in one
  // session: they are minted as separate entities and must stay separate.
  const gala = await resolver.resolve({
    name: "Harborview charity gala",
    classIri: "schema:Event",
    sessionId: "s1",
  });
  const org = await resolver.resolve({
    name: "Harborview",
    classIri: "schema:Organization",
    sessionId: "s1",
  });

  assertEquals(org.matched, false);
  assertEquals(org.id !== gala.id, true);
});

Deno.test("embedding path merges close vectors and separates distinct ones", async () => {
  const resolver = new EntityResolver(undefined, { threshold: 0.9 });
  const base = await resolver.resolve({
    name: "Melanie",
    embedding: [1, 0.9, 0.1],
  });
  const near = await resolver.resolve({
    name: "Melanie",
    embedding: [0.98, 0.9, 0.12],
  });
  const far = await resolver.resolve({
    name: "Melanie",
    embedding: [0, 1, 0.9],
    scopedUrn: "urn:person:s9/x",
  });

  assertEquals(near.matched, true);
  assertEquals(near.id, base.id);
  assertEquals(far.matched, false);
  assertEquals(far.id !== base.id, true);
});

Deno.test("merge combines alias tables into the surviving entity", async () => {
  const resolver = new EntityResolver();
  const a = await resolver.resolve({
    name: "Anna",
    scopedUrn: "urn:person:s1/anna",
  });
  const b = await resolver.resolve({
    name: "Anna K.",
    scopedUrn: "urn:person:s2/anna-k",
  });

  const merged = await resolver.merge(a.id, b.id);
  assertEquals(merged, b.id);
  const entity = (await resolver.lookup(b.id))!;
  assertEquals(entity.aliases.includes("anna"), true);
  assertEquals(entity.aliases.includes("anna k."), true);
});

Deno.test("createResolveEntityTool exposes resolve, lookup, merge, and stats", async () => {
  const resolver = new EntityResolver();
  const tool = createResolveEntityTool(resolver);

  // @ts-ignore testing tool execution directly
  const resolved = await tool.execute!(
    {
      operation: "resolve",
      name: "Melanie",
      scopedUrn: "urn:person:s1/melanie",
    },
    { toolCallId: "1", messages: [], context: {} },
  ) as { success: boolean; data?: { id: string } };

  assertEquals(resolved.success, true);

  // @ts-ignore testing tool execution directly
  const looked = await tool.execute!(
    { operation: "lookup", id: resolved.data!.id },
    { toolCallId: "2", messages: [], context: {} },
  ) as { success: boolean; data?: { name: string } };
  assertEquals(looked.success, true);
  assertEquals(looked.data!.name, "Melanie");

  // @ts-ignore testing tool execution directly
  const stats = await tool.execute!(
    { operation: "stats" },
    { toolCallId: "3", messages: [], context: {} },
  ) as { success: boolean; data?: { entities: number } };
  assertEquals(stats.data!.entities, 1);

  // @ts-ignore testing tool execution directly
  const bad = await tool.execute!(
    { operation: "resolve" },
    { toolCallId: "4", messages: [], context: {} },
  ) as { success: boolean; error?: string };
  assertEquals(bad.success, false);
});

Deno.test("createTools adds resolveEntity when an entityResolver is supplied", () => {
  const mockClient = {
    sparql: () => Promise.resolve({ kind: "bindings", data: [] }),
    search: () => Promise.resolve({}),
    importRdf: () => Promise.resolve({}),
    exportRdf: () => Promise.resolve({}),
  };
  const without = createTools({
    client: mockClient as unknown as Parameters<
      typeof createTools
    >[0]["client"],
  });
  assertEquals("resolveEntity" in without, false);

  const withER = createTools({
    client: mockClient as unknown as Parameters<
      typeof createTools
    >[0]["client"],
    entityResolver: new EntityResolver(new InMemoryEntityStore()),
  });
  assertEquals("resolveEntity" in withER, true);
});
