import { describe, expect, it, vi } from 'vitest';
import { forwardFinancialApproval } from '../src/entrypoints/financial-approval-relay';

const origin = 'https://synthetic-approval.example.invalid';
const path = '/financial-confirmation/10000000-0000-4000-8000-000000000001';
const assertion = 'synthetic.assertion.only';

describe('isolated browser approval relay', () => {
  it.each(['GET', 'POST'])('preserves the original %s request and security response headers', async method => {
    const headers = { 'Cf-Access-Jwt-Assertion': assertion, Origin: origin, Cookie: '__Secure-pea-confirm=synthetic',
      'Content-Type': 'application/x-www-form-urlencoded' };
    const request = new Request(`${origin}${path}${method === 'GET' ? '?utm_source=chatgpt.com' : ''}`,
      { method, headers, ...(method === 'POST' ? { body: 'csrf=synthetic' } : {}) });
    const response = new Response('synthetic approval only', { headers: { 'Content-Security-Policy': "default-src 'none'",
      'Set-Cookie': '__Secure-pea-confirm=synthetic; Secure; HttpOnly', 'Cache-Control': 'no-store' } });
    const fetch = vi.fn(async (received: RequestInfo | URL) => {
      expect(received).toBe(request);
      if (received instanceof Request && method === 'POST') expect(await received.text()).toBe('csrf=synthetic');
      return response;
    });
    expect(await forwardFinancialApproval(request, origin, { fetch })).toBe(response);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['/mcp', 'POST', {}, 404], ['/api/v1/portfolio/positions', 'GET', {}, 404],
    ['/financial-confirmation/not-a-uuid', 'GET', {}, 404], [path, 'DELETE', {}, 405],
    [path, 'GET', { Authorization: 'Bearer synthetic' }, 403],
    [path, 'GET', { 'CF-Access-Client-Id': 'synthetic' }, 403],
    [path, 'GET', { 'CF-Access-Client-Secret': 'synthetic' }, 403],
  ] as const)('does not forward an unsupported route, method or credential: %s %s %j', async (route, method, extra, status) => {
    const fetch = vi.fn();
    const response = await forwardFinancialApproval(new Request(`${origin}${route}`, { method,
      headers: { 'Cf-Access-Jwt-Assertion': assertion, ...extra } }), origin, { fetch });
    expect(response.status).toBe(status); expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed for missing assertion, wrong origin and unavailable backend', async () => {
    const fetch = vi.fn();
    expect((await forwardFinancialApproval(new Request(`${origin}${path}`), origin, { fetch })).status).toBe(401);
    expect((await forwardFinancialApproval(new Request(`https://other.example.invalid${path}`), origin, { fetch })).status).toBe(403);
    expect((await forwardFinancialApproval(new Request(`${origin}${path}`), `${origin}/path`, { fetch })).status).toBe(503);
    expect((await forwardFinancialApproval(new Request(`${origin}${path}`), 'https://', { fetch })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    const unavailable = await forwardFinancialApproval(new Request(`${origin}${path}`, {
      headers: { 'Cf-Access-Jwt-Assertion': assertion },
    }), origin, { fetch: async () => { throw new Error('Synthetic sensitive backend detail'); } });
    expect(unavailable.status).toBe(503); expect(await unavailable.text()).toBe('financial_service_unavailable');
  });
});
