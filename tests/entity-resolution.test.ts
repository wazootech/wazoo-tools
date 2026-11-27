import assert from "node:assert/strict";
import test from "node:test";
import { createResolveEntityTool } from "../src/entity-resolution-tool.ts";
import {
  cosineSimilarity,
  EntityResolver,
  InMemoryEntityStore,
  normalizeName,
} from "../src/mod.ts";
import { createTools } from "../src/mod.ts";

test("normalizeName lowercases and collapses whitespace", () => {
  assert.deepStrictEqual(
    normalizeName("  Harborview   Medical  Center "),
    "harborview medical center",
  );
});

test("cosineSimilarity is 1 for identical vectors and 0 for orthogonal ones", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 1], [1, 0, 1]) - 1) < 1e-12);
  assert.deepStrictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("resolve generates a stable ID and absorbs the same name", async () => {
  const resolver = new EntityResolver(undefined, {
    canonicalIdGenerator: () => "urn:entity:test-001",
  });
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

  assert.deepStrictEqual(first.matched, false);
  assert.deepStrictEqual(second.matched, true);
  assert.deepStrictEqual(first.id, "urn:entity:test-001");
  assert.deepStrictEqual(second.id, first.id);
  const entity = await resolver.lookup(first.id);
  assert.deepStrictEqual(entity!.name, "Melanie");
  assert.deepStrictEqual(entity!.aliases.length, 1); // aliases keyed by normalized name
});

test("alias containment merges 'Harborview' into 'Harborview Medical Center'", async () => {
  const resolver = new EntityResolver();
  const org = await resolver.resolve({
    name: "Harborview Medical Center",
    classIri: "schema:Organization",
  });
  const short = await resolver.resolve({
    name: "Harborview",
    classIri: "schema:Organization",
  });

  assert.deepStrictEqual(short.matched, true);
  assert.deepStrictEqual(short.id, org.id);
  assert.deepStrictEqual(short.score, 0.9); // containment fallback score
});

test("classGuard prevents merging entities across schema classes", async () => {
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
  assert.deepStrictEqual(org.matched, false);
  assert.deepStrictEqual(org.id !== person.id, true);
});

test("sameSessionGuard prevents merging two entities from one session", async () => {
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

  assert.deepStrictEqual(org.matched, false);
  assert.deepStrictEqual(org.id !== gala.id, true);
});

test("embedding path merges close vectors and separates distinct ones", async () => {
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

  assert.deepStrictEqual(near.matched, true);
  assert.deepStrictEqual(near.id, base.id);
  assert.deepStrictEqual(far.matched, false);
  assert.deepStrictEqual(far.id !== base.id, true);
});

test("merge combines alias tables into the surviving entity", async () => {
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
  assert.deepStrictEqual(merged, b.id);
  const entity = (await resolver.lookup(b.id))!;
  assert.deepStrictEqual(entity.aliases.includes("anna"), true);
  assert.deepStrictEqual(entity.aliases.includes("anna k."), true);
});

test("createResolveEntityTool exposes resolve, lookup, merge, and stats", async () => {
  const resolver = new EntityResolver();
  const tool = createResolveEntityTool(resolver);

  const resolved = (await tool.execute!(
    {
      operation: "resolve",
      name: "Melanie",
      scopedUrn: "urn:person:s1/melanie",
    },
    { toolCallId: "1", messages: [], context: {} },
  )) as { success: boolean; data?: { id: string } };

  assert.deepStrictEqual(resolved.success, true);

  const looked = (await tool.execute!(
    { operation: "lookup", id: resolved.data!.id },
    { toolCallId: "2", messages: [], context: {} },
  )) as { success: boolean; data?: { name: string } };
  assert.deepStrictEqual(looked.success, true);
  assert.deepStrictEqual(looked.data!.name, "Melanie");

  const stats = (await tool.execute!(
    { operation: "stats" },
    { toolCallId: "3", messages: [], context: {} },
  )) as { success: boolean; data?: { entities: number } };
  assert.deepStrictEqual(stats.data!.entities, 1);

  const bad = (await tool.execute!(
    { operation: "resolve" },
    { toolCallId: "4", messages: [], context: {} },
  )) as { success: boolean; error?: string };
  assert.deepStrictEqual(bad.success, false);
});

test("createTools adds resolveEntity when an entityResolver is supplied", () => {
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
  assert.deepStrictEqual("resolveEntity" in without, false);

  const withER = createTools({
    client: mockClient as unknown as Parameters<
      typeof createTools
    >[0]["client"],
    entityResolver: new EntityResolver(new InMemoryEntityStore()),
  });
  assert.deepStrictEqual("resolveEntity" in withER, true);
});
