import { describe, expect, it } from 'vitest';
import { FinancialAccessAuthenticator } from '../src/adapters/auth/financial-access';
import { accessFixture, accessConfig } from './helpers/access-fixtures';

const browserAudience = 'b'.repeat(64);
const config = { ...accessConfig, browserAudience, internalSubject: 'synthetic-owner',
  financialWritesEnabled: true, mcpKnownAudiencePairEnabled: true };

describe('explicit MCP known-audience pair policy with independent approval', () => {
  it.each([[accessConfig.audience], [accessConfig.audience, browserAudience], [browserAudience, accessConfig.audience]])(
    'authorizes owner MCP preparation/confirmation but never approval for %j', async (...aud) => {
      const auth = await accessFixture(); const access = new FinancialAccessAuthenticator(config, { fetch: auth.keys });
      const request = auth.request(await auth.token({ aud }));
      const principal = await access.authenticateMcp(request);
      expect(principal.permissions).toEqual(['instruments:read', 'quotes:read', 'portfolio:read', 'portfolio:write']);
      expect(principal.permissions).not.toContain('portfolio:approve');
      expect(principal.permissions).not.toContain('portfolio:admin');
      await expect(access.authenticateBrowser(request)).rejects.toMatchObject({ status: 401 });
      expect((await access.authenticateBrowser(auth.request(await auth.token({ aud: [browserAudience] })))).permissions)
        .toEqual(['portfolio:read', 'portfolio:approve']);
    });
  it.each([
    [], [browserAudience], ['c'.repeat(64)], [accessConfig.audience, 'c'.repeat(64)],
    [accessConfig.audience, browserAudience, 'c'.repeat(64)],
    [accessConfig.audience, accessConfig.audience], [accessConfig.audience, browserAudience, browserAudience],
  ])('rejects missing read audience, unknown audiences and duplicates %j', async (...aud) => {
    const auth = await accessFixture(); const access = new FinancialAccessAuthenticator(config, { fetch: auth.keys });
    await expect(access.authenticateMcp(auth.request(await auth.token({ aud })))).rejects.toMatchObject({ status: 401 });
  });
  it('keeps signature, issuer, expiry and owner checks for write-capable MCP identities', async () => {
    const auth = await accessFixture(); const access = new FinancialAccessAuthenticator(config, { fetch: auth.keys });
    await expect(access.authenticateMcp(auth.request())).rejects.toMatchObject({ status: 401 });
    await expect(access.authenticateMcp(auth.request('synthetic.forged.assertion'))).rejects.toMatchObject({ status: 401 });
    const aud = [accessConfig.audience, browserAudience];
    for (const [claims, status] of [
      [{ sub: 'synthetic-other-owner' }, 403], [{ exp: auth.issuedAt - 60 }, 401],
      [{ iss: 'https://other-team.cloudflareaccess.com' }, 401],
    ] as const) await expect(access.authenticateMcp(auth.request(await auth.token({ aud, ...claims })))).rejects.toMatchObject({ status });
  });
  it('is opt-in, preserves read-only recovery and ignores attempted verifier-policy injection on approval', async () => {
    const auth = await accessFixture(); const mixed = auth.request(await auth.token({ aud: [accessConfig.audience, browserAudience] }));
    const strict = new FinancialAccessAuthenticator({ ...config, mcpKnownAudiencePairEnabled: false }, { fetch: auth.keys });
    await expect(strict.authenticateMcp(mixed)).rejects.toMatchObject({ status: 401 });
    const readonly = new FinancialAccessAuthenticator({ ...config, financialWritesEnabled: false,
      readOnlyMixedAudienceEnabled: true, mcpKnownAudiencePairEnabled: false }, { fetch: auth.keys });
    expect((await readonly.authenticateMcp(mixed)).permissions).not.toContain('portfolio:write');
    await expect(readonly.authenticateBrowser(mixed)).rejects.toMatchObject({ code: 'financial_writes_disabled' });
    expect(() => new FinancialAccessAuthenticator({ ...config, readOnlyMixedAudienceEnabled: true }, { fetch: auth.keys })).toThrow();
    const injected = new FinancialAccessAuthenticator(config, { fetch: auth.keys, permittedCompanionAudience: accessConfig.audience });
    await expect(injected.authenticateBrowser(mixed)).rejects.toMatchObject({ status: 401 });
  });
});
