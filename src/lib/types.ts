export type AssetClass = 'stock' | 'etf' | 'forex' | 'crypto' | 'index' | 'futures' | 'commodity' | 'option' | 'other'
export type Direction = 'long' | 'short'
export type TradeStatus = 'planned' | 'open' | 'closed' | 'cancelled'
export type Outcome = 'win' | 'loss' | 'be'
export type PortfolioStatus = 'active' | 'locked' | 'archived'
export type AccountType = 'live' | 'demo' | 'prop' | 'paper' | 'other'
export type CashFlowKind = 'deposit' | 'withdrawal' | 'fee' | 'income' | 'adjustment'
export type LookupKind = 'session' | 'sentiment' | 'mistake'

export interface Portfolio {
  id: string
  name: string
  description: string | null
  account_type: AccountType
  broker: string | null
  currency: string
  initial_balance: number
  goal: number | null
  color: string
  status: PortfolioStatus
  start_date: string // YYYY-MM-DD — the initial balance counts from this day
  created_at: string
}

export interface CashFlow {
  id: string
  portfolio_id: string
  kind: CashFlowKind
  /** Always positive except 'adjustment', which is signed. */
  amount: number
  date: string
  note: string | null
}

export interface Instrument {
  id: string
  symbol: string
  name: string | null
  asset_class: AssetClass
  exchange: string | null
  quote_currency: string | null
  multiplier: number
  tick_size: number | null
  logo: string | null
  provider: string | null
  provider_id: string | null
  notes: string | null
  updated_at: string
}

export interface Strategy {
  id: string
  name: string
  description: string | null
  color: string
  active: number
}

export interface Lookup {
  id: string
  kind: LookupKind
  name: string
  color: string
  sort: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Trade {
  id: string
  portfolio_id: string
  instrument_id: string | null
  symbol: string
  asset_name: string | null
  asset_class: AssetClass
  direction: Direction
  strategy_id: string | null
  session_id: string | null
  sentiment_id: string | null
  status: TradeStatus
  entry_at: string | null // local "YYYY-MM-DDTHH:MM"
  exit_at: string | null
  entry_price: number | null
  exit_price: number | null
  quantity: number | null
  multiplier: number
  /** Converts the instrument's quote currency to the portfolio currency. null = automatic. */
  fx_rate: number | null
  stop_loss: number | null
  take_profit: number | null
  /** Manual risk in portfolio currency (overrides entry/stop). */
  risk_amount: number | null
  fees: number
  /** Gross result typed by hand when no prices are recorded. */
  manual_pnl: number | null
  planned_rr: number | null
  followed_plan: number | null // 1 = followed, 0 = broke the plan, null = not recorded
  is_be: number
  mark_price: number | null
  mark_at: string | null
  mark_source: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TradeImage {
  id: string
  trade_id: string
  kind: 'entry' | 'exit' | 'other'
  file: string
  name: string
  mime: string
  caption: string | null
  created_at: string
}

export interface TradeNote {
  id: string
  trade_id: string
  at: string
  text: string
}
