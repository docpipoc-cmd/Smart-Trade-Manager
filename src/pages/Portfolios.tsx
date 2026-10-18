import { useState, type CSSProperties } from 'react'
import { useApp, Empty, Help, Money, Seg, DirBadge, Outcome, StatusBadge } from '../components/ui'
import { I } from '../components/icons'
import { AssetLogo, Icon3D, classColor } from '../components/visual'
import { Donut, EquityChart, PnlBars } from '../components/charts'
import { PeriodPicker, usePerformance, useScopeState } from '../components/shared'
import { accountTypeLabel, flowLabel } from '../components/PortfolioModal'
import { classLabel } from '../components/AssetPicker'
import { L } from '../lib/i18n'
import { fdate, fdatetime, money, num, pct, price, ratio } from '../lib/format'
import { cashFlows, deletePortfolio, instrumentMap, portfolio, portfolioMetrics, portfolios, setPortfolioStatus, type PortfolioMetrics } from '../lib/repo'
import { useSettings } from '../lib/settings'
import { signedFlow, type Grouping } from '../lib/stats'
import type { Portfolio } from '../lib/types'

type SortKey = 'name' | 'balance' | 'profit' | 'return'

export function Portfolios() {
  const app = useApp()
  if (app.params.portfolioId && portfolio(app.params.portfolioId)) return <PortfolioDetail id={app.params.portfolioId} />
  return <PortfolioList />
}

function PortfolioList() {
  const app = useApp()
  const [status, setStatus] = useState<'all' | 'active' | 'goal' | 'broken' | 'locked' | 'archived'>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const list = portfolios()
    .map((p) => ({ p, m: portfolioMetrics(p) }))
    .filter(({ p, m }) => (status === 'all' ? m.state !== 'archived' : m.state === status) && (!q || (p.name + ' ' + (p.description ?? '') + ' ' + (p.broker ?? '')).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === 'name' ? a.p.name.localeCompare(b.p.name) : sort === 'balance' ? b.m.equity - a.m.equity : sort === 'profit' ? b.m.realized - a.m.realized : (b.m.returnPct ?? -1e9) - (a.m.returnPct ?? -1e9)))

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Carteiras', 'Portfolios')}</h2>
          <p>{L('Gerencie suas carteiras e contas de trading', 'Manage your trading portfolios and accounts')}</p>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => app.editCashFlow({})}>
            <I.transfer /> {L('Depósito / saque', 'Deposit / withdrawal')}
          </button>
          <button className="btn primary" onClick={() => app.editPortfolio(null)}>
            <I.plus /> {L('Nova carteira', 'New portfolio')}
          </button>
        </div>
      </div>
      <div className="card filters">
        <div className="field">
          <label>{L('Filtrar por status', 'Filter by status')}</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">{L('Todas as carteiras', 'All portfolios')}</option>
            <option value="active">{L('Ativas', 'Active')}</option>
            <option value="goal">{L('Meta atingida', 'Goal reached')}</option>
            <option value="broken">{L('Quebradas', 'Broken')}</option>
            <option value="locked">{L('Bloqueadas', 'Locked')}</option>
            <option value="archived">{L('Arquivadas', 'Archived')}</option>
          </select>
        </div>
        <div className="field grow">
          <label>{L('Buscar', 'Search')}</label>
          <input className="input" placeholder={L('Nome, descrição ou corretora…', 'Name, description or broker…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field">
          <label>{L('Ordenar por', 'Sort by')}</label>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="name">{L('Nome', 'Name')}</option>
            <option value="balance">{L('Patrimônio', 'Equity')}</option>
            <option value="profit">{L('Lucro', 'Profit')}</option>
            <option value="return">{L('Retorno %', 'Return %')}</option>
          </select>
        </div>
      </div>
      {list.length ? (
        <div className="pf-grid">
          {list.map(({ p, m }) => (
            <PortfolioCard key={p.id} p={p} m={m} />
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty
            icon={<I.wallet />}
            title={portfolios().length ? L('Nenhuma carteira com esse filtro', 'No portfolio matches this filter') : L('Nenhuma carteira criada', 'No portfolios yet')}
            action={
              !portfolios().length && (
                <button className="btn primary" onClick={() => app.editPortfolio(null)}>
                  <I.plus /> {L('Criar primeira carteira', 'Create first portfolio')}
                </button>
              )
            }
          >
            {!portfolios().length && L('Crie sua primeira carteira para começar a registrar suas operações', 'Create your first portfolio to start recording trades')}
          </Empty>
        </div>
      )}
    </div>
  )
}

const stateBadge = (s: PortfolioMetrics['state']) =>
  ({
    active: ['blue', L('Ativa', 'Active')],
    goal: ['green', L('Meta atingida', 'Goal reached')],
    broken: ['red', L('Quebrada', 'Broken')],
    locked: ['amber', L('Bloqueada', 'Locked')],
    archived: ['gray', L('Arquivada', 'Archived')]
  })[s]

function PortfolioCard({ p, m }: { p: Portfolio; m: PortfolioMetrics }) {
  const app = useApp()
  const [more, setMore] = useState(false)
  const cur = p.currency
  const [bc, bl] = stateBadge(m.state)
  const del = async () => {
    if (await app.confirm({ title: L('Excluir carteira?', 'Delete portfolio?'), message: L(`"${p.name}" e todas as suas ${m.open + m.closed + m.planned} operações, prints e movimentações serão apagadas. Para manter o histórico, prefira arquivar.`, `"${p.name}" and all of its ${m.open + m.closed + m.planned} trades, screenshots and cash movements will be deleted. To keep the history, archive it instead.`), ok: L('Excluir tudo', 'Delete everything'), danger: true })) {
      await deletePortfolio(p.id)
      app.toast(L('Carteira excluída', 'Portfolio deleted'), 'ok')
    }
  }
  return (
    <div className="card pf-card" style={{ '--pc': p.color } as CSSProperties}>
      <div className="pf-top">
        <button className="pf-name" onClick={() => app.nav('portfolios', { portfolioId: p.id })}>
          <b>{p.name}</b>
          <small>
            {fdate(p.start_date)} · {accountTypeLabel(p.account_type)}
            {p.broker ? ` · ${p.broker}` : ''}
          </small>
        </button>
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" title={p.status === 'locked' ? L('Desbloquear', 'Unlock') : L('Bloquear novas operações', 'Lock new trades')} onClick={() => setPortfolioStatus(p.id, p.status === 'locked' ? 'active' : 'locked')} style={{ color: p.status === 'locked' ? 'var(--amber)' : undefined }}>
            <I.lock />
          </button>
          <button className="icon-btn" title={L('Editar', 'Edit')} onClick={() => app.editPortfolio(p.id)}>
            <I.edit />
          </button>
          <button className="icon-btn red" title={L('Excluir', 'Delete')} onClick={del}>
            <I.trash />
          </button>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={'badge ' + bc}>{bl}</span>
        {m.goalProgress !== null && <span className="badge blue">{pct(m.goalProgress * 100, 1)} {L('da meta', 'of goal')}</span>}
        {m.open > 0 && <span className="badge violet">{m.open} {L('abertas', 'open')}</span>}
      </div>
      <button className="pf-balance" onClick={() => app.nav('portfolios', { portfolioId: p.id })}>
        <span className="xs muted">{L('Saldo líquido (após taxas)', 'Net balance (after fees)')}</span>
        <b className={m.balance >= m.invested ? 'pos' : 'neg'}>{money(m.balance, cur)}</b>
        <dl className="mini-kv">
          <dt>{L('Saldo bruto', 'Gross balance')}</dt>
          <dd>{money(m.balance + m.fees, cur)}</dd>
          <dt>{L('Taxas pagas', 'Fees paid')}</dt>
          <dd className="neg">
            {money(-m.fees, cur)} ({pct(m.gross ? (m.fees / Math.abs(m.gross)) * 100 : 0, 1)})
          </dd>
          {m.unrealized !== 0 && (
            <>
              <dt>{L('Não realizado', 'Unrealized')}</dt>
              <dd>
                <Money v={m.unrealized} currency={cur} sign />
              </dd>
            </>
          )}
        </dl>
      </button>
      <button className="link center" onClick={() => setMore(!more)}>
        {more ? L('Ver menos', 'Show less') : L('Ver mais detalhes', 'More details')} {more ? '▴' : '▾'}
      </button>
      {more && (
        <div className="pf-more">
          <div>
            <span>{L('Saldo inicial', 'Initial balance')}</span>
            <b>{money(m.initial, cur)}</b>
          </div>
          <div>
            <span>{L('Retorno', 'Return')}</span>
            <b className={(m.returnPct ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(m.returnPct, 2, { sign: true })}</b>
          </div>
          <div>
            <span>{L('P&L bruto', 'Gross P&L')}</span>
            <b>
              <Money v={m.gross} currency={cur} sign />
            </b>
          </div>
          <div>
            <span>{L('P&L líquido', 'Net P&L')}</span>
            <b>
              <Money v={m.realized} currency={cur} sign />
            </b>
          </div>
          <div>
            <span>{L('Depósitos', 'Deposits')}</span>
            <b>{money(m.deposits, cur)}</b>
          </div>
          <div>
            <span>{L('Saques', 'Withdrawals')}</span>
            <b>{money(m.withdrawals, cur)}</b>
          </div>
          <div>
            <span>{L('Fechadas / abertas', 'Closed / open')}</span>
            <b>
              {m.closed} / {m.open}
            </b>
          </div>
          <div>
            <span>{L('Última operação', 'Last trade')}</span>
            <b>{fdate(m.lastTrade)}</b>
          </div>
        </div>
      )}
      {p.goal ? (
        <div className="pf-goal">
          <div className="row between xs">
            <span className="muted">{L('Meta', 'Goal')}</span>
            <b style={{ color: 'var(--accent)' }}>{money(p.goal, cur)}</b>
          </div>
          <div className="row between xs">
            <span className="muted">{L('Falta', 'Remaining')}</span>
            <b className={p.goal - m.equity > 0 ? 'warn-txt' : 'pos'}>{p.goal - m.equity > 0 ? money(p.goal - m.equity, cur) : L('Atingida ✓', 'Reached ✓')}</b>
          </div>
          <div className="goal-bar">
            <i style={{ width: (m.goalProgress ?? 0) * 100 + '%' }} />
          </div>
        </div>
      ) : null}
      <div className="pf-actions">
        <button className="btn sm" onClick={() => app.editTrade(null, { portfolio_id: p.id })} disabled={p.status !== 'active'}>
          <I.plus /> {L('Operação', 'Trade')}
        </button>
        <button className="btn sm" onClick={() => app.editCashFlow({ portfolioId: p.id })}>
          <I.transfer /> {L('Caixa', 'Cash')}
        </button>
        <button className="btn sm" onClick={() => app.nav('portfolios', { portfolioId: p.id })}>
          {L('Abrir', 'Open')} <I.chevronRight />
        </button>
      </div>
    </div>
  )
}

function PortfolioDetail({ id }: { id: string }) {
  const app = useApp()
  const s = useSettings()
  const p = portfolio(id)!
  const m = portfolioMetrics(p)
  const sc = useScopeState('pf', { portfolioId: id, preset: 'all' })
  const [g, setG] = useState<Grouping>(s.chartGrouping)
  const [mode, setMode] = useState<'balance' | 'pnl'>('balance')
  const perf = usePerformance(id, sc.range, g)
  const S = perf.summary
  const cur = p.currency
  const flows = cashFlows().filter((f) => f.portfolio_id === id)
  const im = instrumentMap()
  const [bc, bl] = stateBadge(m.state)
  const allocData = m.allocation.map((a) => ({ key: a.key, name: classLabel(a.key), value: a.count, color: classColor(a.key) }))

  return (
    <div>
      <div className="page-head">
        <div>
          <button className="link back" onClick={() => app.nav('portfolios')}>
            <I.chevronLeft width={14} height={14} /> {L('Todas as carteiras', 'All portfolios')}
          </button>
          <h2 className="row" style={{ gap: 10 }}>
            <span className="pf-dot" style={{ background: p.color }} /> {p.name} <span className={'badge ' + bc}>{bl}</span>
          </h2>
          <p>
            {[accountTypeLabel(p.account_type), p.broker, p.currency, `${L('desde', 'since')} ${fdate(p.start_date)}`].filter(Boolean).join(' · ')}
            {p.description ? ` — ${p.description}` : ''}
          </p>
        </div>
        <div className="row wrap">
          <PeriodPicker preset={sc.preset} custom={sc.custom} onPreset={sc.setPreset} onCustom={sc.setCustom} />
          <button className="btn" onClick={() => app.editPortfolio(id)}>
            <I.edit /> {L('Editar', 'Edit')}
          </button>
          <button className="btn" onClick={() => app.editCashFlow({ portfolioId: id })}>
            <I.transfer /> {L('Depósito / saque', 'Deposit / withdrawal')}
          </button>
          <button className="btn primary" onClick={() => app.editTrade(null, { portfolio_id: id })} disabled={p.status !== 'active'}>
            <I.plus /> {L('Nova operação', 'New trade')}
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label={L('Patrimônio', 'Equity')} value={money(m.equity, cur)} sub={m.unrealizedMissing ? L(`${m.unrealizedMissing} aberta(s) sem preço atual`, `${m.unrealizedMissing} open without a current price`) : `${L('Não realizado', 'Unrealized')}: ${money(m.unrealized, cur, { sign: true })}`} />
        <Kpi label={L('Saldo', 'Balance')} value={money(m.balance, cur)} sub={`${L('Inicial', 'Initial')} ${money(m.initial, cur)} · ${L('aportes', 'net deposits')} ${money(m.netFlows, cur, { sign: true })}`} />
        <Kpi label={L('P&L líquido (total)', 'Net P&L (all-time)')} value={<Money v={m.realized} currency={cur} sign />} sub={`${L('Bruto', 'Gross')} ${money(m.gross, cur, { sign: true })} · ${L('taxas', 'fees')} ${money(m.fees, cur)}`} />
        <Kpi label={L('Retorno', 'Return')} value={<span className={(m.returnPct ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(m.returnPct, 2, { sign: true })}</span>} sub={L('sobre o capital aportado', 'on contributed capital')} />
        <Kpi label={L('P&L no período', 'Period P&L')} value={<Money v={S.net} currency={cur} sign />} sub={`${S.closed} ${L('fechadas', 'closed')} · ${pct(S.winRate, 0)} ${L('acerto', 'win rate')}`} onClick={() => app.nav('trades', { portfolioId: id, from: sc.range.from ?? undefined, to: sc.range.to ?? undefined })} />
        <Kpi label="Profit factor" value={ratio(S.profitFactor)} sub={`${L('Expectativa', 'Expectancy')} ${money(S.expectancy, cur)}`} />
        <Kpi label={L('Drawdown máx.', 'Max drawdown')} value={<span className="neg">{pct(S.maxDrawdownPct !== null ? -S.maxDrawdownPct : null, 2)}</span>} sub={money(-S.maxDrawdown, cur)} />
        <Kpi label={L('Operações', 'Trades')} value={`${m.closed}`} sub={`${m.open} ${L('abertas', 'open')} · ${m.planned} ${L('planejadas', 'planned')}`} onClick={() => app.nav('trades', { portfolioId: id })} />
      </div>

      <div className="grid g-main">
        <div className="card">
          <div className="card-head">
            <h3>{mode === 'balance' ? L('Evolução do saldo', 'Balance over time') : L('P&L por período', 'P&L by period')}</h3>
            <div className="row">
              <Seg
                value={mode}
                onChange={setMode}
                options={[
                  ['balance', L('Saldo', 'Balance')],
                  ['pnl', 'P&L']
                ]}
              />
              <select className="select sm" value={g} onChange={(e) => setG(e.target.value as Grouping)}>
                <option value="day">{L('Diário', 'Daily')}</option>
                <option value="week">{L('Semanal', 'Weekly')}</option>
                <option value="month">{L('Mensal', 'Monthly')}</option>
              </select>
            </div>
          </div>
          <div className="card-body">
            {perf.series.points.length ? mode === 'balance' ? <EquityChart points={perf.series.points} g={g} currency={cur} /> : <PnlBars points={perf.series.points} g={g} currency={cur} height={290} /> : <Empty title={L('Sem movimentos no período', 'No activity in this period')} />}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L('Alocação & exposição', 'Allocation & exposure')}</h3>
            <Help text={L('Alocação: nº de operações por classe de ativo. Exposição: valor das posições abertas agora.', 'Allocation: number of trades per asset class. Exposure: value of positions open now.')} />
          </div>
          <div className="card-body col" style={{ alignItems: 'center', gap: 12 }}>
            <Donut data={allocData} center={<><b>{m.closed + m.open}</b><span className="xs muted">{L('operações', 'trades')}</span></>} onPick={(k) => app.nav('trades', { portfolioId: id, assetClass: k })} />
            <div className="legend">
              {allocData.map((a) => (
                <span key={a.key}>
                  <i style={{ background: a.color }} /> {a.name} · {a.value}
                </span>
              ))}
            </div>
            <div style={{ width: '100%' }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>{L('Posições abertas', 'Open positions')}</div>
              {m.exposure.length ? (
                m.exposure.map((e, i) => (
                  <div key={i} className="row between small" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="row">
                      <b>{e.symbol}</b> <DirBadge d={e.side} />
                    </span>
                    <span className="num">{money(e.notional, cur)}</span>
                  </div>
                ))
              ) : (
                <span className="xs muted">{L('Nenhuma posição aberta', 'No open positions')}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-head">
            <h3>{L('Operações recentes', 'Recent trades')}</h3>
            <button className="btn ghost sm" onClick={() => app.nav('trades', { portfolioId: id })}>
              {L('Histórico completo', 'Full history')} <I.chevronRight />
            </button>
          </div>
          {perf.rows.length ? (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="t">
                <tbody>
                  {perf.rows.slice(0, 15).map((r) => (
                    <tr key={r.t.id} className="click" onClick={() => app.viewTrade(r.t.id)}>
                      <td>
                        <div className="row">
                          <AssetLogo symbol={r.t.symbol} logo={r.t.instrument_id ? im[r.t.instrument_id]?.logo : null} cls={r.t.asset_class} size={26} />
                          <b>{r.t.symbol}</b>
                          <DirBadge d={r.t.direction} />
                        </div>
                      </td>
                      <td className="small muted hide-sm">{fdatetime(r.t.exit_at ?? r.t.entry_at)}</td>
                      <td className="num small hide-sm">{price(r.t.entry_price)} → {r.t.status === 'closed' ? price(r.t.exit_price) : '…'}</td>
                      <td className="money">{r.t.status === 'closed' ? <Money v={r.c.net} currency={cur} sign /> : <StatusBadge s={r.t.status} />}</td>
                      <td>
                        <Outcome o={r.c.outcome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title={L('Nenhuma operação nesta carteira', 'No trades in this portfolio')} action={<button className="btn primary" onClick={() => app.editTrade(null, { portfolio_id: id })}><I.plus /> {L('Registrar operação', 'Record a trade')}</button>} />
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L('Depósitos, saques e ajustes', 'Deposits, withdrawals & adjustments')}</h3>
            <button className="btn ghost sm" onClick={() => app.editCashFlow({ portfolioId: id })}>
              <I.plus /> {L('Adicionar', 'Add')}
            </button>
          </div>
          {flows.length ? (
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="t">
                <tbody>
                  <tr className="dim-row">
                    <td>{fdate(p.start_date)}</td>
                    <td>{L('Saldo inicial', 'Initial balance')}</td>
                    <td className="money">{money(p.initial_balance, cur)}</td>
                    <td />
                  </tr>
                  {flows.map((f) => (
                    <tr key={f.id} className="click" onClick={() => app.editCashFlow({ id: f.id })}>
                      <td className="small">{fdate(f.date)}</td>
                      <td>
                        {flowLabel(f.kind)}
                        {f.note && <div className="xs muted">{f.note}</div>}
                      </td>
                      <td className="money">
                        <Money v={signedFlow(f)} currency={cur} sign />
                      </td>
                      <td>
                        <I.edit width={13} height={13} className="muted" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<I.transfer />} title={L('Nenhuma movimentação', 'No cash movements')}>
              {L('Depósitos e saques ficam separados do resultado das operações.', 'Deposits and withdrawals are kept apart from trading results.')}
            </Empty>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h3>{L('Estatísticas do período', 'Statistics for the period')}</h3>
          <button className="btn ghost sm" onClick={() => app.nav('analytics', { portfolioId: id })}>
            {L('Análise completa', 'Full analytics')} <I.chevronRight />
          </button>
        </div>
        <div className="stat-grid">
          <Stat l={L('Taxa de acerto', 'Win rate')} v={pct(S.winRate, 1)} />
          <Stat l={L('Ganho médio', 'Avg win')} v={money(S.avgWin, cur)} c="pos" />
          <Stat l={L('Perda média', 'Avg loss')} v={money(S.avgLoss, cur)} c="neg" />
          <Stat l="Payoff" v={ratio(S.payoff)} />
          <Stat l={L('Maior ganho', 'Largest win')} v={money(S.largestWin, cur)} c="pos" />
          <Stat l={L('Maior perda', 'Largest loss')} v={money(S.largestLoss, cur)} c="neg" />
          <Stat l={L('R médio', 'Avg R')} v={S.avgR !== null ? num(S.avgR, 2, { sign: true }) + 'R' : '—'} />
          <Stat l={L('Sequência de ganhos', 'Win streak')} v={String(S.bestStreak)} />
          <Stat l={L('Sequência de perdas', 'Loss streak')} v={String(S.worstStreak)} />
          <Stat l="Long" v={`${S.long.n} · ${money(S.long.net, cur, { sign: true })}`} />
          <Stat l="Short" v={`${S.short.n} · ${money(S.short.net, cur, { sign: true })}`} />
          <Stat l={L('Taxas no período', 'Fees in period')} v={money(S.fees, cur)} />
        </div>
      </div>
    </div>
  )
}

export function Kpi({ label, value, sub, onClick }: { label: string; value: React.ReactNode; sub?: React.ReactNode; onClick?(): void }) {
  return (
    <div className={'card kpi' + (onClick ? ' click' : '')} onClick={onClick}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
export function Stat({ l, v, c }: { l: string; v: string; c?: string }) {
  return (
    <div className="stat">
      <span>{l}</span>
      <b className={c}>{v}</b>
    </div>
  )
}
export { Icon3D }
