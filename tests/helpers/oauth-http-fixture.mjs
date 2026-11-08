import { startLocalInstrumentServer } from './instruments-http-server.mjs';

// Trusted server-side composition only. Reuse all loopback/Host/Origin guards;
// the supplied app verifies JWTs and never uses the legacy fixed role fixture.
export function startOAuthHttpFixture(app) {
  return startLocalInstrumentServer({ app });
}
