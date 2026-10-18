import { useState } from 'react'
import { useApp, Empty, Help, PortfolioSelect, Seg, type NavParams } from '../components/ui'
import { I } from '../components/icons'
import { Donut, EquityChart, GroupBars, Histogram, PnlBars, monthName } from '../components/charts'
import { MissingRates, PeriodPicker, usePerformance, useScopeState, weekdayName, hourLabel } from '../components/shared'
import { classLabel } from '../components/AssetPicker'
import { classColor } from '../components/visual'
import { L } from '../lib/i18n'
import { duration, money, num, pct, ratio } from '../lib/format'
import { lookupMap, portfolioMap, strategyMap, tagMap, tradeMistakeIndex, tradeTagIndex } from '../lib/repo'
import { useSettings } from '../lib/settings'
import { groupBy, type GroupRow, type Grouping, type Row } from '../lib/stats'

type Dim = 'symbol' | 'strategy' | 'portfolio' | 'direction' | 'class' | 'session' | 'sentiment' | 'tag' | 'mistake' | 'weekday' | 'hour' | 'month'

export function Analytics() {
  const app = useApp()
  const s = useSettings()
  const sc = useScopeState('analytics', app.params.portfolioId ? { portfolioId: app.params.portfolioId } : undefined)
  const [g, setG] = useState<Grouping>(s.chartGrouping)
  const [dim, setDim] = useState<Dim>('symbol')
  const perf = usePerformance(sc.portfolioId, sc.range, g)
  const S = perf.summary
  const cur = perf.currency
  const closed = perf.period.filter((r) => r.t.status === 'closed' && r.c.net !== null)
  const base: NavParams = { portfolioId: sc.portfolioId || undefined, from: sc.range.from ?? undefined, to: sc.range.to ?? undefined, status: 'closed' }
  const go = (p: NavParams) => app.nav('trades', { ...base, ...p })

  const sm = strategyMap()
  const pm = portfolioMap()
  const lm = lookupMap()
  const tm = tagMap()
  const ti = tradeTagIndex()
  const mi = tradeMistakeIndex()
  const explode = (rows: Row[], keys: (r: Row) => string[]) => rows.flatMap((r) => (keys(r).length ? keys(r) : ['—']).map((k) => ({ ...r, _k: k })))

  const dims: Record<Dim, { label: string; rows: () => GroupRow[]; pick(k: string): void; sortKey?: boolean }> = {
    symbol: { label: L('Ativo', 'Asset'), rows: () => groupBy(closed, (r) => r.t.symbol), pick: (k) => go({ symbol: k }) },
    strategy: { label: L('Estratégia', 'Strategy'), rows: () => groupBy(closed, (r) => r.t.strategy_id, (k) => sm[k]?.name ?? L('Sem estratégia', 'No strategy'), (k) => sm[k]?.color), pick: (k) => k !== '—' && go({ strategyId: k }) },
    portfolio: { label: L('Carteira', 'Portfolio'), rows: () => groupBy(closed, (r) => r.t.portfolio_id, (k) => pm[k]?.name ?? k, (k) => pm[k]?.color), pick: (k) => go({ portfolioId: k }) },
    direction: { label: L('Direção', 'Direction'), rows: () => groupBy(closed, (r) => r.t.direction, (k) => (k === 'long' ? 'Long' : 'Short')), pick: (k) => go({ direction: k as 'long' | 'short' }) },
    class: { label: L('Classe de ativo', 'Asset class'), rows: () => groupBy(closed, (r) => r.t.asset_class, classLabel, classColor), pick: (k) => go({ assetClass: k }) },
    session: { label: L('Sessão', 'Session'), rows: () => groupBy(closed, (r) => r.t.session_id, (k) => lm[k]?.name ?? L('Sem sessão', 'No session'), (k) => lm[k]?.color), pick: (k) => k !== '—' && go({ sessionId: k }) },
    sentiment: { label: L('Sentimento', 'Sentiment'), rows: () => groupBy(closed, (r) => r.t.sentiment_id, (k) => lm[k]?.name ?? L('Sem sentimento', 'No sentiment'), (k) => lm[k]?.color), pick: (k) => k !== '—' && go({ sentimentId: k }) },
    tag: { label: 'Tags', rows: () => groupBy(explode(closed, (r) => ti[r.t.id] ?? []), (r) => (r as Row & { _k: string })._k, (k) => (tm[k] ? '#' + tm[k].name : L('Sem tag', 'No tag')), (k) => tm[k]?.color), pick: (k) => k !== '—' && go({ tagId: k }) },
    mistake: { label: L('Erros', 'Mistakes'), rows: () => groupBy(explode(closed, (r) => mi[r.t.id] ?? []), (r) => (r as Row & { _k: string })._k, (k) => lm[k]?.name ?? L('Sem erro marcado', 'No mistake'), (k) => (lm[k] ? '#ef4444' : undefined)), pick: () => undefined },
    weekday: { label: L('Dia da semana', 'Weekday'), rows: () => groupBy(closed, (r) => { const w = r.t.exit_at ?? r.t.entry_at; return w ? String(new Date(w).getDay()) : null }, (k) => (k === '—' ? '—' : weekdayName(+k))).sort((a, b) => ((+a.key + 6) % 7) - ((+b.key + 6) % 7)), pick: (k) => k !== '—' && go({ weekday: +k }), sortKey: true },
    hour: { label: L('Hora de entrada', 'Entry hour'), rows: () => groupBy(closed, (r) => (r.t.entry_at && r.t.entry_at.length >= 13 ? r.t.entry_at.slice(11, 13) : null), (k) => (k === '—' ? '—' : hourLabel(+k))).sort((a, b) => a.key.localeCompare(b.key)), pick: (k) => k !== '—' && go({ hour: +k }), sortKey: true },
    month: { label: L('Mês', 'Month'), rows: () => groupBy(closed, (r) => (r.t.exit_at ?? r.t.entry_at ?? '').slice(5, 7) || null, (k) => (k === '—' ? '—' : monthName(+k - 1))).sort((a, b) => a.key.localeCompare(b.key)), pick: (k) => k !== '—' && go({ month: k }), sortKey: true }
  }
  const D = dims[dim]
  const grows = D.rows()
  const rVals = closed.map((r) => r.c.rMultiple).filter((x): x is number => x !== null)

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Análises', 'Analytics')}</h2>
          <p>{L('Avalie sua performance por ativo, estratégia, horário e mais', 'Evaluate performance by asset, strategy, time and more')}</p>
        </div>
        <div className="row wrap head-filters">
          <PortfolioSelect value={sc.portfolioId} onChange={sc.setPortfolio} allowAll includeArchived />
          <PeriodPicker preset={sc.preset} custom={sc.custom} onPreset={sc.setPreset} onCustom={sc.setCustom} />
        </div>
      </div>
      <MissingRates list={perf.skipped} />

      {!closed.length ? (
        <div className="card">
          <Empty icon={<I.pl />} title={L('Sem operações fechadas no período', 'No closed trades in this period')} action={<button className="btn primary" onClick={() => app.editTrade(null)}><I.plus /> {L('Registrar operação', 'Record a trade')}</button>}>
            {L('As análises usam apenas operações fechadas.', 'Analytics only use closed trades.')}
          </Empty>
        </div>
      ) : (
        <>
          <div className="stat-band card">
            <St l={L('Taxa de acerto', 'Win rate')} v={pct(S.winRate, 1)} sub={`${L('Erro', 'Loss rate')} ${pct(S.lossRate, 1)}`} onClick={() => go({ outcome: 'win' })} h={L('Vitórias ÷ (vitórias + derrotas); BE fora.', 'Wins ÷ (wins + losses); BE excluded.')} />
            <St l={L('P&L líquido', 'Net P&L')} v={money(S.net, cur, { sign: true })} c={S.net >= 0 ? 'pos' : 'neg'} sub={`${L('Bruto', 'Gross')} ${money(S.grossProfit + S.grossLoss + S.fees, cur, { sign: true })}`} />
            <St l={L('Ganho médio', 'Average win')} v={money(S.avgWin, cur)} c="pos" sub={`${L('Maior', 'Largest')} ${money(S.largestWin, cur)}`} onClick={() => go({ outcome: 'win' })} />
            <St l={L('Perda média', 'Average loss')} v={money(S.avgLoss, cur)} c="neg" sub={`${L('Maior', 'Largest')} ${money(S.largestLoss, cur)}`} onClick={() => go({ outcome: 'loss' })} />
            <St l="Profit factor" v={ratio(S.profitFactor)} sub={`Payoff ${ratio(S.payoff)}`} h={L('Lucro bruto ÷ prejuízo bruto.', 'Gross profit ÷ gross loss.')} />
            <St l={L('Expectativa', 'Expectancy')} v={money(S.expectancy, cur, { sign: true })} sub={S.avgR !== null ? `${num(S.avgR, 2, { sign: true })}R / op` : '—'} h={L('Resultado médio esperado por operação.', 'Average expected result per trade.')} />
            <St l={L('R:R médio', 'Avg R:R')} v={S.avgPlannedRR ? '1:' + ratio(S.avgPlannedRR) : '—'} sub={`${L('Executado', 'Executed')} ${S.avgActualRR !== null ? num(S.avgActualRR, 2, { sign: true }) + 'R' : '—'}`} />
            <St l={L('Drawdown máx.', 'Max drawdown')} v={S.maxDrawdownPct !== null ? pct(-S.maxDrawdownPct, 2) : money(-S.maxDrawdown, cur)} c="neg" sub={money(-S.maxDrawdown, cur)} />
            <St l={L('Sequências', 'Streaks')} v={`${S.bestStreak}W / ${S.worstStreak}L`} sub={L('maior sequência', 'longest run')} />
            <St l={L('Duração média', 'Avg hold time')} v={duration(S.avgHoldMinutes)} sub={`${S.closed} ${L('operações', 'trades')}`} />
          </div>

          <div className="grid g-main mt">
            <div className="card">
              <div className="card-head">
                <h3>{L('P&L acumulado', 'Cumulative P&L')}</h3>
                <select className="select sm" value={g} onChange={(e) => setG(e.target.value as Grouping)}>
                  <option value="day">{L('Diário', 'Daily')}</option>
                  <option value="week">{L('Semanal', 'Weekly')}</option>
                  <option value="month">{L('Mensal', 'Monthly')}</option>
                </select>
              </div>
              <div className="card-body">
                <EquityChart points={perf.series.points} g={g} currency={cur} mode="pnl" height={260} />
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h3>{L('Vitórias vs derrotas', 'Wins vs losses')}</h3>
              </div>
              <div className="card-body col" style={{ alignItems: 'center' }}>
                <Donut
                  data={[
                    { key: 'win', name: 'Win', value: S.wins, color: 'var(--green)' },
                    { key: 'loss', name: 'Loss', value: S.losses, color: 'var(--red)' },
                    { key: 'be', name: 'BE', value: S.be, color: 'var(--text-3)' }
                  ]}
                  size={190}
                  inner={60}
                  center={
                    <>
                      <b>{pct(S.winRate, 0)}</b>
                      <span className="xs muted">{L('acerto', 'win rate')}</span>
                    </>
                  }
                  onPick={(k) => go({ outcome: k as 'win' | 'loss' | 'be' })}
                />
                <div className="legend" style={{ marginTop: 8 }}>
                  <span><i style={{ background: 'var(--green)' }} /> Win {S.wins} · {money(S.grossProfit, cur)}</span>
                  <span><i style={{ background: 'var(--red)' }} /> Loss {S.losses} · {money(S.grossLoss, cur)}</span>
                  <span><i style={{ background: 'var(--text-3)' }} /> BE {S.be}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-head">
                <h3>{L('P&L por período', 'P&L by period')}</h3>
                <span className="xs muted">{L('clique numa barra para ver as operações', 'click a bar to see its trades')}</span>
              </div>
              <div className="card-body">
                <PnlBars points={perf.series.points} g={g} currency={cur} onPick={(k) => app.nav('trades', { portfolioId: sc.portfolioId || undefined, from: k.length === 7 ? k + '-01' : k, to: g === 'day' ? k : g === 'month' ? lastDay(k) : addDays(k, 6) })} />
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h3>{L('Distribuição de R', 'R distribution')}</h3>
                <Help text={L('Quantas operações terminaram em cada faixa de múltiplo de risco. Só operações com risco definido (stop ou risco manual).', 'How many trades ended in each risk-multiple bucket. Only trades with defined risk (stop or manual risk).')} />
              </div>
              <div className="card-body">{rVals.length ? <Histogram values={rVals} /> : <Empty title={L('Sem operações com risco definido', 'No trades with defined risk')}>{L('Informe stop-loss ou risco manual nas operações.', 'Add a stop-loss or manual risk to your trades.')}</Empty>}</div>
            </div>
          </div>

          <div className="card mt">
            <div className="card-head wrap">
              <h3>{L('Performance por', 'Performance by')} {D.label.toLowerCase()}</h3>
              <div className="dim-tabs">
                <Seg
                  value={dim}
                  onChange={setDim}
                  options={(Object.keys(dims) as Dim[]).map((k) => [k, dims[k].label])}
                />
              </div>
            </div>
            <div className="dim-body">
              <div className="dim-chart">{grows.length ? <GroupBars rows={D.sortKey ? grows : grows} currency={cur} onPick={(k) => D.pick(k)} /> : <Empty title={L('Sem dados', 'No data')} />}</div>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>{D.label}</th>
                      <th className="money">{L('Ops', 'Trades')}</th>
                      <th className="money">{L('Acerto', 'Win %')}</th>
                      <th className="money">PF</th>
                      <th className="money">{L('R médio', 'Avg R')}</th>
                      <th className="money">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(D.sortKey ? grows : [...grows].sort((a, b) => b.net - a.net)).map((r) => (
                      <tr key={r.key} className="click" onClick={() => D.pick(r.key)}>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            {r.color && <span className="dot" style={{ background: r.color }} />}
                            {r.label}
                          </span>
                        </td>
                        <td className="money">{r.count}</td>
                        <td className="money">{pct(r.winRate, 0)}</td>
                        <td className="money">{ratio(r.profitFactor)}</td>
                        <td className="money">{r.avgR !== null ? num(r.avgR, 2, { sign: true }) : '—'}</td>
                        <td className={'money bold ' + (r.net >= 0 ? 'pos' : 'neg')}>{money(r.net, cur, { sign: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function St({ l, v, sub, c, onClick, h }: { l: string; v: string; sub?: string; c?: string; onClick?(): void; h?: string }) {
  return (
    <div className={'st' + (onClick ? ' click' : '')} onClick={onClick}>
      <span className="kpi-label">
        {l} {h && <Help text={h} />}
      </span>
      <b className={c}>{v}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const lastDay = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
