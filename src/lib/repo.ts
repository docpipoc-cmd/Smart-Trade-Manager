// Data access: every read and write of records goes through here, so the Dashboard, Portfolios,
// Trades, Analytics and Tools all use the same numbers.
import { all, audit, dbVersion, get, run, transaction } from './db'
import { nowLocal, todayIso, uid } from './format'
import { computeTrade, type TradeCalc } from './calc'
import { settings } from './settings'
import { signedFlow, tradeDay, type Row } from './stats'
import { removeImageFile, storeImage } from './images'
import { L } from './i18n'
import type { CashFlow, Instrument, Lookup, LookupKind, Portfolio, Strategy, Tag, Trade, TradeImage, TradeNote } from './types'

// Per-database-version memo: reads are cheap to repeat inside one render pass.
const memo = new Map<string, { v: number; val: unknown }>()
function cached<T>(key: string, fn: () => T): T {
  const v = dbVersion()
  const hit = memo.get(key)
  if (hit && hit.v === v) return hit.val as T
  const val = fn()
  memo.set(key, { v, val })
  return val
}
const stamp = () => new Date().toISOString()

// ───────────────────────── portfolios
export const portfolios = (): Portfolio[] => cached('portfolios', () => all<Portfolio>('SELECT * FROM portfolios ORDER BY status = \'archived\', name COLLATE NOCASE'))
export const portfolioMap = (): Record<string, Portfolio> => cached('portfolioMap', () => Object.fromEntries(portfolios().map((p) => [p.id, p])))
export const portfolio = (id: string | null | undefined): Portfolio | undefined => (id ? portfolioMap()[id] : undefined)

export function savePortfolio(p: Partial<Portfolio> & { name: string }): string {
  const id = p.id ?? uid()
  const exists = !!p.id && !!portfolio(p.id)
  const row = [p.name.trim(), p.description ?? null, p.account_type ?? 'live', p.broker ?? null, p.currency ?? 'USD', p.initial_balance ?? 0, p.goal ?? null, p.color ?? '#f7931a', p.status ?? 'active', p.start_date ?? todayIso()]
  if (exists) run('UPDATE portfolios SET name=?,description=?,account_type=?,broker=?,currency=?,initial_balance=?,goal=?,color=?,status=?,start_date=? WHERE id=?', [...row, id])
  else run('INSERT INTO portfolios(name,description,account_type,broker,currency,initial_balance,goal,color,status,start_date,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [...row, id, stamp()])
  audit(exists ? L('Carteira editada', 'Portfolio edited') : L('Carteira criada', 'Portfolio created'), p.name)
  return id
}
export async function deletePortfolio(id: string): Promise<void> {
  const files = all<{ file: string }>('SELECT i.file FROM trade_images i JOIN trades t ON t.id = i.trade_id WHERE t.portfolio_id=?', [id])
  const name = portfolio(id)?.name ?? ''
  run('DELETE FROM portfolios WHERE id=?', [id])
  audit(L('Carteira excluída', 'Portfolio deleted'), name)
  await Promise.all(files.map((f) => removeImageFile(f.file).catch(() => undefined)))
}
export function setPortfolioStatus(id: string, status: Portfolio['status']): void {
  run('UPDATE portfolios SET status=? WHERE id=?', [status, id])
  audit(L('Status da carteira', 'Portfolio status'), `${portfolio(id)?.name}: ${status}`)
}

// ───────────────────────── cash flows
export const cashFlows = (): CashFlow[] => cached('flows', () => all<CashFlow>('SELECT * FROM cash_flows ORDER BY date DESC, rowid DESC'))
export function saveCashFlow(f: Partial<CashFlow> & { portfolio_id: string; kind: CashFlow['kind']; amount: number; date: string }): string {
  const id = f.id ?? uid()
  if (f.id) run('UPDATE cash_flows SET portfolio_id=?,kind=?,amount=?,date=?,note=? WHERE id=?', [f.portfolio_id, f.kind, f.amount, f.date, f.note ?? null, id])
  else run('INSERT INTO cash_flows(id,portfolio_id,kind,amount,date,note) VALUES(?,?,?,?,?,?)', [id, f.portfolio_id, f.kind, f.amount, f.date, f.note ?? null])
  audit(L('Movimentação salva', 'Cash movement saved'), `${f.kind} ${f.amount}`)
  return id
}
export function deleteCashFlow(id: string): void {
  run('DELETE FROM cash_flows WHERE id=?', [id])
  audit(L('Movimentação excluída', 'Cash movement deleted'))
}

// ───────────────────────── instruments (asset catalog)
export const instruments = (): Instrument[] => cached('instruments', () => all<Instrument>('SELECT * FROM instruments ORDER BY symbol'))
export const instrumentMap = (): Record<string, Instrument> => cached('instrumentMap', () => Object.fromEntries(instruments().map((i) => [i.id, i])))
export function findInstrument(symbol: string, cls?: string): Instrument | undefined {
  const s = symbol.trim().toUpperCase()
  return instruments().find((i) => i.symbol.toUpperCase() === s && (!cls || i.asset_class === cls))
}
export function saveInstrument(i: Partial<Instrument> & { symbol: string }): string {
  const existing = i.id ? instrumentMap()[i.id] : findInstrument(i.symbol, i.asset_class)
  const id = existing?.id ?? i.id ?? uid()
  const v = { ...(existing ?? {}), ...i }
  const row = [v.symbol!.trim().toUpperCase(), v.name ?? null, v.asset_class ?? 'stock', v.exchange ?? null, v.quote_currency ?? null, v.multiplier ?? 1, v.tick_size ?? null, v.logo ?? null, v.provider ?? null, v.provider_id ?? null, v.notes ?? null, stamp()]
  if (existing) run('UPDATE instruments SET symbol=?,name=?,asset_class=?,exchange=?,quote_currency=?,multiplier=?,tick_size=?,logo=?,provider=?,provider_id=?,notes=?,updated_at=? WHERE id=?', [...row, id])
  else run('INSERT INTO instruments(symbol,name,asset_class,exchange,quote_currency,multiplier,tick_size,logo,provider,provider_id,notes,updated_at,id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', [...row, id])
  return id
}
export function deleteInstrument(id: string): void {
  run('DELETE FROM instruments WHERE id=?', [id])
  audit(L('Ativo removido do catálogo', 'Asset removed from catalog'))
}

// ───────────────────────── strategies, lookups, tags
export const strategies = (): Strategy[] => cached('strategies', () => all<Strategy>('SELECT * FROM strategies ORDER BY active DESC, name COLLATE NOCASE'))
export const strategyMap = (): Record<string, Strategy> => cached('strategyMap', () => Object.fromEntries(strategies().map((s) => [s.id, s])))
export function saveStrategy(s: Partial<Strategy> & { name: string }): string {
  const id = s.id ?? uid()
  if (s.id) run('UPDATE strategies SET name=?,description=?,color=?,active=? WHERE id=?', [s.name.trim(), s.description ?? null, s.color ?? '#5b95ff', s.active ?? 1, id])
  else run('INSERT INTO strategies(id,name,description,color,active) VALUES(?,?,?,?,?)', [id, s.name.trim(), s.description ?? null, s.color ?? '#5b95ff', s.active ?? 1])
  audit(L('Estratégia salva', 'Strategy saved'), s.name)
  return id
}
export function deleteStrategy(id: string): void {
  run('DELETE FROM strategies WHERE id=?', [id])
  audit(L('Estratégia excluída', 'Strategy deleted'))
}
export const lookups = (kind: LookupKind): Lookup[] => cached('lk:' + kind, () => all<Lookup>('SELECT * FROM lookups WHERE kind=? ORDER BY sort, name', [kind]))
export const lookupMap = (): Record<string, Lookup> => cached('lookupMap', () => Object.fromEntries(all<Lookup>('SELECT * FROM lookups').map((l) => [l.id, l])))
export function saveLookup(l: Partial<Lookup> & { kind: LookupKind; name: string }): string {
  const id = l.id ?? uid()
  if (l.id) run('UPDATE lookups SET name=?,color=?,sort=? WHERE id=?', [l.name.trim(), l.color ?? '#64748b', l.sort ?? 0, id])
  else run('INSERT INTO lookups(id,kind,name,color,sort) VALUES(?,?,?,?,?)', [id, l.kind, l.name.trim(), l.color ?? '#64748b', l.sort ?? lookups(l.kind).length])
  return id
}
export function deleteLookup(id: string): void {
  run('DELETE FROM lookups WHERE id=?', [id])
}
export const tags = (): Tag[] => cached('tags', () => all<Tag>('SELECT * FROM tags ORDER BY name COLLATE NOCASE'))
export const tagMap = (): Record<string, Tag> => cached('tagMap', () => Object.fromEntries(tags().map((t) => [t.id, t])))
export function saveTag(t: Partial<Tag> & { name: string }): string {
  const id = t.id ?? uid()
  if (t.id) run('UPDATE tags SET name=?,color=? WHERE id=?', [t.name.trim(), t.color ?? '#8b5cf6', id])
  else run('INSERT INTO tags(id,name,color) VALUES(?,?,?)', [id, t.name.trim(), t.color ?? '#8b5cf6'])
  return id
}
export function deleteTag(id: string): void {
  run('DELETE FROM tags WHERE id=?', [id])
}
/** trade id → tag ids */
export const tradeTagIndex = (): Record<string, string[]> =>
  cached('tradeTags', () => {
    const m: Record<string, string[]> = {}
    for (const r of all<{ trade_id: string; tag_id: string }>('SELECT * FROM trade_tags')) (m[r.trade_id] ??= []).push(r.tag_id)
    return m
  })
export const tradeMistakeIndex = (): Record<string, string[]> =>
  cached('tradeMistakes', () => {
    const m: Record<string, string[]> = {}
    for (const r of all<{ trade_id: string; lookup_id: string }>('SELECT * FROM trade_mistakes')) (m[r.trade_id] ??= []).push(r.lookup_id)
    return m
  })

// ───────────────────────── fx rates (USD per 1 unit of currency)
export const fxRates = (): Record<string, { rate: number; updated_at: string; source: string | null }> =>
  cached('fx', () => Object.fromEntries(all<{ currency: string; rate: number; updated_at: string; source: string | null }>('SELECT * FROM fx_rates').map((r) => [r.currency, r])))
export function setFxRate(currency: string, usdPerUnit: number | null, source: string | null = null): void {
  if (usdPerUnit === null) run('DELETE FROM fx_rates WHERE currency=?', [currency])
  else run('INSERT OR REPLACE INTO fx_rates(currency,rate,updated_at,source) VALUES(?,?,?,?)', [currency, usdPerUnit, stamp(), source])
}
/** Factor that turns an amount in `from` into `to`; null when a rate is missing. */
export function convFactor(from: string, to: string): number | null {
  if (from === to) return 1
  const r = fxRates()
  const usd = (c: string) => (c === 'USD' ? 1 : c === 'USDT' ? (r.USDT?.rate ?? 1) : r[c]?.rate ?? null)
  const a = usd(from)
  const b = usd(to)
  return a && b ? a / b : null
}
/** Currencies used by portfolios that can't be converted to the display currency. */
export function missingRates(currency = settings().currency): string[] {
  return [...new Set(portfolios().map((p) => p.currency))].filter((c) => convFactor(c, currency) === null)
}

// ───────────────────────── trades
export const trades = (): Trade[] => cached('trades', () => all<Trade>('SELECT * FROM trades ORDER BY COALESCE(exit_at, entry_at, created_at) DESC'))
export const trade = (id: string): Trade | undefined => cached('tradeMap', () => Object.fromEntries(trades().map((t) => [t.id, t])))[id]

/** Calculations of one trade, in its portfolio currency. */
export function calcOf(t: Trade): TradeCalc {
  const p = portfolio(t.portfolio_id)
  const ins = t.instrument_id ? instrumentMap()[t.instrument_id] : undefined
  return computeTrade(t, p?.currency ?? 'USD', { beTolerance: settings().beTolerance, quoteCurrency: ins?.quote_currency ?? null })
}

/**
 * All trades with their calculations, converted to the display currency. Trades of portfolios whose
 * currency has no rate are kept with conv = 1 only when the list is limited to that one currency.
 */
export function rows(opts: { portfolioIds?: string[] | null; currency?: string } = {}): { rows: Row[]; currency: string; skipped: string[] } {
  const ids = opts.portfolioIds?.length ? opts.portfolioIds : null
  const pm = portfolioMap()
  const list = trades().filter((t) => !ids || ids.includes(t.portfolio_id))
  const curs = ids ? [...new Set(ids.map((id) => pm[id]?.currency ?? 'USD'))] : []
  // One portfolio (or several in one currency): show its own currency.
  const currency = opts.currency ?? (ids && curs.length === 1 ? curs[0] : settings().currency)
  const skipped = new Set<string>()
  const out: Row[] = []
  const key = 'rows:' + (ids?.join(',') ?? '*') + ':' + currency
  const res = cached(key, () => {
    for (const t of list) {
      const pc = pm[t.portfolio_id]?.currency ?? 'USD'
      const conv = convFactor(pc, currency)
      if (conv === null) {
        skipped.add(pc)
        continue
      }
      out.push({ t, c: calcOf(t), conv })
    }
    return { rows: out, currency, skipped: [...skipped] }
  })
  return res
}

export interface TradeInput extends Partial<Trade> {
  portfolio_id: string
  symbol: string
}
export function saveTrade(t: TradeInput, extra: { tags?: string[]; mistakes?: string[] } = {}): string {
  const id = t.id ?? uid()
  const existing = t.id ? trade(t.id) : undefined
  const v: Trade = {
    instrument_id: null, asset_name: null, asset_class: 'stock', direction: 'long', strategy_id: null, session_id: null, sentiment_id: null,
    status: 'closed', entry_at: null, exit_at: null, entry_price: null, exit_price: null, quantity: null, multiplier: 1, fx_rate: null,
    stop_loss: null, take_profit: null, risk_amount: null, fees: 0, manual_pnl: null, planned_rr: null, followed_plan: null, is_be: 0,
    mark_price: null, mark_at: null, mark_source: null, notes: null, created_at: stamp(), updated_at: stamp(),
    ...(existing ?? {}),
    ...t,
    id
  } as Trade
  v.symbol = v.symbol.trim().toUpperCase()
  v.updated_at = stamp()
  const cols: (keyof Trade)[] = ['portfolio_id', 'instrument_id', 'symbol', 'asset_name', 'asset_class', 'direction', 'strategy_id', 'session_id', 'sentiment_id', 'status', 'entry_at', 'exit_at', 'entry_price', 'exit_price', 'quantity', 'multiplier', 'fx_rate', 'stop_loss', 'take_profit', 'risk_amount', 'fees', 'manual_pnl', 'planned_rr', 'followed_plan', 'is_be', 'mark_price', 'mark_at', 'mark_source', 'notes', 'created_at', 'updated_at']
  transaction(() => {
    if (existing) run(`UPDATE trades SET ${cols.map((c) => c + '=?').join(',')} WHERE id=?`, [...cols.map((c) => v[c] as never), id])
    else run(`INSERT INTO trades(${cols.join(',')},id) VALUES(${cols.map(() => '?').join(',')},?)`, [...cols.map((c) => v[c] as never), id])
    if (extra.tags) {
      run('DELETE FROM trade_tags WHERE trade_id=?', [id])
      for (const tg of extra.tags) run('INSERT OR IGNORE INTO trade_tags(trade_id,tag_id) VALUES(?,?)', [id, tg])
    }
    if (extra.mistakes) {
      run('DELETE FROM trade_mistakes WHERE trade_id=?', [id])
      for (const m of extra.mistakes) run('INSERT OR IGNORE INTO trade_mistakes(trade_id,lookup_id) VALUES(?,?)', [id, m])
    }
  })
  audit(existing ? L('Operação editada', 'Trade edited') : L('Operação registrada', 'Trade recorded'), `${v.symbol} ${v.direction}`)
  return id
}

export async function deleteTrade(id: string): Promise<void> {
  const files = tradeImages(id).map((i) => i.file)
  const t = trade(id)
  run('DELETE FROM trades WHERE id=?', [id])
  audit(L('Operação excluída', 'Trade deleted'), t ? `${t.symbol} ${t.entry_at ?? ''}` : id)
  await Promise.all(files.map((f) => removeImageFile(f).catch(() => undefined)))
}

/** Copies a trade's setup as a new planned trade (no prices, times, screenshots or notes). */
export function duplicateTrade(id: string): string | null {
  const t = trade(id)
  if (!t) return null
  const copy: TradeInput = {
    portfolio_id: t.portfolio_id, instrument_id: t.instrument_id, symbol: t.symbol, asset_name: t.asset_name, asset_class: t.asset_class,
    direction: t.direction, strategy_id: t.strategy_id, session_id: t.session_id, quantity: t.quantity, multiplier: t.multiplier,
    fx_rate: t.fx_rate, fees: t.fees, planned_rr: t.planned_rr, status: 'planned', entry_at: nowLocal()
  }
  const nid = saveTrade(copy, { tags: tradeTagIndex()[id] ?? [] })
  return nid
}

export function setMark(id: string, price: number, at: string, source: string): void {
  run('UPDATE trades SET mark_price=?, mark_at=?, mark_source=? WHERE id=?', [price, at, source, id])
}

// ───────────────────────── screenshots & notes
export const tradeImages = (tradeId: string): TradeImage[] => cached('imgs', () => {
  const m: Record<string, TradeImage[]> = {}
  for (const i of all<TradeImage>('SELECT * FROM trade_images ORDER BY created_at')) (m[i.trade_id] ??= []).push(i)
  return m
})[tradeId] ?? []
export const allImages = (): TradeImage[] => cached('allImgs', () => all<TradeImage>('SELECT * FROM trade_images ORDER BY created_at DESC'))

export async function addImage(tradeId: string, kind: TradeImage['kind'], file: { name: string; bytes: Uint8Array; mime: string }, caption: string | null = null): Promise<string> {
  const ref = await storeImage(file.name, file.bytes)
  const id = uid()
  run('INSERT INTO trade_images(id,trade_id,kind,file,name,mime,caption,created_at) VALUES(?,?,?,?,?,?,?,?)', [id, tradeId, kind, ref, file.name, file.mime, caption, stamp()])
  return id
}
export async function deleteImage(id: string): Promise<void> {
  const img = get<TradeImage>('SELECT * FROM trade_images WHERE id=?', [id])
  if (!img) return
  run('DELETE FROM trade_images WHERE id=?', [id])
  await removeImageFile(img.file).catch(() => undefined)
}
export function setImageCaption(id: string, caption: string | null): void {
  run('UPDATE trade_images SET caption=? WHERE id=?', [caption, id])
}

export const tradeNotes = (tradeId: string): TradeNote[] => cached('notes', () => {
  const m: Record<string, TradeNote[]> = {}
  for (const n of all<TradeNote>('SELECT * FROM trade_notes ORDER BY at')) (m[n.trade_id] ??= []).push(n)
  return m
})[tradeId] ?? []
export function addNote(tradeId: string, text: string): void {
  run('INSERT INTO trade_notes(id,trade_id,at,text) VALUES(?,?,?,?)', [uid(), tradeId, nowLocal(), text.trim()])
}
export function deleteNote(id: string): void {
  run('DELETE FROM trade_notes WHERE id=?', [id])
}

// ───────────────────────── portfolio metrics

export interface PortfolioMetrics {
  initial: number
  deposits: number
  withdrawals: number
  otherFlows: number
  netFlows: number
  invested: number
  gross: number
  fees: number
  realized: number
  balance: number
  unrealized: number
  unrealizedMissing: number
  equity: number
  returnPct: number | null
  open: number
  closed: number
  planned: number
  goalProgress: number | null
  state: 'active' | 'goal' | 'broken' | 'locked' | 'archived'
  exposure: { symbol: string; cls: string; notional: number; side: 'long' | 'short' }[]
  allocation: { key: string; notional: number; count: number }[]
  lastTrade: string | null
}

export function portfolioMetrics(p: Portfolio, range?: { from: string | null; to: string | null }): PortfolioMetrics {
  return cached('pm:' + p.id + ':' + (range?.from ?? '') + ':' + (range?.to ?? ''), () => {
    const flows = cashFlows().filter((f) => f.portfolio_id === p.id && (!range?.to || f.date <= range.to))
    const list = trades().filter((t) => t.portfolio_id === p.id)
    let deposits = 0
    let withdrawals = 0
    let other = 0
    for (const f of flows) {
      const v = signedFlow(f)
      if (f.kind === 'deposit') deposits += v
      else if (f.kind === 'withdrawal') withdrawals += -v
      else other += v
    }
    let gross = 0
    let fees = 0
    let realized = 0
    let unrealized = 0
    let unrealizedMissing = 0
    const exposure: PortfolioMetrics['exposure'] = []
    const alloc = new Map<string, { notional: number; count: number }>()
    let lastTrade: string | null = null
    for (const t of list) {
      const c = calcOf(t)
      if (t.status === 'closed' && c.net !== null && (!range?.to || tradeDay(t) <= range.to)) {
        gross += c.gross ?? 0
        fees += t.fees || 0
        realized += c.net
        const day = tradeDay(t)
        if (!lastTrade || day > lastTrade) lastTrade = day
      }
      if (t.status === 'open') {
        if (c.unrealized !== null) unrealized += c.unrealized
        else unrealizedMissing++
        if (c.notional) exposure.push({ symbol: t.symbol, cls: t.asset_class, notional: c.notional, side: t.direction })
      }
      if (t.status === 'closed' || t.status === 'open') {
        const a = alloc.get(t.asset_class) ?? { notional: 0, count: 0 }
        a.notional += c.notional ?? 0
        a.count++
        alloc.set(t.asset_class, a)
      }
    }
    const netFlows = deposits - withdrawals + other
    const invested = p.initial_balance + deposits - withdrawals
    const balance = p.initial_balance + netFlows + realized
    const equity = balance + unrealized
    const goalProgress = p.goal && p.goal > 0 ? Math.max(0, Math.min(1, equity / p.goal)) : null
    const state: PortfolioMetrics['state'] =
      p.status === 'archived' ? 'archived' : p.status === 'locked' ? 'locked' : (p.initial_balance > 0 || invested > 0) && equity <= 0 ? 'broken' : p.goal && equity >= p.goal ? 'goal' : 'active'
    return {
      initial: p.initial_balance,
      deposits,
      withdrawals,
      otherFlows: other,
      netFlows,
      invested,
      gross,
      fees,
      realized,
      balance,
      unrealized,
      unrealizedMissing,
      equity,
      returnPct: invested > 0 ? (realized / invested) * 100 : null,
      open: list.filter((t) => t.status === 'open').length,
      closed: list.filter((t) => t.status === 'closed').length,
      planned: list.filter((t) => t.status === 'planned').length,
      goalProgress,
      state,
      exposure: exposure.sort((a, b) => b.notional - a.notional),
      allocation: [...alloc.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.notional - a.notional),
      lastTrade
    }
  })
}

// ───────────────────────── history
export const history = (limit = 300) => all<{ id: number; at: string; action: string; detail: string }>('SELECT * FROM history ORDER BY id DESC LIMIT ?', [limit])

export function counts(): Record<string, number> {
  const q = (t: string) => get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)?.n ?? 0
  return { portfolios: q('portfolios'), trades: q('trades'), cash_flows: q('cash_flows'), instruments: q('instruments'), strategies: q('strategies'), tags: q('tags'), lookups: q('lookups'), trade_images: q('trade_images'), trade_notes: q('trade_notes') }
}
