# @wazoo/tools

Vercel AI SDK tools integration for Wazoo and Worlds knowledge graphs.

## Installation

```bash
# JSR (Deno / Node / Bun)
npx jsr add @wazoo/tools
deno add jsr:@wazoo/tools
bunx jsr add @wazoo/tools
```

## Quick Start

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { WorldsSdk } from "@worlds/sdk";
import { MemoryStore, WazooSparqlEngine } from "@wazoo/sparql-engine";
import { RdfjsQuadStore, RdfjsSearchIndex } from "@worlds/sdk/rdfjs";
import { createTools } from "@wazoo/tools";

const store = new MemoryStore();
const worlds = new WorldsSdk({
  quadStore: new RdfjsQuadStore({ store }),
  searchIndex: new RdfjsSearchIndex(store),
  sparqlEngine: new WazooSparqlEngine({ store }),
});

const tools = createTools({
  client: worlds,
});

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt:
    "Find all entities in the knowledge base and describe their relations.",
});
```

## Included Tools

- `createTools`: full lifecycle surface for a self-managing agent.
- `createRecallTools`: read-only `searchWorld` and `executeSparql`.
- `createIngestTools`: RDF import/export, read-only verification SPARQL, and
  optional `resolveEntity`.
- `createAdministrativeTools`: RDF import/export, `reindexWorld`, writable
  SPARQL when explicitly enabled, and optional `resolveEntity`.

`searchWorld` supports optional two-stage retrieval: pass `searchOptions.rerank`
with a caller-supplied AI SDK `RerankingModel` (e.g.
`cohere.reranking("rerank-v3.5")`) to recall generously, reorder with the
cross-encoder, and cut to `topN`. A reranker failure degrades ordering, not the
tool call. The reranking model is caller-supplied, so no provider dependency is
bundled here.

The full surface is intentionally available as a one-size-fits-all starting
point. Phase-specific factories prevent recall agents from seeing mutation and
identity-management capabilities they should not invoke.

The identity layer persists canonical entities, aliases, and co-reference links
through `WorldsEntityStore` when backed by a Worlds SDK client. Canonical IDs
are generated once by code and never derived from mutable names or ontology
fields.

## Releases

Every push to `main` runs the [Publish workflow](.github/workflows/publish.yml),
which publishes only when `deno.json`'s `version` is not yet on JSR:

- **Release PR** (bumps `version`): merging it publishes the new version of
  `@wazoo/tools`.
- **Routine PR** (no bump): the Publish job skips green with a notice. That is
  expected, not a failure.

To release, bump `version` in `deno.json` (minor for additive public API, patch
for fixes) in the PR that should ship. If the package ever imports a pinned
`jsr:@wazoo/tools@<version>` of itself, commit that entry to `deno.lock`;
otherwise a cold CI run rewrites the lockfile and `deno publish` aborts on the
dirty tree.

## License

MIT
