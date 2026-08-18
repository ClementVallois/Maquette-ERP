// Deliberate violations. Shipped domain code, where every way a float reaches a monetary value is
// refused — including the literal that would carry a VAT rate as `0.2`. See README.md here.
export const parsed = parseFloat('150.50');
export const converted = Number('150.50');
export const recovered = Math.round(1505 / 2);
export const rate = 0.2;
// A float with no dot in it. `85e-3` is 0.085 — the exact value ADR-0035 was written about — and a
// selector anchored on the decimal point cannot see it.
export const exponent = 85e-3;
