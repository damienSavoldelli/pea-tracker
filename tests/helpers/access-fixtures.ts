import { authFixture } from './auth-fixtures';
import { AccessAuthenticator } from '../../src/adapters/auth/access-authenticator';

export const accessConfig = { issuer: 'https://synthetic-team.cloudflareaccess.com', audience: 'a'.repeat(64), ownerSubject: 'synthetic-access-owner' };
export async function accessFixture() {
  const fixture = await authFixture();
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = (claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, second = false) =>
    fixture.token({ iss: accessConfig.issuer, aud: [accessConfig.audience], sub: accessConfig.ownerSubject,
      type: 'app', iat: issuedAt, exp: issuedAt + 300, ...claims }, { typ: 'JWT', ...header }, second);
  const request = (assertion?: string) => new Request('https://synthetic-access-poc.example.invalid/mcp', {
    headers: assertion === undefined ? {} : { 'Cf-Access-Jwt-Assertion': assertion },
  });
  const keys: typeof fetch = async () => Response.json({ keys: [fixture.key.firstPublic] });
  return { ...fixture, token, request, issuedAt, authenticator: new AccessAuthenticator(accessConfig, { fetch: keys }), keys };
}
