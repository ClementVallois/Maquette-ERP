import type { AssignmentInput } from './types';

/**
 * Why a filled-in assignment form must not be submitted.
 *
 * `consultant` and `mission` are both reachable through the UI and are rendered next to their
 * field: the consultant and mission pickers are `Button`+`Popover` pairs
 * (`single-select-combobox.tsx`), not native `<select required>`, so no browser constraint
 * validation stands behind either and "Affecter" would otherwise silently do nothing.
 *
 * `incomplete` is not reachable that way — the start date still carries a native `required`, and
 * the browser refuses the submit event before the handler runs. It stays a refusal rather than an
 * assumption, so that removing that attribute surfaces as a blocked submit instead of a request
 * built from an empty field.
 */
export type AssignmentFormRefusal = 'consultant' | 'mission' | 'incomplete';

/** The refusal this form earns, or `null` when it is ready to be sent. */
export function assignmentFormRefusal(form: AssignmentInput): AssignmentFormRefusal | null {
  if (form.consultantId === '') return 'consultant';
  if (form.missionId === '') return 'mission';
  if (form.fromDate === '') return 'incomplete';

  return null;
}
