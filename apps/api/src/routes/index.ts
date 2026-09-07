import type { FastifyInstance } from 'fastify';

import type { ServerDependencies } from '../dependencies.ts';

import { registerAssignmentRoutes } from './assignments.ts';
import { registerCraRoutes } from './cra.ts';
import { registerDashboardRoutes } from './dashboard.ts';
import { registerInvoiceRoutes } from './invoices.ts';
import { registerPreFacturierRoutes } from './pre-facturier.ts';

export function registerApiRoutes(app: FastifyInstance, dependencies: ServerDependencies): void {
  registerPreFacturierRoutes(app, dependencies);
  registerCraRoutes(app, dependencies);
  registerInvoiceRoutes(app, dependencies);
  registerAssignmentRoutes(app, dependencies);
  registerDashboardRoutes(app, dependencies);
}
