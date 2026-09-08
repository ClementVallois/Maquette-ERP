/**
 * "What period is it right now" — a **state** question, not a display format, which is why this
 * lives beside `format.ts` rather than inside it: `format.ts` is a deliberate copy of the API's
 * own `format.ts` (Annexe C.8, same outputs, tested against it), and a wall-clock reader has no
 * server-side counterpart to mirror.
 *
 * The seed's calendar lives in 2026 and the demo runs in real time against it, so "the period a
 * brand-new consultant should open first" is genuinely today's month, not a value the seed
 * dictates. Both `features/cra`'s "months ahead" picker and the dashboard read it from here:
 * `GET /api/v1/dashboard` requires an explicit `period` with no server-side default
 * (`PeriodQuery`, `apps/api/src/routes/schemas.ts`; no `period` answers `400 malformed-request`),
 * so the SPA is what has to say what "now" means.
 */
export function currentPeriod(): string {
  const now = new Date();

  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
