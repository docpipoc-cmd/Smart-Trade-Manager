// Performance statistics built only from recorded trades and cash flows. Pure (testable in Node).
import type { CashFlow, Portfolio, Trade } from './types'
import type { TradeCalc } from './calc'

export interface Row {
  t: Trade
  c: TradeCalc
  /** Multiplies portfolio-currency amounts into the display currency (1 when they match). */
  conv: number
}

/** Date the trade counts on: exit for closed trades, entry otherwise. */
export const tradeDay = (t: Trade): string => ((t.status === 'closed' ? t.exit_at || t.entry_at : t.entry_at || t.exit_at) ?? t.created_at).slice(0, 10)

export interface Summary {
  total: number
  closed: number
  open: number
  planned: number
  cancelled: number
  wins: number
  losses: number
  be: number
  /** wins ÷ (wins + losses); break-even trades are left out. */
  winRate: number | null
  lossRate: number | null
  net: number
  grossProfit: number
  grossLoss: number
  fees: number
  avgWin: number | null
  avgLoss: number | null
  largestWin: number | null
  largestLoss: number | null
  profitFactor: number | null
  /** average win ÷ |average loss| */
  payoff: number | null
  expectancy: number | null
  avgR: number | null
  avgPlannedRR: number | null
  avgActualRR: number | null
  maxDrawdown: number
  maxDrawdownPct: number | null
  bestStreak: number
  worstStreak: number
  avgHoldMinutes: number | null
  followed: number
  broke: number
  unrealized: number
  unrealizedMissing: number
  long: { n: number; wins: number; losses: number; be: number; net: number }
  short: { n: number; wins: number; losses: number; be: number; net: number }
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)

export function sortChrono(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => ((a.t.exit_at || a.t.entry_at || '') < (b.t.exit_at || b.t.entry_at || '') ? -1 : 1))
}

/** Peak-to-trough fall of the cumulative result, in money and as % of (startCapital + peak). */
export function drawdown(values: number[], startCapital = 0): { abs: number; pct: number | null } {
  let peak = 0
  let cum = 0
  let maxAbs = 0
  let maxPct: number | null = null
  for (const v of values) {
    cum += v
    if (cum > peak) peak = cum
    const dd = peak - cum
    if (dd > maxAbs) maxAbs = dd
    const base = startCapital + peak
    if (base > 0 && dd > 0) maxPct = Math.max(maxPct ?? 0, (dd / base) * 100)
  }
  return { abs: maxAbs, pct: startCapital > 0 ? (maxPct ?? 0) : null }
}

export function summarize(rows: Row[], startCapital = 0): Summary {
  const closed = sortChrono(rows.filter((r) => r.t.status === 'closed' && r.c.net !== null))
  const net = (r: Row) => r.c.net! * r.conv
  const wins = closed.filter((r) => r.c.outcome === 'win')
  const losses = closed.filter((r) => r.c.outcome === 'loss')
  const be = closed.filter((r) => r.c.outcome === 'be')
  const gp = wins.reduce((s, r) => s + net(r), 0)
  const gl = losses.reduce((s, r) => s + net(r), 0)
  const total = closed.reduce((s, r) => s + net(r), 0)
  const avgWin = avg(wins.map(net))
  const avgLoss = avg(losses.map(net))
  const decided = wins.length + losses.length

  let bestStreak = 0
  let worstStreak = 0
  let curW = 0
  let curL = 0
  for (const r of closed) {
    if (r.c.outcome === 'win') (curW++, (curL = 0))
    else if (r.c.outcome === 'loss') (curL++, (curW = 0))
    bestStreak = Math.max(bestStreak, curW)
    worstStreak = Math.max(worstStreak, curL)
  }
  const dd = drawdown(closed.map(net), startCapital)
  const side = (d: 'long' | 'short') => {
    const l = closed.filter((r) => r.t.direction === d)
    return { n: l.length, wins: l.filter((r) => r.c.outcome === 'win').length, losses: l.filter((r) => r.c.outcome === 'loss').length, be: l.filter((r) => r.c.outcome === 'be').length, net: l.reduce((s, r) => s + net(r), 0) }
  }
  const open = rows.filter((r) => r.t.status === 'open')
  return {
    total: rows.length,
    closed: closed.length,
    open: open.length,
    planned: rows.filter((r) => r.t.status === 'planned').length,
    cancelled: rows.filter((r) => r.t.status === 'cancelled').length,
    wins: wins.length,
    losses: losses.length,
    be: be.length,
    winRate: decided ? (wins.length / decided) * 100 : null,
    lossRate: decided ? (losses.length / decided) * 100 : null,
    net: total,
    grossProfit: gp,
    grossLoss: gl,
    fees: closed.reduce((s, r) => s + (r.t.fees || 0) * r.conv, 0),
    avgWin,
    avgLoss,
    largestWin: wins.length ? Math.max(...wins.map(net)) : null,
    largestLoss: losses.length ? Math.min(...losses.map(net)) : null,
    profitFactor: gl < 0 ? gp / Math.abs(gl) : gp > 0 ? Infinity : null,
    payoff: avgWin !== null && avgLoss ? avgWin / Math.abs(avgLoss) : null,
    expectancy: closed.length ? total / closed.length : null,
    avgR: avg(closed.map((r) => r.c.rMultiple).filter((x): x is number => x !== null)),
    avgPlannedRR: avg(rows.map((r) => r.c.plannedRR).filter((x): x is number => x !== null)),
    avgActualRR: avg(closed.map((r) => r.c.rMultiple).filter((x): x is number => x !== null)),
    maxDrawdown: dd.abs,
    maxDrawdownPct: dd.pct,
    bestStreak,
    worstStreak,
    avgHoldMinutes: avg(closed.map((r) => r.c.holdMinutes).filter((x): x is number => x !== null && x >= 0)),
    followed: rows.filter((r) => r.t.followed_plan === 1).length,
    broke: rows.filter((r) => r.t.followed_plan === 0).length,
    unrealized: open.reduce((s, r) => s + (r.c.unrealized ?? 0) * r.conv, 0),
    unrealizedMissing: open.filter((r) => r.c.unrealized === null).length,
    long: side('long'),
    short: side('short')
  }
}

export interface GroupRow {
  key: string
  label: string
  color?: string
  count: number
  wins: number
  losses: number
  be: number
  net: number
  grossProfit: number
  grossLoss: number
  winRate: number | null
  profitFactor: number | null
  avgR: number | null
}

export function groupBy(rows: Row[], keyOf: (r: Row) => string | null, labelOf: (k: string) => string = (k) => k, colorOf?: (k: string) => string | undefined): GroupRow[] {
  const m = new Map<string, Row[]>()
  for (const r of rows) {
    if (r.t.status !== 'closed' || r.c.net === null) continue
    const k = keyOf(r) ?? '—'
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return [...m.entries()].map(([key, l]) => {
    const s = summarize(l)
    return { key, label: labelOf(key), color: colorOf?.(key), count: s.closed, wins: s.wins, losses: s.losses, be: s.be, net: s.net, grossProfit: s.grossProfit, grossLoss: s.grossLoss, winRate: s.winRate, profitFactor: s.profitFactor, avgR: s.avgR }
  })
}

// ───────────────────────── balance / equity over time

export interface SeriesPoint {
  key: string // day (YYYY-MM-DD), week start or month (YYYY-MM)
  balance: number
  equity: number
  pnl: number // trading result in this bucket
  cumPnl: number
  flows: number
  trades: number
}

export type Grouping = 'day' | 'week' | 'month'

export function bucketOf(day: string, g: Grouping): string {
  if (g === 'month') return day.slice(0, 7)
  if (g === 'week') {
    const d = new Date(day + 'T12:00:00')
    const dow = (d.getDay() + 6) % 7 // Monday = 0
    d.setDate(d.getDate() - dow)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return day
}

export function signedFlow(f: CashFlow): number {
  if (f.kind === 'deposit' || f.kind === 'income') return Math.abs(f.amount)
  if (f.kind === 'withdrawal' || f.kind === 'fee') return -Math.abs(f.amount)
  return f.amount
}

/**
 * Account balance over time for a set of portfolios (already converted to one currency by `conv`):
 * initial balances on their start dates + cash flows + closed-trade results on their exit dates.
 * The last point's equity adds the unrealized result of open trades (when a mark price is known).
 */
export function balanceSeries(
  portfolios: Portfolio[],
  flows: CashFlow[],
  rows: Row[],
  convOf: (portfolioId: string) => number,
  range: { from: string | null; to: string | null },
  g: Grouping
): { points: SeriesPoint[]; startBalance: number } {
  const ev: { day: string; amt: number; kind: 'flow' | 'pnl' }[] = []
  for (const p of portfolios) ev.push({ day: p.start_date || p.created_at.slice(0, 10), amt: p.initial_balance * convOf(p.id), kind: 'flow' })
  for (const f of flows) ev.push({ day: f.date, amt: signedFlow(f) * convOf(f.portfolio_id), kind: 'flow' })
  for (const r of rows) if (r.t.status === 'closed' && r.c.net !== null) ev.push({ day: tradeDay(r.t), amt: r.c.net * r.conv, kind: 'pnl' })
  ev.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  let bal = 0
  let startBalance = 0
  for (const e of ev) if (range.from && e.day < range.from) bal += e.amt
  startBalance = bal
  const buckets = new Map<string, SeriesPoint>()
  let cum = 0
  for (const e of ev) {
    if (range.from && e.day < range.from) continue
    if (range.to && e.day > range.to) continue
    bal += e.amt
    const k = bucketOf(e.day, g)
    const b = buckets.get(k) ?? { key: k, balance: 0, equity: 0, pnl: 0, cumPnl: 0, flows: 0, trades: 0 }
    if (e.kind === 'pnl') {
      cum += e.amt
      b.pnl += e.amt
      b.trades++
    } else b.flows += e.amt
    b.balance = bal
    b.equity = bal
    b.cumPnl = cum
    buckets.set(k, b)
  }
  const points = [...buckets.values()]
  // Starting point just before the first bucket, so the first day's result shows as a move on the chart
  if (points.length) {
    const f = points[0]
    const d = new Date((f.key.length === 7 ? f.key + '-01' : f.key) + 'T12:00:00')
    if (g === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - (g === 'week' ? 7 : 1))
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` + (g === 'month' ? '' : `-${String(d.getDate()).padStart(2, '0')}`)
    const before = f.balance - f.pnl
    if (before !== 0 || f.pnl !== 0) points.unshift({ key: k, balance: before, equity: before, pnl: 0, cumPnl: 0, flows: 0, trades: 0 })
  }
  const unreal = rows.filter((r) => r.t.status === 'open').reduce((s, r) => s + (r.c.unrealized ?? 0) * r.conv, 0)
  if (points.length) points[points.length - 1].equity += unreal
  return { points, startBalance }
}

// ───────────────────────── periods

export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'all' | 'custom'
export interface Range {
  from: string | null
  to: string | null
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return iso(d)
}
export function periodRange(p: PeriodPreset, custom: Range = { from: null, to: null }, now = new Date()): Range {
  const today = iso(now)
  switch (p) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: today.slice(0, 8) + '01', to: today }
    case 'lastMonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: iso(d), to: iso(e) }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3
      return { from: iso(new Date(now.getFullYear(), q, 1)), to: today }
    }
    case 'year':
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case 'all':
      return { from: null, to: null }
    case 'custom':
      return custom
  }
}
/** The equally long period right before `r` (null for "all time"). */
export function previousRange(r: Range): Range | null {
  if (!r.from || !r.to) return null
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1
  return { from: addDays(r.from, -days), to: addDays(r.from, -1) }
}
export const inRange = (day: string, r: Range) => (!r.from || day >= r.from) && (!r.to || day <= r.to)
