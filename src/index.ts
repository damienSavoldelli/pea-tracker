import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { handleMcp } from './adapters/mcp/handler';
import { health } from './adapters/rest/health';

const app = new Hono();

app.use('*', async (context, next) => {
  await next();
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
});
app.route('/api/v1/health', health);
app.use('/mcp', bodyLimit({
  maxSize: 64 * 1024,
  onError: context => context.json({ error: 'Request body too large' }, 413),
}));
app.all('/mcp', context => handleMcp(context.req.raw));
app.onError(() => Response.json({ error: 'Internal server error' }, { status: 500 }));

export default app;
