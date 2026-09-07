/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated. This file
 * stays so every other file in this feature keeps importing `./types` — the single description
 * now lives in `packages/contracts/src/dashboard.ts`, shared with
 * `apps/api/src/routes/dashboard.ts`. That file also carries the confirmed-against-the-handler
 * history this file used to hold — read it there.
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
