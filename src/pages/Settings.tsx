import { useEffect, useState, type ReactNode } from 'react'
import { useApp, Field, Help, Modal, NumInput, Seg, PortfolioSelect, Spinner, Swatches } from '../components/ui'
import { I } from '../components/icons'
import { ASSET_CLASSES } from '../components/AssetPicker'
import { PERIODS } from '../components/shared'
import { L, setLang, getLang } from '../lib/i18n'
import { CURRENCIES, fdate, fdatetime, money, num, todayIso } from '../lib/format'
import { DEFAULTS, saveSettings, settings, useSettings, WIDGETS, type Settings, type WidgetId } from '../lib/settings'
import { fxRates, portfolios, setFxRate, strategies } from '../lib/repo'
import { fetchFx, marketStatus, setProviderKey } from '../lib/market'
import { backupBytes, hasPassword, setPassword, verifyPassword, wipe } from '../lib/db'
import { download } from '../lib/csv'
import type { AssetClass } from '../lib/types'
import type { Grouping, PeriodPreset } from '../lib/stats'

const WIDGET_LABEL: Record<WidgetId, () => string> = {
  kpis: () => L('Indicadores principais', 'Key indicators'),
  equity: () => L('Evolução do saldo', 'Balance chart'),
  portfolios: () => L('Carteiras, saldo e total de operações', 'Portfolios, balance & trade count'),
  quality: () => L('Acerto, lucro/perda e drawdown vs período anterior', 'Win rate, win/loss & drawdown vs previous'),
  avgWinLoss: () => L('Ganho / perda média', 'Average win / loss'),
  rr: () => L('Risco/retorno médio', 'Average risk/reward'),
  discipline: () => L('Disciplina do plano', 'Plan discipline'),
  sessions: () => L('Sessões de mercado', 'Market sessions'),
  sentiment: () => L('Sentimento', 'Sentiment'),
  hours: () => L('Análise de horários', 'Time-of-day analysis'),
  calendar: () => L('Calendário de resultados', 'P&L calendar'),
  recent: () => L('Operações recentes', 'Recent trades')
}

export function SettingsPage({ tab }: { tab: string }) {
  const app = useApp()
  const saved = useSettings()
  const [d, setD] = useState<Settings>(saved)
  const [lang, setL] = useState(getLang())
  const dirty = JSON.stringify(d) !== JSON.stringify(saved) || lang !== getLang()
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setD((o) => ({ ...o, [k]: v }))
  const save = () => {
    saveSettings(d)
    app.toast(L('Configurações salvas', 'Settings saved'), 'ok')
    if (lang !== getLang()) setTimeout(() => setLang(lang), 50)
  }
  const T: [string, string][] = [
    ['general', L('Geral', 'General')],
    ['profile', L('Perfil', 'Profile')],
    ['currency', L('Moeda & câmbio', 'Currency & FX')],
    ['trading', L('Trading', 'Trading')],
    ['dashboard', L('Dashboard & gráficos', 'Dashboard & charts')],
    ['reminders', L('Lembretes', 'Reminders')],
    ['integrations', L('Integrações', 'Integrations')],
    ['security', L('Dados & segurança', 'Data & security')]
  ]
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Configurações', 'Settings')}</h2>
          <p>{L('Personalize o aplicativo e suas preferências de trading', 'Personalize the app and your trading preferences')}</p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={L('Seções', 'Sections')}>
          {T.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => app.nav('settings', { tab: k })}>
              {l}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === 'general' && (
            <Section title={L('Aparência e formatos', 'Appearance & formats')}>
              <div className="form-grid">
                <Field label={L('Tema', 'Theme')}>
                  <Seg value={d.theme} onChange={(v) => set('theme', v)} options={[['light', L('Claro', 'Light')], ['dark', L('Escuro', 'Dark')], ['system', L('Sistema', 'System')]]} />
                </Field>
                <Field label={L('Idioma', 'Language')}>
                  <Seg value={lang} onChange={(v) => setL(v)} options={[['pt', 'Português'], ['en', 'English']]} />
                </Field>
                <Field label={L('Formato de data', 'Date format')}>
                  <select className="select" value={d.dateFormat} onChange={(e) => set('dateFormat', e.target.value as Settings['dateFormat'])}>
                    <option value="DD/MM/YYYY">DD/MM/AAAA (18/10/2026)</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY (10/18/2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-18)</option>
                  </select>
                </Field>
                <Field label={L('Formato de hora', 'Time format')}>
                  <Seg value={d.timeFormat} onChange={(v) => set('timeFormat', v)} options={[['24h', '24h (14:30)'], ['12h', '12h (2:30 PM)']]} />
                </Field>
                <Field label={L('Formato de números', 'Number format')}>
                  <select className="select" value={d.numberLocale} onChange={(e) => set('numberLocale', e.target.value)}>
                    <option value="pt-BR">1.234,56 (pt-BR)</option>
                    <option value="en-US">1,234.56 (en-US)</option>
                    <option value="de-DE">1.234,56 (de-DE)</option>
                    <option value="fr-FR">1 234,56 (fr-FR)</option>
                    <option value="en-IN">1,23,456.78 (en-IN)</option>
                  </select>
                </Field>
                <Field label={L('Casas decimais (valores)', 'Decimal places (amounts)')}>
                  <select className="select" value={d.moneyDecimals} onChange={(e) => set('moneyDecimals', +e.target.value)}>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={L('Casas decimais (preços)', 'Decimal places (prices)')}>
                  <select className="select" value={String(d.priceDecimals)} onChange={(e) => set('priceDecimals', e.target.value === 'auto' ? 'auto' : +e.target.value)}>
                    <option value="auto">{L('Automático (conforme o preço)', 'Automatic (by price)')}</option>
                    {[0, 1, 2, 3, 4, 5, 6, 8].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={L('Exibição da moeda', 'Currency display')}>
                  <select className="select" value={d.currencyDisplay} onChange={(e) => set('currencyDisplay', e.target.value as Settings['currencyDisplay'])}>
                    <option value="symbol">{L('Símbolo (R$, US$)', 'Symbol ($, R$)')}</option>
                    <option value="narrowSymbol">{L('Símbolo curto ($)', 'Narrow symbol ($)')}</option>
                    <option value="code">{L('Código (BRL, USD)', 'Code (USD, BRL)')}</option>
                  </select>
                </Field>
              </div>
              <PreviewLine d={d} />
            </Section>
          )}

          {tab === 'profile' && (
            <Section title={L('Perfil', 'Profile')}>
              <div className="form-grid">
                <Field label={L('Nome', 'Name')}>
                  <input className="input" value={d.profileName} onChange={(e) => set('profileName', e.target.value)} placeholder={L('Seu nome', 'Your name')} />
                </Field>
                <Field label="E-mail">
                  <input className="input" type="email" value={d.profileEmail} onChange={(e) => set('profileEmail', e.target.value)} placeholder="trader@email.com" />
                </Field>
                <Field label={L('Cor do avatar', 'Avatar color')} className="full">
                  <Swatches value={d.avatarColor} onChange={(c) => set('avatarColor', c)} />
                </Field>
              </div>
              <p className="xs muted" style={{ marginTop: 10 }}>{L('Seus dados ficam só neste computador; nada é enviado para servidores.', 'Your data stays on this computer; nothing is sent to any server.')}</p>
            </Section>
          )}

          {tab === 'currency' && (
            <>
              <Section title={L('Moeda preferida', 'Preferred currency')}>
                <Field label={L('Moeda dos totais consolidados', 'Currency for consolidated totals')} help={L('Usada no Dashboard e nas análises com "Todas as carteiras". Uma carteira sozinha aparece na própria moeda.', 'Used on the Dashboard and analytics for "All portfolios". A single portfolio shows in its own currency.')}>
                  <select className="select" value={d.currency} onChange={(e) => set('currency', e.target.value)} style={{ maxWidth: 240 }}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </Section>
              <FxRates currency={d.currency} />
            </>
          )}

          {tab === 'trading' && (
            <Section title={L('Padrões para novas operações', 'Defaults for new trades')}>
              <TradingDefaults value={d} onChange={setD} />
            </Section>
          )}

          {tab === 'dashboard' && (
            <>
              <Section title={L('Widgets do Dashboard', 'Dashboard widgets')} sub={L('Escolha o que aparece e a ordem.', 'Choose what shows and in which order.')}>
                <div className="widget-list">
                  {d.widgetOrder.map((w, i) => (
                    <div key={w} className="widget-row">
                      <label className="chk grow">
                        <input type="checkbox" checked={d.widgets[w]} onChange={(e) => set('widgets', { ...d.widgets, [w]: e.target.checked })} />
                        {WIDGET_LABEL[w]()}
                      </label>
                      <button className="icon-btn" disabled={i === 0} onClick={() => set('widgetOrder', move(d.widgetOrder, i, -1))} aria-label={L('Subir', 'Move up')}>
                        ▲
                      </button>
                      <button className="icon-btn" disabled={i === d.widgetOrder.length - 1} onClick={() => set('widgetOrder', move(d.widgetOrder, i, 1))} aria-label={L('Descer', 'Move down')}>
                        ▼
                      </button>
                    </div>
                  ))}
                </div>
              </Section>
              <Section title={L('Período e gráficos', 'Period & charts')}>
                <div className="form-grid">
                  <Field label={L('Período padrão', 'Default period')}>
                    <select className="select" value={d.defaultPeriod} onChange={(e) => set('defaultPeriod', e.target.value as PeriodPreset)}>
                      {PERIODS.filter(([k]) => k !== 'custom').map(([k, l]) => (
                        <option key={k} value={k}>
                          {l()}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={L('Agrupamento dos gráficos', 'Chart grouping')}>
                    <select className="select" value={d.chartGrouping} onChange={(e) => set('chartGrouping', e.target.value as Grouping)}>
                      <option value="day">{L('Diário', 'Daily')}</option>
                      <option value="week">{L('Semanal', 'Weekly')}</option>
                      <option value="month">{L('Mensal', 'Monthly')}</option>
                    </select>
                  </Field>
                  <Field label={L('Tipo de linha', 'Line style')}>
                    <Seg value={d.chartCurve} onChange={(v) => set('chartCurve', v)} options={[['monotone', L('Suave', 'Smooth')], ['linear', L('Reta', 'Straight')], ['stepAfter', L('Degraus', 'Steps')]]} />
                  </Field>
                  <Field label={L('Opções', 'Options')}>
                    <label className="chk">
                      <input type="checkbox" checked={d.chartGrid} onChange={(e) => set('chartGrid', e.target.checked)} /> {L('Linhas de grade', 'Grid lines')}
                    </label>
                    <label className="chk">
                      <input type="checkbox" checked={d.chartShowEquity} onChange={(e) => set('chartShowEquity', e.target.checked)} /> {L('Mostrar patrimônio (com abertas)', 'Show equity (incl. open)')}
                    </label>
                  </Field>
                  <Field label={L('Operações por página', 'Trades per page')}>
                    <select className="select" value={d.pageSize} onChange={(e) => set('pageSize', +e.target.value)}>
                      {[10, 25, 50, 100, 200].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Section>
            </>
          )}

          {tab === 'reminders' && (
            <Section title={L('Lembretes no Dashboard', 'Dashboard reminders')} sub={L('Avisos dentro do app (sem notificações externas).', 'In-app notices (no external notifications).')}>
              <div className="col" style={{ gap: 10 }}>
                <label className="chk">
                  <input type="checkbox" checked={d.remindNoStop} onChange={(e) => set('remindNoStop', e.target.checked)} /> {L('Avisar sobre operações abertas sem stop-loss', 'Warn about open trades without a stop-loss')}
                </label>
                <label className="chk">
                  <input type="checkbox" checked={d.remindJournal} onChange={(e) => set('remindJournal', e.target.checked)} /> {L('Lembrar de anotar operações fechadas sem notas', 'Remind me to journal closed trades without notes')}
                </label>
                <Field label={L('Considerar "esquecida" uma operação aberta há mais de (dias)', 'Flag open trades older than (days)')}>
                  <NumInput value={d.staleOpenDays} onChange={(v) => set('staleOpenDays', Math.max(1, Math.round(v ?? 14)))} className="w-120" />
                </Field>
              </div>
            </Section>
          )}

          {tab === 'integrations' && <Integrations d={d} set={set} />}

          {tab === 'security' && <Security />}

          {tab !== 'security' ? (
            <div className="save-bar">
              <span className={'small ' + (dirty ? 'warn-txt' : 'muted')}>{dirty ? L('Alterações não salvas', 'Unsaved changes') : L('Tudo salvo', 'All saved')}</span>
              <span className="grow" />
              <button
                className="btn ghost"
                onClick={async () => {
                  if (await app.confirm({ title: L('Restaurar padrões?', 'Restore defaults?'), message: L('Volta todas as preferências ao padrão (seus registros não são afetados). Perfil e carteira padrão são mantidos.', 'Resets every preference to its default (your records are not affected). Profile and default portfolio are kept.'), ok: L('Restaurar', 'Restore') }))
                    setD({ ...DEFAULTS, profileName: d.profileName, profileEmail: d.profileEmail, avatarColor: d.avatarColor, defaultPortfolioId: d.defaultPortfolioId })
                }}
              >
                {L('Restaurar padrões', 'Restore defaults')}
              </button>
              <button className="btn" disabled={!dirty} onClick={() => (setD(saved), setL(getLang()))}>
                {L('Descartar', 'Discard')}
              </button>
              <button className="btn primary" disabled={!dirty} onClick={save}>
                <I.ok /> {L('Salvar alterações', 'Save changes')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const a = [...arr]
  const [x] = a.splice(i, 1)
  a.splice(i + d, 0, x)
  return a
}

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="card settings-card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {sub && <p className="xs muted">{sub}</p>}
        </div>
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}

function PreviewLine({ d }: { d: Settings }) {
  const fmt = new Intl.NumberFormat(d.numberLocale, { style: 'currency', currency: d.currency.length === 3 ? d.currency : 'USD', currencyDisplay: d.currencyDisplay, minimumFractionDigits: d.moneyDecimals, maximumFractionDigits: d.moneyDecimals })
  const date = d.dateFormat.replace('DD', '18').replace('MM', '10').replace('YYYY', '2026')
  return (
    <div className="preview-line">
      <span className="xs muted">{L('Prévia', 'Preview')}:</span> <b>{fmt.format(12345.678)}</b> · <b>{date}</b> · <b>{d.timeFormat === '12h' ? '2:30 PM' : '14:30'}</b>
    </div>
  )
}

/** Default portfolio, risk and other values used when a new trade opens. Saves directly when used outside Settings. */
export function TradingDefaults({ value, onChange }: { value?: Settings; onChange?(s: Settings): void }) {
  const live = useSettings()
  const app = useApp()
  const d = value ?? live
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    const n = { ...d, [k]: v }
    if (onChange) onChange(n)
    else (saveSettings(n), app.toast(L('Padrão salvo', 'Default saved'), 'ok'))
  }
  return (
    <div className="form-grid">
      <Field label={L('Carteira padrão', 'Default portfolio')}>
        <PortfolioSelect value={d.defaultPortfolioId ?? ''} onChange={(v) => set('defaultPortfolioId', v || null)} allowAll allLabel={L('— Primeira ativa —', '— First active —')} />
      </Field>
      <Field label={L('Risco padrão por operação (%)', 'Default risk per trade (%)')} help={L('Usado em "Calcular pelo risco" e na calculadora de posição.', 'Used by "Size from risk" and the position size calculator.')}>
        <NumInput value={d.defaultRiskPct} onChange={(v) => set('defaultRiskPct', v ?? 1)} suffix="%" />
      </Field>
      <Field label={L('Taxa padrão por operação', 'Default fee per trade')}>
        <NumInput value={d.defaultFees} onChange={(v) => set('defaultFees', v ?? 0)} />
      </Field>
      <Field label={L('Classe de ativo padrão', 'Default asset class')}>
        <select className="select" value={d.defaultAssetClass} onChange={(e) => set('defaultAssetClass', e.target.value as AssetClass)}>
          {ASSET_CLASSES.map(([k, l]) => (
            <option key={k} value={k}>
              {l()}
            </option>
          ))}
        </select>
      </Field>
      <Field label={L('Estratégia padrão', 'Default strategy')}>
        <select className="select" value={d.defaultStrategyId ?? ''} onChange={(e) => set('defaultStrategyId', e.target.value || null)}>
          <option value="">{L('— Nenhuma —', '— None —')}</option>
          {strategies()
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label={L('Tolerância de breakeven', 'Breakeven tolerance')} help={L('Resultados líquidos entre −X e +X (na moeda da carteira) contam como BE.', 'Net results between −X and +X (in portfolio currency) count as BE.')}>
        <NumInput value={d.beTolerance} onChange={(v) => set('beTolerance', Math.abs(v ?? 0))} />
      </Field>
    </div>
  )
}

function FxRates({ currency }: { currency: string }) {
  const app = useApp()
  const rates = fxRates()
  const used = [...new Set([...portfolios().map((p) => p.currency), currency])].filter((c) => c !== 'USD')
  const [extra, setExtra] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const list = [...new Set([...used, ...Object.keys(rates)])].sort()
  const fetchOne = async (c: string) => {
    setBusy(c)
    try {
      const q = await fetchFx(c === 'USDT' ? 'USD' : c, 'USD')
      setFxRate(c, q.price, `${q.source} · ${fdatetime(q.at.slice(0, 16))}`)
      app.toast(`1 ${c} = ${num(q.price, 6)} USD · ${q.source}`, 'ok')
    } catch (e) {
      app.toast(L(`Cotação de ${c} indisponível: `, `${c} rate unavailable: `) + String((e as Error).message ?? e), 'err')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Section title={L('Câmbio', 'Exchange rates')} sub={L('Cotações usadas para somar carteiras de moedas diferentes. Informe à mão ou busque (Yahoo Finance).', 'Rates used to add up portfolios in different currencies. Type them or fetch them (Yahoo Finance).')}>
      <table className="t">
        <thead>
          <tr>
            <th>{L('Moeda', 'Currency')}</th>
            <th>{L('1 unidade = USD', '1 unit = USD')}</th>
            <th className="hide-sm">{L('Atualizado', 'Updated')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr className="dim-row">
            <td>USD</td>
            <td>1</td>
            <td className="hide-sm xs muted">{L('base', 'base')}</td>
            <td />
          </tr>
          {list.map((c) => (
            <tr key={c}>
              <td>
                <b>{c}</b>
              </td>
              <td>
                <NumInput value={rates[c]?.rate ?? null} onChange={(v) => setFxRate(c, v && v > 0 ? v : null, L('manual', 'manual'))} placeholder={L('sem cotação', 'no rate')} className="w-160" />
              </td>
              <td className="hide-sm xs muted">{rates[c] ? `${fdate(rates[c].updated_at.slice(0, 10))} · ${rates[c].source ?? ''}` : '—'}</td>
              <td>
                <button className="btn sm" onClick={() => fetchOne(c)} disabled={busy === c}>
                  {busy === c ? <Spinner size={12} /> : <I.refresh />} {L('Buscar', 'Fetch')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="row mt"
        onSubmit={(e) => {
          e.preventDefault()
          const c = extra.trim().toUpperCase()
          if (/^[A-Z]{3,4}$/.test(c)) (setFxRate(c, null), fetchOne(c), setExtra(''))
        }}
      >
        <input className="input w-120" placeholder="EUR" value={extra} onChange={(e) => setExtra(e.target.value)} maxLength={4} />
        <button className="btn sm">
          <I.plus /> {L('Adicionar moeda', 'Add currency')}
        </button>
      </form>
      {currency !== 'USD' && !rates[currency] && <div className="alert amber small mt">{L(`Sem cotação para ${currency}: carteiras em outras moedas não podem ser convertidas.`, `No ${currency} rate: portfolios in other currencies cannot be converted.`)}</div>}
      <p className="xs muted mt">{L('Exemplo: com 1 BRL = 0,18 USD, uma carteira de R$ 10.000 entra como US$ 1.800 nos totais em dólar.', 'Example: with 1 BRL = 0.18 USD, a R$10,000 portfolio counts as $1,800 in USD totals.')} {money(0, 'USD') && ''}</p>
    </Section>
  )
}

function Integrations({ d, set }: { d: Settings; set<K extends keyof Settings>(k: K, v: Settings[K]): void }) {
  const app = useApp()
  const [keys, setKeys] = useState<Record<string, boolean> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fk, setFk] = useState('')
  const load = () =>
    marketStatus()
      .then((s) => (setKeys(s.keys), setErr(null)))
      .catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => {
    load()
  }, [])
  const P = (k: keyof Settings['providers'], name: string, desc: string, extra?: ReactNode) => (
    <div className="provider">
      <label className="chk">
        <input type="checkbox" checked={d.providers[k]} onChange={(e) => set('providers', { ...d.providers, [k]: e.target.checked })} />
        <b>{name}</b>
      </label>
      <p className="xs muted">{desc}</p>
      {extra}
    </div>
  )
  return (
    <Section title={L('Provedores de dados de mercado', 'Market data providers')} sub={L('Opcional: o app funciona 100% offline para registro e análise. As chamadas saem do processo principal (desktop) — as chaves nunca ficam no navegador.', 'Optional: the app works fully offline for recording and analysis. Requests run in the main process (desktop) — keys never live in the browser.')}>
      {err && <div className="alert red small" style={{ marginBottom: 10 }}>{L('Serviço de mercado indisponível: ', 'Market service unavailable: ')}{err}</div>}
      {P('yahoo', 'Yahoo Finance', L('Ações, ETFs, forex, índices e futuros: busca e cotações. Fonte não oficial e sem garantia; preços podem ter atraso de 15–20 min.', 'Stocks, ETFs, forex, indices and futures: search and quotes. Unofficial, best-effort source; prices may be delayed 15–20 min.'))}
      {P('coingecko', 'CoinGecko', L('Criptomoedas: busca, logos e preço spot agregado em USD (API pública, com limite de requisições).', 'Crypto: search, logos and aggregated USD spot price (public API, rate limited).'))}
      {P(
        'finnhub',
        'Finnhub',
        L('Opcional, com chave gratuita (finnhub.io): busca de ações, logos de empresas e cotações conforme o seu plano.', 'Optional, with a free key (finnhub.io): stock search, company logos and quotes according to your plan.'),
        <div className="row wrap" style={{ marginTop: 6 }}>
          {keys?.finnhub ? <span className="badge green"><I.key width={12} height={12} /> {L('Chave configurada', 'Key configured')}</span> : <span className="badge gray">{L('Sem chave', 'No key')}</span>}
          <input className="input sm" type="password" placeholder={L('Colar chave da API', 'Paste API key')} value={fk} onChange={(e) => setFk(e.target.value)} autoComplete="off" style={{ width: 220 }} />
          <button className="btn sm" disabled={!fk.trim()} onClick={async () => { await setProviderKey('finnhub', fk.trim()); setFk(''); load(); app.toast(L('Chave salva com segurança', 'Key stored securely'), 'ok') }}>
            {L('Salvar chave', 'Save key')}
          </button>
          {keys?.finnhub && (
            <button className="btn sm danger" onClick={async () => { await setProviderKey('finnhub', null); load(); app.toast(L('Chave removida', 'Key removed'), 'ok') }}>
              {L('Remover', 'Remove')}
            </button>
          )}
        </div>
      )}
      <p className="xs muted mt">{L('Lembre de salvar as alterações dos provedores (botão abaixo). Chaves são salvas na hora.', 'Remember to save provider changes (button below). Keys are saved immediately.')}</p>
    </Section>
  )
}

/** Confirmation for sensitive actions: asks the current password when one is set. */
export function SecureAction({ title, message, ok, onConfirm, onClose, askBackupPassword }: { title: string; message: ReactNode; ok: string; onConfirm(backupPw: string): Promise<void> | void; onClose(): void; askBackupPassword?: boolean }) {
  const [pw, setPw] = useState('')
  const [bpw, setBpw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const need = hasPassword()
  return (
    <Modal
      title={title}
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>
            {L('Cancelar', 'Cancel')}
          </button>
          <button
            className="btn danger solid"
            disabled={busy || (need && !pw)}
            onClick={async () => {
              setBusy(true)
              if (need && !(await verifyPassword(pw))) {
                setErr(L('Senha incorreta', 'Wrong password'))
                setBusy(false)
                return
              }
              await onConfirm(bpw)
              setBusy(false)
            }}
          >
            {busy ? <Spinner size={13} /> : null} {ok}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-2)', marginBottom: 12 }}>{message}</p>
      {need && (
        <Field label={L('Confirme sua senha atual', 'Confirm your current password')} error={err || null}>
          <input className="input" type="password" autoFocus value={pw} onChange={(e) => (setPw(e.target.value), setErr(''))} />
        </Field>
      )}
      {askBackupPassword && (
        <Field label={L('Senha do backup (se tiver)', 'Backup password (if any)')}>
          <input className="input" type="password" value={bpw} onChange={(e) => setBpw(e.target.value)} />
        </Field>
      )}
    </Modal>
  )
}

function Security() {
  const app = useApp()
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [act, setAct] = useState<'remove' | 'wipe' | 'change' | null>(null)
  const on = hasPassword()
  const valid = pw1.length >= 6 && pw1 === pw2
  return (
    <>
      <Section title={L('Senha do aplicativo', 'App password')} sub={L('Criptografa o arquivo de dados e os backups com AES-256. Sem a senha os dados não podem ser recuperados.', 'Encrypts the data file and backups with AES-256. Without the password the data cannot be recovered.')}>
        <div className="row" style={{ marginBottom: 10 }}>
          {on ? <span className="badge green"><I.lock width={12} height={12} /> {L('Protegido por senha', 'Password protected')}</span> : <span className="badge amber">{L('Sem senha', 'No password')}</span>}
        </div>
        <div className="form-grid">
          <Field label={on ? L('Nova senha', 'New password') : L('Senha', 'Password')} hint={L('Mínimo 6 caracteres', 'At least 6 characters')}>
            <input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={L('Repita a senha', 'Repeat password')} error={pw2 && pw1 !== pw2 ? L('As senhas não conferem', "Passwords don't match") : null}>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="row mt">
          <button className="btn primary" disabled={!valid} onClick={() => (on ? setAct('change') : setPassword(pw1).then(() => (setPw1(''), setPw2(''), app.toast(L('Senha ativada', 'Password enabled'), 'ok'))))}>
            <I.lock /> {on ? L('Trocar senha', 'Change password') : L('Ativar senha', 'Enable password')}
          </button>
          {on && (
            <button className="btn danger" onClick={() => setAct('remove')}>
              {L('Remover senha', 'Remove password')}
            </button>
          )}
        </div>
      </Section>
      <Section title={L('Backup', 'Backup')}>
        <p className="small muted" style={{ marginBottom: 10 }}>{L('Salve uma cópia completa dos seus dados. Restaurar e importar ficam em Administração › Importar/exportar.', 'Save a full copy of your data. Restore and import are in Administration › Import/export.')}</p>
        <div className="row">
          <button className="btn" onClick={async () => (await download(`smart-trader-backup-${todayIso()}.sqlite`, await backupBytes(), 'application/octet-stream')) && app.toast(L('Backup salvo', 'Backup saved'), 'ok')}>
            <I.download /> {L('Salvar backup agora', 'Save a backup now')}
          </button>
          <button className="btn ghost" onClick={() => app.nav('admin', { tab: 'data' })}>
            {L('Importar / exportar', 'Import / export')} <I.chevronRight />
          </button>
        </div>
      </Section>
      <Section title={L('Zona de perigo', 'Danger zone')}>
        <div className="row between wrap">
          <div>
            <b>{L('Apagar todos os dados', 'Erase all data')}</b>
            <p className="xs muted">{L('Remove carteiras, operações, movimentações e configurações. Faça um backup antes.', 'Removes portfolios, trades, cash movements and settings. Make a backup first.')}</p>
          </div>
          <button className="btn danger" onClick={() => setAct('wipe')}>
            <I.trash /> {L('Apagar tudo…', 'Erase everything…')}
          </button>
        </div>
        <Help text={L('Os arquivos de prints podem ser limpos depois em Administração › Verificação de dados.', 'Screenshot files can be cleaned up afterwards in Administration › Data check.')} />
      </Section>
      {act === 'change' && (
        <SecureAction title={L('Trocar senha?', 'Change password?')} message={L('Os dados serão criptografados com a nova senha.', 'Data will be encrypted with the new password.')} ok={L('Trocar', 'Change')} onClose={() => setAct(null)} onConfirm={async () => { await setPassword(pw1); setPw1(''); setPw2(''); setAct(null); app.toast(L('Senha alterada', 'Password changed'), 'ok') }} />
      )}
      {act === 'remove' && (
        <SecureAction title={L('Remover senha?', 'Remove password?')} message={L('O arquivo de dados deixará de ser criptografado.', 'The data file will no longer be encrypted.')} ok={L('Remover', 'Remove')} onClose={() => setAct(null)} onConfirm={async () => { await setPassword(null); setAct(null); app.toast(L('Senha removida', 'Password removed'), 'ok') }} />
      )}
      {act === 'wipe' && (
        <SecureAction
          title={L('Apagar todos os dados?', 'Erase all data?')}
          message={L('Esta ação apaga todos os registros. Ctrl+Z ainda pode desfazer enquanto o app estiver aberto, mas faça um backup antes.', 'This erases every record. Ctrl+Z can still undo while the app stays open, but make a backup first.')}
          ok={L('Apagar tudo', 'Erase everything')}
          onClose={() => setAct(null)}
          onConfirm={async () => {
            await wipe()
            setAct(null)
            app.toast(L('Dados apagados', 'Data erased'), 'ok')
            app.nav('dashboard')
          }}
        />
      )}
    </>
  )
}

export { settings, WIDGETS }
