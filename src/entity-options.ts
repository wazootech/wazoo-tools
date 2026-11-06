import type { EntityResolverOptions } from "./entity-types.ts";

/** Fill every resolver option with its documented default. */
export function withDefaults(
  options?: EntityResolverOptions,
): Required<EntityResolverOptions> {
  return {
    threshold: options?.threshold ?? 0.9,
    stringThreshold: options?.stringThreshold ?? 0.9,
    exactMatchIri: options?.exactMatchIri ??
      "http://www.w3.org/2004/02/skos/core#exactMatch",
    closeMatchIri: options?.closeMatchIri ??
      "http://www.w3.org/2004/02/skos/core#closeMatch",
    canonicalIdGenerator: options?.canonicalIdGenerator ??
      (() => `urn:entity:${crypto.randomUUID()}`),
  };
}
