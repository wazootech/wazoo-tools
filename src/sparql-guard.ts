import { Parser } from "@wazoo/sparql-engine/parser";

/** Query forms a read-only tool may forward. Everything else fails closed. */
const READ_FORMS: ReadonlySet<string> = new Set(["query"]);
const READ_QUERY_TYPES: ReadonlySet<string> = new Set([
  "SELECT",
  "ASK",
  "CONSTRUCT",
  "DESCRIBE",
]);

/**
 * Returns true only when the text parses as a SPARQL query of form SELECT,
 * ASK, CONSTRUCT, or DESCRIBE. Updates (including graph management) and
 * anything that fails to parse are rejected.
 */
export function isReadOnlySparql(text: string, baseIri?: string): boolean {
  try {
    const parsed = new Parser({ baseIRI: baseIri }).parse(text) as {
      type: string;
      queryType?: string;
    };
    return READ_FORMS.has(parsed.type) &&
      READ_QUERY_TYPES.has(parsed.queryType ?? "");
  } catch {
    return false;
  }
}
