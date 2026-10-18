import { run, get, all, exec } from './db'
import { uid } from './format'

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, action TEXT, detail TEXT);

CREATE TABLE IF NOT EXISTS portfolios (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, account_type TEXT NOT NULL DEFAULT 'live',
  broker TEXT, currency TEXT NOT NULL DEFAULT 'USD', initial_balance REAL NOT NULL DEFAULT 0, goal REAL,
  color TEXT NOT NULL DEFAULT '#f7931a', status TEXT NOT NULL DEFAULT 'active', start_date TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cash_flows (
  id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS instruments (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT, asset_class TEXT NOT NULL DEFAULT 'stock', exchange TEXT,
  quote_currency TEXT, multiplier REAL NOT NULL DEFAULT 1, tick_size REAL, logo TEXT, provider TEXT, provider_id TEXT,
  notes TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_instr_symbol ON instruments(symbol, asset_class);
CREATE TABLE IF NOT EXISTS strategies (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT NOT NULL DEFAULT '#5b95ff', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS lookups (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#64748b', sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL DEFAULT '#8b5cf6');

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  instrument_id TEXT REFERENCES instruments(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL, asset_name TEXT, asset_class TEXT NOT NULL DEFAULT 'stock', direction TEXT NOT NULL DEFAULT 'long',
  strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES lookups(id) ON DELETE SET NULL,
  sentiment_id TEXT REFERENCES lookups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'closed',
  entry_at TEXT, exit_at TEXT, entry_price REAL, exit_price REAL, quantity REAL, multiplier REAL NOT NULL DEFAULT 1, fx_rate REAL,
  stop_loss REAL, take_profit REAL, risk_amount REAL, fees REAL NOT NULL DEFAULT 0, manual_pnl REAL, planned_rr REAL,
  followed_plan INTEGER, is_be INTEGER NOT NULL DEFAULT 0, mark_price REAL, mark_at TEXT, mark_source TEXT, notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_trades_portfolio ON trades(portfolio_id);
CREATE INDEX IF NOT EXISTS ix_trades_exit ON trades(exit_at);
CREATE TABLE IF NOT EXISTS trade_tags (trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (trade_id, tag_id));
CREATE TABLE IF NOT EXISTS trade_mistakes (trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE, lookup_id TEXT NOT NULL REFERENCES lookups(id) ON DELETE CASCADE, PRIMARY KEY (trade_id, lookup_id));
CREATE TABLE IF NOT EXISTS trade_images (
  id TEXT PRIMARY KEY, trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE, kind TEXT NOT NULL,
  file TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, caption TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trade_notes (id TEXT PRIMARY KEY, trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE, at TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fx_rates (currency TEXT PRIMARY KEY, rate REAL NOT NULL, updated_at TEXT NOT NULL, source TEXT);
`

/** Default option lists for a fresh database (all editable in Administration). */
export function seed(): void {
  const strategies: [string, string, string][] = [
    ['Rompimento', 'Breakout', '#f7931a'],
    ['Pullback', 'Pullback', '#5b95ff'],
    ['Alinhamento de fluxo', 'Order-flow alignment', '#ffc453'],
    ['Reversão', 'Reversal', '#c084fc'],
    ['Tendência', 'Trend following', '#14b8a6']
  ]
  const pt = (localStorage.getItem('lang') ?? 'pt') !== 'en'
  for (const [p, e, c] of strategies) run('INSERT INTO strategies(id,name,color) VALUES(?,?,?)', [uid(), pt ? p : e, c])
  const sessions = pt ? ['Ásia', 'Londres', 'Nova York', 'Abertura B3', 'Overlap Londres/NY'] : ['Asia', 'London', 'New York', 'B3 open', 'London/NY overlap']
  sessions.forEach((s, i) => run('INSERT INTO lookups(id,kind,name,color,sort) VALUES(?,?,?,?,?)', [uid(), 'session', s, ['#0ea5e9', '#8b5cf6', '#f7931a', '#16a34a', '#ec4899'][i], i]))
  const sentiments = pt
    ? [['Confiante', '#16a34a'], ['Calmo', '#0ea5e9'], ['Ansioso', '#f59e0b'], ['Com medo', '#ef4444'], ['Ganancioso', '#a855f7'], ['Vingativo', '#b91c1c']]
    : [['Confident', '#16a34a'], ['Calm', '#0ea5e9'], ['Anxious', '#f59e0b'], ['Fearful', '#ef4444'], ['Greedy', '#a855f7'], ['Revenge', '#b91c1c']]
  sentiments.forEach(([s, c], i) => run('INSERT INTO lookups(id,kind,name,color,sort) VALUES(?,?,?,?,?)', [uid(), 'sentiment', s, c, i]))
  const mistakes = pt
    ? ['Entrada antecipada', 'Sem stop', 'Moveu o stop', 'Saída precoce', 'Tamanho excessivo', 'Fora do plano']
    : ['Early entry', 'No stop', 'Moved stop', 'Exited too early', 'Oversized', 'Off plan']
  mistakes.forEach((s, i) => run('INSERT INTO lookups(id,kind,name,color,sort) VALUES(?,?,?,?,?)', [uid(), 'mistake', s, '#ef4444', i]))
  for (const [n, c] of [['A+ setup', '#16a34a'], ['FOMO', '#ef4444'], ['News', '#0ea5e9']] as const) run('INSERT INTO tags(id,name,color) VALUES(?,?,?)', [uid(), n, c])
  run("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','1')")
}

export function migrateSchema(): void {
  const v = Number(get<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'")?.value ?? 0)
  if (v < 1) exec("INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','1')")
  void all
}
