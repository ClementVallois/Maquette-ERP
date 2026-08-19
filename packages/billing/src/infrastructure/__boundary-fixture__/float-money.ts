// Deliberate violations, in `infrastructure/` on purpose: the layer that reads money out of
// Postgres, and the layer the money rule stopped covering when Phase 3 gave it its own ESLint
// block. `Number.parseInt` is on the last line and is NOT a violation — it is the integer-only
// subset the block's comment always claimed replaced the `Number()` ban.
export const parsed = parseFloat('150.50');
export const converted = Number('150.50');
export const recovered = Math.round(1505 / 2);
export const allowed = Number.parseInt('150', 10);
