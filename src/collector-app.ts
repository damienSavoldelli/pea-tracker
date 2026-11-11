import { createApp } from './app';
import type { QuotationService } from './application/quotations';
import type { TokenVerifier } from './adapters/auth/token-verifier';

// Explicit opt-in only; no deployed entrypoint imports this composition.
// Reuse the existing distinct audience/client/subject/scope verification policy.
export function createCollectorApp(verifier: TokenVerifier, service: QuotationService) {
  return createApp({ quotations: { service, ingestionOnly: true, authenticate: request => verifier.authenticate(request, 'collector') } });
}
