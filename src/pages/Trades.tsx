import { useMemo, useState } from 'react'
import { useApp, Empty, Money, PortfolioSelect, DirBadge, Outcome, StatusBadge, type NavParams } from '../components/ui'
import { I } from '../components/icons'
import { AssetLogo } from '../components/visual'
import { MissingRates, PeriodPicker, PnlCalendar, useScopeState, weekdayName, hourLabel } from '../components/shared'
import { ASSET_CLASSES, classLabel } from '../components/AssetPicker'
import { monthName } from '../components/charts'
import { L } from '../lib/i18n'
import { fdate, fdatetime, ftime, money, num, pct, price, todayIso } from '../lib/format'
import { deleteTrade, duplicateTrade, instrumentMap, lookupMap, lookups, portfolioMap, rows as getRows, strategies, strategyMap, tagMap, tags, tradeImages, tradeTagIndex } from '../lib/repo'
import { useSettings } from '../lib/settings'
import { inRange, summarize, tradeDay, type Row } from '../lib/stats'
import { download, tradesCsv } from '../lib/csv'

type SortKey = 'date_desc' | 'date_asc' | 'pnl_desc' | 'pnl_asc' | 'r_desc' | 'symbol'
type Show = 'all' | 'win' | 'loss' | 'be' | 'open' | 'planned' | 'closed' | 'cancelled' | 'profit' | 'losing'

export function Trades() {
  const app = useApp()
  const s = useSettings()
  const prm = app.params
  const drill = !!(prm.from || prm.to)
  const sc = useScopeState('trades', { portfolioId: prm.portfolioId, ...(drill ? { preset: 'custom' as const, range: { from: prm.from ?? null, to: prm.to ?? null } } : prm.portfolioId || prm.status || prm.symbol ? { preset: 'all' as const } : {}) })
  const [view, setView] = useState<'list' | 'calendar'>(prm.tab === 'calendar' ? 'calendar' : 'list')
  const [symbol, setSymbol] = useState(prm.symbol ?? '')
  const [show, setShow] = useState<Show>(prm.outcome ?? (prm.status as Show | undefined) ?? 'all')
  const [sort, setSort] = useState<SortKey>('date_desc')
  const [adv, setAdv] = useState(!!(prm.strategyId || prm.direction || prm.assetClass || prm.sessionId || prm.sentimentId || prm.tagId))
  const [strategyId, setStrategyId] = useState(prm.strategyId ?? '')
  const [direction, setDirection] = useState(prm.direction ?? '')
  const [assetClass, setAssetClass] = useState(prm.assetClass ?? '')
  const [sessionId, setSessionId] = useState(prm.sessionId ?? '')
  const [sentimentId, setSentimentId] = useState(prm.sentimentId ?? '')
  const [tagId, setTagId] = useState(prm.tagId ?? '')
  const [drillChips, setDrillChips] = useState<Pick<NavParams, 'weekday' | 'hour' | 'month'>>({ weekday: prm.weekday, hour: prm.hour, month: prm.month })
  const [page, setPage] = useState(0)
  const [calMonth, setCalMonth] = useState((prm.from ?? todayIso()).slice(0, 7))

  const data = getRows({ portfolioIds: sc.portfolioId ? [sc.portfolioId] : null })
  const cur = data.currency
  const pm = portfolioMap()
  const im = instrumentMap()
  const sm = strategyMap()
  const lm = lookupMap()
  const tm = tagMap()
  const ti = tradeTagIndex()

  const filtered = useMemo(() => {
    const q = symbol.trim().toUpperCase()
    let l = data.rows.filter((r) => {
      const t = r.t
      if (view === 'list' && !inRange(tradeDay(t), sc.range)) return false
      if (q && !t.symbol.includes(q) && !(t.asset_name ?? '').toUpperCase().includes(q)) return false
      if (show === 'win' || show === 'loss' || show === 'be') {
        if (r.c.outcome !== show) return false
      } else if (show === 'profit') {
        if (!(r.c.net !== null && r.c.net > 0)) return false
      } else if (show === 'losing') {
        if (!(r.c.net !== null && r.c.net < 0)) return false
      } else if (show !== 'all' && t.status !== show) return false
      if (strategyId && t.strategy_id !== strategyId) return false
      if (direction && t.direction !== direction) return false
      if (assetClass && t.asset_class !== assetClass) return false
      if (sessionId && t.session_id !== sessionId) return false
      if (sentimentId && t.sentiment_id !== sentimentId) return false
      if (tagId && !(ti[t.id] ?? []).includes(tagId)) return false
      const when = t.status === 'closed' ? t.exit_at ?? t.entry_at : t.entry_at
      if (drillChips.weekday !== undefined && (!when || new Date(when).getDay() !== drillChips.weekday)) return false
      if (drillChips.hour !== undefined && (!t.entry_at || +t.entry_at.slice(11, 13) !== drillChips.hour)) return false
      if (drillChips.month !== undefined && tradeDay(t).slice(5, 7) !== drillChips.month) return false
      return true
    })
    const val = (r: Row) => (r.c.net ?? r.c.unrealized ?? 0) * r.conv
    const d = (r: Row) => r.t.exit_at ?? r.t.entry_at ?? r.t.created_at
    l = [...l].sort((a, b) =>
      sort === 'date_desc' ? (d(a) < d(b) ? 1 : -1) : sort === 'date_asc' ? (d(a) > d(b) ? 1 : -1) : sort === 'pnl_desc' ? val(b) - val(a) : sort === 'pnl_asc' ? val(a) - val(b) : sort === 'r_desc' ? (b.c.rMultiple ?? -1e9) - (a.c.rMultiple ?? -1e9) : a.t.symbol.localeCompare(b.t.symbol)
    )
    return l
  }, [data, symbol, show, sort, strategyId, direction, assetClass, sessionId, sentimentId, tagId, drillChips, sc.range.from, sc.range.to, view])

  const S = summarize(filtered)
  // Gross (before fees) totals of winning and losing trades, as in the reference cards
  const grossOf = (o: 'win' | 'loss') => filtered.filter((r) => r.t.status === 'closed' && r.c.outcome === o).reduce((t, r) => t + (r.c.gross ?? 0) * r.conv, 0)
  const grossWins = grossOf('win')
  const grossLosses = grossOf('loss')
  const per = s.pageSize
  const pages = Math.max(1, Math.ceil(filtered.length / per))
  const pg = Math.min(page, pages - 1)
  const visible = filtered.slice(pg * per, pg * per + per)
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => (fn(v), setPage(0))

  const menu = (e: React.MouseEvent, r: Row) =>
    app.openMenu(e, [
      { label: L('Ver detalhes', 'View details'), icon: <I.eye />, onClick: () => app.viewTrade(r.t.id) },
      { label: L('Editar', 'Edit'), icon: <I.edit />, onClick: () => app.editTrade(r.t.id) },
      ...(r.t.status === 'open' ? [{ label: L('Fechar operação', 'Close trade'), icon: <I.ok />, onClick: () => app.editTrade(r.t.id, { status: 'closed' }) }] : []),
      {
        label: L('Duplicar', 'Duplicate'),
        icon: <I.copy />,
        onClick: () => {
          const nid = duplicateTrade(r.t.id)
          if (nid) (app.toast(L('Cópia criada como planejada', 'Copy created as planned'), 'ok'), app.editTrade(nid))
        }
      },
      { sep: true, label: '' },
      { label: L('Excluir', 'Delete'), icon: <I.trash />, danger: true, onClick: () => del(r) }
    ])
  const del = async (r: Row) => {
    if (await app.confirm({ title: L('Excluir operação?', 'Delete trade?'), message: `${r.t.symbol} · ${fdatetime(r.t.entry_at)} · ${money(r.c.net, pm[r.t.portfolio_id]?.currency)}`, ok: L('Excluir', 'Delete'), danger: true })) {
      await deleteTrade(r.t.id)
      app.toast(L('Operação excluída · Ctrl+Z desfaz', 'Trade deleted · Ctrl+Z to undo'), 'ok')
    }
  }
  const chips: { label: string; clear(): void }[] = []
  if (drillChips.weekday !== undefined) chips.push({ label: weekdayName(drillChips.weekday), clear: () => setDrillChips((c) => ({ ...c, weekday: undefined })) })
  if (drillChips.hour !== undefined) chips.push({ label: L('Entrada às ', 'Entry at ') + hourLabel(drillChips.hour), clear: () => setDrillChips((c) => ({ ...c, hour: undefined })) })
  if (drillChips.month !== undefined) chips.push({ label: monthName(+drillChips.month - 1), clear: () => setDrillChips((c) => ({ ...c, month: undefined })) })

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Operações', 'Trades')}</h2>
          <p>{L('Seu diário de trading: registre, revise e analise cada operação', 'Your trading journal: record, review and analyze every trade')}</p>
        </div>
        <div className="row wrap">
          <div className="seg">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
              <I.list width={14} height={14} /> {L('Lista', 'List')}
            </button>
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>
              <I.calendar width={14} height={14} /> {L('Calendário', 'Calendar')}
            </button>
          </div>
          <button className="btn" onClick={() => download(`trades-${todayIso()}.csv`, tradesCsv(filtered.map((r) => r.t))).then((f) => f && app.toast(L('CSV exportado', 'CSV exported'), 'ok'))} disabled={!filtered.length}>
            <I.download /> CSV
          </button>
          <button className="btn primary" onClick={() => app.editTrade(null, sc.portfolioId ? { portfolio_id: sc.portfolioId } : undefined)}>
            <I.plus /> {L('Nova operação', 'New trade')}
          </button>
        </div>
      </div>

      <MissingRates list={data.skipped} />
      <div className="card filters">
        <div className="field">
          <label>{L('Carteira', 'Portfolio')}</label>
          <PortfolioSelect value={sc.portfolioId} onChange={resetPage(sc.setPortfolio)} allowAll includeArchived />
        </div>
        <div className="field">
          <label>{L('Ativo', 'Asset')}</label>
          <input className="input" placeholder={L('Filtrar por ativo…', 'Filter by asset…')} value={symbol} onChange={(e) => (setSymbol(e.target.value), setPage(0))} />
        </div>
        <div className="field">
          <label>{L('Filtrar por', 'Show')}</label>
          <select className="select" value={show} onChange={(e) => (setShow(e.target.value as Show), setPage(0))}>
            <option value="all">{L('Todas', 'All')}</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="be">Breakeven</option>
            <option value="profit">{L('Lucrativas (> 0)', 'Profitable (> 0)')}</option>
            <option value="losing">{L('Com prejuízo (< 0)', 'Losing (< 0)')}</option>
            <option value="closed">{L('Fechadas', 'Closed')}</option>
            <option value="open">{L('Abertas', 'Open')}</option>
            <option value="planned">{L('Planejadas', 'Planned')}</option>
            <option value="cancelled">{L('Canceladas', 'Cancelled')}</option>
          </select>
        </div>
        {view === 'list' && (
          <div className="field">
            <label>{L('Período', 'Period')}</label>
            <PeriodPicker preset={sc.preset} custom={sc.custom} onPreset={resetPage(sc.setPreset)} onCustom={resetPage(sc.setCustom)} />
          </div>
        )}
        <div className="field">
          <label>{L('Ordenar por', 'Sort by')}</label>
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="date_desc">{L('Data (mais recente)', 'Date (newest)')}</option>
            <option value="date_asc">{L('Data (mais antiga)', 'Date (oldest)')}</option>
            <option value="pnl_desc">{L('Maior lucro', 'Highest profit')}</option>
            <option value="pnl_asc">{L('Maior prejuízo', 'Largest loss')}</option>
            <option value="r_desc">{L('Maior R', 'Highest R')}</option>
            <option value="symbol">{L('Ativo (A–Z)', 'Asset (A–Z)')}</option>
          </select>
        </div>
        <button className={'btn ghost adv-btn' + (adv ? ' on' : '')} onClick={() => setAdv(!adv)}>
          <I.filter /> {L('Mais filtros', 'More filters')}
        </button>
        {adv && (
          <div className="adv-filters">
            <select className="select" value={strategyId} onChange={(e) => (setStrategyId(e.target.value), setPage(0))} aria-label={L('Estratégia', 'Strategy')}>
              <option value="">{L('Todas as estratégias', 'All strategies')}</option>
              {strategies().map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select className="select" value={direction} onChange={(e) => (setDirection(e.target.value as 'long' | 'short' | ''), setPage(0))} aria-label={L('Direção', 'Direction')}>
              <option value="">Long + Short</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <select className="select" value={assetClass} onChange={(e) => (setAssetClass(e.target.value), setPage(0))} aria-label={L('Classe', 'Class')}>
              <option value="">{L('Todas as classes', 'All classes')}</option>
              {ASSET_CLASSES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l()}
                </option>
              ))}
            </select>
            <select className="select" value={sessionId} onChange={(e) => (setSessionId(e.target.value), setPage(0))} aria-label={L('Sessão', 'Session')}>
              <option value="">{L('Todas as sessões', 'All sessions')}</option>
              {lookups('session').map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select className="select" value={sentimentId} onChange={(e) => (setSentimentId(e.target.value), setPage(0))} aria-label={L('Sentimento', 'Sentiment')}>
              <option value="">{L('Todos os sentimentos', 'All sentiments')}</option>
              {lookups('sentiment').map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select className="select" value={tagId} onChange={(e) => (setTagId(e.target.value), setPage(0))} aria-label="Tag">
              <option value="">{L('Todas as tags', 'All tags')}</option>
              {tags().map((x) => (
                <option key={x.id} value={x.id}>
                  #{x.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {chips.length > 0 && (
          <div className="adv-filters">
            {chips.map((c) => (
              <button key={c.label} className="chip on" onClick={c.clear}>
                {c.label} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid g4 sum-cards">
        <div className="card kpi">
          <div className="kpi-label row between">
            {L('Operações', 'Trades')} <I.chartUp width={15} height={15} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="kpi-value">{filtered.length}</div>
          <div className="side-split">
            <div className="ss long">
              <b>Long ({S.long.n})</b>
              <span>
                Win: {S.long.wins} · Loss: <span className="neg">{S.long.losses}</span> · BE: {S.long.be}
              </span>
            </div>
            <div className="ss short">
              <b>Short ({S.short.n})</b>
              <span>
                Win: {S.short.wins} · Loss: <span className="neg">{S.short.losses}</span> · BE: {S.short.be}
              </span>
            </div>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label row between">
            {L('Total lucros (bruto)', 'Total profits (gross)')} <I.arrowUp width={15} height={15} className="pos" />
          </div>
          <div className="kpi-value pos">{money(grossWins, cur, { sign: true })}</div>
          <div className="kpi-sub">
            {L('Líquido', 'Net')}: <Money v={S.net} currency={cur} sign /> · {S.wins} {L('vitórias', 'wins')}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label row between">
            {L('Total perdas (bruto)', 'Total losses (gross)')} <I.arrowDown width={15} height={15} className="neg" />
          </div>
          <div className="kpi-value neg">{money(grossLosses, cur)}</div>
          <div className="kpi-sub">
            {S.losses} {L('derrotas', 'losses')} · {L('acerto', 'win rate')} {pct(S.winRate, 1)}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label row between">
            {L('Taxas pagas', 'Fees paid')} <I.cash width={15} height={15} style={{ color: 'var(--amber)' }} />
          </div>
          <div className="kpi-value" style={{ color: 'var(--amber)' }}>
            {money(S.fees, cur)}
          </div>
          <div className="kpi-sub">
            {S.open} {L('abertas', 'open')} · {S.planned} {L('planejadas', 'planned')}
          </div>
        </div>
      </div>

      {view === 'calendar' ? (
        <div className="card mt">
          <div className="card-body">
            <PnlCalendar rows={filtered} currency={cur} month={calMonth} onMonth={setCalMonth} onDay={(d) => app.nav('trades', { portfolioId: sc.portfolioId || undefined, from: d, to: d })} />
          </div>
        </div>
      ) : (
        <div className="card mt">
          <div className="card-head">
            <h3>
              {L('Histórico de operações', 'Trade history')} ({filtered.length})
            </h3>
            {filtered.length > per && (
              <div className="pager">
                <button className="icon-btn" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label={L('Anterior', 'Previous')}>
                  <I.chevronLeft />
                </button>
                <span className="small">
                  {pg + 1} / {pages}
                </span>
                <button className="icon-btn" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label={L('Próxima', 'Next')}>
                  <I.chevronRight />
                </button>
              </div>
            )}
          </div>
          {visible.length ? (
            <div className="table-wrap">
              <table className="t trades-t">
                <thead>
                  <tr>
                    <th>{L('Ativo', 'Asset')}</th>
                    <th className="hide-md">{L('Carteira', 'Portfolio')}</th>
                    <th>{L('Entrada', 'Entry')}</th>
                    <th className="hide-sm">{L('Saída', 'Exit')}</th>
                    <th className="money hide-md">{L('Qtd.', 'Size')}</th>
                    <th className="money">P&L</th>
                    <th className="money hide-sm">{L('Retorno', 'Return')}</th>
                    <th className="money hide-md">R</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const t = r.t
                    const p = pm[t.portfolio_id]
                    const imgs = tradeImages(t.id)
                    const tg = (ti[t.id] ?? []).map((x) => tm[x]).filter(Boolean)
                    const v = t.status === 'open' ? r.c.unrealized : r.c.net
                    return (
                      <tr key={t.id} className={'click st-' + t.status} onClick={() => app.viewTrade(t.id)} onContextMenu={(e) => menu(e, r)}>
                        <td>
                          <div className="row">
                            <AssetLogo symbol={t.symbol} logo={t.instrument_id ? im[t.instrument_id]?.logo : null} cls={t.asset_class} size={30} />
                            <div className="col" style={{ gap: 2, minWidth: 0 }}>
                              <span className="row" style={{ gap: 6 }}>
                                <b>{t.symbol}</b>
                                <DirBadge d={t.direction} />
                              </span>
                              <span className="row wrap" style={{ gap: 4 }}>
                                {t.strategy_id && sm[t.strategy_id] && <span className="tag-pill" style={{ '--c': sm[t.strategy_id].color } as React.CSSProperties}>{sm[t.strategy_id].name}</span>}
                                {t.sentiment_id && lm[t.sentiment_id] && <span className="tag-pill" style={{ '--c': lm[t.sentiment_id].color } as React.CSSProperties}>{lm[t.sentiment_id].name}</span>}
                                {tg.slice(0, 2).map((x) => (
                                  <span key={x.id} className="tag-pill" style={{ '--c': x.color } as React.CSSProperties}>
                                    #{x.name}
                                  </span>
                                ))}
                                {!t.strategy_id && !t.sentiment_id && !tg.length && <span className="xs muted">{classLabel(t.asset_class)}</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="hide-md small">
                          <span className="row" style={{ gap: 6 }}>
                            <span className="dot" style={{ background: p?.color }} /> {p?.name}
                          </span>
                        </td>
                        <td className="small">
                          <div>{fdate(t.entry_at)} <span className="muted">{ftime(t.entry_at)}</span></div>
                          <div className="num muted">{price(t.entry_price)}</div>
                        </td>
                        <td className="small hide-sm">
                          {t.status === 'closed' ? (
                            <>
                              <div>{fdate(t.exit_at)} <span className="muted">{ftime(t.exit_at)}</span></div>
                              <div className="num muted">{t.exit_price !== null ? price(t.exit_price) : L('manual', 'manual')}</div>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="money hide-md small">{num(t.quantity, 6, { min: 0 })}</td>
                        <td className="money">
                          <Money v={v} currency={p?.currency} sign />
                          {t.status === 'open' && <div className="xs muted">{r.c.unrealized === null ? L('sem preço', 'no price') : L('não realizado', 'unrealized')}</div>}
                        </td>
                        <td className="money hide-sm small">{pct(r.c.returnPct, 2, { sign: true })}</td>
                        <td className="money hide-md small">{r.c.rMultiple !== null ? num(r.c.rMultiple, 2, { sign: true }) : '—'}</td>
                        <td>{t.status === 'closed' ? <Outcome o={r.c.outcome} /> : <StatusBadge s={t.status} />}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="row row-actions">
                            {imgs.length > 0 && (
                              <button className="icon-btn" title={`${imgs.length} ${L('prints', 'screenshots')}`} onClick={() => app.viewTrade(t.id)}>
                                <I.image />
                              </button>
                            )}
                            <button className="icon-btn" title={L('Editar', 'Edit')} onClick={() => app.editTrade(t.id)}>
                              <I.edit />
                            </button>
                            <button className="icon-btn" title={L('Mais ações', 'More actions')} onClick={(e) => menu(e, r)}>
                              <I.more />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              icon={<I.chartUp />}
              title={data.rows.length ? L('Nenhuma operação com esses filtros', 'No trades match these filters') : L('Nenhuma operação registrada', 'No trades recorded')}
              action={
                <button className="btn primary" onClick={() => app.editTrade(null)}>
                  <I.plus /> {data.rows.length ? L('Nova operação', 'New trade') : L('Registrar primeira operação', 'Record your first trade')}
                </button>
              }
            >
              {data.rows.length ? L('Ajuste os filtros ou o período.', 'Adjust the filters or the period.') : L('Comece registrando sua primeira operação', 'Start by recording your first trade')}
            </Empty>
          )}
        </div>
      )}
    </div>
  )
}
