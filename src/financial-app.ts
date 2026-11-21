import { createApp } from './app';
import type { ProtectedMcpDependencies } from './adapters/mcp/handler';
import { financialConfirmationRoutes } from './adapters/rest/financial-confirmation';
import type { FinancialAccessAuthenticator } from './adapters/auth/financial-access';
import type { FinancialMcpService } from './application/financial-mcp';

/** Explicit opt-in composition on the existing Worker architecture; not a deployed entrypoint. */
export function createFinancialManagementApp(dependencies: {
  mcp: Omit<ProtectedMcpDependencies, 'authenticate' | 'financialOperations'>;
  rest?: Omit<NonNullable<Parameters<typeof createApp>[0]>, 'mcp'>;
  financial: FinancialMcpService; access: FinancialAccessAuthenticator; origin: string;
}) {
  const app = createApp({ ...dependencies.rest, mcp: { ...dependencies.mcp, financialOperations: dependencies.financial,
    authenticate: request => dependencies.access.authenticateMcp(request) } });
  app.route('/financial-confirmation', financialConfirmationRoutes(dependencies.financial,
    request => dependencies.access.authenticateBrowser(request), dependencies.origin));
  return app;
}
