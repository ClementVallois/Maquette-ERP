/**
 * `{name}` filled from a value the model carries.
 *
 * It exists so that a number or a name never lives inside a label (ADR-0017 for the invoice's
 * mandatory mentions, ADR-0026 for every other visible string): the sentence is reviewable in
 * `labels.ts` as a whole, and what goes into the hole comes from the record.
 *
 * A key with no value is left as it was written, rather than replaced with an empty string. A
 * sentence with a visible `{name}` in it is a bug somebody reports; a sentence with a hole silently
 * closed is a bug nobody sees.
 */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}
