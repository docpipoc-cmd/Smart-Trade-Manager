import { useEffect, useMemo, useState } from 'react'
import { Field, Help, Modal, NumInput, Seg, PortfolioSelect, useApp, Money, Outcome, Spinner } from './ui'
import { I } from './icons'
import { AssetPicker, ASSET_CLASSES } from './AssetPicker'
import { ImageDrop, type PendingImage } from './ImageDrop'
import { L } from '../lib/i18n'
import { CLASS_MULTIPLIER, computeTrade, knownSpec, positionSize } from '../lib/calc'
import { duration, money, nowLocal, num, pct, ratio, uid } from '../lib/format'
import {
  addImage, deleteImage, instrumentMap, lookups, portfolio, portfolioMetrics, portfolios, saveTrade, strategies, tags as allTags,
  trade as getTrade, tradeImages, tradeMistakeIndex, tradeTagIndex, saveTag, setMark
} from '../lib/repo'
import { settings } from '../lib/settings'
import { fetchQuote, quoteAge, yahooSymbol } from '../lib/market'
import type { AssetClass, Instrument, Trade, TradeStatus } from '../lib/types'

type Draft = Omit<Trade, 'id' | 'created_at' | 'updated_at'> & { id?: string }
type Tab = 'main' | 'risk' | 'journal' | 'images'

function blank(defaults?: Partial<Trade>): Draft {
  const s = settings()
  const active = portfolios().filter((p) => p.status === 'active')
  const pid = defaults?.portfolio_id ?? (s.defaultPortfolioId && portfolio(s.defaultPortfolioId)?.status === 'active' ? s.defaultPortfolioId : active[0]?.id ?? '')
  const now = nowLocal()
  return {
    portfolio_id: pid, instrument_id: null, symbol: '', asset_name: null, asset_class: s.defaultAssetClass, direction: 'long',
    strategy_id: s.defaultStrategyId, session_id: null, sentiment_id: null, status: 'closed', entry_at: now, exit_at: now,
    entry_price: null, exit_price: null, quantity: null, multiplier: CLASS_MULTIPLIER[s.defaultAssetClass], fx_rate: null,
    stop_loss: null, take_profit: null, risk_amount: null, fees: s.defaultFees, manual_pnl: null, planned_rr: null,
    followed_plan: null, is_be: 0, mark_price: null, mark_at: null, mark_source: null, notes: null,
    ...defaults
  }
}
const SIZE_STEP: Record<AssetClass, number> = { stock: 1, etf: 1, forex: 0.01, crypto: 0.0001, index: 0.01, futures: 1, commodity: 0.01, option: 1, other: 0.0001 }

export function TradeModal({ id, defaults, onClose, onSaved }: { id: string | null; defaults?: Partial<Trade>; onClose(): void; onSaved?(id: string): void }) {
  const app = useApp()
  const existing = id ? getTrade(id) : undefined
  const [v, setV] = useState<Draft>(() => (existing ? { ...existing } : blank(defaults)))
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV((o) => ({ ...o, [k]: val }))
  const [tab, setTab] = useState<Tab>('main')
  const [manual, setManual] = useState(() => !!existing && existing.manual_pnl !== null && existing.exit_price === null)
  const [multTouched, setMultTouched] = useState(!!existing)
  const [tagIds, setTagIds] = useState<string[]>(() => (id ? tradeTagIndex()[id] ?? [] : []))
  const [mistakeIds, setMistakeIds] = useState<string[]>(() => (id ? tradeMistakeIndex()[id] ?? [] : []))
  const [pending, setPending] = useState<PendingImage[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [newTag, setNewTag] = useState('')
  useEffect(() => () => pending.forEach((x) => URL.revokeObjectURL(x.url)), [])

  const p = portfolio(v.portfolio_id)
  const ins = v.instrument_id ? instrumentMap()[v.instrument_id] : undefined
  const cur = p?.currency ?? settings().currency
  const draftTrade = { ...v, id: v.id ?? 'draft', manual_pnl: manual ? v.manual_pnl : null, exit_price: manual ? null : v.exit_price, created_at: '', updated_at: '' } as Trade
  const c = useMemo(() => computeTrade(draftTrade, cur, { beTolerance: settings().beTolerance, quoteCurrency: ins?.quote_currency ?? null }), [JSON.stringify(draftTrade), cur, ins?.quote_currency])
  const equity = p ? portfolioMetrics(p).equity - (existing?.status === 'closed' ? (computeTrade(existing, cur).net ?? 0) : 0) : null
  const riskPct = c.risk && equity && equity > 0 ? (c.risk / equity) * 100 : null
  const spec = v.symbol ? knownSpec(v.symbol, v.asset_class) : null
  // "missing exit" is the form's job (field errors); don't nag before anything is typed
  const shownIssues = c.issues.filter((i) => tried || !/without exit price/.test(i))

  // ── validation
  const errs: Partial<Record<string, string>> = {}
  if (!v.portfolio_id) errs.portfolio = L('Escolha a carteira', 'Pick a portfolio')
  else if (!existing && p?.status === 'locked') errs.portfolio = L('Esta carteira está bloqueada para novas operações', 'This portfolio is locked for new trades')
  if (!v.symbol.trim()) errs.symbol = L('Informe o ativo', 'Enter the asset')
  if (v.quantity !== null && v.quantity <= 0) errs.quantity = L('Deve ser maior que zero', 'Must be greater than zero')
  if (!(v.multiplier > 0)) errs.multiplier = L('Deve ser maior que zero', 'Must be greater than zero')
  if ((v.status === 'open' || v.status === 'closed') && !v.entry_at) errs.entry_at = L('Informe a data de entrada', 'Enter the entry date')
  if (v.status === 'closed') {
    if (!v.exit_at) errs.exit_at = L('Informe a data de saída', 'Enter the exit date')
    if (manual) {
      if (v.manual_pnl === null) errs.manual = L('Informe o resultado', 'Enter the result')
    } else {
      if (v.entry_price === null) errs.entry_price = L('Informe o preço de entrada', 'Enter the entry price')
      if (v.exit_price === null) errs.exit_price = L('Informe o preço de saída', 'Enter the exit price')
      if (v.quantity === null) errs.quantity = L('Informe a quantidade', 'Enter the quantity')
    }
  }
  if (c.holdMinutes !== null && c.holdMinutes < 0) errs.exit_at = L('A saída é antes da entrada', 'Exit is before entry')
  if (v.fees < 0) errs.fees = L('Taxas não podem ser negativas', 'Fees cannot be negative')
  const tabOf: Record<string, Tab> = { portfolio: 'main', symbol: 'main', quantity: 'main', multiplier: 'main', entry_at: 'main', exit_at: 'main', manual: 'main', entry_price: 'main', exit_price: 'main', fees: 'main' }
  const E = (k: string) => (tried ? errs[k] ?? null : null)

  const pickInstrument = (i: Instrument) => {
    setV((o) => ({ ...o, instrument_id: i.id, symbol: i.symbol, asset_name: i.name, asset_class: i.asset_class, multiplier: i.multiplier || CLASS_MULTIPLIER[i.asset_class] }))
    setMultTouched(true)
  }
  const typeSymbol = (s: string) => {
    setV((o) => {
      const sp = knownSpec(s, o.asset_class)
      return { ...o, symbol: s, instrument_id: null, asset_name: null, multiplier: multTouched ? o.multiplier : sp?.multiplier ?? CLASS_MULTIPLIER[o.asset_class] }
    })
  }
  const setClass = (cls: AssetClass) => {
    setV((o) => ({ ...o, asset_class: cls, multiplier: knownSpec(o.symbol, cls)?.multiplier ?? CLASS_MULTIPLIER[cls] }))
    setMultTouched(false)
  }
  const setStatus = (st: TradeStatus) => {
    setV((o) => ({ ...o, status: st, exit_at: st === 'closed' ? o.exit_at || nowLocal() : o.exit_at, entry_at: st === 'planned' ? o.entry_at : o.entry_at || nowLocal() }))
  }
  const sizeFromRisk = () => {
    if (!equity || v.entry_price === null || v.stop_loss === null) return app.toast(L('Informe entrada e stop (aba Risco) primeiro', 'Enter entry and stop (Risk tab) first'), 'err')
    const r = positionSize({ balance: equity, riskPct: settings().defaultRiskPct, entry: v.entry_price, stop: v.stop_loss, multiplier: v.multiplier, fx: c.fx.rate, step: SIZE_STEP[v.asset_class] })
    if (!r || r.size <= 0) return app.toast(L('Risco pequeno demais para 1 unidade', 'Risk too small for one unit'), 'err')
    set('quantity', r.size)
    app.toast(L(`Quantidade ${num(r.size, 4, { min: 0 })} para arriscar ${pct(settings().defaultRiskPct, 2)} (${money(r.actualRisk, cur)})`, `Size ${num(r.size, 4, { min: 0 })} risks ${pct(settings().defaultRiskPct, 2)} (${money(r.actualRisk, cur)})`), 'ok')
  }
  const getQuote = async () => {
    setQuoting(true)
    try {
      const prov = ins?.provider && ins.provider_id ? [ins.provider, ins.provider_id] : ['yahoo', yahooSymbol(v.symbol, v.asset_class)]
      const q = await fetchQuote(prov[0], prov[1], v.symbol)
      setV((o) => ({ ...o, mark_price: q.price, mark_at: q.at, mark_source: `${q.source}${q.delayed ? ' (delayed)' : ''}` }))
      if (id) setMark(id, q.price, q.at, q.source)
      app.toast(`${v.symbol}: ${num(q.price, 6, { min: 2 })} · ${q.source} · ${quoteAge(q.at)}`, 'ok')
    } catch (e) {
      app.toast(L('Cotação indisponível: ', 'Quote unavailable: ') + String((e as Error).message ?? e), 'err')
    } finally {
      setQuoting(false)
    }
  }

  const save = async (again = false) => {
    setTried(true)
    const keys = Object.keys(errs)
    if (keys.length) {
      setTab(tabOf[keys[0]] ?? 'main')
      app.toast(L('Revise os campos destacados', 'Check the highlighted fields'), 'err')
      return
    }
    setSaving(true)
    try {
      const payload = { ...v, portfolio_id: v.portfolio_id, symbol: v.symbol }
      if (v.status !== 'closed') Object.assign(payload, { exit_at: null, exit_price: null, manual_pnl: null })
      else if (manual) Object.assign(payload, { exit_price: null })
      else Object.assign(payload, { manual_pnl: null })
      if (v.status !== 'open') Object.assign(payload, { mark_price: null, mark_at: null, mark_source: null })
      const tid = saveTrade({ ...payload, id: existing?.id }, { tags: tagIds, mistakes: mistakeIds })
      for (const rid of removed) await deleteImage(rid)
      for (const x of pending) await addImage(tid, x.kind, { name: x.file.name, bytes: new Uint8Array(await x.file.arrayBuffer()), mime: x.file.type || 'image/png' })
      app.toast(existing ? L('Operação atualizada', 'Trade updated') : L('Operação registrada com sucesso!', 'Trade recorded!'), 'ok')
      onSaved?.(tid)
      if (again) {
        pending.forEach((x) => URL.revokeObjectURL(x.url))
        setPending([])
        setRemoved([])
        setTagIds([])
        setMistakeIds([])
        setTried(false)
        setManual(false)
        setTab('main')
        setV(blank({ portfolio_id: v.portfolio_id, asset_class: v.asset_class, strategy_id: v.strategy_id }))
      } else onClose()
    } catch (e) {
      app.toast(String((e as Error).message ?? e), 'err')
    } finally {
      setSaving(false)
    }
  }

  const stored = id ? tradeImages(id).filter((i) => !removed.includes(i.id)) : []
  const addPending = (kind: PendingImage['kind']) => (files: File[]) => setPending((l) => [...l, ...files.map((f) => ({ key: uid(), kind, file: f, url: URL.createObjectURL(f) }))])
  const rmPending = (key: string) =>
    setPending((l) => {
      const x = l.find((i) => i.key === key)
      if (x) URL.revokeObjectURL(x.url)
      return l.filter((i) => i.key !== key)
    })
  const imgCount = stored.length + pending.length
  const strategiesList = strategies().filter((s) => s.active || s.id === v.strategy_id)

  const tabs: [Tab, string, number?][] = [
    ['main', L('Dados principais', 'Main details')],
    ['risk', L('Risco & alvos', 'Risk & targets')],
    ['journal', L('Diário', 'Journal')],
    ['images', L('Prints', 'Screenshots'), imgCount]
  ]

  return (
    <Modal
      title={existing ? L('Editar operação', 'Edit trade') : L('Nova operação', 'New trade')}
      onClose={onClose}
      xl
      className="trade-modal"
      foot={
        <>
          <span className="xs muted grow desk-only">{L('Ctrl+N abre uma nova operação de qualquer tela', 'Ctrl+N opens a new trade from anywhere')}</span>
          <button className="btn" onClick={onClose}>
            {L('Cancelar', 'Cancel')}
          </button>
          {!existing && (
            <button className="btn" onClick={() => save(true)} disabled={saving}>
              {L('Salvar e registrar outra', 'Save & add another')}
            </button>
          )}
          <button className="btn primary" onClick={() => save(false)} disabled={saving}>
            {saving ? <Spinner size={14} /> : <I.ok />} {existing ? L('Salvar alterações', 'Save changes') : L('Criar operação', 'Create trade')}
          </button>
        </>
      }
    >
      <div className="trade-form">
        <div className="tf-main">
          <div className="tabs" role="tablist">
            {tabs.map(([k, l, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
                {!!n && <span className="tab-n">{n}</span>}
                {tried && Object.keys(errs).some((e) => (tabOf[e] ?? 'main') === k) && <span className="tab-err" />}
              </button>
            ))}
          </div>

          {tab === 'main' && (
            <div className="form-grid">
              <Field label={L('Carteira', 'Portfolio')} error={E('portfolio')}>
                <PortfolioSelect value={v.portfolio_id} onChange={(x) => set('portfolio_id', x)} />
              </Field>
              <Field label="Status" help={L('Planejada e aberta não exigem dados de saída. Só operações fechadas entram nas estatísticas.', 'Planned and open trades need no exit data. Only closed trades count in statistics.')}>
                <Seg
                  value={v.status}
                  onChange={setStatus}
                  options={[
                    ['planned', L('Planejada', 'Planned')],
                    ['open', L('Aberta', 'Open')],
                    ['closed', L('Fechada', 'Closed')],
                    ['cancelled', L('Cancelada', 'Cancelled')]
                  ]}
                />
              </Field>
              <Field label={L('Ativo', 'Asset')} error={E('symbol')} hint={v.asset_name ?? undefined}>
                <AssetPicker symbol={v.symbol} logo={ins?.logo} cls={v.asset_class} onType={typeSymbol} onPick={pickInstrument} autoFocus={!existing} invalid={!!E('symbol')} />
              </Field>
              <Field label={L('Classe do ativo', 'Asset class')}>
                <select className="select" value={v.asset_class} onChange={(e) => setClass(e.target.value as AssetClass)}>
                  {ASSET_CLASSES.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L('Direção', 'Direction')}>
                <div className="dir-pick">
                  <button type="button" className={'long' + (v.direction === 'long' ? ' on' : '')} onClick={() => set('direction', 'long')}>
                    <I.arrowUp /> Long / {L('Compra', 'Buy')}
                  </button>
                  <button type="button" className={'short' + (v.direction === 'short' ? ' on' : '')} onClick={() => set('direction', 'short')}>
                    <I.arrowDown /> Short / {L('Venda', 'Sell')}
                  </button>
                </div>
              </Field>
              <Field label={L('Estratégia / setup', 'Strategy / setup')}>
                <select className="select" value={v.strategy_id ?? ''} onChange={(e) => set('strategy_id', e.target.value || null)}>
                  <option value="">{L('— Nenhuma —', '— None —')}</option>
                  {strategiesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="full fieldset">
                <div className="fieldset-title">{L('Entrada', 'Entry')}</div>
                <div className="form-grid g3f">
                  <Field label={L('Data e hora', 'Date & time')} error={E('entry_at')}>
                    <input className="input" type="datetime-local" value={v.entry_at ?? ''} onChange={(e) => set('entry_at', e.target.value || null)} />
                  </Field>
                  <Field label={L('Preço de entrada', 'Entry price')} error={E('entry_price')}>
                    <NumInput value={v.entry_price} onChange={(x) => set('entry_price', x)} invalid={!!E('entry_price')} />
                  </Field>
                  <Field
                    label={v.asset_class === 'forex' ? L('Lotes', 'Lots') : v.asset_class === 'futures' ? L('Contratos', 'Contracts') : L('Quantidade', 'Quantity')}
                    error={E('quantity')}
                    hint={
                      <button type="button" className="link" onClick={sizeFromRisk}>
                        {L(`Calcular pelo risco (${pct(settings().defaultRiskPct, 1)})`, `Size from risk (${pct(settings().defaultRiskPct, 1)})`)}
                      </button>
                    }
                  >
                    <NumInput value={v.quantity} onChange={(x) => set('quantity', x)} invalid={!!E('quantity')} />
                  </Field>
                </div>
                <div className="spec-line">
                  <Field
                    label={L('Multiplicador / tamanho do contrato', 'Multiplier / contract size')}
                    help={L('Quanto vale 1,0 de movimento de preço por unidade de quantidade: 1 para ações e cripto, 100.000 por lote no forex, R$0,20 por ponto no WIN, $50 no ES…', 'Value of a 1.0 price move per unit of quantity: 1 for stocks and crypto, 100,000 per forex lot, $50 per point on ES, R$0.20 on WIN…')}
                    error={E('multiplier')}
                  >
                    <NumInput value={v.multiplier} onChange={(x) => (set('multiplier', x ?? 0), setMultTouched(true))} />
                  </Field>
                  {spec && (
                    <span className="spec-chip">
                      <I.sparkles width={13} height={13} /> {spec.label}
                      {v.multiplier !== spec.multiplier && (
                        <button type="button" className="link" onClick={() => set('multiplier', spec.multiplier)}>
                          {L('usar', 'use')}
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {v.status === 'closed' && (
                <div className="full fieldset">
                  <div className="fieldset-title row between">
                    <span>{L('Saída', 'Exit')}</span>
                    <label className="chk xs">
                      <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
                      {L('Informar só o resultado (sem preços)', 'Enter the result only (no prices)')}
                    </label>
                  </div>
                  <div className="form-grid g3f">
                    <Field label={L('Data e hora', 'Date & time')} error={E('exit_at')}>
                      <input className="input" type="datetime-local" value={v.exit_at ?? ''} onChange={(e) => set('exit_at', e.target.value || null)} />
                    </Field>
                    {manual ? (
                      <Field label={`${L('Resultado bruto', 'Gross result')} (${cur})`} help={L('Lucro (positivo) ou prejuízo (negativo) antes das taxas.', 'Profit (positive) or loss (negative) before fees.')} error={E('manual')}>
                        <NumInput value={v.manual_pnl} onChange={(x) => set('manual_pnl', x)} placeholder={L('Ex: 100,00 ou -50,00', 'e.g. 100.00 or -50.00')} invalid={!!E('manual')} />
                      </Field>
                    ) : (
                      <Field label={L('Preço de saída', 'Exit price')} error={E('exit_price')}>
                        <NumInput value={v.exit_price} onChange={(x) => set('exit_price', x)} invalid={!!E('exit_price')} />
                      </Field>
                    )}
                    <Field label={`${L('Taxas & comissões', 'Fees & commissions')} (${cur})`} error={E('fees')}>
                      <NumInput value={v.fees} onChange={(x) => set('fees', x ?? 0)} placeholder="0" />
                    </Field>
                  </div>
                  <label className="chk small" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={!!v.is_be} onChange={(e) => set('is_be', e.target.checked ? 1 : 0)} />
                    {L('Marcar como breakeven (BE)', 'Mark as breakeven (BE)')} <Help text={L('Conta como BE nas estatísticas, mesmo com pequeno lucro/prejuízo.', 'Counts as BE in statistics, even with a small profit/loss.')} />
                  </label>
                </div>
              )}
              {v.status !== 'closed' && (
                <div className="full fieldset">
                  <div className="fieldset-title">{L('Custos', 'Costs')}</div>
                  <div className="form-grid g3f">
                    <Field label={`${L('Taxas & comissões', 'Fees & commissions')} (${cur})`} error={E('fees')}>
                      <NumInput value={v.fees} onChange={(x) => set('fees', x ?? 0)} placeholder="0" />
                    </Field>
                  </div>
                  {v.status === 'planned' && <p className="xs muted" style={{ marginTop: 6 }}>{L('Operação planejada: registre o plano agora e complete a entrada/saída depois.', 'Planned trade: record the plan now and fill in entry/exit later.')}</p>}
                </div>
              )}
            </div>
          )}

          {tab === 'risk' && (
            <div className="form-grid">
              <Field label="Stop-loss">
                <NumInput value={v.stop_loss} onChange={(x) => set('stop_loss', x)} />
              </Field>
              <Field label="Take-profit">
                <NumInput value={v.take_profit} onChange={(x) => set('take_profit', x)} />
              </Field>
              <Field label={`${L('Risco manual', 'Manual risk')} (${cur}) — ${L('opcional', 'optional')}`} help={L('Use quando o risco não vem do stop (ex.: risco definido em dinheiro). Substitui o cálculo entrada × stop.', 'Use when risk is not defined by a stop (e.g. fixed money risk). Overrides the entry × stop calculation.')}>
                <NumInput value={v.risk_amount} onChange={(x) => set('risk_amount', x)} placeholder={c.risk && !v.risk_amount ? num(c.risk, 2) : ''} />
              </Field>
              <Field label={L('R:R planejado — opcional', 'Planned R:R — optional')} help={L('Calculado de entrada, stop e alvo. Preencha para substituir.', 'Calculated from entry, stop and target. Fill in to override.')}>
                <NumInput value={v.planned_rr} onChange={(x) => set('planned_rr', x)} placeholder={c.plannedRR ? ratio(c.plannedRR) : 'ex: 3'} />
              </Field>
              {(c.fx.quoteCurrency && c.fx.quoteCurrency !== cur) || v.fx_rate ? (
                <Field
                  label={`${L('Câmbio', 'FX rate')} ${c.fx.quoteCurrency ?? '?'} → ${cur}`}
                  help={L('Converte o resultado da moeda de cotação do ativo para a moeda da carteira.', "Converts the result from the asset's quote currency to the portfolio currency.")}
                  hint={c.fx.auto && !c.fx.warning ? L(`Automático: ${num(c.fx.rate, 6)}`, `Automatic: ${num(c.fx.rate, 6)}`) : c.fx.warning ?? undefined}
                >
                  <NumInput value={v.fx_rate} onChange={(x) => set('fx_rate', x)} placeholder={num(c.fx.rate, 6)} />
                </Field>
              ) : null}
              {v.status === 'open' && (
                <Field
                  label={L('Preço atual (marcação)', 'Current price (mark)')}
                  className="full"
                  help={L('Usado para o P&L não realizado e o patrimônio. Digite ou busque uma cotação.', 'Used for unrealized P&L and equity. Type it or fetch a quote.')}
                  hint={v.mark_at ? `${v.mark_source ?? L('manual', 'manual')} · ${quoteAge(v.mark_at)} ${L('atrás', 'ago')}` : undefined}
                >
                  <div className="row">
                    <NumInput value={v.mark_price} onChange={(x) => setV((o) => ({ ...o, mark_price: x, mark_at: x === null ? null : new Date().toISOString(), mark_source: L('manual', 'manual') }))} />
                    <button type="button" className="btn" onClick={getQuote} disabled={quoting || !v.symbol}>
                      {quoting ? <Spinner size={13} /> : <I.globe />} {L('Buscar cotação', 'Fetch quote')}
                    </button>
                  </div>
                </Field>
              )}
              <div className="full risk-visual">
                <RiskBar dir={v.direction} entry={v.entry_price} stop={v.stop_loss} target={v.take_profit} exit={manual ? null : v.exit_price ?? v.mark_price} />
              </div>
            </div>
          )}

          {tab === 'journal' && (
            <div className="form-grid">
              <Field label={L('Sessão do mercado', 'Market session')}>
                <select className="select" value={v.session_id ?? ''} onChange={(e) => set('session_id', e.target.value || null)}>
                  <option value="">{L('— Nenhuma —', '— None —')}</option>
                  {lookups('session').map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L('Sentimento', 'Sentiment')}>
                <select className="select" value={v.sentiment_id ?? ''} onChange={(e) => set('sentiment_id', e.target.value || null)}>
                  <option value="">{L('— Nenhum —', '— None —')}</option>
                  {lookups('sentiment').map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={L('Seguiu o plano?', 'Followed the plan?')} help={L('Alimenta o indicador "Disciplina do plano" no Dashboard.', 'Feeds the "Plan discipline" widget on the Dashboard.')}>
                <Seg
                  value={v.followed_plan === 1 ? 'y' : v.followed_plan === 0 ? 'n' : '-'}
                  onChange={(x) => set('followed_plan', x === 'y' ? 1 : x === 'n' ? 0 : null)}
                  options={[
                    ['y', L('Sim', 'Yes')],
                    ['n', L('Não', 'No')],
                    ['-', '—']
                  ]}
                />
              </Field>
              <Field label={L('Erros cometidos', 'Mistakes')} className="full">
                <div className="chips">
                  {lookups('mistake').map((m) => (
                    <button type="button" key={m.id} className={'chip' + (mistakeIds.includes(m.id) ? ' on red' : '')} onClick={() => setMistakeIds((l) => (l.includes(m.id) ? l.filter((x) => x !== m.id) : [...l, m.id]))}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Tags" className="full">
                <div className="chips">
                  {allTags().map((t) => (
                    <button type="button" key={t.id} className={'chip' + (tagIds.includes(t.id) ? ' on' : '')} style={tagIds.includes(t.id) ? { background: t.color, borderColor: t.color } : undefined} onClick={() => setTagIds((l) => (l.includes(t.id) ? l.filter((x) => x !== t.id) : [...l, t.id]))}>
                      #{t.name}
                    </button>
                  ))}
                  <form
                    className="chip-add"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const n = newTag.trim().replace(/^#/, '')
                      if (!n) return
                      const ex = allTags().find((t) => t.name.toLowerCase() === n.toLowerCase())
                      const tid = ex?.id ?? saveTag({ name: n })
                      setTagIds((l) => (l.includes(tid) ? l : [...l, tid]))
                      setNewTag('')
                    }}
                  >
                    <input className="input sm" placeholder={L('+ nova tag', '+ new tag')} value={newTag} onChange={(e) => setNewTag(e.target.value)} />
                  </form>
                </div>
              </Field>
              <Field label={L('Notas e observações', 'Notes & observations')} className="full">
                <textarea className="input" rows={5} placeholder={L('Por que entrou? O que viu no gráfico? O que faria diferente?', 'Why did you enter? What did the chart show? What would you do differently?')} value={v.notes ?? ''} onChange={(e) => set('notes', e.target.value || null)} />
              </Field>
            </div>
          )}

          {tab === 'images' && (
            <div className="img-grid">
              <ImageDrop
                kind="entry"
                title={L('Prints da entrada', 'Entry screenshots')}
                stored={stored.filter((i) => i.kind === 'entry')}
                pending={pending.filter((x) => x.kind === 'entry')}
                onAdd={addPending('entry')}
                onRemovePending={rmPending}
                onRemoveStored={(rid) => setRemoved((l) => [...l, rid])}
                onReplaceStored={(rid, f) => (setRemoved((l) => [...l, rid]), addPending('entry')([f]))}
              />
              <ImageDrop
                kind="exit"
                title={L('Prints da saída', 'Exit screenshots')}
                stored={stored.filter((i) => i.kind === 'exit')}
                pending={pending.filter((x) => x.kind === 'exit')}
                onAdd={addPending('exit')}
                onRemovePending={rmPending}
                onRemoveStored={(rid) => setRemoved((l) => [...l, rid])}
                onReplaceStored={(rid, f) => (setRemoved((l) => [...l, rid]), addPending('exit')([f]))}
              />
              <p className="xs muted full">{L('As imagens são salvas junto com a operação quando você clicar em Salvar. Prints da entrada continuam guardados quando você fechar a operação e adicionar os da saída.', 'Images are stored with the trade when you click Save. Entry screenshots stay when you later close the trade and add exit ones.')}</p>
            </div>
          )}
        </div>

        <aside className="tf-side">
          <div className="calc-panel">
            <div className="row between">
              <span className="kpi-label">{v.status === 'open' ? L('Não realizado', 'Unrealized') : L('Resultado líquido', 'Net result')}</span>
              <Outcome o={c.outcome} />
            </div>
            <div className={'calc-big ' + ((c.net ?? c.unrealized ?? 0) > 0 ? 'pos' : (c.net ?? c.unrealized ?? 0) < 0 ? 'neg' : '')}>
              {v.status === 'closed' ? money(c.net, cur, { sign: true }) : v.status === 'open' ? money(c.unrealized, cur, { sign: true }) : '—'}
            </div>
            <dl className="calc-list">
              <dt>{L('Bruto', 'Gross')}</dt>
              <dd><Money v={c.gross} currency={cur} sign /></dd>
              <dt>{L('Taxas', 'Fees')}</dt>
              <dd className="neg">{v.fees ? money(-v.fees, cur) : '—'}</dd>
              <dt>{L('Retorno', 'Return')}</dt>
              <dd>{pct(c.returnPct, 2, { sign: true })}</dd>
              <dt>{L('Múltiplo de R', 'R multiple')}</dt>
              <dd>{c.rMultiple !== null ? num(c.rMultiple, 2, { sign: true }) + 'R' : '—'}</dd>
              <dt>{L('Risco', 'Risk')}</dt>
              <dd>{c.risk ? money(c.risk, cur) : '—'}</dd>
              <dt>{L('Risco da conta', 'Account risk')}</dt>
              <dd className={riskPct && riskPct > 2 ? 'warn-txt' : ''}>{pct(riskPct, 2)}</dd>
              <dt>{L('Lucro potencial', 'Potential profit')}</dt>
              <dd>{c.reward ? money(c.reward, cur) : '—'}</dd>
              <dt>{L('R:R planejado', 'Planned R:R')}</dt>
              <dd>{c.plannedRR ? '1:' + ratio(c.plannedRR) : '—'}</dd>
              <dt>{L('Tamanho da posição', 'Position value')}</dt>
              <dd>{c.notional ? money(c.notional, cur) : '—'}</dd>
              <dt>{L('Duração', 'Duration')}</dt>
              <dd>{duration(c.holdMinutes)}</dd>
            </dl>
            {shownIssues.length > 0 && (
              <div className="calc-issues">
                {shownIssues.map((i) => (
                  <div key={i}>
                    <I.warn width={13} height={13} /> {translateIssue(i)}
                  </div>
                ))}
              </div>
            )}
            <p className="xs muted" style={{ marginTop: 10 }}>
              {L('Calculado com a quantidade, o multiplicador, a direção e as taxas.', 'Calculated from quantity, multiplier, direction and fees.')} {p && `${L('Moeda', 'Currency')}: ${cur}`}
            </p>
          </div>
        </aside>
      </div>
    </Modal>
  )
}

export function translateIssue(s: string): string {
  const m: Record<string, string> = {
    'Closed trade without exit price or result': 'Operação fechada sem preço de saída ou resultado',
    'Stop-loss is above the entry of a long trade': 'Stop-loss acima da entrada numa compra',
    'Stop-loss is below the entry of a short trade': 'Stop-loss abaixo da entrada numa venda',
    'Take-profit is below the entry of a long trade': 'Alvo abaixo da entrada numa compra',
    'Take-profit is above the entry of a short trade': 'Alvo acima da entrada numa venda',
    'Exit time is before the entry time': 'Saída antes da entrada',
    'Quantity must be greater than zero': 'Quantidade deve ser maior que zero'
  }
  if (m[s]) return L(m[s], s)
  const fx = s.match(/^Result is in (\w+); set a (\w+)→(\w+) rate to convert$/)
  if (fx) return L(`Resultado em ${fx[1]}: informe o câmbio ${fx[2]}→${fx[3]} na aba Risco`, s)
  return s
}

/** Visual of stop · entry · target (and exit/mark) on one line. */
export function RiskBar({ dir, entry, stop, target, exit }: { dir: 'long' | 'short'; entry: number | null; stop: number | null; target: number | null; exit: number | null }) {
  if (entry === null || (stop === null && target === null)) return <div className="xs muted">{L('Informe entrada, stop e alvo para ver o gráfico de risco.', 'Enter entry, stop and target to see the risk chart.')}</div>
  const pts = [entry, stop, target, exit].filter((x): x is number => x !== null)
  const lo = Math.min(...pts)
  const hi = Math.max(...pts)
  const span = hi - lo || 1
  const pos = (x: number) => ((x - lo) / span) * 100
  const flip = dir === 'short'
  const P = (x: number) => (flip ? 100 - pos(x) : pos(x))
  return (
    <div className="riskbar">
      {stop !== null && <div className="rb-zone loss" style={{ left: Math.min(P(stop), P(entry)) + '%', width: Math.abs(P(entry) - P(stop)) + '%' }} />}
      {target !== null && <div className="rb-zone win" style={{ left: Math.min(P(target), P(entry)) + '%', width: Math.abs(P(target) - P(entry)) + '%' }} />}
      {stop !== null && <Mark at={P(stop)} label="SL" v={stop} cls="loss" />}
      <Mark at={P(entry)} label={L('Entrada', 'Entry')} v={entry} cls="entry" />
      {target !== null && <Mark at={P(target)} label="TP" v={target} cls="win" />}
      {exit !== null && <Mark at={P(exit)} label={L('Saída', 'Exit')} v={exit} cls="exit" />}
    </div>
  )
}
function Mark({ at, label, v, cls }: { at: number; label: string; v: number; cls: string }) {
  return (
    <div className={'rb-mark ' + cls} style={{ left: at + '%' }}>
      <span className="rb-l">{label}</span>
      <span className="rb-v">{num(v, 5, { min: 0 })}</span>
    </div>
  )
}
