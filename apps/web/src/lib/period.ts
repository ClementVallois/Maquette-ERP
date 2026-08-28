/**
 * "What period is it right now" — a **state** question, not a display format, which is why this
 * lives beside `format.ts` rather than inside it: `format.ts` is a deliberate copy of the API's
 * own `format.ts` (Annexe C.8, same outputs, tested against it), and a wall-clock reader has no
 * server-side counterpart to mirror.
 *
 * First written for `features/cra`'s "months ahead" picker (task 6.3): "the seed's own calendar
 * lives in 2026, and the demo runs in real time against it, so 'the period a brand-new consultant
 * should open first' is genuinely today's month, not a value the seed dictates." Phase 8's
 * dashboard (task 8.4) needs the identical answer — `GET /api/v1/dashboard` requires an explicit
 * `period` query parameter with no server-side default (`PeriodQuery`, `apps/api/src/routes/
 * api.ts` — confirmed live: no `period` answers `400 malformed-request`), so the SPA is the one
 * that has to say what "now" means, the same way it already does for the CRA picker.
 */
export function currentPeriod(): string {
  const now = new Date();

  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
