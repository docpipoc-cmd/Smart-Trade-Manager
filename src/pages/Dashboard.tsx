import { useState, type ReactNode } from 'react'
import { useApp, Delta, Empty, Help, Money, Seg, PortfolioSelect, DirBadge, Outcome, StatusBadge } from '../components/ui'
import { I } from '../components/icons'
import { AssetLogo, Icon3D } from '../components/visual'
import { EquityChart } from '../components/charts'
import { MissingRates, PeriodPicker, PnlCalendar, usePerformance, useScopeState, hourLabel } from '../components/shared'
import { L } from '../lib/i18n'
import { fdatetime, money, num, pct, price, ratio, todayIso } from '../lib/format'
import { instrumentMap, lookupMap, portfolioMetrics, portfolios, strategyMap, tradeNotes } from '../lib/repo'
import { useSettings, type WidgetId } from '../lib/settings'
import { groupBy, type Grouping, type Summary } from '../lib/stats'

export function Dashboard() {
  const app = useApp()
  const s = useSettings()
  const sc = useScopeState('dash')
  const [grouping, setGrouping] = useState<Grouping>(s.chartGrouping)
  const [chartMode, setChartMode] = useState<'balance' | 'pnl'>('balance')
  const [balView, setBalView] = useState<'total' | 'period'>('total')
  const [calMonth, setCalMonth] = useState(todayIso().slice(0, 7))
  const perf = usePerformance(sc.portfolioId, sc.range, grouping)
  const { summary: S, prevSummary: P, currency: cur } = perf
  const pfs = portfolios().filter((p) => p.status !== 'archived')
  const pid = sc.portfolioId || undefined
  const toTrades = (extra: Record<string, unknown> = {}) => app.nav('trades', { portfolioId: pid, from: sc.range.from ?? undefined, to: sc.range.to ?? undefined, ...extra })

  const head = (
    <div className="page-head">
      <div>
        <h2>Dashboard</h2>
        <p>{L('Visão geral da sua performance', 'Overview of your performance')}</p>
      </div>
      <div className="row wrap head-filters">
        <PortfolioSelect value={sc.portfolioId} onChange={sc.setPortfolio} allowAll includeArchived />
        <PeriodPicker preset={sc.preset} custom={sc.custom} onPreset={sc.setPreset} onCustom={sc.setCustom} />
      </div>
    </div>
  )

  if (!pfs.length)
    return (
      <div>
        {head}
        <div className="card onboard">
          <Icon3D icon="wallet" size="xl" sec="business" />
          <h3>{L('Crie sua primeira carteira!', 'Create your first portfolio!')}</h3>
          <p className="muted">{L('Para começar, crie uma carteira e registre suas primeiras operações. Todos os números do Dashboard vêm dos seus registros.', 'To get started, create a portfolio and record your first trades. Every number on the Dashboard comes from your records.')}</p>
          <button className="btn primary" onClick={() => app.editPortfolio(null)}>
            <I.wallet /> {L('Criar primeira carteira', 'Create first portfolio')}
          </button>
        </div>
      </div>
    )

  const metrics = pfs.map((p) => portfolioMetrics(p))
  const openCount = metrics.filter((m) => m.state === 'active').length
  const goalCount = metrics.filter((m) => m.state === 'goal').length
  const brokenCount = metrics.filter((m) => m.state === 'broken').length
  const periodNet = S.net
  const periodFlows = perf.periodFlows.reduce((t, f) => t + (f.kind === 'withdrawal' || f.kind === 'fee' ? -Math.abs(f.amount) : f.kind === 'adjustment' ? f.amount : Math.abs(f.amount)), 0)
  const lk = lookupMap()
  const closedP = perf.period.filter((r) => r.t.status === 'closed' && r.c.net !== null)

  // reminders
  const openNoStop = perf.rows.filter((r) => r.t.status === 'open' && r.t.stop_loss === null && r.t.risk_amount === null)
  const stale = perf.rows.filter((r) => r.t.status === 'open' && r.t.entry_at && (Date.now() - Date.parse(r.t.entry_at)) / 86400000 > s.staleOpenDays)
  const noNotes = closedP.filter((r) => !r.t.notes && !tradeNotes(r.t.id).length)

  const W: Record<WidgetId, () => ReactNode> = {
    kpis: () => (
      <div className="kpi-grid" key="kpis">
        <Tile icon="wallet" label={L('Patrimônio', 'Equity')} value={money(perf.equity, cur)} sub={perf.summary.unrealizedMissing ? L(`${perf.summary.unrealizedMissing} aberta(s) sem preço`, `${perf.summary.unrealizedMissing} open without price`) : `${L('Não realizado', 'Unrealized')} ${money(S.unrealized, cur, { sign: true })}`} onClick={() => app.nav('portfolios', pid ? { portfolioId: pid } : {})} help={L('Saldo (inicial + depósitos − saques + resultados fechados) mais o resultado não realizado das operações abertas com preço atual.', 'Balance (initial + deposits − withdrawals + closed results) plus unrealized P&L of open trades that have a current price.')} />
        <Tile icon="chartUp" label={L('P&L líquido no período', 'Net P&L (period)')} value={<span className={periodNet > 0 ? 'pos' : periodNet < 0 ? 'neg' : ''}>{money(periodNet, cur, { sign: true })}</span>} sub={<Delta cur={periodNet} prev={P?.net ?? null} />} onClick={() => toTrades({ status: 'closed' })} help={L('Soma dos resultados líquidos (após taxas) das operações fechadas no período.', 'Sum of net results (after fees) of trades closed in the period.')} />
        <Tile icon="percent" label={L('Retorno', 'Return')} value={pct(sc.range.from ? (perf.series.startBalance > 0 ? (periodNet / perf.series.startBalance) * 100 : null) : perf.invested > 0 ? (periodNet / perf.invested) * 100 : null, 2, { sign: true })} sub={`${L('Total', 'Total')}: ${pct(perf.invested > 0 ? (perf.realized / perf.invested) * 100 : null, 2, { sign: true })}`} onClick={() => app.nav('analytics', { portfolioId: pid })} help={L('Período: P&L líquido ÷ saldo no início do período. Total: resultado acumulado ÷ capital aportado (inicial + depósitos − saques).', 'Period: net P&L ÷ balance at the start of the period. Total: all-time result ÷ capital contributed (initial + deposits − withdrawals).')} />
        <Tile icon="candles" label={L('Operações', 'Trades')} value={num(S.closed, 0)} sub={<><span className="pos">{S.wins}W</span> · <span className="neg">{S.losses}L</span> · {S.be} BE · {S.open} {L('abertas', 'open')}</>} onClick={() => toTrades()} />
        <Tile icon="target" label={L('Taxa de acerto', 'Win rate')} value={pct(S.winRate, 1)} sub={<Delta cur={S.winRate} prev={P?.winRate ?? null} abs />} onClick={() => toTrades({ outcome: 'win', status: 'closed' })} help={L('Vitórias ÷ (vitórias + derrotas). Operações breakeven ficam de fora.', 'Wins ÷ (wins + losses). Break-even trades are excluded.')} />
        <Tile icon="scale" label="Profit factor" value={ratio(S.profitFactor)} sub={`${L('Payoff', 'Payoff')} ${ratio(S.payoff)}`} onClick={() => app.nav('analytics', { portfolioId: pid })} help={L('Lucro bruto das vitórias ÷ prejuízo bruto das derrotas. Payoff = ganho médio ÷ perda média.', 'Gross profit of winners ÷ gross loss of losers. Payoff = average win ÷ average loss.')} />
        <Tile icon="sparkles" label={L('Expectativa', 'Expectancy')} value={<Money v={S.expectancy} currency={cur} sign />} sub={S.avgR !== null ? `${num(S.avgR, 2, { sign: true })}R ${L('por operação', 'per trade')}` : L('por operação', 'per trade')} help={L('Resultado médio por operação fechada (e em múltiplos de R quando há risco definido).', 'Average result per closed trade (and in R multiples when risk is defined).')} />
        <Tile icon="arrowDown" label={L('Drawdown máximo', 'Max drawdown')} value={<span className={S.maxDrawdown ? 'neg' : ''}>{S.maxDrawdownPct !== null ? pct(-S.maxDrawdownPct, 2) : money(-S.maxDrawdown, cur)}</span>} sub={money(-S.maxDrawdown, cur)} help={L('Maior queda do resultado acumulado a partir de um topo, no período (em % do saldo no topo).', 'Largest fall of the cumulative result from a peak, in the period (as % of the balance at that peak).')} />
      </div>
    ),
    portfolios: () => (
      <div className="grid g3 dash-trio" key="portfolios">
        <div className="card wcard">
          <div className="wcard-head">
            <span>{L('Carteiras', 'Portfolios')}</span>
            <Help text={L('Abertas: ativas. Metas: atingiram a meta. Quebradas: patrimônio zerado ou negativo.', 'Open: active. Goals: reached their goal. Broken: equity at or below zero.')} />
            <I.wallet className="wcard-ico" />
          </div>
          <div className="triple">
            <div>
              <span>{L('Ativas', 'Active')}</span>
              <b style={{ color: 'var(--accent)' }}>{openCount}</b>
            </div>
            <div>
              <span>{L('Metas', 'Goals')}</span>
              <b className="pos">{goalCount}</b>
            </div>
            <div>
              <span>{L('Quebradas', 'Broken')}</span>
              <b className="neg">{brokenCount}</b>
            </div>
          </div>
          <div className="wcard-actions">
            <button className="btn ghost sm" onClick={() => app.nav('portfolios')}>
              {L('Listar todas', 'List all')}
            </button>
            <button className="btn ghost sm" onClick={() => app.editPortfolio(null)}>
              {L('Criar nova', 'Create new')}
            </button>
          </div>
        </div>
        <div className="card wcard balance-card">
          <div className="wcard-head">
            <Seg
              value={balView}
              onChange={setBalView}
              options={[
                ['total', L('Saldo total', 'Total balance')],
                ['period', L('Saldo do período', 'Period')]
              ]}
            />
            <I.cash className="wcard-ico pos" />
          </div>
          {balView === 'total' ? (
            <>
              <span className="xs muted">{L('Saldo líquido (após taxas)', 'Net balance (after fees)')}</span>
              <div className={'big-money ' + (perf.balance >= perf.initial ? 'pos' : 'neg')}>{money(perf.balance, cur)}</div>
              <dl className="mini-kv">
                <dt>{L('Saldo bruto', 'Gross balance')}</dt>
                <dd>{money(perf.balance + perf.fees, cur)}</dd>
                <dt>{L('Taxas pagas', 'Fees paid')}</dt>
                <dd className="neg">{money(-perf.fees, cur)}</dd>
                <dt>{L('Inicial + aportes', 'Initial + deposits')}</dt>
                <dd>{money(perf.initial + perf.netFlows, cur)}</dd>
                <dt>{L('Resultado', 'Result')}</dt>
                <dd className={perf.realized >= 0 ? 'pos' : 'neg'}>
                  {money(perf.realized, cur, { sign: true })} ({pct(perf.invested > 0 ? (perf.realized / perf.invested) * 100 : null, 2, { sign: true })})
                </dd>
              </dl>
            </>
          ) : (
            <>
              <span className="xs muted">{L('Resultado líquido do período', 'Net result for the period')}</span>
              <div className={'big-money ' + (periodNet >= 0 ? 'pos' : 'neg')}>{money(periodNet, cur, { sign: true })}</div>
              <dl className="mini-kv">
                <dt>{L('Saldo no início', 'Opening balance')}</dt>
                <dd>{money(perf.series.startBalance, cur)}</dd>
                <dt>{L('Lucro bruto', 'Gross profit')}</dt>
                <dd className="pos">{money(S.grossProfit, cur)}</dd>
                <dt>{L('Perdas', 'Losses')}</dt>
                <dd className="neg">{money(S.grossLoss, cur)}</dd>
                <dt>{L('Taxas', 'Fees')}</dt>
                <dd className="neg">{money(-S.fees, cur)}</dd>
                <dt>{L('Depósitos/saques', 'Deposits/withdrawals')}</dt>
                <dd>{money(periodFlows, cur, { sign: true })}</dd>
              </dl>
            </>
          )}
        </div>
        <div className="card wcard">
          <div className="wcard-head">
            <span>{L('Total de operações', 'Total trades')}</span>
            <I.chartUp className="wcard-ico" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="triple four">
            <div>
              <span>Total</span>
              <b style={{ color: 'var(--accent)' }}>{S.closed}</b>
            </div>
            <div>
              <span>Win</span>
              <b className="pos">{S.wins}</b>
            </div>
            <div>
              <span>Loss</span>
              <b className="neg">{S.losses}</b>
            </div>
            <div>
              <span>BE</span>
              <b>{S.be}</b>
            </div>
          </div>
          <div className="wcard-actions">
            <button className="btn ghost sm" onClick={() => toTrades()}>
              {L('Ver todas', 'See all')}
            </button>
            <button className="btn ghost sm" onClick={() => app.editTrade(null, pid ? { portfolio_id: pid } : undefined)}>
              {L('Registrar nova', 'Record new')}
            </button>
          </div>
        </div>
      </div>
    ),
    quality: () => (
      <div className="grid g3 dash-trio" key="quality">
        <Compare title={L('Taxa de acerto', 'Win rate')} help={L('Comparada com o período anterior de mesma duração.', 'Compared with the previous period of the same length.')} cur={S.winRate} prev={P?.winRate ?? null} fmt={(v) => pct(v, 1)} color="var(--accent)" max={100} icon="target" />
        <Compare title={L('Relação lucro/perda', 'Win/loss ratio')} help={L('Ganho médio ÷ perda média (payoff).', 'Average win ÷ average loss (payoff).')} cur={S.payoff} prev={P?.payoff ?? null} fmt={(v) => ratio(v)} color="var(--amber)" max={Math.max(3, S.payoff ?? 0, P?.payoff ?? 0)} icon="trophy" />
        <Compare title={L('Drawdown máximo', 'Max drawdown')} help={L('Maior queda a partir de um topo, em % do saldo.', 'Largest fall from a peak, as % of balance.')} cur={S.maxDrawdownPct} prev={P?.maxDrawdownPct ?? null} fmt={(v) => pct(v, 2)} color="var(--red)" max={Math.max(10, S.maxDrawdownPct ?? 0, P?.maxDrawdownPct ?? 0)} invert icon="arrowDown" />
      </div>
    ),
    avgWinLoss: () => (
      <div className="card wcard" key="avgWinLoss">
        <div className="wcard-head">
          <span>{L('Ganho / perda média', 'Average win / loss')}</span>
          <Help text={L('Média das operações vencedoras e perdedoras no período, com maior ganho e maior perda.', 'Average of winning and losing trades in the period, with largest win and loss.')} />
        </div>
        <div className="wl-pair">
          <button className="wl win" onClick={() => toTrades({ outcome: 'win', status: 'closed' })}>
            <span>{L('Ganho médio', 'Average win')}</span>
            <b>{money(S.avgWin, cur)}</b>
            <small>
              {S.wins} ops · {L('maior', 'largest')} {money(S.largestWin, cur)}
            </small>
          </button>
          <button className="wl loss" onClick={() => toTrades({ outcome: 'loss', status: 'closed' })}>
            <span>{L('Perda média', 'Average loss')}</span>
            <b>{money(S.avgLoss, cur)}</b>
            <small>
              {S.losses} ops · {L('maior', 'largest')} {money(S.largestLoss, cur)}
            </small>
          </button>
        </div>
      </div>
    ),
    rr: () => (
      <div className="card wcard" key="rr">
        <div className="wcard-head">
          <span>{L('Risco/retorno médio (R:R)', 'Average risk/reward (R:R)')}</span>
          <Help text={L('Planejado: alvo ÷ risco definido na entrada. Executado: resultado ÷ risco (múltiplo de R) das operações fechadas.', 'Planned: target ÷ risk at entry. Executed: result ÷ risk (R multiple) of closed trades.')} />
        </div>
        <dl className="rr-list">
          <dt>{L('Planejado', 'Planned')}</dt>
          <dd>{S.avgPlannedRR !== null ? '1:' + ratio(S.avgPlannedRR) : '—'}</dd>
          <dt>{L('Executado', 'Executed')}</dt>
          <dd>{S.avgActualRR !== null ? num(S.avgActualRR, 2, { sign: true }) + 'R' : '—'}</dd>
          <dt>{L('Diferença', 'Difference')}</dt>
          <dd className={S.avgActualRR !== null && S.avgPlannedRR !== null ? (S.avgActualRR - S.avgPlannedRR >= 0 ? 'pos' : 'neg') : ''}>{S.avgActualRR !== null && S.avgPlannedRR !== null ? num(S.avgActualRR - S.avgPlannedRR, 2, { sign: true }) : '—'}</dd>
        </dl>
      </div>
    ),
    discipline: () => {
      const tot = S.followed + S.broke
      return (
        <div className="card wcard" key="discipline">
          <div className="wcard-head">
            <span>{L('Disciplina do plano', 'Plan discipline')}</span>
            <Help text={L('Do campo "Seguiu o plano?" das operações do período.', 'From the "Followed the plan?" field of trades in the period.')} />
          </div>
          <div className="wl-pair">
            <div className="wl win">
              <span>{L('Aderência', 'Followed')}</span>
              <b>{pct(tot ? (S.followed / tot) * 100 : null, 1)}</b>
              <small>{S.followed} ops</small>
            </div>
            <div className="wl loss">
              <span>{L('Fora do plano', 'Off plan')}</span>
              <b>{pct(tot ? (S.broke / tot) * 100 : null, 1)}</b>
              <small>{S.broke} ops</small>
            </div>
          </div>
          {!tot && <p className="xs muted" style={{ marginTop: 8 }}>{L('Marque "Seguiu o plano?" na aba Diário das operações.', 'Set "Followed the plan?" in the Journal tab of your trades.')}</p>}
        </div>
      )
    },
    sessions: () => <GroupWidget key="sessions" title={L('Sessões de mercado', 'Market sessions')} icon="globe" rows={groupBy(closedP, (r) => r.t.session_id, (k) => lk[k]?.name ?? L('Sem sessão', 'No session'), (k) => lk[k]?.color)} cur={cur} empty={L('Registre operações com sessão de mercado para ver estatísticas', 'Record trades with a market session to see statistics')} onPick={(k) => toTrades({ sessionId: k === '—' ? undefined : k, status: 'closed' })} />,
    sentiment: () => <GroupWidget key="sentiment" title={L('Sentimento', 'Sentiment')} icon="brain" rows={groupBy(closedP, (r) => r.t.sentiment_id, (k) => lk[k]?.name ?? L('Sem sentimento', 'No sentiment'), (k) => lk[k]?.color)} cur={cur} empty={L('Registre operações com sentimento para ver estatísticas', 'Record trades with a sentiment to see statistics')} onPick={(k) => toTrades({ sentimentId: k === '—' ? undefined : k, status: 'closed' })} />,
    hours: () => {
      const byH = (field: 'entry_at' | 'exit_at') => groupBy(closedP, (r) => (r.t[field] && r.t[field]!.length >= 13 ? r.t[field]!.slice(11, 13) : null)).filter((g) => g.key !== '—' && g.count >= 2)
      const best = (l: ReturnType<typeof byH>) => [...l].sort((a, b) => b.net - a.net)[0]
      const be = best(byH('entry_at'))
      const bx = best(byH('exit_at'))
      return (
        <div className="card wcard" key="hours">
          <div className="wcard-head">
            <span>{L('Análise de horários', 'Time-of-day analysis')}</span>
            <Help text={L('Hora com o melhor resultado líquido (mínimo 2 operações).', 'Hour with the best net result (minimum 2 trades).')} />
            <I.clock className="wcard-ico" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="wl-pair">
            <button className="wl neutral" disabled={!be} onClick={() => be && toTrades({ hour: +be.key, status: 'closed' })}>
              <span>{L('Melhor hora de entrada', 'Best entry hour')}</span>
              <b>{be ? hourLabel(+be.key) : '—'}</b>
              <small>{be ? `${money(be.net, cur, { sign: true })} · ${be.count} ops` : L('Sem dados (mín. 2 ops)', 'No data (min. 2 trades)')}</small>
            </button>
            <div className="wl neutral">
              <span>{L('Melhor hora de saída', 'Best exit hour')}</span>
              <b>{bx ? hourLabel(+bx.key) : '—'}</b>
              <small>{bx ? `${money(bx.net, cur, { sign: true })} · ${bx.count} ops` : L('Sem dados (mín. 2 ops)', 'No data (min. 2 trades)')}</small>
            </div>
          </div>
        </div>
      )
    },
    equity: () => (
      <div className="card" key="equity">
        <div className="card-head">
          <h3>{chartMode === 'balance' ? L('Evolução do saldo', 'Balance over time') : L('P&L acumulado', 'Cumulative P&L')}</h3>
          <div className="row wrap">
            <Seg
              value={chartMode}
              onChange={setChartMode}
              options={[
                ['balance', L('Saldo', 'Balance')],
                ['pnl', 'P&L']
              ]}
            />
            <select className="select sm" value={grouping} onChange={(e) => setGrouping(e.target.value as Grouping)} aria-label={L('Agrupar', 'Group by')}>
              <option value="day">{L('Diário', 'Daily')}</option>
              <option value="week">{L('Semanal', 'Weekly')}</option>
              <option value="month">{L('Mensal', 'Monthly')}</option>
            </select>
          </div>
        </div>
        <div className="card-body">
          {perf.series.points.length ? <EquityChart points={perf.series.points} g={grouping} currency={cur} mode={chartMode} /> : <Empty icon={<I.chartUp />} title={L('Sem movimentos no período', 'No activity in this period')}>{L('Registre operações ou escolha outro período.', 'Record trades or pick another period.')}</Empty>}
        </div>
      </div>
    ),
    calendar: () => (
      <div className="card" key="calendar">
        <div className="card-head">
          <h3>{L('Calendário de resultados', 'P&L calendar')}</h3>
          <button className="btn ghost sm" onClick={() => app.nav('trades', { portfolioId: pid, tab: 'calendar' })}>
            {L('Abrir em Operações', 'Open in Trades')} <I.chevronRight />
          </button>
        </div>
        <div className="card-body">
          <PnlCalendar rows={perf.rows} currency={cur} month={calMonth} onMonth={setCalMonth} onDay={(d) => app.nav('trades', { portfolioId: pid, from: d, to: d })} />
        </div>
      </div>
    ),
    recent: () => {
      const recent = perf.rows.slice(0, 8)
      const im = instrumentMap()
      const sm = strategyMap()
      return (
        <div className="card" key="recent">
          <div className="card-head">
            <h3>{L('Operações recentes', 'Recent trades')}</h3>
            <button className="btn ghost sm" onClick={() => toTrades()}>
              {L('Ver todas', 'See all')} <I.chevronRight />
            </button>
          </div>
          {recent.length ? (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>{L('Ativo', 'Asset')}</th>
                    <th>{L('Entrada', 'Entry')}</th>
                    <th>{L('Saída', 'Exit')}</th>
                    <th className="hide-sm">{L('Data', 'Date')}</th>
                    <th className="money">{L('Resultado', 'Result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.t.id} className="click" onClick={() => app.viewTrade(r.t.id)}>
                      <td>
                        <div className="row">
                          <AssetLogo symbol={r.t.symbol} logo={r.t.instrument_id ? im[r.t.instrument_id]?.logo : null} cls={r.t.asset_class} size={28} />
                          <div className="col" style={{ gap: 1 }}>
                            <span className="row" style={{ gap: 6 }}>
                              <b>{r.t.symbol}</b> <DirBadge d={r.t.direction} />
                            </span>
                            <span className="xs muted">{r.t.strategy_id ? sm[r.t.strategy_id]?.name : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td className="num">{price(r.t.entry_price)}</td>
                      <td className="num">{r.t.status === 'closed' ? (r.t.exit_price !== null ? price(r.t.exit_price) : L('manual', 'manual')) : <StatusBadge s={r.t.status} />}</td>
                      <td className="hide-sm small muted">{fdatetime(r.t.exit_at ?? r.t.entry_at)}</td>
                      <td className="money">
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <Money v={r.t.status === 'open' ? r.c.unrealized : r.c.net !== null ? r.c.net * r.conv : null} currency={cur} sign />
                          <Outcome o={r.c.outcome} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={L('Nenhuma operação registrada', 'No trades recorded')} action={<button className="btn primary" onClick={() => app.editTrade(null)}><I.plus /> {L('Registrar primeira operação', 'Record your first trade')}</button>} />
          )}
        </div>
      )
    }
  }

  // Layout: small widgets in a 3-column flow, wide ones full width, following the order chosen in Settings
  const order = s.widgetOrder.filter((w) => s.widgets[w])
  const small: WidgetId[] = ['avgWinLoss', 'rr', 'discipline', 'sessions', 'sentiment', 'hours']
  const blocks: ReactNode[] = []
  let buf: WidgetId[] = []
  const flush = () => {
    if (buf.length) blocks.push(<div className="grid g3 dash-trio" key={'g' + blocks.length}>{buf.map((w) => W[w]())}</div>)
    buf = []
  }
  for (const w of order) {
    if (small.includes(w)) buf.push(w)
    else (flush(), blocks.push(W[w]()))
  }
  flush()

  return (
    <div>
      {head}
      <MissingRates list={perf.skipped} />
      {(s.remindNoStop || s.remindJournal) && (openNoStop.length > 0 || stale.length > 0 || (s.remindJournal && noNotes.length > 0)) && (
        <div className="reminders">
          {s.remindNoStop && openNoStop.length > 0 && (
            <button className="pill-alert red" onClick={() => toTrades({ status: 'open' })}>
              <I.shield width={14} height={14} /> {L(`${openNoStop.length} operação(ões) aberta(s) sem stop`, `${openNoStop.length} open trade(s) without a stop`)}
            </button>
          )}
          {stale.length > 0 && (
            <button className="pill-alert amber" onClick={() => toTrades({ status: 'open' })}>
              <I.clock width={14} height={14} /> {L(`${stale.length} aberta(s) há mais de ${s.staleOpenDays} dias`, `${stale.length} open for over ${s.staleOpenDays} days`)}
            </button>
          )}
          {s.remindJournal && noNotes.length > 0 && (
            <button className="pill-alert amber" onClick={() => app.nav('tools', { tab: 'journal' })}>
              <I.note width={14} height={14} /> {L(`${noNotes.length} operação(ões) fechada(s) sem anotações no período`, `${noNotes.length} closed trade(s) without notes in this period`)}
            </button>
          )}
        </div>
      )}
      <div className="dash-stack">{blocks}</div>
    </div>
  )
}

function Tile({ icon, label, value, sub, onClick, help }: { icon: Parameters<typeof Icon3D>[0]['icon']; label: string; value: ReactNode; sub?: ReactNode; onClick?(): void; help?: string }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="tile kpi-tile" onClick={onClick}>
      <Icon3D icon={icon} size={38} />
      <span className="tile-l">
        {label} {help && <Help text={help} />}
      </span>
      <b className="tile-v">{value}</b>
      {sub && <span className="tile-sub">{sub}</span>}
    </Tag>
  )
}

function Compare({ title, help, cur, prev, fmt, color, max, invert, icon }: { title: string; help: string; cur: number | null; prev: number | null; fmt(v: number | null): string; color: string; max: number; invert?: boolean; icon: 'target' | 'trophy' | 'arrowDown' }) {
  const G = I[icon]
  const w = (v: number | null) => (v === null ? 0 : Math.max(0, Math.min(100, (Math.abs(v) / (max || 1)) * 100)))
  return (
    <div className="card wcard">
      <div className="wcard-head">
        <span>{title}</span>
        <Help text={help} />
        <G className="wcard-ico" style={{ color }} />
      </div>
      <div className="big-money" style={{ color }}>
        {fmt(cur)}
      </div>
      <div className="row between xs muted">
        <span>{L('vs período anterior', 'vs previous period')}</span>
        <Delta cur={cur} prev={prev} invert={invert} abs={title.includes('%') || icon !== 'trophy'} />
      </div>
      <div className="cmp-bar">
        <i style={{ width: w(cur) + '%', background: color }} />
      </div>
      <div className="row between xs muted">
        <span>
          {L('Anterior', 'Previous')}: {fmt(prev)}
        </span>
        <span>
          {L('Atual', 'Current')}: {fmt(cur)}
        </span>
      </div>
    </div>
  )
}

function GroupWidget({ title, icon, rows, cur, empty, onPick }: { title: string; icon: 'globe' | 'brain'; rows: ReturnType<typeof groupBy>; cur: string; empty: string; onPick(k: string): void }) {
  const G = I[icon]
  const list = rows.filter((r) => r.key !== '—').sort((a, b) => b.net - a.net)
  return (
    <div className="card wcard">
      <div className="wcard-head">
        <span>{title}</span>
        <G className="wcard-ico" style={{ color: 'var(--accent)' }} />
      </div>
      {list.length ? (
        <div className="grp-list">
          {list.slice(0, 5).map((r) => (
            <button key={r.key} className="grp-row" onClick={() => onPick(r.key)}>
              <span className="dot" style={{ background: r.color ?? 'var(--accent)' }} />
              <span className="grow ellipsis">{r.label}</span>
              <span className="xs muted">
                {r.count} · {pct(r.winRate, 0)}
              </span>
              <b className={r.net >= 0 ? 'pos' : 'neg'}>{money(r.net, cur, { sign: true })}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="mini-empty">
          <G />
          <b>{L('Sem operações registradas', 'No trades recorded')}</b>
          <span>{empty}</span>
        </div>
      )}
    </div>
  )
}

export type { Summary }
