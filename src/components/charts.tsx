import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fdate, money, moneyShort, num, pct } from '../lib/format'
import { L } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { animOn } from './visual'
import type { GroupRow, Grouping, SeriesPoint } from '../lib/stats'

const anim = (begin: number, duration = 900) => ({ isAnimationActive: animOn(), animationBegin: begin, animationDuration: duration, animationEasing: 'ease-out' as const })
const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthName = (m: number) => L(MONTHS_PT[m], MONTHS_EN[m])
export function bucketLabel(k: string, g: Grouping, short = false): string {
  if (g === 'month') return `${monthName(+k.slice(5, 7) - 1)}${short ? '' : ' ' + k.slice(0, 4)}`
  if (short) return `${k.slice(8, 10)}/${k.slice(5, 7)}`
  return (g === 'week' ? L('Semana de ', 'Week of ') : '') + fdate(k)
}

interface TipRow {
  name?: string
  value?: number
  color?: string
  dataKey?: string
  payload?: Record<string, unknown>
}
function Tip({ active, payload, label, fmtLabel, currency, extra }: { active?: boolean; payload?: TipRow[]; label?: string; fmtLabel?: (l: string) => string; currency?: string; extra?: (p: Record<string, unknown>) => string | null }) {
  if (!active || !payload?.length) return null
  const p0 = payload[0].payload ?? {}
  return (
    <div className="chart-tip">
      {label !== undefined && <div className="bold" style={{ marginBottom: 4 }}>{fmtLabel ? fmtLabel(String(label)) : label}</div>}
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: p.color }} />
          <span>{p.name}</span>
          <b className="num" style={{ marginLeft: 'auto', paddingLeft: 12 }}>
            {money(p.value ?? 0, currency)}
          </b>
        </div>
      ))}
      {extra && extra(p0) && <div className="xs muted" style={{ marginTop: 4 }}>{extra(p0)}</div>}
    </div>
  )
}

/** Balance / equity line and cumulative P&L area over time. */
export function EquityChart({ points, g, currency, height = 290, mode = 'balance' }: { points: SeriesPoint[]; g: Grouping; currency: string; height?: number; mode?: 'balance' | 'pnl' }) {
  const s = useSettings()
  const curve = s.chartCurve
  const d = points.map((p) => ({ ...p, label: p.key }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={d} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--sb)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--sb)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--green)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--green)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {s.chartGrid && <CartesianGrid vertical={false} />}
        <XAxis dataKey="label" tickFormatter={(k: string) => bucketLabel(k, g, true)} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v: number) => moneyShort(v, currency)} tickLine={false} axisLine={false} width={70} domain={['auto', 'auto']} />
        <Tooltip content={<Tip fmtLabel={(k) => bucketLabel(k, g)} currency={currency} extra={(p) => (p.trades ? `${p.trades} ${L('operações', 'trades')}` : null)} />} />
        {mode === 'balance' ? (
          <>
            <Area dataKey="balance" name={L('Saldo', 'Balance')} stroke="var(--sb)" strokeWidth={2.4} fill="url(#eqFill)" type={curve} {...anim(0, 1100)} />
            {s.chartShowEquity && d.some((p) => p.equity !== p.balance) && <Line dataKey="equity" name={L('Patrimônio (com abertas)', 'Equity (incl. open)')} stroke="var(--sa)" strokeDasharray="4 4" strokeWidth={1.6} dot={false} type={curve} {...anim(300, 1100)} />}
          </>
        ) : (
          <>
            <ReferenceLine y={0} stroke="var(--border-strong)" />
            <Area dataKey="cumPnl" name={L('P&L acumulado', 'Cumulative P&L')} stroke="var(--green)" strokeWidth={2.4} fill="url(#pnlFill)" type={curve} {...anim(0, 1100)} />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/** P&L per day/week/month, green up / red down. */
export function PnlBars({ points, g, currency, height = 240, onPick }: { points: SeriesPoint[]; g: Grouping; currency: string; height?: number; onPick?(k: string): void }) {
  const s = useSettings()
  const d = points.filter((p) => p.trades).map((p) => ({ label: p.key, pnl: p.pnl, trades: p.trades }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={d} margin={{ top: 10, right: 8, left: 4, bottom: 0 }} onClick={(e) => e?.activeLabel && onPick?.(String(e.activeLabel))}>
        {s.chartGrid && <CartesianGrid vertical={false} />}
        <XAxis dataKey="label" tickFormatter={(k: string) => bucketLabel(k, g, true)} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickFormatter={(v: number) => moneyShort(v, currency)} tickLine={false} axisLine={false} width={66} />
        <ReferenceLine y={0} stroke="var(--border-strong)" />
        <Tooltip content={<Tip fmtLabel={(k) => bucketLabel(k, g)} currency={currency} extra={(p) => `${p.trades} ${L('operações', 'trades')}`} />} cursor={{ fill: 'var(--surface-3)' }} />
        <Bar dataKey="pnl" name="P&L" radius={[5, 5, 5, 5]} maxBarSize={30} style={{ cursor: onPick ? 'pointer' : undefined }} {...anim(0)}>
          {d.map((x) => (
            <Cell key={x.label} fill={x.pnl >= 0 ? 'var(--green)' : 'var(--red)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Horizontal bars of net result per group (asset, strategy…). Click a bar to open its trades. */
export function GroupBars({ rows, currency, onPick, height }: { rows: GroupRow[]; currency: string; onPick?(key: string): void; height?: number }) {
  const d = [...rows].sort((a, b) => b.net - a.net).slice(0, 14)
  const h = height ?? Math.max(140, d.length * 34 + 20)
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={d} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} onClick={(e) => e?.activePayload?.[0] && onPick?.(String((e.activePayload[0].payload as GroupRow).key))}>
        <XAxis type="number" tickFormatter={(v: number) => moneyShort(v, currency)} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 11.5 }} />
        <ReferenceLine x={0} stroke="var(--border-strong)" />
        <Tooltip
          cursor={{ fill: 'var(--surface-3)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const r = payload[0].payload as GroupRow
            return (
              <div className="chart-tip">
                <div className="bold">{r.label}</div>
                <div>{money(r.net, currency, { sign: true })}</div>
                <div className="xs muted">
                  {r.count} {L('operações', 'trades')} · {L('acerto', 'win rate')} {pct(r.winRate, 0)} · PF {r.profitFactor === Infinity ? '∞' : num(r.profitFactor, 2)}
                </div>
              </div>
            )
          }}
        />
        <Bar dataKey="net" radius={[4, 4, 4, 4]} maxBarSize={20} style={{ cursor: onPick ? 'pointer' : undefined }} {...anim(0)}>
          {d.map((x) => (
            <Cell key={x.key} fill={x.net >= 0 ? 'var(--green)' : 'var(--red)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data, size = 170, inner = 52, center, onPick }: { data: { key: string; name: string; value: number; color: string }[]; size?: number; inner?: number; center?: React.ReactNode; onPick?(k: string): void }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={total ? data : [{ key: 'none', name: '', value: 1, color: 'var(--surface-3)' }]} dataKey="value" nameKey="name" innerRadius={inner} outerRadius={size / 2 - 4} paddingAngle={total && data.length > 1 ? 2 : 0} stroke="none" {...anim(0, 900)} onClick={(d) => onPick?.((d as unknown as { key: string }).key)}>
            {(total ? data : [{ key: 'none', color: 'var(--surface-3)' }]).map((d) => (
              <Cell key={d.key} fill={d.color} style={{ cursor: onPick ? 'pointer' : undefined }} />
            ))}
          </Pie>
          {total > 0 && <Tooltip formatter={(v: number, n: string) => [`${num(v, 0)} (${pct((v / total) * 100, 0)})`, n]} />}
        </PieChart>
      </ResponsiveContainer>
      {center && <div className="donut-center">{center}</div>}
    </div>
  )
}

/** Histogram of R multiples (or results) of closed trades. */
export function Histogram({ values, height = 220, unit = 'R' }: { values: number[]; height?: number; unit?: string }) {
  if (!values.length) return null
  const lo = Math.floor(Math.min(...values, -1))
  const hi = Math.ceil(Math.max(...values, 1))
  const step = hi - lo > 12 ? Math.ceil((hi - lo) / 12) : 1
  const bins: { label: string; from: number; n: number }[] = []
  for (let x = lo; x < hi; x += step) bins.push({ label: `${x}${unit}`, from: x, n: values.filter((v) => v >= x && v < x + step).length })
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bins} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v: number) => [v, L('operações', 'trades')]} cursor={{ fill: 'var(--surface-3)' }} />
        <Bar dataKey="n" radius={[4, 4, 0, 0]} {...anim(0)}>
          {bins.map((b) => (
            <Cell key={b.label} fill={b.from >= 0 ? 'var(--green)' : 'var(--red)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
