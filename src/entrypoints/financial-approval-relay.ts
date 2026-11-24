/** Browser-only ingress. The financial Worker still verifies every signed assertion
 * and all approval/CSRF invariants. A Service binding grants no financial permission.
 */
export async function forwardFinancialApproval(request: Request, origin: string,
  financial: Pick<Fetcher, 'fetch'>): Promise<Response> {
  const reject = (status: number, code: string) => new Response(code, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
  const url = new URL(request.url);
  try {
    if (!origin.startsWith('https://') || new URL(origin).origin !== origin) return reject(503, 'financial_service_unavailable');
  } catch { return reject(503, 'financial_service_unavailable'); }
  if (url.origin !== origin) return reject(403, 'origin_forbidden');
  if (!/^\/financial-confirmation\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url.pathname))
    return reject(404, 'not_found');
  if (request.method !== 'GET' && request.method !== 'POST') return reject(405, 'method_not_allowed');
  if (request.headers.has('Authorization') || request.headers.has('CF-Access-Client-Id') || request.headers.has('CF-Access-Client-Secret'))
    return reject(403, 'browser_confirmation_required');
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) return reject(401, 'invalid_token');
  try {
    // Preserve the original URL, signed assertion, cookies, Origin and body.
    // Never rewrite a request onto the trusted confirmation origin.
    return await financial.fetch(request);
  } catch { return reject(503, 'financial_service_unavailable'); }
}

export default {
  fetch(request: Request, environment: FinancialApprovalRelayEnv): Promise<Response> {
    return forwardFinancialApproval(request, environment.FINANCIAL_CONFIRMATION_ORIGIN, environment.FINANCIAL);
  },
} satisfies ExportedHandler<FinancialApprovalRelayEnv>;
