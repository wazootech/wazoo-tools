export const EXECUTE_SPARQL_TOOL_DESCRIPTION =
  "Execute a SPARQL query against the knowledge graph. Defaults to read-only queries (SELECT, ASK, CONSTRUCT, DESCRIBE).";

export const ENTITY_RESOLUTION_TOOL_DESCRIPTION =
  "Resolve, look up, merge, and count canonical entities across sessions. " +
  "Use resolve to map a candidate name (optionally with an embedding and " +
  "session-scoped URN) to a stable canonical entity ID, absorbing aliases " +
  "like 'Mel' vs 'Melanie' automatically.";

export const SEARCH_WORLD_TOOL_DESCRIPTION =
  "Perform semantic and keyword search across entities, predicates, and facts in the knowledge graph.";

export const IMPORT_RDF_TOOL_DESCRIPTION =
  "Import RDF graph triples into the knowledge base.";

export const EXPORT_RDF_TOOL_DESCRIPTION =
  "Export RDF graph triples from the knowledge base in requested serialization format.";
