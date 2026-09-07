import type { AssignmentInput } from './types';

/**
 * Why a filled-in assignment form must not be submitted.
 *
 * `consultant` is reachable through the UI and is rendered next to the field: the consultant
 * picker is a `Button`+`Popover` pair (`single-select-combobox.tsx`), not a native
 * `<select required>`, so no browser constraint validation stands behind it and "Affecter" would
 * otherwise silently do nothing.
 *
 * `incomplete` is not reachable that way — mission and start date still carry a native `required`,
 * and the browser refuses the submit event before the handler runs. It stays a refusal rather than
 * an assumption, so that removing one of those attributes surfaces as a blocked submit instead of
 * a request built from an empty field.
 */
export type AssignmentFormRefusal = 'consultant' | 'incomplete';

/** The refusal this form earns, or `null` when it is ready to be sent. */
export function assignmentFormRefusal(form: AssignmentInput): AssignmentFormRefusal | null {
  if (form.consultantId === '') return 'consultant';
  if (form.missionId === '' || form.fromDate === '') return 'incomplete';

  return null;
}
