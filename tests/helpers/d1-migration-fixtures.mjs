import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { projectRoot } from './d1-local.mjs';

// Only test-owned migration copies may be edited; source migrations are immutable.
export async function migrationFixture(directory, mode) {
  const state = resolve(directory);
  if (dirname(state) !== join(projectRoot, '.wrangler') || !basename(state).startsWith('d1-tests-') ||
      !['v1', 'v2', 'all', 'failing'].includes(mode)) throw new Error('Only owned migration fixtures are permitted');
  const target = join(state, `migration-fixture-${mode}`);
  await mkdir(target, { recursive: true });
  const names = ['0001_instruments.sql', ...(mode === 'v1' ? [] : ['0002_instrument_create_outcomes.sql']),
    ...(['all', 'failing'].includes(mode) ? ['0003_opening_portfolio.sql'] : [])];
  for (const name of names) await copyFile(join(projectRoot, 'migrations', name), join(target, name));
  if (mode === 'failing') {
    await writeFile(join(target, '0004_test_failure.sql'),
      'CREATE TABLE migration_must_rollback (id INTEGER PRIMARY KEY);\nINSERT INTO table_that_does_not_exist VALUES (1);\n');
  }
  return target;
}
