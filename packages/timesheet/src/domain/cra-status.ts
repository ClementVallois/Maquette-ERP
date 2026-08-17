export const CRA_STATUSES = ['draft', 'submitted', 'refused', 'validated'] as const;

export type CraStatus = (typeof CRA_STATUSES)[number];
