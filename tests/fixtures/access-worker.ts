import { accessFixture } from '../helpers/access-fixtures';
import { createAccessPocApp } from '../../src/entrypoints/access-poc';

// Native loopback test only. No deployment config imports this token fixture.
async function initialize() {
  const fixture = await accessFixture();
  return { fixture, app: await createAccessPocApp(fixture.authenticator) };
}
let initialized: ReturnType<typeof initialize> | undefined;
export default {
  async fetch(request: Request): Promise<Response> {
    const { fixture, app } = await (initialized ??= initialize());
    if (new URL(request.url).pathname === '/__test/assertion') return Response.json({ assertion: await fixture.token() });
    return app.fetch(request);
  },
};
