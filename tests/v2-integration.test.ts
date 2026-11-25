import { afterEach, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/app';
import { FinancialMcpService } from '../src/application/financial-mcp';
import { PortfolioReadService } from '../src/application/portfolio-reads';
import { TransactionService } from '../src/application/transactions';
import { MemoryTransactionRepository } from '../src/adapters/memory/transactions';
import type { PortfolioRegistryRepository } from '../src/ports/portfolio-registry';
import type { RegisteredPortfolio } from '../src/domain/portfolio-registry';
import { PortfolioService } from '../src/application/portfolio';
import { QuotationService } from '../src/application/quotations';
import { MemoryQuotationRepository } from '../src/adapters/memory/quotations';
import { openingInput, portfolioAdmin, portfolioReader, portfolioFixture } from './helpers/portfolio';

const id = '10000000-0000-4000-8000-000000000001';
const origin = 'https://synthetic-integration.example.invalid';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

it('official SDK selects registry discovery once when legacy financial tools coexist', async () => {
  const f = await portfolioFixture('memory'); cleanups.push(f.dispose);
  const initial = await new PortfolioService(f.repository, f.instruments)
    .append(portfolioAdmin, openingInput(), 0, 'synthetic-integration-opening');
  const row: RegisteredPortfolio = { id, name: 'Synthetic integration', owner_subject: portfolioReader.subject,
    kind: 'real', status: 'active', version: 1, opening: { source: 'historical', id: initial.id, revision: initial.revision },
    created_at: initial.recorded_at, updated_at: initial.recorded_at };
  // Read-only registry fixture; every mutation is an explicit test failure.
  const forbidden = async (): Promise<never> => { throw new Error('Unexpected registry mutation'); };
  const registry: PortfolioRegistryRepository = { create: forbidden, archive: forbidden,
    get: async (owner, selected) => owner === row.owner_subject && selected === id ? row : null,
    list: async (owner, limit, after) => owner === row.owner_subject && (!after || id > after) ? [row].slice(0, limit) : [],
    opening: async (owner, selected) => owner === row.owner_subject && selected === id ? initial : null };
  const transactions = new MemoryTransactionRepository();
  const binding = { portfolio_id: id, owner_subject: row.owner_subject, kind: row.kind, opening_id: initial.id, opening_revision: initial.revision };
  const financial = new FinancialMcpService(new TransactionService(transactions, f.repository, f.instruments, binding),
    { portfolio_id: id, owner_subject: row.owner_subject });
  const reads = new PortfolioReadService({ registry, instruments: f.instruments, transactions, quotations: new QuotationService(new MemoryQuotationRepository(), f.instruments, []) });
  let principal = portfolioReader;
  const app = createApp({ mcp: { service: f.instrumentService, financialOperations: financial, portfolioReads: reads,
    authenticate: async () => principal, challenge: () => 'Bearer', oauthScopes: [] } });
  const client = new Client({ name: 'synthetic-integration', version: '1' });
  cleanups.push(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    fetch: async (url, init) => app.fetch(new Request(url, init)),
  }));
  const names = (await client.listTools()).tools.map(tool => tool.name);
  expect(new Set(names).size).toBe(names.length);
  expect(names.filter(name => name === 'list_portfolios')).toHaveLength(1);
  expect(names).toContain('get_transaction_journal');
  expect(names).toContain('get_portfolio_details');
  expect(names).not.toContain('create_portfolio');
  expect((await client.callTool({ name: 'list_portfolios', arguments: {} })).structuredContent)
    .toEqual({ data: [row], page: { next_after: null }, read_only: true });
  principal = { ...principal, subject: 'synthetic-foreign-owner' };
  expect((await client.callTool({ name: 'list_portfolios', arguments: {} })).structuredContent)
    .toEqual({ data: [], page: { next_after: null }, read_only: true });
  principal = { ...principal, permissions: ['instruments:read'] };
  expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('list_portfolios');
});
