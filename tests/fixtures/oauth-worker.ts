import { authFixture } from '../helpers/auth-fixtures';
import { createProtectedApp } from '../../src/protected-app';
import { MemoryInstrumentRepository } from '../../src/adapters/memory/instruments';
import { InstrumentService } from '../../src/application/instruments';

// Test-only Worker, never imported by src/index.ts or any deployment config.
// Fixed token fixtures prove native crypto/JWKS/router behavior, not an OAuth AS.
let initialized: ReturnType<typeof initialize> | undefined;
async function initialize() {
  const fixture = await authFixture();
  const verifier = fixture.remote(async () => Response.json({ keys: [fixture.key.firstPublic] }));
  return { fixture, app: createProtectedApp(verifier, new InstrumentService(new MemoryInstrumentRepository())) };
}
export default {
  async fetch(request: Request): Promise<Response> {
    const { fixture, app } = await (initialized ??= initialize());
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/__synthetic/admin-token') return Response.json({ token: await fixture.token() });
    if (request.method === 'GET' && path === '/__synthetic/mcp-token') return Response.json({ token: await fixture.token({ aud: fixture.policy.mcp.audience, azp: 'synthetic-mcp', scope: 'mcp:read portfolio:read' }) });
    return app.fetch(request);
  },
};
