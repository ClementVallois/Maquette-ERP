// Deliberate violation: the same module, reached past its entry point. See README.md.
import { CRA_STATUSES } from '../../../packages/timesheet/src/domain/cra-status.ts';

export const reachedPastTheIndex = CRA_STATUSES;
