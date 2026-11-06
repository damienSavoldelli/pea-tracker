import { Hono } from 'hono';
import { service } from '../../diagnostics';

export const health = new Hono();

health.get('/', context => context.json(service));
health.all('/', context => {
  context.header('Allow', 'GET, HEAD');
  return context.json({ error: 'Method not allowed' }, 405);
});
