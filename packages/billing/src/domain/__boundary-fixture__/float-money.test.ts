// Deliberate violations, in a file named `*.test.ts` on purpose: this is the scope where the ban
// on a decimal literal is lifted and the ban on the calls is not. See README.md here.
export const parsed = parseFloat('150.50');
export const converted = Number('150.50');
export const recovered = Math.round(1505 / 2);

// Allowed here, and asserted to be: a negative test proves a factory refuses a float by handing
// it one, which cannot be written without writing a float.
export const refusedByAFactory = 1.5;
