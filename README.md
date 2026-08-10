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
import { Worlds } from "@worlds/client";
import { createTools } from "@wazoo/tools";

const worlds = new Worlds({
  apiKey: process.env.WORLDS_TOKEN,
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
  graphs.
- `discoverSchema`: Explore ontology classes and predicate relations.
- `importRdf`: Import RDF triples into a world graph.
- `exportRdf`: Export RDF triples from a world graph.

## License

MIT
