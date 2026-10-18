import { useEffect, useMemo, useState } from 'react'
import { useApp, Empty, Field, Help, NumInput, PortfolioSelect, Seg, Spinner, Money, Outcome, DirBadge } from '../components/ui'
import { I } from '../components/icons'
import { AssetLogo, Icon3D } from '../components/visual'
import { StoredThumb } from '../components/ImageDrop'
import { ASSET_CLASSES, classLabel, instrumentFromHit } from '../components/AssetPicker'
import { PeriodPicker, usePerformance, useScopeState } from '../components/shared'
import { L } from '../lib/i18n'
import { CLASS_MULTIPLIER, knownSpec, pipSize, pnl, positionSize, riskRows, forexPair } from '../lib/calc'
import { esc, fdate, fdatetime, money, num, pct, price, ratio, todayIso } from '../lib/format'
import { imageUrl } from '../lib/images'
import { instruments, portfolio, portfolioMetrics, strategies, strategyMap, tradeImages, tradeNotes, deleteInstrument } from '../lib/repo'
import { fetchQuote, quoteAge, searchAssets, yahooSymbol, type AssetHit, type Quote } from '../lib/market'
import { settings, useSettings } from '../lib/settings'
import { groupBy } from '../lib/stats'
import { download, reportCsv } from '../lib/csv'
import type { AssetClass, Direction, Instrument } from '../lib/types'

const TABS: [string, () => string, Parameters<typeof Icon3D>[0]['icon']][] = [
  ['size', () => L('Tamanho de posição', 'Position size'), 'target'],
  ['risk', () => L('Gestão de risco', 'Risk management'), 'shield'],
  ['pnl', () => L('Calculadora de P&L', 'P&L calculator'), 'percent'],
  ['journal', () => L('Diário & relatórios', 'Journal & reports'), 'book'],
  ['assets', () => L('Busca de ativos', 'Asset search'), 'search']
]

export function Tools({ tab }: { tab: string }) {
  const app = useApp()
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Ferramentas', 'Tools')}</h2>
          <p>{L('Planeje, calcule e avalie suas operações', 'Plan, calculate and evaluate your trades')}</p>
        </div>
      </div>
      <div className="tool-tabs">
        {TABS.map(([k, l, ic]) => (
          <button key={k} className={'tool-tab tilt' + (tab === k ? ' on' : '')} onClick={() => app.nav('tools', { tab: k })}>
            <Icon3D icon={ic} size={30} />
            <span>{l()}</span>
          </button>
        ))}
      </div>
      {tab === 'size' && <SizeTool />}
      {tab === 'risk' && <RiskTool />}
      {tab === 'pnl' && <PnlTool />}
      {tab === 'journal' && <JournalTool />}
      {tab === 'assets' && <AssetTool />}
    </div>
  )
}

/** Shared instrument inputs: class, symbol → contract multiplier & quote currency. */
function useInstrumentInputs(init?: { cls?: AssetClass }) {
  const [cls, setCls] = useState<AssetClass>(init?.cls ?? settings().defaultAssetClass)
  const [symbol, setSymbol] = useState('')
  const [mult, setMult] = useState<number | null>(CLASS_MULTIPLIER[cls])
  const spec = symbol ? knownSpec(symbol, cls) : null
  useEffect(() => setMult(spec?.multiplier ?? CLASS_MULTIPLIER[cls]), [cls, symbol])
  const ui = (
    <>
      <Field label={L('Classe do ativo', 'Asset class')}>
        <select className="select" value={cls} onChange={(e) => setCls(e.target.value as AssetClass)}>
          {ASSET_CLASSES.map(([k, l]) => (
            <option key={k} value={k}>
              {l()}
            </option>
          ))}
        </select>
      </Field>
      <Field label={L('Ativo (opcional)', 'Symbol (optional)')} hint={spec?.label}>
        <input className="input" placeholder="EURUSD, WINZ25, ES, AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} list="known-instruments" />
        <datalist id="known-instruments">
          {instruments().map((i) => (
            <option key={i.id} value={i.symbol} />
          ))}
        </datalist>
      </Field>
      <Field label={L('Multiplicador / contrato', 'Multiplier / contract')} help={L('Valor de 1,0 de movimento por unidade: 1 (ações/cripto), 100.000 por lote (forex), $50/pt (ES), R$0,20/pt (WIN).', 'Value of a 1.0 move per unit: 1 (stocks/crypto), 100,000 per lot (forex), $50/pt (ES), R$0.20/pt (WIN).')}>
        <NumInput value={mult} onChange={setMult} />
      </Field>
    </>
  )
  return { cls, symbol, mult: mult ?? 1, spec, ui, pair: cls === 'forex' ? forexPair(symbol) : null }
}

function useAccount() {
  const [pid, setPid] = useState(settings().defaultPortfolioId ?? '')
  const p = portfolio(pid)
  const [bal, setBal] = useState<number | null>(p ? portfolioMetrics(p).equity : null)
  useEffect(() => {
    const pp = portfolio(pid)
    if (pp) setBal(Math.round(portfolioMetrics(pp).equity * 100) / 100)
  }, [pid])
  return { pid, setPid, p, bal, setBal, cur: p?.currency ?? settings().currency }
}

function SizeTool() {
  const app = useApp()
  const acc = useAccount()
  const ins = useInstrumentInputs()
  const [riskPct, setRiskPct] = useState<number | null>(settings().defaultRiskPct)
  const [entry, setEntry] = useState<number | null>(null)
  const [stop, setStop] = useState<number | null>(null)
  const [fx, setFx] = useState<number | null>(null)
  const [step, setStep] = useState<number | null>(ins.cls === 'forex' ? 0.01 : ins.cls === 'crypto' ? 0.0001 : 1)
  useEffect(() => setStep(ins.cls === 'forex' ? 0.01 : ins.cls === 'crypto' ? 0.0001 : ins.cls === 'index' || ins.cls === 'commodity' ? 0.01 : 1), [ins.cls])
  const autoFx = ins.pair && ins.pair[1] !== acc.cur ? (ins.pair[0] === acc.cur && entry ? 1 / entry : null) : null
  const r = acc.bal && riskPct && entry !== null && stop !== null ? positionSize({ balance: acc.bal, riskPct, entry, stop, multiplier: ins.mult, fx: fx ?? autoFx ?? 1, step: step ?? 0 }) : null
  const pips = ins.cls === 'forex' && entry !== null && stop !== null ? Math.abs(entry - stop) / pipSize(ins.symbol) : null
  const pipValue = ins.cls === 'forex' ? pipSize(ins.symbol) * ins.mult * (fx ?? autoFx ?? 1) : null
  const needFx = ins.pair && ins.pair[1] !== acc.cur && !autoFx && !fx

  return (
    <div className="tool-grid">
      <div className="card">
        <div className="card-head">
          <h3>{L('Calculadora de tamanho de posição', 'Position size calculator')}</h3>
          <Help text={L('Tamanho = (saldo × risco%) ÷ (|entrada − stop| × multiplicador × câmbio), arredondado para baixo no passo escolhido.', 'Size = (balance × risk%) ÷ (|entry − stop| × multiplier × fx), rounded down to the chosen step.')} />
        </div>
        <div className="card-body form-grid">
          <Field label={L('Carteira (preenche o saldo)', 'Portfolio (fills the balance)')}>
            <PortfolioSelect value={acc.pid} onChange={acc.setPid} allowAll allLabel={L('— Saldo manual —', '— Manual balance —')} />
          </Field>
          <Field label={`${L('Saldo da conta', 'Account balance')} (${acc.cur})`}>
            <NumInput value={acc.bal} onChange={acc.setBal} />
          </Field>
          <Field label={L('Risco por operação (%)', 'Risk per trade (%)')}>
            <NumInput value={riskPct} onChange={setRiskPct} suffix="%" />
          </Field>
          {ins.ui}
          <Field label={L('Preço de entrada', 'Entry price')}>
            <NumInput value={entry} onChange={setEntry} />
          </Field>
          <Field label="Stop-loss">
            <NumInput value={stop} onChange={setStop} />
          </Field>
          <Field label={L('Arredondar para', 'Round down to')} help={L('Menor tamanho negociável: 1 ação, 0,01 lote, 1 contrato…', 'Smallest tradable size: 1 share, 0.01 lot, 1 contract…')}>
            <NumInput value={step} onChange={setStep} />
          </Field>
          {(ins.pair && ins.pair[1] !== acc.cur) || fx ? (
            <Field label={`${L('Câmbio', 'FX')} ${ins.pair?.[1] ?? '?'}→${acc.cur}`} hint={autoFx ? `${L('Automático', 'Automatic')}: ${num(autoFx, 6)}` : undefined}>
              <NumInput value={fx} onChange={setFx} placeholder={autoFx ? num(autoFx, 6) : '1'} />
            </Field>
          ) : null}
        </div>
      </div>
      <div className="card result-card">
        <div className="card-head">
          <h3>{L('Resultado', 'Result')}</h3>
          {r && <DirBadge d={r.direction} />}
        </div>
        <div className="card-body">
          {needFx && <div className="alert amber small" style={{ marginBottom: 10 }}>{L(`Informe o câmbio ${ins.pair![1]}→${acc.cur} para um cálculo exato.`, `Enter the ${ins.pair![1]}→${acc.cur} rate for an exact result.`)}</div>}
          {r ? (
            <>
              <div className="res-big">
                <span>{ins.cls === 'forex' ? L('Lotes', 'Lots') : ins.cls === 'futures' ? L('Contratos', 'Contracts') : L('Quantidade', 'Quantity')}</span>
                <b>{num(r.size, 8, { min: 0 })}</b>
                {r.size === 0 && <small className="neg">{L('O risco não cobre 1 unidade mínima', 'Risk does not cover one minimum unit')}</small>}
              </div>
              <dl className="calc-list">
                <dt>{L('Risco desejado', 'Target risk')}</dt>
                <dd>{money(r.riskMoney, acc.cur)}</dd>
                <dt>{L('Risco real (após arredondar)', 'Actual risk (after rounding)')}</dt>
                <dd className="neg">{money(r.actualRisk, acc.cur)} · {pct(acc.bal ? (r.actualRisk / acc.bal) * 100 : null, 2)}</dd>
                <dt>{L('Risco por unidade', 'Risk per unit')}</dt>
                <dd>{money(r.riskPerUnit, acc.cur)}</dd>
                <dt>{L('Capital / valor da posição', 'Capital / position value')}</dt>
                <dd>{money(r.capital, acc.cur)}</dd>
                <dt>{L('Tamanho sem arredondar', 'Unrounded size')}</dt>
                <dd>{num(r.rawSize, 6)}</dd>
                {pips !== null && (
                  <>
                    <dt>{L('Distância do stop', 'Stop distance')}</dt>
                    <dd>{num(pips, 1)} pips</dd>
                    <dt>{L('Valor do pip por lote', 'Pip value per lot')}</dt>
                    <dd>{money(pipValue, acc.cur)}</dd>
                  </>
                )}
              </dl>
              <button className="btn primary full-w" disabled={!r.size} onClick={() => app.editTrade(null, { portfolio_id: acc.pid || undefined, symbol: ins.symbol, asset_class: ins.cls, direction: r.direction, entry_price: entry, stop_loss: stop, quantity: r.size, multiplier: ins.mult, fx_rate: fx, status: 'planned' })}>
                <I.plus /> {L('Criar operação planejada', 'Create planned trade')}
              </button>
            </>
          ) : (
            <Empty icon={<I.target />} title={L('Preencha saldo, risco, entrada e stop', 'Fill in balance, risk, entry and stop')} />
          )}
        </div>
      </div>
    </div>
  )
}

function RiskTool() {
  const acc = useAccount()
  const ins = useInstrumentInputs()
  const [dir, setDir] = useState<Direction>('long')
  const [entry, setEntry] = useState<number | null>(null)
  const [qty, setQty] = useState<number | null>(null)
  const [fees, setFees] = useState<number | null>(settings().defaultFees || null)
  const [fx, setFx] = useState<number | null>(null)
  const [sc, setSc] = useState<{ stop: number | null; target: number | null }[]>([
    { stop: null, target: null },
    { stop: null, target: null },
    { stop: null, target: null }
  ])
  const valid = sc.filter((x) => x.stop !== null && x.target !== null) as { stop: number; target: number }[]
  const rows = entry !== null && qty ? riskRows({ direction: dir, entry, quantity: qty, multiplier: ins.mult, equity: acc.bal ?? 0, fees: fees ?? 0, fx: fx ?? 1 }, valid) : []
  const best = rows.filter((r) => r.valid && r.rr !== null).sort((a, b) => b.rr! - a.rr!)[0]
  return (
    <div className="tool-grid">
      <div className="card">
        <div className="card-head">
          <h3>{L('Calculadora de gestão de risco', 'Risk management calculator')}</h3>
        </div>
        <div className="card-body form-grid">
          <Field label={L('Carteira (preenche o patrimônio)', 'Portfolio (fills equity)')}>
            <PortfolioSelect value={acc.pid} onChange={acc.setPid} allowAll allLabel={L('— Patrimônio manual —', '— Manual equity —')} />
          </Field>
          <Field label={`${L('Patrimônio', 'Equity')} (${acc.cur})`}>
            <NumInput value={acc.bal} onChange={acc.setBal} />
          </Field>
          <Field label={L('Direção', 'Direction')}>
            <Seg value={dir} onChange={setDir} options={[['long', 'Long'], ['short', 'Short']]} />
          </Field>
          <Field label={L('Preço de entrada', 'Entry price')}>
            <NumInput value={entry} onChange={setEntry} />
          </Field>
          {ins.ui}
          <Field label={L('Quantidade', 'Quantity')}>
            <NumInput value={qty} onChange={setQty} />
          </Field>
          <Field label={`${L('Taxas (ida e volta)', 'Fees (round trip)')} (${acc.cur})`}>
            <NumInput value={fees} onChange={setFees} />
          </Field>
          {ins.pair && ins.pair[1] !== acc.cur && (
            <Field label={`${L('Câmbio', 'FX')} ${ins.pair[1]}→${acc.cur}`}>
              <NumInput value={fx} onChange={setFx} placeholder="1" />
            </Field>
          )}
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          <div className="kpi-label" style={{ marginBottom: 8 }}>
            {L('Cenários de stop e alvo', 'Stop & target scenarios')}
          </div>
          {sc.map((x, i) => (
            <div key={i} className="scen-row">
              <span className="scen-n">{String.fromCharCode(65 + i)}</span>
              <NumInput value={x.stop} onChange={(v) => setSc((l) => l.map((y, j) => (j === i ? { ...y, stop: v } : y)))} placeholder="Stop" />
              <NumInput value={x.target} onChange={(v) => setSc((l) => l.map((y, j) => (j === i ? { ...y, target: v } : y)))} placeholder={L('Alvo', 'Target')} />
              <button className="icon-btn red" onClick={() => setSc((l) => l.filter((_, j) => j !== i))} disabled={sc.length <= 1} aria-label={L('Remover cenário', 'Remove scenario')}>
                <I.trash />
              </button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setSc((l) => [...l, { stop: null, target: null }])} disabled={sc.length >= 8}>
            <I.plus /> {L('Cenário', 'Scenario')}
          </button>
        </div>
      </div>
      <div className="card result-card">
        <div className="card-head">
          <h3>{L('Comparação', 'Comparison')}</h3>
        </div>
        <div className="card-body">
          {rows.length ? (
            <>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th />
                      <th className="money">{L('Risco', 'Risk')}</th>
                      <th className="money">{L('Lucro', 'Profit')}</th>
                      <th className="money">R:R</th>
                      <th className="money">{L('% conta', '% acct')}</th>
                      <th className="money" title={L('Taxa de acerto mínima para empatar', 'Minimum win rate to break even')}>{L('Acerto mín.', 'Min win%')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={best === r ? 'sel' : ''}>
                        <td>
                          <b>{String.fromCharCode(65 + sc.findIndex((x) => x.stop === r.stop && x.target === r.target))}</b>
                          {!r.valid && <div className="xs neg">{L('stop/alvo do lado errado', 'stop/target on the wrong side')}</div>}
                        </td>
                        <td className="money neg">{money(r.risk, acc.cur)}</td>
                        <td className="money pos">{money(r.reward, acc.cur)}</td>
                        <td className="money bold">{r.rr !== null ? '1:' + ratio(r.rr) : '—'}</td>
                        <td className="money">{pct(r.riskPct, 2)}</td>
                        <td className="money">{pct(r.breakevenWinRate, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {best && (
                <p className="small" style={{ marginTop: 12 }}>
                  {L('Melhor relação:', 'Best ratio:')} <b>1:{ratio(best.rr)}</b> — {L('você precisa acertar mais de', 'you need to win more than')} <b>{pct(best.breakevenWinRate, 1)}</b> {L('das vezes para lucrar.', 'of the time to profit.')}
                  {best.riskPct !== null && best.riskPct > 2 && <span className="warn-txt"> {L('Atenção: risco acima de 2% da conta.', 'Warning: risk above 2% of the account.')}</span>}
                </p>
              )}
            </>
          ) : (
            <Empty icon={<I.shield />} title={L('Informe entrada, quantidade e cenários', 'Enter entry, quantity and scenarios')} />
          )}
        </div>
      </div>
    </div>
  )
}

function PnlTool() {
  const acc = useAccount()
  const ins = useInstrumentInputs()
  const [dir, setDir] = useState<Direction>('long')
  const [entry, setEntry] = useState<number | null>(null)
  const [exit, setExit] = useState<number | null>(null)
  const [qty, setQty] = useState<number | null>(null)
  const [fees, setFees] = useState<number | null>(settings().defaultFees || null)
  const [fx, setFx] = useState<number | null>(null)
  const autoFx = ins.pair && ins.pair[1] !== acc.cur && ins.pair[0] === acc.cur && exit ? 1 / exit : null
  const r = entry !== null && exit !== null && qty ? pnl({ direction: dir, entry, exit, quantity: qty, multiplier: ins.mult, fees: fees ?? 0, fx: fx ?? autoFx ?? 1 }) : null
  return (
    <div className="tool-grid">
      <div className="card">
        <div className="card-head">
          <h3>{L('Calculadora de lucro e prejuízo', 'Profit & loss calculator')}</h3>
        </div>
        <div className="card-body form-grid">
          <Field label={L('Moeda da conta (pela carteira)', 'Account currency (from portfolio)')}>
            <PortfolioSelect value={acc.pid} onChange={acc.setPid} allowAll allLabel={`— ${settings().currency} —`} />
          </Field>
          <Field label={L('Direção', 'Direction')}>
            <Seg value={dir} onChange={setDir} options={[['long', 'Long / ' + L('Compra', 'Buy')], ['short', 'Short / ' + L('Venda', 'Sell')]]} />
          </Field>
          {ins.ui}
          <Field label={L('Preço de entrada', 'Entry price')}>
            <NumInput value={entry} onChange={setEntry} />
          </Field>
          <Field label={L('Preço de saída', 'Exit price')}>
            <NumInput value={exit} onChange={setExit} />
          </Field>
          <Field label={L('Quantidade', 'Quantity')}>
            <NumInput value={qty} onChange={setQty} />
          </Field>
          <Field label={`${L('Taxas', 'Fees')} (${acc.cur})`}>
            <NumInput value={fees} onChange={setFees} />
          </Field>
          {ins.pair && ins.pair[1] !== acc.cur && (
            <Field label={`${L('Câmbio', 'FX')} ${ins.pair[1]}→${acc.cur}`} hint={autoFx ? `${L('Automático', 'Automatic')}: ${num(autoFx, 6)}` : L('Necessário para converter', 'Needed to convert')}>
              <NumInput value={fx} onChange={setFx} placeholder={autoFx ? num(autoFx, 6) : '1'} />
            </Field>
          )}
        </div>
      </div>
      <div className="card result-card">
        <div className="card-head">
          <h3>{L('Resultado', 'Result')}</h3>
          {r && <Outcome o={r.net > 0 ? 'win' : r.net < 0 ? 'loss' : 'be'} />}
        </div>
        <div className="card-body">
          {r ? (
            <>
              <div className="res-big">
                <span>{L('Resultado líquido', 'Net result')}</span>
                <b className={r.net >= 0 ? 'pos' : 'neg'}>{money(r.net, acc.cur, { sign: true })}</b>
                <small>{pct(r.returnPct, 2, { sign: true })} {L('sobre o valor da posição', 'on position value')}</small>
              </div>
              <dl className="calc-list">
                <dt>{L('Bruto', 'Gross')}</dt>
                <dd><Money v={r.gross} currency={acc.cur} sign /></dd>
                <dt>{L('Taxas', 'Fees')}</dt>
                <dd className="neg">{money(-(fees ?? 0), acc.cur)}</dd>
                <dt>{ins.cls === 'forex' ? 'Pips' : L('Pontos', 'Points')}</dt>
                <dd>{ins.cls === 'forex' ? num(r.points / pipSize(ins.symbol), 1, { sign: true }) : num(r.points, 6, { sign: true, min: 0 })}</dd>
                <dt>{L('Valor da posição', 'Position value')}</dt>
                <dd>{money(r.notional, acc.cur)}</dd>
              </dl>
            </>
          ) : (
            <Empty icon={<I.percent />} title={L('Informe entrada, saída e quantidade', 'Enter entry, exit and quantity')} />
          )}
        </div>
      </div>
    </div>
  )
}

function JournalTool() {
  const app = useApp()
  const sc = useScopeState('journal')
  const [strategyId, setStrategyId] = useState('')
  const [onlyNotes, setOnlyNotes] = useState(false)
  const perf = usePerformance(sc.portfolioId, sc.range, 'day')
  const cur = perf.currency
  const sm = strategyMap()
  const rows = perf.period.filter((r) => r.t.status === 'closed' && (!strategyId || r.t.strategy_id === strategyId))
  const S = useMemo(() => (strategyId ? summarizeRows(rows) : perf.summary), [rows, strategyId, perf.summary])
  const byStrategy = groupBy(rows, (r) => r.t.strategy_id, (k) => sm[k]?.name ?? L('Sem estratégia', 'No strategy'))
  const bySymbol = groupBy(rows, (r) => r.t.symbol)
  const list = rows.filter((r) => !onlyNotes || r.t.notes || tradeNotes(r.t.id).length || tradeImages(r.t.id).length)
  const pname = sc.portfolioId ? portfolio(sc.portfolioId)?.name : L('Todas as carteiras', 'All portfolios')
  const periodTxt = sc.range.from || sc.range.to ? `${fdate(sc.range.from)} – ${fdate(sc.range.to)}` : L('Todo o período', 'All time')
  const title = `${L('Relatório de performance', 'Performance report')} · ${pname} · ${periodTxt}${strategyId ? ' · ' + sm[strategyId]?.name : ''}`

  const exportPdf = async () => {
    const html = reportHtml(title, S, byStrategy, bySymbol, list, cur)
    if (window.api) await window.api.reportPdf({ html, name: `report-${todayIso()}.pdf` })
    else {
      const w = window.open('', '_blank')
      if (!w) return app.toast(L('Permita pop-ups para imprimir', 'Allow pop-ups to print'), 'err')
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
    }
  }
  return (
    <div>
      <div className="card filters">
        <div className="field">
          <label>{L('Carteira', 'Portfolio')}</label>
          <PortfolioSelect value={sc.portfolioId} onChange={sc.setPortfolio} allowAll includeArchived />
        </div>
        <div className="field">
          <label>{L('Período', 'Period')}</label>
          <PeriodPicker preset={sc.preset} custom={sc.custom} onPreset={sc.setPreset} onCustom={sc.setCustom} />
        </div>
        <div className="field">
          <label>{L('Estratégia', 'Strategy')}</label>
          <select className="select" value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            <option value="">{L('Todas', 'All')}</option>
            {strategies().map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
          <button className="btn" onClick={() => download(`report-${todayIso()}.csv`, reportCsv(title, S, [[L('Por estratégia', 'By strategy'), byStrategy], [L('Por ativo', 'By asset'), bySymbol]], cur))} disabled={!rows.length}>
            <I.download /> CSV
          </button>
          <button className="btn primary" onClick={exportPdf} disabled={!rows.length}>
            <I.statement /> {window.api ? 'PDF' : L('Imprimir / PDF', 'Print / PDF')}
          </button>
        </div>
      </div>
      {!rows.length ? (
        <div className="card">
          <Empty icon={<I.book />} title={L('Nenhuma operação fechada nesse filtro', 'No closed trades for this filter')} />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <h3>{title}</h3>
            </div>
            <div className="stat-grid">
              <Stat l={L('Operações', 'Trades')} v={`${S.closed} (${S.wins}W / ${S.losses}L / ${S.be}BE)`} />
              <Stat l={L('P&L líquido', 'Net P&L')} v={money(S.net, cur, { sign: true })} c={S.net >= 0 ? 'pos' : 'neg'} />
              <Stat l={L('Taxa de acerto', 'Win rate')} v={pct(S.winRate, 1)} />
              <Stat l="Profit factor" v={ratio(S.profitFactor)} />
              <Stat l={L('Expectativa', 'Expectancy')} v={money(S.expectancy, cur, { sign: true })} />
              <Stat l={L('Ganho / perda média', 'Avg win / loss')} v={`${money(S.avgWin, cur)} / ${money(S.avgLoss, cur)}`} />
              <Stat l={L('Drawdown máx.', 'Max drawdown')} v={money(-S.maxDrawdown, cur)} c="neg" />
              <Stat l={L('Taxas', 'Fees')} v={money(S.fees, cur)} />
            </div>
            <div className="grid g2" style={{ padding: 16 }}>
              <MiniGroup title={L('Por estratégia', 'By strategy')} rows={byStrategy} cur={cur} />
              <MiniGroup title={L('Por ativo', 'By asset')} rows={bySymbol} cur={cur} />
            </div>
          </div>
          <div className="card mt">
            <div className="card-head">
              <h3>{L('Revisão: notas e prints', 'Review: notes & screenshots')}</h3>
              <label className="chk small">
                <input type="checkbox" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} />
                {L('Só com notas ou prints', 'Only with notes or screenshots')}
              </label>
            </div>
            <div className="journal-list">
              {list.slice(0, 60).map((r) => {
                const imgs = tradeImages(r.t.id)
                const notes = tradeNotes(r.t.id)
                return (
                  <div key={r.t.id} className="journal-item">
                    <button className="ji-head" onClick={() => app.viewTrade(r.t.id)}>
                      <AssetLogo symbol={r.t.symbol} cls={r.t.asset_class} size={28} />
                      <b>{r.t.symbol}</b>
                      <DirBadge d={r.t.direction} />
                      <span className="small muted">{fdatetime(r.t.exit_at ?? r.t.entry_at)}</span>
                      {r.t.strategy_id && <span className="badge gray">{sm[r.t.strategy_id]?.name}</span>}
                      <span className="grow" />
                      <Money v={r.c.net} currency={portfolio(r.t.portfolio_id)?.currency} sign />
                      <Outcome o={r.c.outcome} />
                    </button>
                    {(r.t.notes || notes.length > 0) && (
                      <div className="ji-notes">
                        {r.t.notes && <p>{r.t.notes}</p>}
                        {notes.map((n) => (
                          <p key={n.id}>
                            <span className="xs muted">{fdatetime(n.at)} · </span>
                            {n.text}
                          </p>
                        ))}
                      </div>
                    )}
                    {imgs.length > 0 && (
                      <div className="thumbs">
                        {imgs.map((img, i) => (
                          <StoredThumb
                            key={img.id}
                            img={img}
                            onOpen={() =>
                              Promise.all(imgs.map(async (x) => ({ url: (await imageUrl(x.file, x.mime)) ?? '', name: x.name, caption: x.caption, kind: x.kind === 'entry' ? L('Entrada', 'Entry') : x.kind === 'exit' ? L('Saída', 'Exit') : '' }))).then((l) => app.lightbox(l.filter((x) => x.url), i))
                            }
                          />
                        ))}
                      </div>
                    )}
                    {!r.t.notes && !notes.length && !imgs.length && <div className="xs muted ji-empty">{L('Sem notas ou prints —', 'No notes or screenshots —')} <button className="link" onClick={() => app.viewTrade(r.t.id)}>{L('adicionar', 'add some')}</button></div>}
                  </div>
                )
              })}
              {list.length > 60 && <p className="xs muted center" style={{ padding: 12 }}>{L(`Mostrando 60 de ${list.length}. Refine o período.`, `Showing 60 of ${list.length}. Narrow the period.`)}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
import { summarize as summarizeRows } from '../lib/stats'

function MiniGroup({ title, rows, cur }: { title: string; rows: ReturnType<typeof groupBy>; cur: string }) {
  return (
    <div>
      <div className="kpi-label" style={{ marginBottom: 6 }}>{title}</div>
      <table className="t">
        <tbody>
          {[...rows].sort((a, b) => b.net - a.net).slice(0, 8).map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td className="money small muted">{r.count} · {pct(r.winRate, 0)}</td>
              <td className={'money bold ' + (r.net >= 0 ? 'pos' : 'neg')}>{money(r.net, cur, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function Stat({ l, v, c }: { l: string; v: string; c?: string }) {
  return (
    <div className="stat">
      <span>{l}</span>
      <b className={c}>{v}</b>
    </div>
  )
}

function reportHtml(title: string, S: ReturnType<typeof summarizeRows>, bySt: ReturnType<typeof groupBy>, bySym: ReturnType<typeof groupBy>, list: ReturnType<typeof usePerformance>['period'], cur: string): string {
  const row = (a: string, b: string) => `<tr><td>${esc(a)}</td><td style="text-align:right">${esc(b)}</td></tr>`
  const grp = (t: string, g: ReturnType<typeof groupBy>) =>
    `<h3>${esc(t)}</h3><table>${[...g].sort((a, b) => b.net - a.net).map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right">${r.count} · ${pct(r.winRate, 0)}</td><td style="text-align:right;color:${r.net >= 0 ? '#0f9b6c' : '#dc3d43'}">${money(r.net, cur, { sign: true })}</td></tr>`).join('')}</table>`
  const trades = list
    .map((r) => `<tr><td>${esc(fdatetime(r.t.exit_at ?? r.t.entry_at))}</td><td><b>${esc(r.t.symbol)}</b> ${r.t.direction}</td><td style="text-align:right">${price(r.t.entry_price)} → ${price(r.t.exit_price)}</td><td style="text-align:right;color:${(r.c.net ?? 0) >= 0 ? '#0f9b6c' : '#dc3d43'}">${money(r.c.net !== null ? r.c.net * r.conv : null, cur, { sign: true })}</td><td>${esc(r.t.notes ?? '')}</td></tr>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#172033;margin:28px;font-size:12px}h1{font-size:18px;margin:0 0 4px}h3{margin:18px 0 6px;font-size:13px}
  table{width:100%;border-collapse:collapse}td,th{padding:5px 8px;border-bottom:1px solid #e3e7ef;vertical-align:top}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.muted{color:#8a93a6}
  </style></head><body><h1>${esc(title)}</h1><div class="muted">$mart Trader · ${esc(fdatetime(new Date().toISOString().slice(0, 16)))} · ${esc(cur)}</div>
  <h3>${L('Resumo', 'Summary')}</h3><table>${row(L('Operações fechadas', 'Closed trades'), `${S.closed} (${S.wins}W / ${S.losses}L / ${S.be}BE)`)}${row(L('P&L líquido', 'Net P&L'), money(S.net, cur, { sign: true }))}${row(L('Taxa de acerto', 'Win rate'), pct(S.winRate, 1))}${row('Profit factor', ratio(S.profitFactor))}${row(L('Expectativa', 'Expectancy'), money(S.expectancy, cur))}${row(L('Ganho médio', 'Average win'), money(S.avgWin, cur))}${row(L('Perda média', 'Average loss'), money(S.avgLoss, cur))}${row(L('Maior ganho', 'Largest win'), money(S.largestWin, cur))}${row(L('Maior perda', 'Largest loss'), money(S.largestLoss, cur))}${row(L('Drawdown máximo', 'Max drawdown'), money(-S.maxDrawdown, cur))}${row(L('Taxas', 'Fees'), money(S.fees, cur))}</table>
  <div class="grid"><div>${grp(L('Por estratégia', 'By strategy'), bySt)}</div><div>${grp(L('Por ativo', 'By asset'), bySym)}</div></div>
  <h3>${L('Operações', 'Trades')}</h3><table>${trades}</table></body></html>`
}

function AssetTool() {
  const app = useApp()
  const s = useSettings()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ results: AssetHit[]; errors: string[] } | null>(null)
  const [quotes, setQuotes] = useState<Record<string, Quote | string | 'loading'>>({})
  const anyOn = s.providers.yahoo || s.providers.coingecko || s.providers.finnhub
  const go = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    try {
      setRes(await searchAssets(q.trim()))
    } catch (er) {
      setRes({ results: [], errors: [String((er as Error).message ?? er)] })
    } finally {
      setBusy(false)
    }
  }
  const quote = async (key: string, provider: string, pid: string, symbol: string) => {
    setQuotes((x) => ({ ...x, [key]: 'loading' }))
    try {
      const qt = await fetchQuote(provider, pid, symbol)
      setQuotes((x) => ({ ...x, [key]: qt }))
    } catch (er) {
      setQuotes((x) => ({ ...x, [key]: String((er as Error).message ?? er) }))
    }
  }
  const QuoteCell = ({ k }: { k: string }) => {
    const v = quotes[k]
    if (!v) return null
    if (v === 'loading') return <Spinner size={14} />
    if (typeof v === 'string') return <span className="xs neg" title={v}>{L('Indisponível', 'Unavailable')}: {v}</span>
    return (
      <span className="quote">
        <b>{price(v.price)}</b> {v.currency && <span className="muted xs">{v.currency}</span>}
        <span className={'badge ' + (v.delayed ? 'amber' : 'green')}>{v.delayed ? L('atrasada', 'delayed') : L('recente', 'recent')}</span>
        <span className="xs muted" title={v.note}>
          {v.source} · {quoteAge(v.at)} {L('atrás', 'ago')}
        </span>
      </span>
    )
  }
  const useHit = (h: AssetHit) => {
    const id = instrumentFromHit(h)
    const ins = instruments().find((i) => i.id === id)!
    app.editTrade(null, { instrument_id: ins.id, symbol: ins.symbol, asset_name: ins.name, asset_class: ins.asset_class, multiplier: ins.multiplier })
  }
  const catalog = instruments()
  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h3>{L('Buscar ativos', 'Search assets')}</h3>
          <span className="xs muted">
            {[s.providers.yahoo && 'Yahoo Finance', s.providers.coingecko && 'CoinGecko', s.providers.finnhub && 'Finnhub*'].filter(Boolean).join(' · ') || L('Nenhum provedor ativo', 'No provider enabled')}
          </span>
        </div>
        <div className="card-body">
          {!anyOn && <div className="alert amber" style={{ marginBottom: 10 }}>{L('Ative um provedor em Configurações › Integrações.', 'Enable a provider in Settings › Integrations.')}</div>}
          <form className="row" onSubmit={go}>
            <div className="reg-search grow" style={{ maxWidth: 'none' }}>
              <I.search />
              <input autoFocus placeholder={L('Nome ou ticker: Apple, PETR4, bitcoin, EURUSD…', 'Name or ticker: Apple, PETR4, bitcoin, EURUSD…')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn primary" disabled={busy || !q.trim() || !anyOn}>
              {busy ? <Spinner size={14} /> : <I.globe />} {L('Buscar', 'Search')}
            </button>
          </form>
          <p className="xs muted" style={{ marginTop: 8 }}>
            {L('Cotações vêm direto do provedor, com a hora informada por ele. Yahoo Finance é uma fonte não oficial e pode ter atraso de 15–20 min. Nenhum preço é inventado: se o provedor falhar, aparece "Indisponível".', 'Quotes come straight from the provider, with the time it reports. Yahoo Finance is an unofficial source and may be delayed 15–20 min. No price is ever made up: if a provider fails you will see "Unavailable".')}
          </p>
        </div>
        {res && (
          <>
            {res.errors.map((e) => (
              <div key={e} className="alert amber small" style={{ margin: '0 16px 10px' }}>
                <I.warn width={14} height={14} /> {e}
              </div>
            ))}
            {res.results.length ? (
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>{L('Ativo', 'Asset')}</th>
                      <th className="hide-sm">{L('Classe', 'Class')}</th>
                      <th className="hide-md">{L('Bolsa / fonte', 'Exchange / source')}</th>
                      <th>{L('Cotação', 'Quote')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {res.results.map((h) => {
                      const k = h.provider + ':' + h.providerId
                      return (
                        <tr key={k}>
                          <td>
                            <div className="row">
                              <AssetLogo symbol={h.symbol} logo={h.logo} cls={h.assetClass} size={32} />
                              <div className="col" style={{ gap: 1 }}>
                                <b>{h.symbol}</b>
                                <span className="xs muted ellipsis" style={{ maxWidth: 260 }}>{h.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="hide-sm">
                            <span className="badge gray">{classLabel(h.assetClass)}</span>
                          </td>
                          <td className="hide-md small muted">{h.exchange ?? '—'} · {h.provider}</td>
                          <td>
                            {quotes[k] ? <QuoteCell k={k} /> : (
                              <button className="btn sm" onClick={() => quote(k, h.provider, h.providerId, h.symbol)}>
                                <I.refresh /> {L('Cotação', 'Quote')}
                              </button>
                            )}
                          </td>
                          <td>
                            <div className="row row-actions">
                              <button className="btn sm" onClick={() => (instrumentFromHit(h), app.toast(L(`${h.symbol} salvo no catálogo`, `${h.symbol} saved to catalog`), 'ok'))}>
                                <I.plus /> {L('Catálogo', 'Catalog')}
                              </button>
                              <button className="btn sm primary" onClick={() => useHit(h)}>
                                {L('Operar', 'Trade')}
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
              !res.errors.length && <Empty icon={<I.search />} title={L('Nenhum ativo encontrado', 'No assets found')} />
            )}
          </>
        )}
      </div>

      <div className="card mt">
        <div className="card-head">
          <h3>
            {L('Seu catálogo de ativos', 'Your asset catalog')} ({catalog.length})
          </h3>
          <Help text={L('Ativos usados em operações ou salvos da busca. Logos ficam guardados localmente (funcionam offline).', 'Assets used in trades or saved from search. Logos are stored locally (work offline).')} />
        </div>
        {catalog.length ? (
          <div className="table-wrap">
            <table className="t">
              <tbody>
                {catalog.map((i: Instrument) => {
                  const k = 'cat:' + i.id
                  return (
                    <tr key={i.id}>
                      <td>
                        <div className="row">
                          <AssetLogo symbol={i.symbol} logo={i.logo} cls={i.asset_class} size={28} />
                          <div className="col" style={{ gap: 1 }}>
                            <b>{i.symbol}</b>
                            <span className="xs muted">{i.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-sm">
                        <span className="badge gray">{classLabel(i.asset_class)}</span>
                      </td>
                      <td className="hide-md small muted">× {num(i.multiplier, 6, { min: 0 })} {i.quote_currency ?? ''}</td>
                      <td>
                        {quotes[k] ? <QuoteCell k={k} /> : (
                          <button className="btn sm" disabled={!anyOn} onClick={() => quote(k, i.provider ?? 'yahoo', i.provider_id ?? yahooSymbol(i.symbol, i.asset_class), i.symbol)}>
                            <I.refresh /> {L('Cotação', 'Quote')}
                          </button>
                        )}
                      </td>
                      <td>
                        <div className="row row-actions">
                          <button className="btn sm primary" onClick={() => app.editTrade(null, { instrument_id: i.id, symbol: i.symbol, asset_name: i.name, asset_class: i.asset_class, multiplier: i.multiplier })}>
                            {L('Operar', 'Trade')}
                          </button>
                          <button
                            className="icon-btn red"
                            title={L('Remover do catálogo', 'Remove from catalog')}
                            onClick={async () => (await app.confirm({ title: L('Remover do catálogo?', 'Remove from catalog?'), message: L('As operações mantêm o símbolo; só o vínculo com o catálogo é removido.', 'Trades keep their symbol; only the catalog link is removed.'), ok: L('Remover', 'Remove'), danger: true })) && deleteInstrument(i.id)}
                          >
                            <I.trash />
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
          <Empty icon={<I.layers />} title={L('Catálogo vazio', 'Catalog is empty')}>
            {L('Busque um ativo acima ou registre uma operação.', 'Search for an asset above or record a trade.')}
          </Empty>
        )}
      </div>
    </div>
  )
}
