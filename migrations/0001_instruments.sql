CREATE TABLE instruments (
  id TEXT NOT NULL PRIMARY KEY COLLATE BINARY
    CHECK (typeof(id) = 'text' AND length(id) = 36
      AND id GLOB '????????-????-4???-[89ab]???-????????????'
      AND length(replace(id, '-', '')) = 32
      AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL
    CHECK (typeof(name) = 'text' AND length(name) BETWEEN 1 AND 160
      AND instr(name, char(0)) = 0 AND name = trim(name)
      AND name NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || '-' || char(159) || ']*')),
  kind TEXT NOT NULL CHECK (kind IN ('stock', 'etf')),
  isin TEXT COLLATE BINARY UNIQUE
    CHECK (isin IS NULL OR (typeof(isin) = 'text' AND length(isin) = 12
      AND isin GLOB '[A-Z][A-Z]?????????[0-9]'
      AND isin NOT GLOB '*[^A-Z0-9]*')),
  quote_currency TEXT NOT NULL
    CHECK (typeof(quote_currency) = 'text' AND quote_currency GLOB '[A-Z][A-Z][A-Z]'),
  price_unit TEXT NOT NULL CHECK (price_unit IN ('currency_unit', 'hundredth_currency_unit')),
  exchange_mic TEXT
    CHECK (exchange_mic IS NULL OR (typeof(exchange_mic) = 'text' AND length(exchange_mic) = 4
      AND exchange_mic NOT GLOB '*[^A-Z0-9]*')),
  provider_symbol TEXT
    CHECK (provider_symbol IS NULL OR (typeof(provider_symbol) = 'text'
      AND length(provider_symbol) BETWEEN 1 AND 64
      AND provider_symbol NOT GLOB '*[^A-Za-z0-9.^=:_-]*')),
  active INTEGER NOT NULL CHECK (typeof(active) = 'integer' AND active IN (0, 1)),
  version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version BETWEEN 1 AND 9007199254740991),
  created_at TEXT NOT NULL
    CHECK (typeof(created_at) = 'text' AND length(created_at) >= 20
      AND substr(created_at, -1) = 'Z' AND instr(created_at, char(0)) = 0),
  updated_at TEXT NOT NULL
    CHECK (typeof(updated_at) = 'text' AND length(updated_at) >= 20
      AND substr(updated_at, -1) = 'Z' AND instr(updated_at, char(0)) = 0)
);

CREATE INDEX instruments_active_id ON instruments (active, id);

CREATE TRIGGER instruments_identity_immutable
BEFORE UPDATE ON instruments
WHEN NEW.id IS NOT OLD.id
  OR NEW.kind IS NOT OLD.kind
  OR NEW.isin IS NOT OLD.isin
  OR NEW.quote_currency IS NOT OLD.quote_currency
  OR NEW.price_unit IS NOT OLD.price_unit
  OR NEW.exchange_mic IS NOT OLD.exchange_mic
  OR NEW.provider_symbol IS NOT OLD.provider_symbol
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'instrument_identity_immutable');
END;

CREATE TRIGGER instruments_version_step
BEFORE UPDATE ON instruments
WHEN NEW.version != OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'instrument_version_step');
END;
