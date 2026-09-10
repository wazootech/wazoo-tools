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

The full surface is intentionally available as a one-size-fits-all starting
point. Phase-specific factories prevent recall agents from seeing mutation and
identity-management capabilities they should not invoke.

The identity layer persists canonical entities, aliases, and co-reference links
through `WorldsEntityStore` when backed by a Worlds SDK client. Canonical IDs
are generated once by code and never derived from mutable names or ontology
fields.

## License

MIT
