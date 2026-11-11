import { accessFixture, accessConfig } from './access-fixtures';
import { AccessServiceAuthenticator } from '../../src/adapters/auth/access-service-authenticator';

export const serviceConfig = { issuer: accessConfig.issuer, audience: 'b'.repeat(64), enabled: true,
  serviceClientIds: ['synthetic-github-collector.access'] };

export async function accessServiceFixture() {
  const fixture = await accessFixture();
  const token = (claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}, second = false) =>
    fixture.token({ aud: [serviceConfig.audience], sub: '', common_name: serviceConfig.serviceClientIds[0], ...claims }, header, second);
  const request = (assertion?: string) => new Request('https://synthetic-ingestion.example.invalid/api/v1/quotation-batches', {
    method: 'POST', headers: assertion === undefined ? {} : { 'Cf-Access-Jwt-Assertion': assertion },
  });
  return { ...fixture, token, request,
    authenticator: new AccessServiceAuthenticator(serviceConfig, { fetch: fixture.keys }) };
}
