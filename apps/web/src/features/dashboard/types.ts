/**
 * Re-exported from `@erp/contracts` rather than hand-duplicated. This file stays so every other
 * file in this feature keeps importing `./types`; the single description lives in
 * `packages/contracts/src/dashboard.ts`, shared with `apps/api/src/routes/dashboard.ts`.
 */
export type {
  BillingDashboard,
  BillingQueueRow,
  ConsultantDashboard,
  ConsultantOrgChart,
  DashboardActivity,
  DashboardCraStatus,
  DashboardResponse,
  ManagerDashboard,
  ManagerOrgChart,
  ManagerQueueRow,
  ManagerStaffing,
  OrgChartMember,
  OrgChartResponse,
} from '@erp/contracts';
