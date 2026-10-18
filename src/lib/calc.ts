// Trade math. Pure functions (no DB, no DOM) so they are unit-tested in scripts/test-calc.ts.
//
// Conventions
//  • quantity × multiplier = units exposed per 1.0 of price movement (shares, coins, lots × contract size,
//    contracts × point value).
//  • Results are first computed in the instrument's quote currency, then converted to the portfolio
//    currency with fx (quote → portfolio). Forex pairs whose base or quote is the portfolio currency are
//    converted automatically; anything else uses the trade's fx_rate (1 when not given, flagged as a warning).
import type { AssetClass, Direction, Outcome, Trade } from './types'

export interface ContractSpec {
  multiplier: number
  tickSize: number | null
  quoteCurrency: string | null
  label: string
}

/** Units per quantity for each asset class when nothing more specific is known. */
export const CLASS_MULTIPLIER: Record<AssetClass, number> = {
  stock: 1,
  etf: 1,
  crypto: 1,
  forex: 100000,
  index: 1,
  futures: 1,
  commodity: 1,
  option: 100,
  other: 1
}

// Well-known contracts (point value per contract, in the contract currency)
const FUTURES: Record<string, ContractSpec> = {
  WIN: { multiplier: 0.2, tickSize: 5, quoteCurrency: 'BRL', label: 'Mini Ibovespa (B3) · R$0,20/pt' },
  IND: { multiplier: 1, tickSize: 5, quoteCurrency: 'BRL', label: 'Ibovespa cheio (B3) · R$1/pt' },
  WDO: { multiplier: 10, tickSize: 0.5, quoteCurrency: 'BRL', label: 'Mini dólar (B3) · R$10/pt' },
  DOL: { multiplier: 50, tickSize: 0.5, quoteCurrency: 'BRL', label: 'Dólar cheio (B3) · R$50/pt' },
  ES: { multiplier: 50, tickSize: 0.25, quoteCurrency: 'USD', label: 'E-mini S&P 500 · $50/pt' },
  MES: { multiplier: 5, tickSize: 0.25, quoteCurrency: 'USD', label: 'Micro E-mini S&P 500 · $5/pt' },
  NQ: { multiplier: 20, tickSize: 0.25, quoteCurrency: 'USD', label: 'E-mini Nasdaq-100 · $20/pt' },
  MNQ: { multiplier: 2, tickSize: 0.25, quoteCurrency: 'USD', label: 'Micro E-mini Nasdaq-100 · $2/pt' },
  YM: { multiplier: 5, tickSize: 1, quoteCurrency: 'USD', label: 'E-mini Dow · $5/pt' },
  MYM: { multiplier: 0.5, tickSize: 1, quoteCurrency: 'USD', label: 'Micro E-mini Dow · $0.50/pt' },
  RTY: { multiplier: 50, tickSize: 0.1, quoteCurrency: 'USD', label: 'E-mini Russell 2000 · $50/pt' },
  M2K: { multiplier: 5, tickSize: 0.1, quoteCurrency: 'USD', label: 'Micro Russell 2000 · $5/pt' },
  CL: { multiplier: 1000, tickSize: 0.01, quoteCurrency: 'USD', label: 'Crude Oil · $1,000/pt' },
  MCL: { multiplier: 100, tickSize: 0.01, quoteCurrency: 'USD', label: 'Micro Crude Oil · $100/pt' },
  GC: { multiplier: 100, tickSize: 0.1, quoteCurrency: 'USD', label: 'Gold · $100/pt' },
  MGC: { multiplier: 10, tickSize: 0.1, quoteCurrency: 'USD', label: 'Micro Gold · $10/pt' },
  SI: { multiplier: 5000, tickSize: 0.005, quoteCurrency: 'USD', label: 'Silver · $5,000/pt' },
  NG: { multiplier: 10000, tickSize: 0.001, quoteCurrency: 'USD', label: 'Natural Gas · $10,000/pt' },
  ZB: { multiplier: 1000, tickSize: 1 / 32, quoteCurrency: 'USD', label: '30Y T-Bond · $1,000/pt' },
  '6E': { multiplier: 125000, tickSize: 0.00005, quoteCurrency: 'USD', label: 'Euro FX · 125,000 €' }
}
const CFD_METALS: Record<string, ContractSpec> = {
  XAUUSD: { multiplier: 100, tickSize: 0.01, quoteCurrency: 'USD', label: 'Gold CFD · 100 oz/lot' },
  XAGUSD: { multiplier: 5000, tickSize: 0.001, quoteCurrency: 'USD', label: 'Silver CFD · 5,000 oz/lot' }
}

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** "EURUSD", "EUR/USD", "EURUSD=X" → ["EUR", "USD"]. */
export function forexPair(symbol: string): [string, string] | null {
  const s = clean(symbol.replace(/=X$/i, ''))
  return /^[A-Z]{6}$/.test(s) ? [s.slice(0, 3), s.slice(3)] : null
}

/**
 * Contract specification for a symbol. Futures are recognized by their root
 * (WINZ25 → WIN, ESH6 → ES, MNQ → MNQ).
 */
export function knownSpec(symbol: string, cls: AssetClass): ContractSpec | null {
  const s = clean(symbol)
  if (CFD_METALS[s] && (cls === 'commodity' || cls === 'forex' || cls === 'other')) return CFD_METALS[s]
  if (cls === 'futures' || cls === 'index' || cls === 'commodity') {
    const roots = Object.keys(FUTURES).sort((a, b) => b.length - a.length)
    for (const r of roots) {
      if (s.startsWith(r) && /^([FGHJKMNQUVXZ]\d{1,2}|\d{0,2}|FUT|N)$/.test(s.slice(r.length))) return FUTURES[r]
    }
  }
  if (cls === 'forex') {
    const p = forexPair(symbol)
    if (p) return { multiplier: 100000, tickSize: p[1] === 'JPY' ? 0.001 : 0.00001, quoteCurrency: p[1], label: `${p[0]}/${p[1]} · 100,000 ${p[0]}/lot` }
  }
  return null
}

/** Pip size: 0.01 for JPY pairs, 0.0001 for other pairs. */
export function pipSize(symbol: string): number {
  const p = forexPair(symbol)
  return p && p[1] === 'JPY' ? 0.01 : 0.0001
}

export interface FxInfo {
  rate: number
  auto: boolean
  /** Set when the result is shown in a currency other than the portfolio's without a known conversion. */
  warning: string | null
  quoteCurrency: string | null
}

/** Conversion from the instrument's quote currency to the portfolio currency. */
export function fxFor(t: Pick<Trade, 'symbol' | 'asset_class' | 'fx_rate'>, portfolioCurrency: string, refPrice: number | null, instrumentQuote?: string | null): FxInfo {
  const pair = t.asset_class === 'forex' ? forexPair(t.symbol) : null
  const quote = instrumentQuote ?? pair?.[1] ?? null
  if (t.fx_rate && t.fx_rate > 0) return { rate: t.fx_rate, auto: false, warning: null, quoteCurrency: quote }
  if (!quote || quote === portfolioCurrency) return { rate: 1, auto: true, warning: null, quoteCurrency: quote }
  if (pair && pair[0] === portfolioCurrency && refPrice && refPrice > 0) return { rate: 1 / refPrice, auto: true, warning: null, quoteCurrency: quote }
  return { rate: 1, auto: true, warning: `Result is in ${quote}; set a ${quote}→${portfolioCurrency} rate to convert`, quoteCurrency: quote }
}

export interface TradeCalc {
  dir: 1 | -1
  fx: FxInfo
  hasPrices: boolean
  /** Gross / net result in the portfolio currency (closed trades only). */
  gross: number | null
  net: number | null
  /** Unrealized result of an open trade at its mark price (after fees already paid). */
  unrealized: number | null
  outcome: Outcome | null
  /** Money at risk between entry and stop (or the manual risk amount). */
  risk: number | null
  /** Potential profit between entry and take-profit. */
  reward: number | null
  plannedRR: number | null
  /** Result in multiples of the initial risk (R). */
  rMultiple: number | null
  /** Result as % of the position value (entry × units). */
  returnPct: number | null
  notional: number | null
  holdMinutes: number | null
  issues: string[]
}

const num = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
export const round = (v: number, d = 2) => Math.round((v + Number.EPSILON) * 10 ** d) / 10 ** d

export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.round((tb - ta) / 60000) : null
}

export function computeTrade(t: Trade, portfolioCurrency: string, opts: { beTolerance?: number; quoteCurrency?: string | null } = {}): TradeCalc {
  const dir: 1 | -1 = t.direction === 'short' ? -1 : 1
  const units = num(t.quantity) ? t.quantity * (t.multiplier || 1) : null
  const fx = fxFor(t, portfolioCurrency, num(t.exit_price) ? t.exit_price : num(t.mark_price) ? t.mark_price : t.entry_price, opts.quoteCurrency)
  const issues: string[] = []
  const hasPrices = num(t.entry_price) && num(t.exit_price) && units !== null

  let gross: number | null = null
  if (t.status === 'closed') {
    if (hasPrices) gross = (t.exit_price! - t.entry_price!) * dir * units! * fx.rate
    else if (num(t.manual_pnl)) gross = t.manual_pnl
    else issues.push('Closed trade without exit price or result')
  }
  const fees = num(t.fees) ? t.fees : 0
  const net = gross === null ? null : gross - fees

  let unrealized: number | null = null
  if (t.status === 'open' && num(t.mark_price) && num(t.entry_price) && units !== null) unrealized = (t.mark_price - t.entry_price) * dir * units * fx.rate - fees

  const riskPerUnit = num(t.entry_price) && num(t.stop_loss) ? Math.abs(t.entry_price - t.stop_loss) : null
  const risk = num(t.risk_amount) && t.risk_amount > 0 ? t.risk_amount : riskPerUnit !== null && units !== null && riskPerUnit > 0 ? riskPerUnit * units * fx.rate : null
  const reward = num(t.entry_price) && num(t.take_profit) && units !== null ? Math.abs(t.take_profit - t.entry_price) * units * fx.rate : null
  const plannedRR = num(t.planned_rr) && t.planned_rr > 0 ? t.planned_rr : riskPerUnit && num(t.take_profit) && num(t.entry_price) ? Math.abs(t.take_profit - t.entry_price) / riskPerUnit : null
  const rMultiple = net !== null && risk ? net / risk : null
  const notional = num(t.entry_price) && units !== null ? Math.abs(t.entry_price * units * fx.rate) : null
  const returnPct = net !== null && notional ? (net / notional) * 100 : null

  let outcome: Outcome | null = null
  if (net !== null) {
    const tol = Math.abs(opts.beTolerance ?? 0)
    outcome = t.is_be ? 'be' : Math.abs(net) <= tol ? 'be' : net > 0 ? 'win' : 'loss'
  }

  // Sanity checks shown in the trade view and Administration › Data check
  if (num(t.stop_loss) && num(t.entry_price)) {
    if (dir === 1 && t.stop_loss >= t.entry_price) issues.push('Stop-loss is above the entry of a long trade')
    if (dir === -1 && t.stop_loss <= t.entry_price) issues.push('Stop-loss is below the entry of a short trade')
  }
  if (num(t.take_profit) && num(t.entry_price)) {
    if (dir === 1 && t.take_profit <= t.entry_price) issues.push('Take-profit is below the entry of a long trade')
    if (dir === -1 && t.take_profit >= t.entry_price) issues.push('Take-profit is above the entry of a short trade')
  }
  const hold = minutesBetween(t.entry_at, t.exit_at)
  if (hold !== null && hold < 0) issues.push('Exit time is before the entry time')
  if (num(t.quantity) && t.quantity <= 0) issues.push('Quantity must be greater than zero')
  if (fx.warning && (gross !== null || unrealized !== null)) issues.push(fx.warning)

  return { dir, fx, hasPrices, gross, net, unrealized, outcome, risk, reward, plannedRR, rMultiple, returnPct, notional, holdMinutes: hold, issues }
}

// ───────────────────────── calculators (Tools)

export interface PositionSizeIn {
  balance: number
  riskPct: number
  entry: number
  stop: number
  multiplier: number
  fx?: number
  /** Round the size down to this step (1 share, 0.01 lot, 1 contract…). */
  step?: number
}
export interface PositionSizeOut {
  riskMoney: number
  riskPerUnit: number
  rawSize: number
  size: number
  actualRisk: number
  capital: number
  direction: Direction
}
export function positionSize(i: PositionSizeIn): PositionSizeOut | null {
  const fx = i.fx && i.fx > 0 ? i.fx : 1
  const perUnit = Math.abs(i.entry - i.stop) * (i.multiplier || 1) * fx
  if (!(i.balance > 0) || !(i.riskPct > 0) || !(perUnit > 0)) return null
  const riskMoney = (i.balance * i.riskPct) / 100
  const rawSize = riskMoney / perUnit
  const step = i.step && i.step > 0 ? i.step : 0
  const size = step ? Math.floor(rawSize / step + 1e-9) * step : rawSize
  return {
    riskMoney,
    riskPerUnit: perUnit,
    rawSize,
    size: round(size, 8),
    actualRisk: size * perUnit,
    capital: Math.abs(i.entry * size * (i.multiplier || 1) * fx),
    direction: i.stop < i.entry ? 'long' : 'short'
  }
}

export interface PnlIn {
  direction: Direction
  entry: number
  exit: number
  quantity: number
  multiplier: number
  fees: number
  fx?: number
}
export function pnl(i: PnlIn): { gross: number; net: number; returnPct: number; points: number; notional: number } {
  const dir = i.direction === 'short' ? -1 : 1
  const units = i.quantity * (i.multiplier || 1)
  const fx = i.fx && i.fx > 0 ? i.fx : 1
  const gross = (i.exit - i.entry) * dir * units * fx
  const net = gross - (i.fees || 0)
  const notional = Math.abs(i.entry * units * fx)
  return { gross, net, returnPct: notional ? (net / notional) * 100 : 0, points: (i.exit - i.entry) * dir, notional }
}

export interface RiskScenario {
  stop: number
  target: number
}
export interface RiskRow {
  stop: number
  target: number
  risk: number
  reward: number
  rr: number | null
  riskPct: number | null
  rewardPct: number | null
  breakevenWinRate: number | null
  valid: boolean
}
export function riskRows(base: { direction: Direction; entry: number; quantity: number; multiplier: number; equity: number; fees?: number; fx?: number }, scenarios: RiskScenario[]): RiskRow[] {
  const dir = base.direction === 'short' ? -1 : 1
  const units = base.quantity * (base.multiplier || 1) * (base.fx && base.fx > 0 ? base.fx : 1)
  const fees = base.fees ?? 0
  return scenarios.map((s) => {
    const risk = (base.entry - s.stop) * dir * units + fees
    const reward = (s.target - base.entry) * dir * units - fees
    const valid = (s.stop - base.entry) * dir < 0 && (s.target - base.entry) * dir > 0
    const rr = valid && risk > 0 ? reward / risk : null
    return {
      stop: s.stop,
      target: s.target,
      risk,
      reward,
      rr,
      riskPct: base.equity > 0 ? (risk / base.equity) * 100 : null,
      rewardPct: base.equity > 0 ? (reward / base.equity) * 100 : null,
      breakevenWinRate: rr !== null ? (1 / (1 + rr)) * 100 : null,
      valid
    }
  })
}
