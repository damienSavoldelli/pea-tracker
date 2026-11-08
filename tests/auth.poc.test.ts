import { describe, expect, it } from 'vitest';
import { assessAuth0Discovery, auth0PocConfiguration } from '../src/adapters/auth/auth0-poc';
import pocWorker, { createOAuthPocApp } from '../src/entrypoints/oauth-poc';
import { authFixture } from './helpers/auth-fixtures';
import { startOAuthHttpFixture } from './helpers/oauth-http-fixture.mjs';
import { assertContractResponse } from './helpers/openapi';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Invented tenant/client values, never contacted; keys are generated in process.
const config = {
  issuer: 'https://synthetic-tenant.eu.auth0.com/', origin: 'https://synthetic-poc.example.invalid/',
  syntheticOwnerSubject: 'synthetic-external-owner', mcpClientIds: ['synthetic-mcp'],
  restReadClientIds: ['synthetic-reader'], restAdminClientIds: ['synthetic-admin'], clientClaim: 'azp',
};
const discovery = {
  issuer: config.issuer, jwks_uri: `${config.issuer}.well-known/jwks.json`,
  authorization_endpoint: `${config.issuer}authorize`, token_endpoint: `${config.issuer}oauth/token`,
  response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
  grant_types_supported: ['authorization_code', 'refresh_token'], authorization_response_iss_parameter_supported: true,
};

describe('Auth0 PoC operator configuration and public discovery assessment', () => {
  it('pins independent clients/resources and leaves ingestion disabled', () => {
    const result = auth0PocConfiguration(config);
    expect(result.jwksUrl).toBe(discovery.jwks_uri);
    expect(result.policies.mcp.clients[0]?.scopes).toEqual(['mcp:read', 'portfolio:read']);
    expect(result.policies.rest.clients.find(client => client.id === 'synthetic-admin')?.scopes).toEqual(['portfolio:admin']);
    expect(result.policies.collector.clients).toEqual([]);
    expect(auth0PocConfiguration({ ...config, mcpClientIds: ['https://synthetic-client.example.invalid/oauth.json'] })
      .policies.mcp.clients[0]?.id).toBe('https://synthetic-client.example.invalid/oauth.json');
  });
  it.each([
    {}, { ...config, issuer: 'http://127.0.0.1/' },
    { ...config, issuer: 'https://synthetic-tenant.eu.auth0.com.attacker.invalid/' },
    { ...config, issuer: 'https://synthetic-tenant.eu.auth0.com/path/' },
    { ...config, origin: 'https://synthetic-poc.example.invalid/mcp' },
    { ...config, restAdminClientIds: ['synthetic-mcp'] },
    { ...config, mcpClientIds: ['synthetic-mcp', 'synthetic-mcp'] },
    { ...config, clientSecret: 'synthetic-unwanted-field' },
  ])('rejects incomplete/unsafe configuration without weakening the verifier', value => {
    expect(() => auth0PocConfiguration(value)).toThrow();
  });
  it('assesses only advertised capabilities and preserves live gates', () => {
    expect(assessAuth0Discovery(config, discovery)).toEqual({ discovery: 'compatible', issuerCallbackProtection: 'advertised',
      registration: 'manual-registration-required', liveTokenProfile: 'unverified', resourceCompatibility: 'unverified', grants: 'unverified' });
    expect(assessAuth0Discovery(config, { ...discovery, authorization_response_iss_parameter_supported: false }).issuerCallbackProtection).toBe('unverified');
  });
  it.each([
    { ...discovery, issuer: 'https://attacker.invalid/' },
    { ...discovery, jwks_uri: 'http://127.0.0.1/keys' },
    { ...discovery, token_endpoint: 'https://attacker.invalid/token' },
    { ...discovery, code_challenge_methods_supported: ['plain'] },
    { ...discovery, response_types_supported: ['token'] },
  ])('rejects incompatible discovery without following its endpoints', value => {
    expect(() => assessAuth0Discovery(config, value)).toThrow();
  });
  it('fails closed with sanitized 503 for missing or placeholder Worker configuration', async () => {
    for (const environment of [{}, { OAUTH_POC_CONFIG: '{}' }, { OAUTH_POC_CONFIG: '{' }]) {
      const response = await pocWorker.fetch(new Request('https://synthetic-poc.example.invalid/mcp'), environment);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toMatch(/Zod|issuer|stack|OAUTH_POC_CONFIG/);
    }
  });
});

describe('PoC composition over real loopback HTTP with synthetic signed tokens', () => {
  it('uses pinned JWKS, shared REST/MCP services and separate admin grants without a token route', async () => {
    const fixture = await authFixture();
    const targets: string[] = [];
    const app = await createOAuthPocApp(config, async target => {
      targets.push(String(target));
      return Response.json({ keys: [fixture.key.firstPublic] });
    });
    const server = await startOAuthHttpFixture(app);
    const client = new Client({ name: 'synthetic-poc-client', version: '1.0' });
    const token = (claims: Parameters<typeof fixture.token>[0] = {}) => {
      const issuedAt = Math.floor(Date.now() / 1000);
      return fixture.token({ iss: config.issuer, aud: 'https://synthetic-poc.example.invalid/mcp', azp: 'synthetic-mcp',
        scope: 'mcp:read portfolio:read portfolio:admin', iat: issuedAt, exp: issuedAt + 300, ...claims });
    };
    try {
      const mcp = await token();
      await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', server.url), { requestInit: { headers: { Authorization: `Bearer ${mcp}` } } }));
      expect((await client.callTool({ name: 'list_instruments', arguments: {} })).structuredContent).toMatchObject({ data: [{ name: 'Synthetic OAuth PoC ETF' }] });
      const path = `${server.url}/api/v1/instruments`;
      expect((await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${mcp}` } })).status).toBe(401);
      const reader = await token({ aud: 'https://synthetic-poc.example.invalid/api/v1', azp: 'synthetic-reader', scope: 'portfolio:read portfolio:admin' });
      const response = await fetch(path, { headers: { Authorization: `Bearer ${reader}` } });
      expect(response.status).toBe(200);
      await assertContractResponse('GET', '/api/v1/instruments', response);
      expect((await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${reader}` } })).status).toBe(403);
      const nonOwner = await token({ sub: 'synthetic-other-owner' });
      expect((await fetch(`${server.url}/mcp`, { headers: { Authorization: `Bearer ${nonOwner}` } })).status).toBe(403);
      expect((await fetch(`${server.url}/__synthetic/admin-token`)).status).toBe(404);
      expect(targets).toEqual([discovery.jwks_uri]);
      const metadata = await (await fetch(`${server.url}/.well-known/oauth-protected-resource/mcp`)).json();
      expect(metadata).toMatchObject({ resource: 'https://synthetic-poc.example.invalid/mcp', authorization_servers: [config.issuer], scopes_supported: ['mcp:read', 'portfolio:read'] });
    } finally { await client.close(); await server.close(); }
  });
});
