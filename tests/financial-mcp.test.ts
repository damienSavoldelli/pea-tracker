import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { TransactionService } from '../src/application/transactions';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import { D1TransactionRepository } from '../src/adapters/d1/transactions';
import { MemoryFinancialApprovalRepository } from '../src/adapters/memory/financial-approvals';
import { D1FinancialApprovalRepository } from '../src/adapters/d1/financial-approvals';
import { FinancialAccessAuthenticator } from '../src/adapters/auth/financial-access';
import { financialConfirmationRoutes } from '../src/adapters/rest/financial-confirmation';
import { createAccessFinancialWorker } from '../src/entrypoints/access-financial';
import { forwardFinancialApproval } from '../src/entrypoints/financial-approval-relay';
import { createApp } from '../src/app';
import type { Principal } from '../src/application/authorization';
import type { TransactionInput } from '../src/domain/transactions';
import { accessFixture, accessConfig } from './helpers/access-fixtures';
import { firstId, openingInput, portfolioAdmin, portfolioFixture, portfolioReader, provenance } from './helpers/portfolio';

const portfolioId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const origin = 'https://synthetic-pea.example.invalid';
const at = '2026-11-10T10:00:00.000Z';
const writer: Principal = { subject: portfolioAdmin.subject, permissions: ['instruments:read', 'quotes:read', 'portfolio:read', 'portfolio:write'] };
const approver: Principal = { subject: portfolioAdmin.subject, permissions: ['portfolio:read', 'portfolio:approve'] };
const operation = (type: 'deposit' | 'withdrawal' | 'dividend' = 'deposit', amount = '10'): TransactionInput => ({ type, amount, currency: 'EUR', effective_at: at, provenance });
const trade = (type: 'buy' | 'sell' = 'buy'): Extract<TransactionInput, { type: 'buy' | 'sell' }> => ({ type, amount: '20', fees: '1', quantity: '1', instrument_id: firstId, currency: 'EUR', effective_at: at, provenance });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function fixture(kind: 'memory' | 'd1' = 'memory', simulated = false) {
  const f = await portfolioFixture(kind); cleanups.push(f.dispose);
  const initial = openingInput();
  const opening = await f.service.append(portfolioAdmin, { ...initial, cash: { currency: 'EUR', amount: '100' }, positions: [{ ...initial.positions[0]!, quantity: '2' }] }, 0, 'synthetic-opening');
  const transactions = f.local ? new D1TransactionRepository(f.local.db) : new MemoryTransactionRepository();
  const approvals = f.local ? new D1FinancialApprovalRepository(f.local.db) : new MemoryFinancialApprovalRepository();
  let now = '2026-11-21T10:00:00.000Z';
  const clock = () => now;
  const binding = { portfolio_id: portfolioId, owner_subject: writer.subject, opening_id: opening.id, opening_revision: opening.revision, kind: simulated ? 'simulated' as const : 'real' as const };
  const journal = new TransactionService(transactions, f.repository, f.instruments, binding, clock);
  const financialBinding = { portfolio_id: portfolioId, owner_subject: writer.subject };
  const service = new FinancialMcpService(journal, financialBinding, approvals, clock, origin);
  const prepare = (input: TransactionInput = operation()) => service.prepare(writer, portfolioId, input);
  async function approve(id: string) {
    const csrf = crypto.randomUUID(); await service.confirmationPage(approver, id, csrf); await service.approve(approver, id, csrf);
  }
  async function record(input: TransactionInput) {
    const prepared = await prepare(input); await approve(prepared.operation_id);
    return service.confirm(writer, { operation_id: prepared.operation_id, digest: prepared.proposal.digest });
  }
  return { ...f, openingService: f.service, journal, service, approvals, transactions, binding: financialBinding, prepare, approve, record, clock,
    setTime(value: string) { now = value; } };
}

describe('immutable financial preparation and single-use approval', () => {
  it.each([
    [operation(), '110', '2'], [operation('withdrawal'), '90', '2'], [operation('dividend'), '110', '2'],
    [trade(), '79', '3'], [trade('sell'), '119', '1'],
  ] as const)('records %s through the existing engine only after a distinct approval', async (input, cash, quantity) => {
    const f = await fixture(); const before = await f.openingService.get(portfolioReader);
    const p = await f.prepare(input);
    expect(p.summary.cash_after.amount).toBe(cash);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
    expect(p.confirmation_url).toBe(`${origin}/financial-confirmation/${p.operation_id}`);
    const command = { operation_id: p.operation_id, digest: p.proposal.digest };
    await expect(f.service.confirm(writer, command)).rejects.toMatchObject({ code: 'financial_confirmation_required' });
    await f.approve(p.operation_id);
    const result = await f.service.confirm(writer, command);
    expect(result.balances.cash.amount).toBe(cash); expect(result.balances.positions[0]?.quantity).toBe(quantity);
    expect(await f.service.confirm(writer, command)).toEqual(result);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(1);
    expect(await f.openingService.get(portfolioReader)).toEqual(before);
    expect(await f.approvals.get(p.operation_id)).toMatchObject({ status: 'consumed', approved_at: f.clock(), consumed_at: f.clock() });
  });
  it('counterposts fees and quantity through the original reversal engine', async () => {
    const f = await fixture(); const bought = await f.record(trade());
    const result = await f.record({ type: 'reversal', reversal_of: bought.event.id, effective_at: at, reason: 'Synthetic correction', provenance });
    expect(result.balances.cash.amount).toBe('100'); expect(result.balances.positions[0]?.quantity).toBe('2');
    expect((await f.journal.get(portfolioReader, portfolioId)).events[0]).toEqual(bought.event);
  });
  it.each([null, portfolioReader, portfolioAdmin, { ...writer, subject: 'another-owner' },
    { subject: writer.subject, permissions: ['quotes:ingest'] } as Principal])('refuses non-writing or wrong identities: %s', async principal => {
    const f = await fixture();
    await expect(f.service.prepare(principal, portfolioId, operation())).rejects.toMatchObject({ status: principal ? 403 : 401 });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it('requires a separately authorized approver, exact portfolio, real classification and configured storage', async () => {
    const f = await fixture(); const p = await f.prepare();
    await expect(f.service.confirmationPage(writer, p.operation_id, 'nonce')).rejects.toMatchObject({ status: 403 });
    await expect(f.service.approve(writer, p.operation_id, 'nonce')).rejects.toMatchObject({ status: 403 });
    await expect(f.service.prepare(writer, otherId, operation())).rejects.toMatchObject({ status: 403 });
    await expect(f.service.journal({ ...portfolioReader, subject: 'other' }, portfolioId)).rejects.toMatchObject({ status: 403 });
    const simulation = await fixture('memory', true);
    await expect(simulation.prepare()).rejects.toMatchObject({ code: 'real_portfolio_required' });
    const disabled = new FinancialMcpService(f.journal, f.binding);
    await expect(disabled.prepare(writer, portfolioId, operation())).rejects.toMatchObject({ status: 503 });
  });
  it('refuses changed content, a claimed confirmation Boolean and expired proposals', async () => {
    const f = await fixture(); const p = await f.prepare(); await f.approve(p.operation_id);
    const command = { operation_id: p.operation_id, digest: p.proposal.digest };
    await expect(f.service.confirm(writer, { ...command, confirmed: true })).rejects.toMatchObject({ code: 'invalid_financial_proposal' });
    await expect(f.service.confirm(writer, { ...command, amount: '20' })).rejects.toMatchObject({ code: 'invalid_financial_proposal' });
    await expect(f.service.confirm(writer, { ...command, digest: '0'.repeat(64) })).rejects.toMatchObject({ code: 'financial_proposal_mismatch' });
    f.setTime('2026-11-21T10:05:00.000Z');
    await expect(f.service.confirm(writer, command)).rejects.toMatchObject({ code: 'financial_proposal_expired' });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it('consumes only once, returns original receipts after later events, and never retries an ambiguous append', async () => {
    const f = await fixture(); const p = await f.prepare(); await f.approve(p.operation_id);
    const command = { operation_id: p.operation_id, digest: p.proposal.digest };
    const copies = await Promise.allSettled(Array.from({ length: 4 }, () => f.service.confirm(writer, command)));
    expect(copies.filter(item => item.status === 'fulfilled').length).toBeGreaterThan(0);
    const first = await f.service.confirm(writer, command);
    await f.record(operation('deposit', '1'));
    expect(await f.service.confirm(writer, command)).toEqual(first);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(2);
    const stale = await f.prepare(); await f.approve(stale.operation_id);
    await f.record(operation());
    const staleCommand = { operation_id: stale.operation_id, digest: stale.proposal.digest };
    await expect(f.service.confirm(writer, staleCommand)).rejects.toMatchObject({ code: 'version_mismatch' });
    await expect(f.service.confirm(writer, staleCommand)).rejects.toMatchObject({ code: 'financial_confirmation_consumed' });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(3);
  });
  it('validates financial rules before saving a proposal', async () => {
    const f = await fixture();
    await expect(f.prepare(operation('withdrawal', '101'))).rejects.toMatchObject({ code: 'insufficient_cash' });
    await expect(f.prepare({ ...trade('sell'), quantity: '3' })).rejects.toMatchObject({ code: 'insufficient_quantity' });
  });
  it('binds approval to the original opening anchor, even before the first journal event', async () => {
    const f = await fixture(); const p = await f.prepare(); await f.approve(p.operation_id);
    const initial = await f.openingService.get(portfolioReader);
    const replacement = { ...initial, id: crypto.randomUUID(), revision: initial.revision + 1 };
    const changedJournal = new TransactionService(f.transactions, { get: async () => replacement }, f.instruments,
      { ...f.binding, kind: 'real', opening_id: replacement.id, opening_revision: replacement.revision }, f.clock);
    const changed = new FinancialMcpService(changedJournal, f.binding, f.approvals, f.clock, origin);
    await expect(changed.confirm(writer, { operation_id: p.operation_id, digest: p.proposal.digest })).rejects.toMatchObject({ code: 'opening_anchor_mismatch' });
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it('returns a durable receipt after an interrupted response, but never retries an unrecorded consumed intent', async () => {
    const f = await fixture(); const p = await f.prepare(); await f.approve(p.operation_id);
    expect(await f.approvals.consume(p.operation_id, writer.subject, p.proposal.digest, f.clock())).toBe(true);
    const command = { operation_id: p.operation_id, digest: p.proposal.digest };
    await expect(f.service.confirm(writer, command)).rejects.toMatchObject({ code: 'financial_confirmation_consumed' });
    // Synthetic process-crash boundary: storage succeeded, response was lost.
    const recorded = await f.journal.append(writer, portfolioId, p.proposal.input, p.proposal.expected_version, p.operation_id);
    expect(await f.service.confirm(writer, command)).toEqual(recorded);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(1);
  });
});

describe('browser-only approval boundary', () => {
  it('offers an explicit Access reconnect link only for a same-origin GET authentication error', async () => {
    const f = await fixture(); const p = await f.prepare(); const auth = await accessFixture();
    const access = new FinancialAccessAuthenticator({ ...accessConfig, browserAudience: 'b'.repeat(64),
      internalSubject: writer.subject, financialWritesEnabled: true }, { fetch: auth.keys });
    const routes = financialConfirmationRoutes(f.service, request => access.authenticateBrowser(request), origin);
    const url = `${origin}/${p.operation_id}?utm_source=chatgpt.com`;
    const response = await routes.request(url); const html = await response.text();
    expect(response.status).toBe(401);
    expect(html).toContain('Réinitialiser ma connexion Access');
    expect(html).toContain('autres applications Access'); expect(html).toContain('connecteur MCP');
    expect(html).not.toContain('http-equiv="refresh"'); expect(html).not.toContain('<script');
    const href = /<a class="button" href="([^"]+)">/.exec(html)![1]!;
    const login = new URL(href);
    expect(login.origin).toBe(origin); expect(login.pathname).toBe('/cdn-cgi/access/logout');
    expect(login.searchParams.get('returnTo')).toBe(`${origin}/financial-confirmation/${p.operation_id}`);
    expect([...login.searchParams.keys()]).toEqual(['returnTo']);
    expect(html).not.toContain(p.proposal.digest);
    expect(await f.approvals.get(p.operation_id)).toMatchObject({ status: 'prepared', csrf: null });
    const post = await routes.request(`${origin}/${p.operation_id}`, { method: 'POST' });
    expect(post.status).toBe(401); expect(await post.text()).not.toContain('/cdn-cgi/access/logout');
    const foreign = await routes.request(`https://other.invalid/${p.operation_id}`);
    expect(foreign.status).toBe(403); expect(await foreign.text()).not.toContain('/cdn-cgi/access/logout');
    const malformed = await routes.request(`${origin}/not-a-proposal`);
    expect(malformed.status).toBe(401); expect(await malformed.text()).not.toContain('/cdn-cgi/access/logout');
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it('presents exact preview amounts, instrument identity, Paris execution time and position impacts', async () => {
    const f = await fixture(); const p = await f.prepare(trade());
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const page = await routes.request(`${origin}/${p.operation_id}`); const html = await page.text();
    for (const label of ['PEA Tracker', 'Instrument', 'ISIN', 'Ticker fournisseur', '10/11/2026', '11:00:00',
      'Quantité', 'Prix unitaire calculé', '20 €', 'Montant brut', 'Frais déclarés', '1 €', '21 €',
      'Impact sur les liquidités', '100 €', '79 €', 'Impact sur les positions',
      'Informations techniques et références', 'Approuver l\'enregistrement', '<noscript>']) expect(html).toContain(label);
    expect(html).toContain('<dd>2</dd>'); expect(html).toContain('<dd>3</dd>');
    expect(html).not.toContain('<table>');
    const styleNonce = /<style nonce="([^"]+)">/.exec(html)![1]!;
    const scriptNonce = /<script nonce="([^"]+)">/.exec(html)![1]!;
    expect(scriptNonce).toBe(styleNonce);
    expect(page.headers.get('Content-Security-Policy')).toContain(`script-src 'nonce-${scriptNonce}'`);
    expect(page.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline');
    const other = await routes.request(`${origin}/${p.operation_id}`);
    expect(other.headers.get('Content-Security-Policy')).not.toBe(page.headers.get('Content-Security-Policy'));
  });
  it('keeps undeclared fees unavailable and uses daylight-saving Paris time', async () => {
    const f = await fixture(); f.setTime('2027-07-15T12:00:00.000Z');
    const p = await f.prepare({ ...trade(), fees: undefined, effective_at: '2027-07-15T10:00:00.000Z' });
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const html = await (await routes.request(`${origin}/${p.operation_id}`)).text();
    expect(html).toContain('Non renseignés'); expect(html).toContain('12:00:00');
  });
  it('runs an absolute countdown through warning, danger, expiry and reload without submitting', async () => {
    const f = await fixture(); const p = await f.prepare();
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const html = await (await routes.request(`${origin}/${p.operation_id}`)).text();
    const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const expires = Date.parse(p.proposal.expires_at); let now = expires - 120000;
    const elements = {
      expiry: { dataset: { expires: p.proposal.expires_at, prepared: p.proposal.prepared_at, level: '' } },
      remaining: { textContent: '' }, 'expiry-progress': { value: 0 }, approve: { disabled: false },
      'expiry-message': { textContent: '' },
    };
    let update = () => {}; let cleared = false;
    const run = () => { const environment = { document: { getElementById: (id: keyof typeof elements) => elements[id] },
      Date: { parse: Date.parse, now: () => now }, setInterval: (callback: () => void, delay: number) => {
        expect(delay).toBe(1000); update = callback; return 1;
      }, clearInterval: () => { cleared = true; } };
      // Execute only the application's static countdown against a synthetic DOM.
      new Function(...Object.keys(environment), script)(...Object.values(environment));
    };
    run(); expect(elements.remaining.textContent).toBe('02:00'); expect(elements.expiry.dataset.level).toBe('normal');
    expect(elements['expiry-progress'].value).toBe(40);
    now = expires - 60000; update(); expect(elements.remaining.textContent).toBe('01:00'); expect(elements.expiry.dataset.level).toBe('warning');
    now = expires - 30000; update(); expect(elements.expiry.dataset.level).toBe('danger');
    now = expires - 12000; run(); expect(elements.remaining.textContent).toBe('00:12');
    now = expires; update(); expect(elements.remaining.textContent).toBe('00:00'); expect(elements.approve.disabled).toBe(true);
    expect(elements['expiry-message'].textContent).toContain('nouvelle proposition'); expect(cleared).toBe(true);
    expect(elements['expiry-progress'].value).toBe(0);
    expect(await f.approvals.get(p.operation_id)).toMatchObject({ status: 'prepared' });
    f.setTime(p.proposal.expires_at);
    await expect(f.service.approve(approver, p.operation_id, 'synthetic')).rejects.toMatchObject({ code: 'financial_proposal_expired' });
    const expired = await routes.request(`${origin}/${p.operation_id}`);
    expect(expired.status).toBe(409); expect(await expired.text()).toContain('Proposition expirée');
  });
  it('styles already-used errors without exposing the proposal or fabricating a receipt', async () => {
    const f = await fixture(); const p = await f.prepare(); await f.approve(p.operation_id);
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const page = await routes.request(`${origin}/${p.operation_id}`); const html = await page.text();
    expect(page.status).toBe(409); expect(page.headers.get('Content-Type')).toContain('text/html');
    expect(html).toContain('Proposition déjà approuvée ou utilisée'); expect(html).toContain('PEA Tracker');
    expect(html).not.toContain(p.proposal.digest); expect(html).not.toContain('<form');
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it.each(['', '?utm_source=chatgpt.com', '?utm_source=chatgpt.com&utm_medium=referral&utm_campaign=confirmation'])('opens navigation %s without granting approval or carrying tracking into POST', async query => {
    const f = await fixture(); const p = await f.prepare();
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const url = `${origin}/${p.operation_id}`;
    expect((await routes.request(`https://other.invalid/${p.operation_id}?utm_source=chatgpt.com`)).status).toBe(403);
    const page = await routes.request(`${url}${query}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('Referrer-Policy')).toBe('strict-origin');
    const html = await page.text();
    expect(html).toContain(`action="/financial-confirmation/${p.operation_id}"`);
    expect(html).not.toContain('chatgpt.com');
    expect(html).toContain('name="viewport"');
    const styleNonce = /<style nonce="([^"]+)">/.exec(html)![1]!;
    const policy = page.headers.get('Content-Security-Policy')!;
    expect(policy).toContain(`style-src 'nonce-${styleNonce}'`);
    expect(policy).toContain("default-src 'none'");
    expect(policy).not.toContain('unsafe-inline');
    expect(await f.approvals.get(p.operation_id)).toMatchObject({ status: 'prepared', approved_at: null });
    await expect(f.service.confirm(writer, { operation_id: p.operation_id, digest: p.proposal.digest }))
      .rejects.toMatchObject({ code: 'financial_confirmation_required' });
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
    const headers = { Origin: origin, Cookie: page.headers.get('Set-Cookie')!.split(';')[0]!, 'Content-Type': 'application/x-www-form-urlencoded' };
    const body = new URLSearchParams({ csrf });
    expect((await routes.request(`${url}?utm_source=chatgpt.com`, { method: 'POST', headers, body })).status).toBe(403);
    expect((await routes.request(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.invalid' }, body })).status).toBe(403);
    expect((await routes.request(url, { method: 'POST', headers, body: new URLSearchParams({ csrf: crypto.randomUUID() }) })).status).toBe(403);
    const approved = await routes.request(url, { method: 'POST', headers, body });
    expect(approved.status).toBe(200);
    expect(await approved.text()).toContain("L'enregistrement financier n'est pas encore effectué");
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
    expect((await f.service.confirm(writer, { operation_id: p.operation_id, digest: p.proposal.digest })).balances.cash.amount).toBe('110');
  });
  it.each(['?redirect=https://other.invalid', '?csrf=synthetic', '?digest=synthetic', '?utm_source=chatgpt.com&portfolio_id=other'])('refuses non-tracking navigation parameters %s', async query => {
    const f = await fixture(); const p = await f.prepare();
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const response = await routes.request(`${origin}/${p.operation_id}${query}`);
    expect(response.status).toBe(403); expect(await response.text()).toContain('Code : origin_forbidden');
    expect(await f.approvals.get(p.operation_id)).toMatchObject({ status: 'prepared', csrf: null });
  });
  it('keeps signed browser identity and expiry checks on tracked navigation', async () => {
    const f = await fixture(); const p = await f.prepare(); const auth = await accessFixture();
    const config = { ...accessConfig, browserAudience: 'b'.repeat(64), internalSubject: writer.subject, financialWritesEnabled: true };
    const access = new FinancialAccessAuthenticator(config, { fetch: auth.keys });
    const routes = financialConfirmationRoutes(f.service, request => access.authenticateBrowser(request), origin);
    const url = `${origin}/${p.operation_id}?utm_source=chatgpt.com`;
    expect((await routes.request(url)).status).toBe(401);
    expect((await routes.request(url, { headers: { 'Cf-Access-Jwt-Assertion': await auth.token() } })).status).toBe(401);
    expect((await routes.request(url, { headers: { 'Cf-Access-Jwt-Assertion': await auth.token({ aud: [config.browserAudience], sub: 'other' }) } })).status).toBe(403);
    const headers = { 'Cf-Access-Jwt-Assertion': await auth.token({ aud: [config.browserAudience] }) };
    expect((await routes.request(url, { headers })).status).toBe(200);
    f.setTime(p.proposal.expires_at);
    expect((await routes.request(url, { headers })).status).toBe(409);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
  });
  it('uses exact owner and distinct signed audiences without accepting bearer claims as permissions', async () => {
    const fixture = await accessFixture();
    const config = { ...accessConfig, browserAudience: 'b'.repeat(64), internalSubject: writer.subject, financialWritesEnabled: true };
    const access = new FinancialAccessAuthenticator(config, { fetch: fixture.keys });
    const mcp = await fixture.token(); const browser = await fixture.token({ aud: [config.browserAudience] });
    const request = (jwt: string, extra = {}) => new Request(`${origin}/financial-confirmation/test`, { headers: { 'Cf-Access-Jwt-Assertion': jwt, ...extra } });
    expect((await access.authenticateMcp(request(mcp))).permissions).toContain('portfolio:write');
    expect((await access.authenticateMcp(request(mcp))).permissions).not.toContain('portfolio:admin');
    expect((await access.authenticateBrowser(request(browser))).permissions).toEqual(['portfolio:read', 'portfolio:approve']);
    await expect(access.authenticateBrowser(request(mcp))).rejects.toMatchObject({ status: 401 });
    await expect(access.authenticateMcp(request(browser))).rejects.toMatchObject({ status: 401 });
    await expect(access.authenticateBrowser(request(browser, { Authorization: 'Bearer synthetic' }))).rejects.toMatchObject({ status: 403 });
    await expect(access.authenticateBrowser(request(await fixture.token({ aud: [config.browserAudience], sub: 'other' })))).rejects.toMatchObject({ status: 403 });
    const disabled = new FinancialAccessAuthenticator({ ...config, financialWritesEnabled: false }, { fetch: fixture.keys });
    expect((await disabled.authenticateMcp(request(mcp))).permissions).not.toContain('portfolio:write');
    await expect(disabled.authenticateBrowser(request(browser))).rejects.toMatchObject({ status: 403 });
    expect(() => new FinancialAccessAuthenticator({ ...config, browserAudience: config.audience })).toThrow();
  });
  it('requires a protected-page nonce, same-origin POST, and one explicit submission', async () => {
    const f = await fixture(); const p = await f.prepare();
    let principal = approver;
    const routes = financialConfirmationRoutes(f.service, async () => principal, origin);
    const path = `/${p.operation_id}`;
    const url = `${origin}${path}`;
    const page = await routes.request(url);
    expect(page.status).toBe(200); expect(page.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(page.headers.get('Cache-Control')).toBe('no-store');
    const cookie = page.headers.get('Set-Cookie')!.split(';')[0]!;
    const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1]!;
    const post = (overrides: Record<string, string> = {}, token = csrf) => routes.request(url, { method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', ...overrides }, body: new URLSearchParams({ csrf: token }) });
    expect((await post({ Origin: 'https://other.invalid' })).status).toBe(403);
    expect((await post({ Origin: 'null' })).status).toBe(403);
    expect((await post({ Origin: '' })).status).toBe(403);
    const missingOrigin = await routes.request(url, { method: 'POST', headers: {
      Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'same-origin',
    }, body: new URLSearchParams({ csrf }) });
    expect(missingOrigin.status).toBe(403);
    expect((await post({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await post({ Cookie: '' })).status).toBe(403);
    expect((await post({}, crypto.randomUUID())).status).toBe(403);
    principal = writer; expect((await post()).status).toBe(403); principal = approver;
    expect((await post()).status).toBe(200); expect((await post()).status).toBe(403);
    expect((await f.journal.get(portfolioReader, portfolioId)).events).toEqual([]);
    expect((await f.service.confirm(writer, { operation_id: p.operation_id, digest: p.proposal.digest })).balances.cash.amount).toBe('110');
  });
  it('escapes the recap, rotates page nonces and refuses expired browser approval', async () => {
    const f = await fixture();
    const p = await f.prepare({ ...operation(), provenance: { source: '<script>synthetic</script>', reference: null } });
    const firstNonce = crypto.randomUUID(); const secondNonce = crypto.randomUUID();
    await f.service.confirmationPage(approver, p.operation_id, firstNonce);
    await f.service.confirmationPage(approver, p.operation_id, secondNonce);
    await expect(f.service.approve(approver, p.operation_id, firstNonce)).rejects.toMatchObject({ status: 403 });
    const routes = financialConfirmationRoutes(f.service, async () => approver, origin);
    const response = await routes.request(`${origin}/${p.operation_id}`);
    const html = await response.text(); expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
    f.setTime(p.proposal.expires_at);
    await expect(f.service.approve(approver, p.operation_id, secondNonce)).rejects.toMatchObject({ code: 'financial_proposal_expired' });
  });
});

it('financial Worker logs fixed authentication rejection codes without token or identity data', async () => {
  const f = await fixture('d1'); const auth = await accessFixture();
  const opening = await f.openingService.get(portfolioReader);
  const environment = { INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: accessConfig.issuer,
    ACCESS_READ_AUD: accessConfig.audience, ACCESS_OWNER_SUB: accessConfig.ownerSubject,
    ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true', FINANCIAL_WRITES_ENABLED: 'true',
    ACCESS_CONFIRMATION_AUD: 'b'.repeat(64), FINANCIAL_ORIGIN: origin,
    FINANCIAL_PORTFOLIO_ID: portfolioId, FINANCIAL_OWNER_ID: writer.subject,
    FINANCIAL_OPENING_ID: opening.id, FINANCIAL_OPENING_REVISION: String(opening.revision) };
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const app = createAccessFinancialWorker(environment, { fetch: auth.keys });
    expect((await app.request(`${origin}/mcp`, { method: 'POST' })).status).toBe(401);
    expect((await app.request(`${origin}/mcp`, { method: 'POST', headers: {
      'Cf-Access-Jwt-Assertion': await auth.token({ aud: ['b'.repeat(64)] }),
    } })).status).toBe(401);
    expect(log.mock.calls.map(([message]) => JSON.parse(message as string))).toEqual([
      { event: 'financial_auth_rejected', code: 'assertion_missing_or_malformed' },
      { event: 'financial_auth_rejected', code: 'audience_other_financial_channel' },
      { event: 'financial_auth_rejected', code: 'audience_rejected' },
    ]);
    const codes: string[] = [];
    const injected = createAccessFinancialWorker(environment, { fetch: auth.keys, onDiagnostic: code => codes.push(code) });
    expect((await injected.request(`${origin}/mcp`, { method: 'POST' })).status).toBe(401);
    expect(codes).toEqual(['assertion_missing_or_malformed']); expect(log).toHaveBeenCalledTimes(3);
  } finally { log.mockRestore(); }
});

it.each([
  { separateOrigin: undefined, mixedMcp: false },
  { separateOrigin: 'https://synthetic-approval.example.invalid', mixedMcp: false },
  { separateOrigin: 'https://synthetic-approval.example.invalid', mixedMcp: true },
])('official MCP SDK: prepare → signed browser approval → D1 journal append, replay and read-only compatibility ($separateOrigin, mixed MCP: $mixedMcp)', async ({ separateOrigin, mixedMcp }) => {
  const f = await fixture('d1'); const auth = await accessFixture();
  const config = { ...accessConfig, browserAudience: 'b'.repeat(64), internalSubject: writer.subject, financialWritesEnabled: true };
  const opening = await f.openingService.get(portfolioReader);
  const environment = { INSTRUMENTS_DB: f.local!.db, ACCESS_TEAM_DOMAIN: config.issuer,
    ACCESS_READ_AUD: config.audience, ACCESS_OWNER_SUB: config.ownerSubject,
    ACCESS_READ_ENABLED: 'true', ACCESS_PORTFOLIO_READ_ENABLED: 'true', FINANCIAL_WRITES_ENABLED: 'true',
    ACCESS_CONFIRMATION_AUD: config.browserAudience, FINANCIAL_ORIGIN: origin,
    MCP_KNOWN_AUDIENCE_PAIR_ENABLED: mixedMcp ? 'true' : 'false',
    ...(separateOrigin ? { FINANCIAL_CONFIRMATION_ORIGIN: separateOrigin } : {}),
    FINANCIAL_PORTFOLIO_ID: portfolioId, FINANCIAL_OWNER_ID: writer.subject,
    FINANCIAL_OPENING_ID: opening.id, FINANCIAL_OPENING_REVISION: String(opening.revision),
    FINANCIAL_MARKET_REFERENCE: JSON.stringify({ source_type: 'broker_statement', portfolio_id: portfolioId,
      kind: 'real', opening_state: { id: opening.id, revision: opening.revision }, journal: { version: 0 },
      evaluated_at: opening.effective_at, market_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(opening.effective_at)),
      timestamp_precision: 'session_date', currency: 'EUR', securities_value: '20', cash_value: '100', total_value: '120',
      provenance: { source: 'Synthetic broker', reference: 'Synthetic closing statement', owner_confirmed: true } }) };
  expect(() => createAccessFinancialWorker({ ...environment,
    FINANCIAL_MARKET_REFERENCE: environment.FINANCIAL_MARKET_REFERENCE.replace(portfolioId, crypto.randomUUID()) }, { fetch: auth.keys }))
    .toThrow('financial_reference_binding_mismatch');
  expect(() => createAccessFinancialWorker({ ...environment, FINANCIAL_MARKET_REFERENCE: '{}' }, { fetch: auth.keys })).toThrow();
  const app = createAccessFinancialWorker(environment, { fetch: auth.keys });
  const confirmationOrigin = separateOrigin ?? origin;
  const browserRequest = (url: string, init?: RequestInit) => separateOrigin
    ? forwardFinancialApproval(new Request(url, init), separateOrigin, { fetch: async request => app.fetch(new Request(request)) })
    : app.request(url, init);
  const mcpToken = await auth.token({ aud: mixedMcp ? [config.audience, config.browserAudience] : [config.audience] });
  const client = new Client({ name: 'synthetic-financial-owner', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    fetch: async (url, init) => {
      const request = new Request(url, init); request.headers.set('Cf-Access-Jwt-Assertion', mcpToken);
      return app.fetch(request);
    },
  });
  await client.connect(transport); cleanups.push(() => client.close());
  const tools = (await client.listTools()).tools;
  expect(tools.map(tool => tool.name)).toContain('confirm_financial_operation');
  expect(tools.map(tool => tool.name)).not.toContain('approve_financial_operation');
  expect(tools.find(tool => tool.name === 'confirm_financial_operation')?.annotations?.readOnlyHint).toBe(false);
  expect((await client.callTool({ name: 'get_positions', arguments: {} })).isError).not.toBe(true);
  const oldPositions = await app.request(`${origin}/api/v1/portfolio/positions`, { headers: { 'Cf-Access-Jwt-Assertion': mcpToken } });
  expect(oldPositions.status).toBe(200);
  expect((await client.callTool({ name: 'get_positions', arguments: {} })).structuredContent).toEqual(await oldPositions.json());
  expect((await app.request(`${origin}/api/v1/quotation-batches`, { method: 'POST' })).status).toBe(404);
  expect((await app.request(`${origin}/api/v1/portfolios/${portfolioId}/transactions`, { method: 'POST' })).status).toBe(404);
  expect((await client.callTool({ name: 'ping', arguments: {} })).structuredContent).toMatchObject({ status: 'ok' });
  expect((await client.callTool({ name: 'get_current_portfolio_valuation', arguments: { portfolio_id: portfolioId,
    provider: 'yahoo', price_kind: 'last_trade', adjustment: 'unadjusted' } })).structuredContent)
    .toMatchObject({ performance: { reference: { source_type: 'broker_statement', initial_value: { value: '120' } } } });
  const prepared = await client.callTool({ name: 'prepare_recorded_buy', arguments: { portfolio_id: portfolioId, ...Object.fromEntries(Object.entries(trade()).filter(([key]) => key !== 'type')) } });
  expect(prepared.isError).not.toBe(true);
  const p = prepared.structuredContent as unknown as Awaited<ReturnType<typeof f.prepare>>;
  expect(p.confirmation_url).toBe(`${confirmationOrigin}/financial-confirmation/${p.operation_id}`);
  const command = { operation_id: p.operation_id, digest: p.proposal.digest };
  expect((await client.callTool({ name: 'confirm_financial_operation', arguments: command })).isError).toBe(true);
  const browserToken = await auth.token({ aud: [config.browserAudience] });
  const mixedToken = await auth.token({ aud: [config.audience, config.browserAudience] });
  if (!mixedMcp) expect((await app.request(`${origin}/mcp`, { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': mixedToken } })).status).toBe(401);
  for (const token of [await auth.token(), mixedToken, 'synthetic.forged.assertion']) {
    expect((await browserRequest(p.confirmation_url!, { headers: { 'Cf-Access-Jwt-Assertion': token } })).status).toBe(401);
    expect((await browserRequest(p.confirmation_url!, { method: 'POST', headers: { Origin: confirmationOrigin,
      'Cf-Access-Jwt-Assertion': token, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'csrf=synthetic' })).status).toBe(401);
  }
  if (separateOrigin) {
    expect((await app.request(`${origin}/financial-confirmation/${p.operation_id}`, { headers: { 'Cf-Access-Jwt-Assertion': browserToken } })).status).toBe(403);
    expect((await browserRequest(p.confirmation_url!, { method: 'POST', headers: { Origin: origin,
      'Cf-Access-Jwt-Assertion': browserToken } })).status).toBe(403);
    expect(() => createAccessFinancialWorker({ ...environment, FINANCIAL_CONFIRMATION_ORIGIN: `${separateOrigin}/path` }, { fetch: auth.keys })).toThrow();
  }
  const page = await browserRequest(`${p.confirmation_url!}?utm_source=chatgpt.com`, { headers: { 'Cf-Access-Jwt-Assertion': browserToken } });
  expect(page.status).toBe(200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await page.text())![1]!;
  const approved = await browserRequest(p.confirmation_url!, { method: 'POST', headers: { Origin: confirmationOrigin,
    Cookie: page.headers.get('Set-Cookie')!.split(';')[0]!, 'Content-Type': 'application/x-www-form-urlencoded', 'Cf-Access-Jwt-Assertion': browserToken }, body: new URLSearchParams({ csrf }) });
  expect(approved.status).toBe(200);
  const result = await client.callTool({ name: 'confirm_financial_operation', arguments: command });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toMatchObject({ balances: { cash: { amount: '79' }, positions: [{ quantity: '3' }] } });
  expect((await client.callTool({ name: 'confirm_financial_operation', arguments: command })).structuredContent).toEqual(result.structuredContent);
  expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(1);
  const journal = await client.callTool({ name: 'get_transaction_journal', arguments: { portfolio_id: portfolioId } });
  expect(journal.structuredContent).toMatchObject({ events: [expect.objectContaining({ input: { ...trade() } })] });
  expect((await client.callTool({ name: 'get_current_portfolio', arguments: { portfolio_id: portfolioId } })).isError).not.toBe(true);
  await expect(f.local!.db.prepare("UPDATE financial_approvals SET digest=? WHERE id=?").bind('0'.repeat(64), p.operation_id).run()).rejects.toThrow();
  const consumed = await Promise.all(Array.from({ length: 3 }, () => f.approvals.consume(p.operation_id, writer.subject, p.proposal.digest, f.clock())));
  expect(consumed).toEqual([false, false, false]);
  // The same native D1 path also covers every other operation and traceable correction.
  await f.record(trade('sell'));
  const dividend = await f.record(operation('dividend', '2.15'));
  await f.record(operation('deposit', '10'));
  await f.record(operation('withdrawal', '5'));
  await f.record({ type: 'reversal', reversal_of: dividend.event.id, reason: 'Synthetic correction', effective_at: at, provenance });
  expect((await f.journal.get(portfolioReader, portfolioId)).balances.cash.amount).toBe('103');
  expect((await f.journal.get(portfolioReader, portfolioId)).events).toHaveLength(6);
  const pending = await f.prepare();
  const nonce = crypto.randomUUID(); await f.service.confirmationPage(approver, pending.operation_id, nonce);
  const approvedOnce = await Promise.all(Array.from({ length: 3 }, () => f.approvals.approve(pending.operation_id, writer.subject, nonce, f.clock())));
  expect(approvedOnce.filter(Boolean)).toHaveLength(1);
  const usedOnce = await Promise.all(Array.from({ length: 3 }, () => f.approvals.consume(pending.operation_id, writer.subject, pending.proposal.digest, f.clock())));
  expect(usedOnce.filter(Boolean)).toHaveLength(1);
  const restarted = new D1FinancialApprovalRepository(f.local!.db);
  expect(await restarted.get(pending.operation_id)).toMatchObject({ status: 'consumed', proposal: pending.proposal });
  const closed = createApp({ mcp: { service: f.instrumentService, financialOperations: f.service,
    authenticate: async () => portfolioReader, challenge: () => 'Bearer', oauthScopes: [] } });
  const readClient = new Client({ name: 'synthetic-reader', version: '1' });
  await readClient.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { fetch: async (url, init) => closed.fetch(new Request(url, init)) }));
  cleanups.push(() => readClient.close());
  expect((await readClient.listTools()).tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
  expect((await readClient.callTool({ name: 'confirm_financial_operation', arguments: command })).isError).toBe(true);
});
