// CSV import / export of trades, portfolios, cash flows and performance reports.
import { L } from './i18n'
import { parseNum, todayIso } from './format'
import { settings } from './settings'
import {
  calcOf, cashFlows, lookups, portfolioMap, portfolios, saveLookup, savePortfolio, saveStrategy, saveTag, saveTrade, strategies, tagMap, tags,
  trades, tradeTagIndex, lookupMap, strategyMap
} from './repo'
import { transaction } from './db'
import { CLASS_MULTIPLIER, knownSpec } from './calc'
import type { AssetClass, Direction, Trade, TradeStatus } from './types'
import type { GroupRow, Summary } from './stats'

// ───────── generic CSV
export function toCsv(rows: (string | number | null | undefined)[][], sep = ','): string {
  const q = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /["\n\r,;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(q).join(sep)).join('\r\n')
}

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split(/\r?\n/)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? '\t' : ','
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (inQ) {
      if (ch === '"') {
        if (t[i + 1] === '"') (cell += '"'), i++
        else inQ = false
      } else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === sep) (row.push(cell), (cell = ''))
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((c) => c.trim() !== '')) out.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) out.push(row)
  return out
}

export function download(name: string, data: string | Uint8Array, mime = 'text/csv;charset=utf-8'): Promise<string | null> {
  if (window.api) return window.api.saveFile({ name, data, filters: [{ name: name.split('.').pop()!.toUpperCase(), extensions: [name.split('.').pop()!] }] })
  const blob = new Blob([typeof data === 'string' ? data : data.slice().buffer], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return Promise.resolve(name)
}

// ───────── trades
export const TRADE_COLUMNS = [
  'portfolio', 'symbol', 'asset_name', 'asset_class', 'direction', 'status', 'strategy', 'entry_at', 'entry_price', 'exit_at', 'exit_price',
  'quantity', 'multiplier', 'fees', 'manual_pnl', 'stop_loss', 'take_profit', 'risk_amount', 'planned_rr', 'fx_rate', 'session', 'sentiment',
  'followed_plan', 'is_be', 'tags', 'notes'
] as const
const COMPUTED = ['currency', 'gross_pnl', 'net_pnl', 'return_pct', 'r_multiple', 'outcome'] as const

const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : +v.toPrecision(12))
export function tradesCsv(list: Trade[] = trades()): string {
  const pm = portfolioMap()
  const sm = strategyMap()
  const lm = lookupMap()
  const tm = tagMap()
  const ti = tradeTagIndex()
  const rows: (string | number | null)[][] = [[...TRADE_COLUMNS, ...COMPUTED]]
  for (const t of list) {
    const c = calcOf(t)
    rows.push([
      pm[t.portfolio_id]?.name ?? '', t.symbol, t.asset_name, t.asset_class, t.direction, t.status, t.strategy_id ? sm[t.strategy_id]?.name ?? '' : '',
      t.entry_at, n(t.entry_price), t.exit_at, n(t.exit_price), n(t.quantity), n(t.multiplier), n(t.fees), n(t.manual_pnl), n(t.stop_loss), n(t.take_profit),
      n(t.risk_amount), n(t.planned_rr), n(t.fx_rate), t.session_id ? lm[t.session_id]?.name ?? '' : '', t.sentiment_id ? lm[t.sentiment_id]?.name ?? '' : '',
      t.followed_plan === null ? '' : t.followed_plan ? 'yes' : 'no', t.is_be ? 'yes' : '', (ti[t.id] ?? []).map((x) => tm[x]?.name).filter(Boolean).join('|'), t.notes,
      pm[t.portfolio_id]?.currency ?? '', n(c.gross), n(c.net), c.returnPct === null ? '' : +c.returnPct.toFixed(4), c.rMultiple === null ? '' : +c.rMultiple.toFixed(4), c.outcome ?? ''
    ])
  }
  return toCsv(rows)
}

export function templateCsv(): string {
  return toCsv([
    [...TRADE_COLUMNS],
    ['Day Trade', 'AAPL', 'Apple Inc.', 'stock', 'long', 'closed', 'Breakout', '2026-10-01 10:15', 187.5, '2026-10-01 15:40', 190.2, 100, 1, 2, '', 185, 193, '', '', '', 'New York', 'Confident', 'yes', '', 'A+ setup', 'Opening range breakout'],
    ['Day Trade', 'WINZ25', 'Mini Ibovespa', 'futures', 'short', 'closed', 'Pullback', '02/10/2026 09:30', 128350, '02/10/2026 10:05', 128000, 2, 0.2, 1.5, '', 128500, 127900, '', '', '', '', '', 'yes', '', '', ''],
    ['Crypto', 'BTCUSDT', 'Bitcoin', 'crypto', 'long', 'open', '', '2026-10-03 08:00', 61000, '', '', 0.05, 1, 3, '', 59500, 65000, '', '', '', '', '', '', '', '', '']
  ])
}

// Column names accepted on import (English + Portuguese aliases)
const ALIASES: Record<string, (typeof TRADE_COLUMNS)[number]> = {
  carteira: 'portfolio', portfolio: 'portfolio', conta: 'portfolio', account: 'portfolio',
  ativo: 'symbol', simbolo: 'symbol', símbolo: 'symbol', ticker: 'symbol', symbol: 'symbol',
  nome: 'asset_name', asset: 'asset_name', asset_name: 'asset_name',
  classe: 'asset_class', asset_class: 'asset_class', class: 'asset_class',
  tipo: 'direction', direcao: 'direction', direção: 'direction', side: 'direction', direction: 'direction',
  status: 'status', estrategia: 'strategy', estratégia: 'strategy', setup: 'strategy', gatilho: 'strategy', strategy: 'strategy',
  entrada: 'entry_at', data_entrada: 'entry_at', entry_at: 'entry_at', entry_date: 'entry_at', open_time: 'entry_at',
  preco_entrada: 'entry_price', preço_entrada: 'entry_price', entry_price: 'entry_price', entry: 'entry_price',
  saida: 'exit_at', saída: 'exit_at', data_saida: 'exit_at', exit_at: 'exit_at', exit_date: 'exit_at', close_time: 'exit_at',
  preco_saida: 'exit_price', preço_saída: 'exit_price', exit_price: 'exit_price', exit: 'exit_price',
  quantidade: 'quantity', qtd: 'quantity', quantity: 'quantity', size: 'quantity', lots: 'quantity', contratos: 'quantity',
  multiplicador: 'multiplier', multiplier: 'multiplier', point_value: 'multiplier',
  taxas: 'fees', taxa: 'fees', fees: 'fees', commission: 'fees', comissao: 'fees', comissão: 'fees',
  resultado: 'manual_pnl', valor: 'manual_pnl', pnl: 'manual_pnl', manual_pnl: 'manual_pnl', profit: 'manual_pnl', gross_pnl: 'manual_pnl',
  stop: 'stop_loss', stop_loss: 'stop_loss', sl: 'stop_loss', alvo: 'take_profit', take_profit: 'take_profit', tp: 'take_profit', target: 'take_profit',
  risco: 'risk_amount', risk_amount: 'risk_amount', risk: 'risk_amount', rr_planejado: 'planned_rr', planned_rr: 'planned_rr',
  cambio: 'fx_rate', câmbio: 'fx_rate', fx_rate: 'fx_rate', sessao: 'session', sessão: 'session', session: 'session',
  sentimento: 'sentiment', sentiment: 'sentiment', seguiu_plano: 'followed_plan', followed_plan: 'followed_plan', be: 'is_be', is_be: 'is_be', breakeven: 'is_be',
  tags: 'tags', notas: 'notes', notes: 'notes', descricao: 'notes', descrição: 'notes', observacoes: 'notes', observações: 'notes'
}

export interface ImportRow {
  line: number
  data: Partial<Trade> & { portfolioName: string; strategyName: string; sessionName: string; sentimentName: string; tagNames: string[] }
  errors: string[]
  warnings: string[]
  duplicate: boolean
}
export interface ImportPreview {
  columns: string[]
  unknown: string[]
  rows: ImportRow[]
  newPortfolios: string[]
  newStrategies: string[]
}

/** Accepts ISO ("2026-10-01 10:15"), DD/MM/YYYY HH:MM and MM/DD/YYYY HH:MM (by the date format in Settings). */
export function parseDateTime(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::\d{2})?)?/)
  let y: number, mo: number, d: number, h = 0, mi = 0
  if (m) [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0)]
  else {
    m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[\sT](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i)
    if (!m) return null
    const us = settings().dateFormat === 'MM/DD/YYYY'
    ;[d, mo] = us ? [+m[2], +m[1]] : [+m[1], +m[2]]
    y = +m[3] < 100 ? 2000 + +m[3] : +m[3]
    h = +(m[4] ?? 0)
    mi = +(m[5] ?? 0)
    if (m[6]) h = (h % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0)
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const p = (x: number) => String(x).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`
}

const DIR: Record<string, Direction> = { long: 'long', buy: 'long', compra: 'long', c: 'long', l: 'long', short: 'short', sell: 'short', venda: 'short', v: 'short', s: 'short' }
const STATUS: Record<string, TradeStatus> = { closed: 'closed', fechada: 'closed', fechado: 'closed', open: 'open', aberta: 'open', aberto: 'open', planned: 'planned', planejada: 'planned', draft: 'planned', cancelled: 'cancelled', canceled: 'cancelled', cancelada: 'cancelled' }
const CLASSES: AssetClass[] = ['stock', 'etf', 'forex', 'crypto', 'index', 'futures', 'commodity', 'option', 'other']
const CLASS_ALIAS: Record<string, AssetClass> = { acao: 'stock', ação: 'stock', ações: 'stock', acoes: 'stock', stocks: 'stock', cripto: 'crypto', criptomoeda: 'crypto', indice: 'index', índice: 'index', futuro: 'futures', futuros: 'futures', future: 'futures', opcao: 'option', opção: 'option', fx: 'forex' }
const yes = (s: string) => /^(1|y|yes|s|sim|true|x)$/i.test(s.trim())
const no = (s: string) => /^(0|n|no|não|nao|false)$/i.test(s.trim())

export function previewImport(text: string, fallbackPortfolio: string | null): ImportPreview {
  const grid = parseCsv(text)
  if (!grid.length) return { columns: [], unknown: [], rows: [], newPortfolios: [], newStrategies: [] }
  const header = grid[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const map = header.map((h) => ALIASES[h] ?? ((TRADE_COLUMNS as readonly string[]).includes(h) ? (h as (typeof TRADE_COLUMNS)[number]) : null))
  const unknown = header.filter((h, i) => !map[i] && !(COMPUTED as readonly string[]).includes(h))
  const pm = portfolios()
  const fb = fallbackPortfolio ? pm.find((p) => p.id === fallbackPortfolio) : undefined
  const existing = new Set(trades().map((t) => `${t.portfolio_id}|${t.symbol}|${t.entry_at}|${t.entry_price}`))
  const seen = new Set<string>()
  const newP = new Set<string>()
  const newS = new Set<string>()
  const rows: ImportRow[] = grid.slice(1).map((cells, idx) => {
    const raw: Partial<Record<(typeof TRADE_COLUMNS)[number], string>> = {}
    map.forEach((k, i) => k && (raw[k] = (cells[i] ?? '').trim()))
    const errors: string[] = []
    const warnings: string[] = []
    const num = (k: (typeof TRADE_COLUMNS)[number]) => {
      const v = raw[k]
      if (!v) return null
      const x = parseNum(v)
      if (x === null) errors.push(`${k}: "${v}" ${L('não é um número', 'is not a number')}`)
      return x
    }
    const portfolioName = raw.portfolio || fb?.name || ''
    const pf = pm.find((p) => p.name.toLowerCase() === portfolioName.toLowerCase())
    if (!portfolioName) errors.push(L('Sem carteira (coluna portfolio ou carteira padrão)', 'No portfolio (portfolio column or default portfolio)'))
    else if (!pf) newP.add(portfolioName)
    const symbol = (raw.symbol ?? '').toUpperCase()
    if (!symbol) errors.push(L('Ativo vazio', 'Empty symbol'))
    const dirRaw = (raw.direction ?? 'long').toLowerCase()
    const direction = DIR[dirRaw]
    if (!direction) errors.push(`direction: "${raw.direction}"`)
    const stRaw = (raw.status ?? '').toLowerCase()
    let status: TradeStatus = STATUS[stRaw] ?? (raw.exit_at || raw.exit_price || raw.manual_pnl ? 'closed' : raw.entry_price ? 'open' : 'planned')
    if (stRaw && !STATUS[stRaw]) errors.push(`status: "${raw.status}"`)
    const clsRaw = (raw.asset_class ?? '').toLowerCase()
    const asset_class: AssetClass = (CLASSES.includes(clsRaw as AssetClass) ? clsRaw : CLASS_ALIAS[clsRaw] ?? settings().defaultAssetClass) as AssetClass
    if (clsRaw && !CLASSES.includes(clsRaw as AssetClass) && !CLASS_ALIAS[clsRaw]) warnings.push(`asset_class "${raw.asset_class}" → ${asset_class}`)
    const entry_at = raw.entry_at ? parseDateTime(raw.entry_at) : null
    if (raw.entry_at && !entry_at) errors.push(`entry_at: "${raw.entry_at}"`)
    const exit_at = raw.exit_at ? parseDateTime(raw.exit_at) : null
    if (raw.exit_at && !exit_at) errors.push(`exit_at: "${raw.exit_at}"`)
    const entry_price = num('entry_price')
    const exit_price = num('exit_price')
    const quantity = num('quantity')
    const manual_pnl = num('manual_pnl')
    let multiplier = num('multiplier')
    if (multiplier === null) multiplier = knownSpec(symbol, asset_class)?.multiplier ?? CLASS_MULTIPLIER[asset_class]
    if (status === 'closed') {
      if (!exit_at && !entry_at) errors.push(L('Operação fechada sem data', 'Closed trade without a date'))
      if (!(entry_price !== null && exit_price !== null && quantity !== null) && manual_pnl === null) errors.push(L('Fechada: precisa de entrada, saída e quantidade — ou do resultado', 'Closed: needs entry, exit and quantity — or the result'))
    }
    if (quantity !== null && quantity <= 0) errors.push(L('Quantidade deve ser > 0', 'Quantity must be > 0'))
    if (entry_at && exit_at && exit_at < entry_at) errors.push(L('Saída antes da entrada', 'Exit before entry'))
    const strategyName = raw.strategy ?? ''
    if (strategyName && !strategies().some((s) => s.name.toLowerCase() === strategyName.toLowerCase())) newS.add(strategyName)
    const fp = raw.followed_plan ? (yes(raw.followed_plan) ? 1 : no(raw.followed_plan) ? 0 : null) : null
    const key = `${pf?.id ?? portfolioName}|${symbol}|${entry_at}|${entry_price}`
    const duplicate = existing.has(key) || seen.has(key)
    seen.add(key)
    if (duplicate) warnings.push(L('Parece duplicada (mesmo ativo, entrada e preço)', 'Looks like a duplicate (same symbol, entry and price)'))
    if (status === 'closed' && !exit_at && entry_at) warnings.push(L('Sem data de saída: usando a de entrada', 'No exit date: using the entry date'))
    return {
      line: idx + 2,
      errors,
      warnings,
      duplicate,
      data: {
        portfolio_id: pf?.id,
        portfolioName,
        symbol,
        asset_name: raw.asset_name || null,
        asset_class,
        direction: direction ?? 'long',
        status,
        entry_at,
        exit_at: status === 'closed' ? exit_at ?? entry_at : null,
        entry_price,
        exit_price: status === 'closed' ? exit_price : null,
        quantity,
        multiplier,
        fees: num('fees') ?? 0,
        manual_pnl: status === 'closed' && (entry_price === null || exit_price === null) ? manual_pnl : null,
        stop_loss: num('stop_loss'),
        take_profit: num('take_profit'),
        risk_amount: num('risk_amount'),
        planned_rr: num('planned_rr'),
        fx_rate: num('fx_rate'),
        followed_plan: fp,
        is_be: raw.is_be && yes(raw.is_be) ? 1 : 0,
        notes: raw.notes || null,
        strategyName,
        sessionName: raw.session ?? '',
        sentimentName: raw.sentiment ?? '',
        tagNames: (raw.tags ?? '').split(/[|,]/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean)
      }
    }
  })
  return { columns: header, unknown, rows, newPortfolios: [...newP], newStrategies: [...newS] }
}

/** Imports the valid rows (optionally skipping duplicates). Creates missing portfolios, strategies, options and tags. */
export function commitImport(p: ImportPreview, opts: { skipDuplicates: boolean; currency: string }): number {
  const ok = p.rows.filter((r) => !r.errors.length && !(opts.skipDuplicates && r.duplicate))
  return transaction(() => {
    const pfIds: Record<string, string> = Object.fromEntries(portfolios().map((x) => [x.name.toLowerCase(), x.id]))
    for (const name of p.newPortfolios) {
      const days = ok.filter((r) => r.data.portfolioName === name).map((r) => (r.data.entry_at ?? r.data.exit_at ?? '').slice(0, 10)).filter(Boolean).sort()
      // New portfolios start on their first imported trade, so the balance chart covers the whole history
      if (ok.some((r) => r.data.portfolioName === name)) pfIds[name.toLowerCase()] = savePortfolio({ name, currency: opts.currency, initial_balance: 0, start_date: days[0] ?? todayIso() })
    }
    const stIds: Record<string, string> = Object.fromEntries(strategies().map((s) => [s.name.toLowerCase(), s.id]))
    const lk = (kind: 'session' | 'sentiment', name: string) => {
      if (!name) return null
      const f = lookups(kind).find((x) => x.name.toLowerCase() === name.toLowerCase())
      return f?.id ?? saveLookup({ kind, name })
    }
    const tagIds = (names: string[]) =>
      names.map((nm) => tags().find((t) => t.name.toLowerCase() === nm.toLowerCase())?.id ?? saveTag({ name: nm }))
    for (const r of ok) {
      const d = r.data
      let sid: string | null = null
      if (d.strategyName) sid = stIds[d.strategyName.toLowerCase()] ?? (stIds[d.strategyName.toLowerCase()] = saveStrategy({ name: d.strategyName }))
      const { portfolioName, strategyName, sessionName, sentimentName, tagNames, ...rest } = d
      void strategyName
      saveTrade({ ...rest, portfolio_id: pfIds[portfolioName.toLowerCase()], symbol: d.symbol!, strategy_id: sid, session_id: lk('session', sessionName), sentiment_id: lk('sentiment', sentimentName) }, { tags: tagIds(tagNames) })
    }
    return ok.length
  })
}

// ───────── portfolios, cash flows, report
export function portfoliosCsv(metrics: (id: string) => { balance: number; equity: number; realized: number; returnPct: number | null; open: number; closed: number }): string {
  return toCsv([
    ['name', 'currency', 'account_type', 'broker', 'status', 'start_date', 'initial_balance', 'goal', 'balance', 'equity', 'net_pnl', 'return_pct', 'open_trades', 'closed_trades', 'description'],
    ...portfolios().map((p) => {
      const m = metrics(p.id)
      return [p.name, p.currency, p.account_type, p.broker, p.status, p.start_date, n(p.initial_balance), n(p.goal), n(+m.balance.toFixed(2)), n(+m.equity.toFixed(2)), n(+m.realized.toFixed(2)), m.returnPct === null ? '' : +m.returnPct.toFixed(4), m.open, m.closed, p.description]
    })
  ])
}
export function cashFlowsCsv(): string {
  const pm = portfolioMap()
  return toCsv([['portfolio', 'currency', 'date', 'kind', 'amount', 'note'], ...cashFlows().map((f) => [pm[f.portfolio_id]?.name ?? '', pm[f.portfolio_id]?.currency ?? '', f.date, f.kind, n(f.amount), f.note])])
}
export function reportCsv(title: string, s: Summary, groups: [string, GroupRow[]][], currency: string): string {
  const rows: (string | number | null)[][] = [[title], [L('Moeda', 'Currency'), currency], []]
  const kv: [string, number | string | null][] = [
    ['closed_trades', s.closed], ['wins', s.wins], ['losses', s.losses], ['breakeven', s.be], ['win_rate_pct', s.winRate], ['net_pnl', s.net], ['gross_profit', s.grossProfit],
    ['gross_loss', s.grossLoss], ['fees', s.fees], ['avg_win', s.avgWin], ['avg_loss', s.avgLoss], ['largest_win', s.largestWin], ['largest_loss', s.largestLoss],
    ['profit_factor', s.profitFactor === Infinity ? 'inf' : s.profitFactor], ['payoff', s.payoff], ['expectancy', s.expectancy], ['avg_r', s.avgR], ['max_drawdown', s.maxDrawdown], ['max_drawdown_pct', s.maxDrawdownPct]
  ]
  for (const [k, v] of kv) rows.push([k, typeof v === 'number' ? +v.toFixed(4) : v])
  for (const [name, g] of groups) {
    rows.push([], [name], ['group', 'trades', 'wins', 'losses', 'be', 'win_rate_pct', 'net_pnl', 'profit_factor'])
    for (const r of g) rows.push([r.label, r.count, r.wins, r.losses, r.be, r.winRate === null ? '' : +r.winRate.toFixed(2), +r.net.toFixed(2), r.profitFactor === null ? '' : r.profitFactor === Infinity ? 'inf' : +r.profitFactor.toFixed(3)])
  }
  return toCsv(rows)
}
