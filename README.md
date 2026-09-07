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
  worlds,
  sources: ["my-world"],
});

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools,
  prompt:
    "Find all entities in the knowledge base and describe their relations.",
});
```

## Included Tools

- `executeSparql`: Execute SPARQL queries against the graph (read-only by
  default).
- `searchWorld` / `searchEntities`: Vector and semantic search against knowledge
  graphs. Optional two-stage retrieval: pass `searchOptions.rerank` with a
  caller-supplied AI SDK `RerankingModel` (e.g.
  `cohere.reranking("rerank-v3.5")`) to recall generously, reorder with the
  cross-encoder, and cut to `topN`. A reranker failure degrades ordering, not
  the tool call.
- `discoverSchema`: Explore ontology classes and predicate relations.
- `resolveEntity`: Cross-session entity resolution — map candidate names (with
  optional embeddings) to stable canonical IDs, absorbing aliases
  (`EntityResolver` is exported standalone for non-agent use).
- `importRdf`: Import RDF triples into a world graph.
- `exportRdf`: Export RDF triples from a world graph.

## License

MIT
