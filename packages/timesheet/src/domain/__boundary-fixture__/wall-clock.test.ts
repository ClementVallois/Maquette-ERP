// Deliberate violations, in a file named `*.test.ts` on purpose: this is the scope where the ban
// on `new Date()` is narrowed to the wall clock. See README.md in this directory.
const stamped = new Date();
const millis = Date.now();

// Allowed here, and asserted to be: a fake clock is built from a literal instant.
const fixed = new Date('2026-03-09T09:00:00.000Z');

export const drift = [stamped, millis, fixed];
