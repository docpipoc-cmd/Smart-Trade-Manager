import { useMemo, useState } from 'react'
import { L } from '../lib/i18n'
import { convFactor, portfolioMetrics, portfolios, rows as getRows, cashFlows } from '../lib/repo'
import { settings } from '../lib/settings'
import { balanceSeries, inRange, periodRange, previousRange, summarize, tradeDay, type Grouping, type PeriodPreset, type Range, type Row } from '../lib/stats'
import { fdate, money, num } from '../lib/format'
import { monthName } from './charts'
import { I } from './icons'

export const PERIODS: [PeriodPreset, () => string][] = [
  ['today', () => L('Hoje', 'Today')],
  ['7d', () => L('Últimos 7 dias', 'Last 7 days')],
  ['30d', () => L('Últimos 30 dias', 'Last 30 days')],
  ['month', () => L('Este mês', 'This month')],
  ['lastMonth', () => L('Mês passado', 'Last month')],
  ['quarter', () => L('Este trimestre', 'This quarter')],
  ['year', () => L('Este ano', 'This year')],
  ['all', () => L('Todo o período', 'All time')],
  ['custom', () => L('Personalizado…', 'Custom…')]
]

const readLS = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const writeLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/** Portfolio + period selection, remembered per screen. */
export function useScopeState(key: string, init?: { portfolioId?: string; preset?: PeriodPreset; range?: Range }) {
  const saved = readLS<{ portfolioId: string; preset: PeriodPreset; custom: Range }>('scope_' + key, { portfolioId: '', preset: settings().defaultPeriod, custom: { from: null, to: null } })
  const [portfolioId, setPid] = useState(init?.portfolioId ?? (portfolios().some((p) => p.id === saved.portfolioId) ? saved.portfolioId : ''))
  const [preset, setPreset] = useState<PeriodPreset>(init?.preset ?? saved.preset)
  const [custom, setCustom] = useState<Range>(init?.range ?? saved.custom)
  const persist = (o: Partial<{ portfolioId: string; preset: PeriodPreset; custom: Range }>) => writeLS('scope_' + key, { portfolioId, preset, custom, ...o })
  return {
    portfolioId,
    preset,
    custom,
    range: periodRange(preset, custom),
    setPortfolio: (v: string) => (setPid(v), persist({ portfolioId: v })),
    setPreset: (v: PeriodPreset) => (setPreset(v), persist({ preset: v })),
    setCustom: (v: Range) => (setCustom(v), persist({ custom: v }))
  }
}

export function PeriodPicker({ preset, custom, onPreset, onCustom }: { preset: PeriodPreset; custom: Range; onPreset(p: PeriodPreset): void; onCustom(r: Range): void }) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <select className="select" value={preset} onChange={(e) => onPreset(e.target.value as PeriodPreset)} aria-label={L('Período', 'Period')}>
        {PERIODS.map(([k, l]) => (
          <option key={k} value={k}>
            {l()}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input className="input" type="date" value={custom.from ?? ''} onChange={(e) => onCustom({ ...custom, from: e.target.value || null })} aria-label={L('De', 'From')} />
          <span className="muted">→</span>
          <input className="input" type="date" value={custom.to ?? ''} onChange={(e) => onCustom({ ...custom, to: e.target.value || null })} aria-label={L('Até', 'To')} />
        </>
      )}
    </div>
  )
}

/** Everything the Dashboard / Analytics / reports need for one portfolio selection and period. */
export function usePerformance(portfolioId: string, range: Range, grouping: Grouping) {
  const all = getRows({ portfolioIds: portfolioId ? [portfolioId] : null })
  return useMemo(() => {
    const cur = all.currency
    const pfs = portfolios().filter((p) => (portfolioId ? p.id === portfolioId : p.status !== 'archived'))
    const convOf = (pid: string) => convFactor(portfolios().find((p) => p.id === pid)?.currency ?? cur, cur) ?? 0
    const okIds = new Set(pfs.filter((p) => convFactor(p.currency, cur) !== null).map((p) => p.id))
    const rowsAll = all.rows.filter((r) => okIds.has(r.t.portfolio_id))
    const period = rowsAll.filter((r) => r.t.status === 'open' || inRange(tradeDay(r.t), range))
    const prevR = previousRange(range)
    const prev = prevR ? rowsAll.filter((r) => r.t.status === 'closed' && inRange(tradeDay(r.t), prevR)) : null
    const flows = cashFlows().filter((f) => okIds.has(f.portfolio_id))
    const series = balanceSeries(pfs.filter((p) => okIds.has(p.id)), flows, rowsAll, convOf, range, grouping)
    const prevSeries = prevR ? balanceSeries(pfs.filter((p) => okIds.has(p.id)), flows, rowsAll, convOf, prevR, grouping) : null
    let equity = 0
    let balance = 0
    let initial = 0
    let fees = 0
    let netFlows = 0
    let realized = 0
    let invested = 0
    for (const p of pfs) {
      if (!okIds.has(p.id)) continue
      const m = portfolioMetrics(p)
      const k = convOf(p.id)
      equity += m.equity * k
      balance += m.balance * k
      initial += m.initial * k
      fees += m.fees * k
      netFlows += m.netFlows * k
      realized += m.realized * k
      invested += m.invested * k
    }
    // Capital the period starts with: balance at the period start, or the initial balances for "all time"
    const startCapital = range.from ? series.startBalance : initial
    const summary = summarize(period, startCapital)
    const prevSummary = prev ? summarize(prev, prevSeries?.startBalance ?? 0) : null
    const periodFlows = flows.filter((f) => inRange(f.date, range))
    return {
      startCapital, currency: cur, skipped: all.skipped, rows: rowsAll, period, prev, summary, prevSummary, series, pfs, equity, balance, initial, fees, netFlows, realized, invested, periodFlows, prevRange: prevR }
  }, [all, portfolioId, range.from, range.to, grouping])
}

export function MissingRates({ list }: { list: string[] }) {
  if (!list.length) return null
  return (
    <div className="alert amber" style={{ marginBottom: 14 }}>
      <I.warn width={16} height={16} />
      <span>
        {L(`Carteiras em ${list.join(', ')} não entram no total: informe a cotação em Configurações › Moeda.`, `Portfolios in ${list.join(', ')} are left out of totals: add the exchange rate in Settings › Currency.`)}
      </span>
    </div>
  )
}

/** Month calendar with the net result of each day. Click a day to open its trades. */
export function PnlCalendar({ rows, currency, month, onMonth, onDay }: { rows: Row[]; currency: string; month: string; onMonth(m: string): void; onDay(day: string): void }) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const byDay = new Map<string, { net: number; n: number; w: number; l: number }>()
  for (const r of rows) {
    if (r.t.status !== 'closed' || r.c.net === null) continue
    const d = tradeDay(r.t)
    if (!d.startsWith(month)) continue
    const x = byDay.get(d) ?? { net: 0, n: 0, w: 0, l: 0 }
    x.net += r.c.net * r.conv
    x.n++
    if (r.c.outcome === 'win') x.w++
    if (r.c.outcome === 'loss') x.l++
    byDay.set(d, x)
  }
  const max = Math.max(1, ...[...byDay.values()].map((x) => Math.abs(x.net)))
  const total = [...byDay.values()].reduce((s, x) => s + x.net, 0)
  const tradesN = [...byDay.values()].reduce((s, x) => s + x.n, 0)
  const shift = (k: number) => {
    const d = new Date(y, m - 1 + k, 1)
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const wd = L('Seg Ter Qua Qui Sex Sáb Dom', 'Mon Tue Wed Thu Fri Sat Sun').split(' ')
  const today = new Date().toISOString().slice(0, 10)
  // weekly totals
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return (
    <div className="pcal">
      <div className="pcal-head">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label={L('Mês anterior', 'Previous month')}>
          <I.chevronLeft />
        </button>
        <b>
          {monthName(m - 1)} {y}
        </b>
        <button className="icon-btn" onClick={() => shift(1)} aria-label={L('Próximo mês', 'Next month')}>
          <I.chevronRight />
        </button>
        <span className="grow" />
        <span className="small muted">
          {tradesN} {L('operações', 'trades')} ·{' '}
        </span>
        <b className={total >= 0 ? 'pos' : 'neg'}>{money(total, currency, { sign: true })}</b>
      </div>
      <div className="pcal-grid">
        {wd.map((d) => (
          <div key={d} className="pcal-wd">
            {d}
          </div>
        ))}
        <div className="pcal-wd">{L('Semana', 'Week')}</div>
        {weeks.map((w, wi) => {
          const wk = w.reduce((s, d) => s + (d ? byDay.get(d)?.net ?? 0 : 0), 0)
          const wn = w.reduce((s, d) => s + (d ? byDay.get(d)?.n ?? 0 : 0), 0)
          return [
            ...w.map((d, i) => {
              if (!d) return <div key={wi + '-' + i} className="pcal-day empty" />
              const x = byDay.get(d)
              const a = x ? Math.min(1, Math.abs(x.net) / max) : 0
              return (
                <button
                  key={d}
                  className={'pcal-day' + (x ? (x.net >= 0 ? ' win' : ' loss') : '') + (d === today ? ' today' : '')}
                  style={x ? ({ '--a': 0.12 + a * 0.45 } as React.CSSProperties) : undefined}
                  onClick={() => x && onDay(d)}
                  disabled={!x}
                  title={x ? `${fdate(d)} · ${x.n} ${L('operações', 'trades')} · ${money(x.net, currency, { sign: true })}` : fdate(d)}
                >
                  <span className="pcal-n">{+d.slice(8)}</span>
                  {x && (
                    <>
                      <span className="pcal-v">{money(x.net, currency, { sign: true, decimals: Math.abs(x.net) >= 1000 ? 0 : undefined })}</span>
                      <span className="pcal-c">
                        {x.n} op · {x.w}W {x.l}L
                      </span>
                    </>
                  )}
                </button>
              )
            }),
            <div key={'w' + wi} className={'pcal-week' + (wn ? (wk >= 0 ? ' win' : ' loss') : '')}>
              {wn ? (
                <>
                  <span className="pcal-v">{money(wk, currency, { sign: true, decimals: Math.abs(wk) >= 1000 ? 0 : undefined })}</span>
                  <span className="pcal-c">
                    {wn} op
                  </span>
                </>
              ) : (
                <span className="muted xs">—</span>
              )}
            </div>
          ]
        })}
      </div>
    </div>
  )
}

export const weekdayName = (d: number) => L('Domingo Segunda Terça Quarta Quinta Sexta Sábado', 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday').split(' ')[d]
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}h`
export { num }
