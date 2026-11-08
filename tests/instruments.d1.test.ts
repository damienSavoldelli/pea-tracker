import { D1InstrumentRepository } from '../src/adapters/d1/instruments';
import { openLocalD1 } from './helpers/d1-local.mjs';
import { instrumentRepositoryContract } from './helpers/instrument-repository-contract';

instrumentRepositoryContract('D1 shared repository contract', async () => {
  const local = await openLocalD1();
  return {
    repository: new D1InstrumentRepository(local.db),
    peer: new D1InstrumentRepository(local.db),
    seedBoundary: async record => {
      await local.db.prepare('INSERT INTO instruments (id,name,kind,isin,quote_currency,price_unit,exchange_mic,provider_symbol,active,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(record.id, record.name, record.kind, record.isin, record.quote_currency, record.price_unit, record.exchange_mic, record.provider_symbol, Number(record.active), record.version, record.created_at, record.updated_at).run();
    },
    dispose: () => local.cleanup(),
  };
});
