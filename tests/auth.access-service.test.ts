import { describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet } from 'jose';
import { AccessServiceAuthenticator, collectorSubject } from '../src/adapters/auth/access-service-authenticator';
import { AccessAuthenticator } from '../src/adapters/auth/access-authenticator';
import { requirePermission } from '../src/application/authorization';
import { accessServiceFixture, serviceConfig } from './helpers/access-service-fixtures';
import { accessConfig } from './helpers/access-fixtures';

describe('Cloudflare Access machine-only assertion policy', () => {
  it('uses the documented empty-sub/common_name JWT and grants ingestion only', async () => {
    const f = await accessServiceFixture();
    const principal = await f.authenticator.authenticate(f.request(await f.token({ scope: 'portfolio:admin mcp:read', permissions: ['portfolio:admin'], azp: 'untrusted-client' })));
    expect(principal).toEqual({ subject: collectorSubject, permissions: ['quotes:ingest'] });
    expect(Object.isFrozen(principal)).toBe(true); expect(Object.isFrozen(principal.permissions)).toBe(true);
    for (const permission of ['portfolio:read', 'portfolio:admin', 'instruments:read', 'instruments:admin', 'quotes:read'] as const) {
      expect(() => requirePermission(principal, permission)).toThrow('forbidden');
    }
  });
  it.each([
    { iss: 'https://untrusted.cloudflareaccess.com' }, { aud: accessConfig.audience },
    { aud: [serviceConfig.audience, accessConfig.audience] }, { type: 'org' }, { sub: undefined },
    { iat: 99999999999 }, { exp: 1 }, { nbf: 99999999999 }, { exp: undefined }, { iat: undefined },
  ])('denies invalid or cross-application signed claims %j', async claims => {
    const f = await accessServiceFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token(claims)))).rejects.toMatchObject({ status: 401 });
  });
  it.each([
    { sub: accessConfig.ownerSubject }, { common_name: 'other.access' }, { common_name: undefined },
    { common_name: '' }, { common_name: [serviceConfig.serviceClientIds[0]] },
  ])('denies user identities and non-allowlisted signed machine IDs %j', async claims => {
    const f = await accessServiceFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token(claims)))).rejects.toMatchObject({ status: 403 });
  });
  it('rejects a signed long-lived service assertion and does not silently relax its lifetime', async () => {
    const f = await accessServiceFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token({ exp: f.issuedAt + 301 })))).rejects.toMatchObject({ status: 401 });
  });
  it.each([{ kid: '' }, { kid: 'unknown' }, { jku: 'https://untrusted.invalid/jwks' }, { jwk: {} }])('rejects unsafe/unknown key headers %j', async header => {
    const f = await accessServiceFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token({}, header)))).rejects.toMatchObject({ status: 401 });
  });
  it('rejects forged signatures even with the trusted kid and client ID', async () => {
    const f = await accessServiceFixture();
    await expect(f.authenticator.authenticate(f.request(await f.token({}, {}, true)))).rejects.toMatchObject({ status: 401 });
  });
  it('accepts key rotation through the existing configurable key provider', async () => {
    const f = await accessServiceFixture();
    const authenticator = new AccessServiceAuthenticator(serviceConfig, { keys: createLocalJWKSet({ keys: [f.key.firstPublic, f.key.secondPublic] }) });
    expect((await authenticator.authenticate(f.request(await f.token()))).subject).toBe(collectorSubject);
    expect((await authenticator.authenticate(f.request(await f.token({}, { kid: 'synthetic-key-2' }, true)))).subject).toBe(collectorSubject);
  });
  it('never accepts raw service credentials, Authorization, cookies or forged email as origin identity', async () => {
    const f = await accessServiceFixture();
    const fetcher = vi.fn(f.keys);
    const authenticator = new AccessServiceAuthenticator(serviceConfig, { fetch: fetcher });
    const request = f.request();
    request.headers.set('CF-Access-Client-Id', serviceConfig.serviceClientIds[0]!);
    request.headers.set('CF-Access-Client-Secret', 'synthetic-service-secret-fixture');
    request.headers.set('Authorization', `Bearer ${await f.token()}`);
    request.headers.set('Cookie', 'CF_Authorization=synthetic-cookie');
    request.headers.set('Cf-Access-Authenticated-User-Email', 'synthetic-owner@example.invalid');
    await expect(authenticator.authenticate(request)).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
    await authenticator.authenticate(f.request(await f.token()));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${serviceConfig.issuer}/cdn-cgi/access/certs`);
  });
  it('keeps owner MCP policy independent and denies machine assertions at that boundary', async () => {
    const f = await accessServiceFixture();
    const owner = new AccessAuthenticator(accessConfig, { fetch: f.keys });
    await expect(owner.authenticate(f.request(await f.token({ aud: [accessConfig.audience] })))).rejects.toMatchObject({ status: 401 });
  });
  it('fails closed on unavailable JWKS without exposing upstream text', async () => {
    const f = await accessServiceFixture();
    const verifier = new AccessServiceAuthenticator(serviceConfig, { fetch: async () => { throw new Error('synthetic-private-upstream-marker'); } });
    await expect(verifier.authenticate(f.request(await f.token()))).rejects.toMatchObject({ status: 503, message: 'authentication_unavailable' });
  });
  it('supports bounded client rotation with a stable replay subject and explicit revocation/kill switch', async () => {
    const f = await accessServiceFixture();
    const oldToken = await f.token(); const newToken = await f.token({ common_name: 'synthetic-next.access' });
    const rotatingConfig = { ...serviceConfig, serviceClientIds: [...serviceConfig.serviceClientIds, 'synthetic-next.access'] };
    const rotating = new AccessServiceAuthenticator(rotatingConfig, { fetch: f.keys });
    rotatingConfig.serviceClientIds.splice(0); // Caller mutation cannot change the verifier's grant.
    expect(await rotating.authenticate(f.request(oldToken))).toEqual(await rotating.authenticate(f.request(newToken)));
    const revoked = new AccessServiceAuthenticator({ ...serviceConfig, serviceClientIds: ['synthetic-next.access'] }, { fetch: f.keys });
    await expect(revoked.authenticate(f.request(oldToken))).rejects.toMatchObject({ status: 403 });
    expect((await revoked.authenticate(f.request(newToken))).subject).toBe(collectorSubject);
    const keys = vi.fn(f.keys);
    const disabled = new AccessServiceAuthenticator({ ...serviceConfig, enabled: false }, { fetch: keys });
    await expect(disabled.authenticate(f.request(await f.token()))).rejects.toMatchObject({ status: 503, code: 'ingestion_disabled' });
    expect(keys).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { ...serviceConfig, enabled: undefined }, { ...serviceConfig, serviceClientIds: [] },
    { ...serviceConfig, serviceClientIds: ['invalid'] }, { ...serviceConfig, serviceClientIds: ['same.access', 'same.access'] },
    { ...serviceConfig, serviceClientIds: ['a.access', 'b.access', 'c.access'] }])('rejects incomplete or excessive grants %j', config => {
    expect(() => new AccessServiceAuthenticator(config)).toThrow();
  });
});


describe('fixed-code internal Access diagnostics', () => {
  it.each([
    [{ iss: 'https://untrusted.cloudflareaccess.com' }, {}, false, 'issuer_rejected'],
    [{ aud: 'c'.repeat(64) }, {}, false, 'audience_rejected'],
    [{ aud: [serviceConfig.audience, 'c'.repeat(64)] }, {}, false, 'audience_rejected'],
    [{ exp: 1 }, {}, false, 'expired'],
    [{ nbf: 99999999999 }, {}, false, 'not_before_rejected'],
    [{ iat: 99999999999 }, {}, false, 'issued_at_rejected'],
    [{ exp: undefined }, {}, false, 'expiration_rejected'],
    [{ sub: undefined }, {}, false, 'subject_rejected'],
    [{ type: 'org' }, {}, false, 'token_type_rejected'],
    [{}, { kid: 'unknown' }, false, 'key_not_found'],
    [{}, { kid: '' }, false, 'header_rejected'],
    [{}, { jku: 'https://untrusted.invalid' }, false, 'header_rejected'],
    [{}, { kid: 'synthetic-key-1' }, true, 'signature_invalid'],
  ] as const)('reports only a fixed reason while keeping the public error generic (%s)', async (claims, header, second, code) => {
    const f = await accessServiceFixture();
    const diagnostic = vi.fn();
    const verifier = new AccessServiceAuthenticator({ ...serviceConfig, enabled: false }, { fetch: f.keys, onDiagnostic: diagnostic });
    await expect(verifier.authenticate(f.request(await f.token(claims, header, second))))
      .rejects.toMatchObject({ status: 401, code: 'invalid_token', message: 'invalid_token' });
    expect(diagnostic.mock.calls).toEqual([[code]]);
  });

  it.each([301, 3600])('identifies excessive lifetime %i after cryptographic verification', async lifetime => {
    const f = await accessServiceFixture();
    const diagnostic = vi.fn();
    const verifier = new AccessServiceAuthenticator({ ...serviceConfig, enabled: false }, { fetch: f.keys, onDiagnostic: diagnostic });
    await expect(verifier.authenticate(f.request(await f.token({ exp: f.issuedAt + lifetime }))))
      .rejects.toMatchObject({ status: 401, code: 'invalid_token' });
    expect(diagnostic.mock.calls).toEqual([['assertion_lifetime_exceeded']]);
  });

  it('accepts exactly 300 seconds then applies the disabled gate, with no rejection diagnostic', async () => {
    const f = await accessServiceFixture();
    const diagnostic = vi.fn();
    const verifier = new AccessServiceAuthenticator({ ...serviceConfig, enabled: false }, { fetch: f.keys, onDiagnostic: diagnostic });
    await expect(verifier.authenticate(f.request(await f.token())))
      .rejects.toMatchObject({ status: 503, code: 'ingestion_disabled' });
    expect(diagnostic).not.toHaveBeenCalled();
  });

  it('does not let a failing diagnostic sink alter the rejection', async () => {
    const f = await accessServiceFixture();
    const verifier = new AccessServiceAuthenticator(serviceConfig, { fetch: f.keys,
      onDiagnostic: () => { throw new Error('synthetic-private-marker'); } });
    await expect(verifier.authenticate(f.request(await f.token({ exp: f.issuedAt + 3600 }))))
      .rejects.toMatchObject({ status: 401, message: 'invalid_token' });
  });

  it('reports missing assertions, machine identity mismatches, and JWKS outages without values', async () => {
    const f = await accessServiceFixture();
    const diagnostic = vi.fn();
    const verifier = new AccessServiceAuthenticator(serviceConfig, { fetch: f.keys, onDiagnostic: diagnostic });
    await expect(verifier.authenticate(f.request())).rejects.toMatchObject({ status: 401 });
    await expect(verifier.authenticate(f.request(await f.token({ common_name: 'synthetic-other.access' }))))
      .rejects.toMatchObject({ status: 403 });
    const unavailable = new AccessServiceAuthenticator(serviceConfig, { fetch: async () => { throw new Error('synthetic-private-marker'); }, onDiagnostic: diagnostic });
    await expect(unavailable.authenticate(f.request(await f.token()))).rejects.toMatchObject({ status: 503 });
    expect(diagnostic.mock.calls).toEqual([['assertion_missing_or_malformed'], ['machine_identity_rejected'], ['jwks_unavailable']]);
  });
});
