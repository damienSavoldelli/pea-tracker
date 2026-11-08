import type { LocalInstrumentServer } from './instruments-http-server.mjs';
export function startOAuthHttpFixture(app: { request(request: Request): Response | Promise<Response> }): Promise<LocalInstrumentServer>;
