// Deliberate violations, in `application/` on purpose: the layer that reads a rate off the
// reference and hands it to a line, and the layer the money rule did not cover when it was first
// written. The decimal literal is NOT here — that ban stays scoped to the domain (ADR-0035).
export const parsed = parseFloat('150.50');
export const converted = Number('150.50');
export const recovered = Math.round(1505 / 2);
