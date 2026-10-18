import { useEffect, useRef, useState } from 'react'
import { useApp, Empty, Field, Modal, NumInput, Swatches, Spinner, Help, Money } from '../components/ui'
import { I } from '../components/icons'
import { AssetLogo, Icon3D } from '../components/visual'
import { ASSET_CLASSES, classLabel } from '../components/AssetPicker'
import { flowLabel } from '../components/PortfolioModal'
import { TradingDefaults, SecureAction } from './Settings'
import { L } from '../lib/i18n'
import { CURRENCIES, fdate, fdatetime, money, num, todayIso } from '../lib/format'
import {
  cashFlows, counts, deleteInstrument, deleteLookup, deleteStrategy, deleteTag, history, instruments, lookups, portfolioMap, portfolioMetrics, portfolios,
  saveInstrument, saveLookup, saveStrategy, saveTag, setPortfolioStatus, strategies, tags, trades, deleteImage
} from '../lib/repo'
import { checkImages, checkRecords, type Issue } from '../lib/integrity'
import { cashFlowsCsv, commitImport, download, portfoliosCsv, previewImport, templateCsv, tradesCsv, type ImportPreview } from '../lib/csv'
import { backupBytes, isDesktop, rawSize, replaceWith, useDbVersion, type AppInfo } from '../lib/db'
import { removeImageFile } from '../lib/images'
import { settings } from '../lib/settings'
import { signedFlow } from '../lib/stats'
import type { AssetClass, Instrument, LookupKind } from '../lib/types'

export function Admin({ tab }: { tab: string }) {
  const app = useApp()
  useDbVersion()
  const T: [string, string][] = [
    ['records', L('Registros', 'Records')],
    ['options', L('Estratégias & opções', 'Strategies & options')],
    ['data', L('Importar / exportar', 'Import / export')],
    ['check', L('Verificação de dados', 'Data check')]
  ]
  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{L('Administração', 'Administration')}</h2>
          <p>{L('Gerencie seus registros, opções, importações e a qualidade dos dados', 'Manage your records, options, imports and data quality')}</p>
        </div>
      </div>
      <div className="tabs page-tabs">
        {T.map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => app.nav('admin', { tab: k })}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'records' && <Records />}
      {tab === 'options' && <Options />}
      {tab === 'data' && <DataTab />}
      {tab === 'check' && <CheckTab />}
    </div>
  )
}

function Records() {
  const app = useApp()
  const c = counts()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [editIns, setEditIns] = useState<Instrument | 'new' | null>(null)
  useEffect(() => {
    window.api?.info().then(setInfo)
  }, [])
  const pm = portfolioMap()
  const tiles: [string, number, Parameters<typeof Icon3D>[0]['icon'], () => void][] = [
    [L('Carteiras', 'Portfolios'), c.portfolios, 'wallet', () => app.nav('portfolios')],
    [L('Operações', 'Trades'), c.trades, 'candles', () => app.nav('trades', {})],
    [L('Movimentações', 'Cash movements'), c.cash_flows, 'transfer', () => document.getElementById('flows')?.scrollIntoView({ behavior: 'smooth' })],
    [L('Ativos no catálogo', 'Catalog assets'), c.instruments, 'layers', () => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })],
    [L('Estratégias', 'Strategies'), c.strategies, 'target', () => app.nav('admin', { tab: 'options' })],
    ['Tags', c.tags, 'tag', () => app.nav('admin', { tab: 'options' })],
    [L('Prints', 'Screenshots'), c.trade_images, 'image', () => app.nav('tools', { tab: 'journal' })],
    [L('Notas de revisão', 'Review notes'), c.trade_notes, 'note', () => app.nav('tools', { tab: 'journal' })]
  ]
  return (
    <div>
      <div className="tiles">
        {tiles.map(([l, n, ic, on]) => (
          <button key={l} className="tile" onClick={on}>
            <Icon3D icon={ic} size={38} />
            <span className="tile-l">{l}</span>
            <b>{n}</b>
          </button>
        ))}
      </div>

      <div className="card mt">
        <div className="card-head">
          <h3>{L('Carteiras', 'Portfolios')}</h3>
          <button className="btn sm" onClick={() => app.editPortfolio(null)}>
            <I.plus /> {L('Nova', 'New')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>{L('Nome', 'Name')}</th>
                <th>{L('Moeda', 'Currency')}</th>
                <th>Status</th>
                <th className="money">{L('Operações', 'Trades')}</th>
                <th className="money">{L('Patrimônio', 'Equity')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {portfolios().map((p) => {
                const m = portfolioMetrics(p)
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <span className="dot" style={{ background: p.color }} /> <b>{p.name}</b>
                      </span>
                    </td>
                    <td>{p.currency}</td>
                    <td>
                      <select className="select sm" value={p.status} onChange={(e) => setPortfolioStatus(p.id, e.target.value as 'active')}>
                        <option value="active">{L('Ativa', 'Active')}</option>
                        <option value="locked">{L('Bloqueada', 'Locked')}</option>
                        <option value="archived">{L('Arquivada', 'Archived')}</option>
                      </select>
                    </td>
                    <td className="money">{m.closed + m.open + m.planned}</td>
                    <td className="money">{money(m.equity, p.currency)}</td>
                    <td>
                      <div className="row row-actions">
                        <button className="icon-btn" onClick={() => app.editPortfolio(p.id)} title={L('Editar', 'Edit')}>
                          <I.edit />
                        </button>
                        <button className="icon-btn" onClick={() => app.nav('portfolios', { portfolioId: p.id })} title={L('Abrir', 'Open')}>
                          <I.chevronRight />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card" id="flows">
          <div className="card-head">
            <h3>{L('Movimentações de caixa', 'Cash movements')}</h3>
            <button className="btn sm" onClick={() => app.editCashFlow({})}>
              <I.plus /> {L('Nova', 'New')}
            </button>
          </div>
          {cashFlows().length ? (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="t">
                <tbody>
                  {cashFlows().map((f) => (
                    <tr key={f.id} className="click" onClick={() => app.editCashFlow({ id: f.id })}>
                      <td className="small">{fdate(f.date)}</td>
                      <td>{pm[f.portfolio_id]?.name}</td>
                      <td className="small">{flowLabel(f.kind)}</td>
                      <td className="money">
                        <Money v={signedFlow(f)} currency={pm[f.portfolio_id]?.currency} sign />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<I.transfer />} title={L('Nenhuma movimentação', 'No cash movements')} />
          )}
        </div>
        <div className="card" id="catalog">
          <div className="card-head">
            <h3>{L('Catálogo de ativos', 'Asset catalog')}</h3>
            <button className="btn sm" onClick={() => setEditIns('new')}>
              <I.plus /> {L('Novo', 'New')}
            </button>
          </div>
          {instruments().length ? (
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="t">
                <tbody>
                  {instruments().map((i) => (
                    <tr key={i.id} className="click" onClick={() => setEditIns(i)}>
                      <td>
                        <div className="row">
                          <AssetLogo symbol={i.symbol} logo={i.logo} cls={i.asset_class} size={24} />
                          <b>{i.symbol}</b>
                          <span className="xs muted ellipsis" style={{ maxWidth: 140 }}>{i.name}</span>
                        </div>
                      </td>
                      <td className="small">{classLabel(i.asset_class)}</td>
                      <td className="money small">× {num(i.multiplier, 6, { min: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon={<I.layers />} title={L('Catálogo vazio', 'Catalog is empty')} />
          )}
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <div className="card-head">
            <h3>{L('Informações do sistema', 'System information')}</h3>
          </div>
          <div className="card-body">
            <dl className="kv2">
              <dt>{L('Versão', 'Version')}</dt>
              <dd>{info?.version ?? '1.0.0'} {isDesktop() ? `· Electron ${info?.electron ?? ''}` : L('· modo navegador', '· browser mode')}</dd>
              <dt>{L('Banco de dados', 'Database')}</dt>
              <dd>SQLite · {num(rawSize() / 1024, 0)} KB</dd>
              <dt>{L('Pasta de dados', 'Data folder')}</dt>
              <dd className="mono xs" style={{ wordBreak: 'break-all' }}>{info?.dataDir ?? 'IndexedDB (navegador)'}</dd>
              <dt>{L('Backups automáticos', 'Automatic backups')}</dt>
              <dd>{isDesktop() ? L('1 por dia, últimos 30', '1 per day, last 30') : L('Indisponível no navegador — exporte backups em Importar/exportar', 'Not available in the browser — export backups in Import/export')}</dd>
              <dt>{L('Chaves de API', 'API keys')}</dt>
              <dd>{isDesktop() ? (info?.keyEncryption ? L('Criptografadas pelo sistema (fora do banco)', 'Encrypted by the OS keychain (outside the database)') : L('Arquivo local fora do banco', 'Local file outside the database')) : L('No servidor de desenvolvimento (.data/keys.json)', 'On the dev server (.data/keys.json)')}</dd>
              <dt>{L('Usuários', 'Users')}</dt>
              <dd>{L('Aplicativo de usuário único; proteja com senha em Configurações › Segurança', 'Single-user app; protect it with a password in Settings › Security')}</dd>
            </dl>
            {isDesktop() && (
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn sm" onClick={() => window.api!.openFolder('data')}>
                  <I.folder /> {L('Abrir pasta de dados', 'Open data folder')}
                </button>
                <button className="btn sm" onClick={() => window.api!.openFolder('backups')}>
                  <I.folder /> {L('Abrir backups', 'Open backups')}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L('Histórico de atividades', 'Activity history')}</h3>
          </div>
          <div className="table-wrap" style={{ maxHeight: 330 }}>
            <table className="t">
              <tbody>
                {history(150).map((h) => (
                  <tr key={h.id}>
                    <td className="xs muted" style={{ whiteSpace: 'nowrap' }}>{fdatetime(h.at.replace(' ', 'T').slice(0, 16))}</td>
                    <td className="small">{h.action}</td>
                    <td className="xs muted ellipsis" style={{ maxWidth: 200 }}>{h.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {editIns && <InstrumentModal ins={editIns === 'new' ? null : editIns} onClose={() => setEditIns(null)} />}
    </div>
  )
}

function InstrumentModal({ ins, onClose }: { ins: Instrument | null; onClose(): void }) {
  const app = useApp()
  const [v, setV] = useState<Partial<Instrument>>(ins ?? { symbol: '', asset_class: 'stock', multiplier: 1 })
  const set = <K extends keyof Instrument>(k: K, x: Instrument[K]) => setV((o) => ({ ...o, [k]: x }))
  const used = ins ? trades().filter((t) => t.instrument_id === ins.id).length : 0
  return (
    <Modal
      title={ins ? L('Editar ativo', 'Edit asset') : L('Novo ativo', 'New asset')}
      sub={ins && used ? L(`Usado em ${used} operação(ões). O multiplicador de operações já registradas não muda.`, `Used in ${used} trade(s). The multiplier of recorded trades does not change.`) : undefined}
      onClose={onClose}
      foot={
        <>
          {ins && (
            <button
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                if (await app.confirm({ title: L('Remover ativo?', 'Remove asset?'), message: L('As operações mantêm o símbolo.', 'Trades keep their symbol.'), ok: L('Remover', 'Remove'), danger: true })) (deleteInstrument(ins.id), onClose())
              }}
            >
              <I.trash />
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {L('Cancelar', 'Cancel')}
          </button>
          <button
            className="btn primary"
            disabled={!v.symbol?.trim() || !(v.multiplier! > 0)}
            onClick={() => {
              saveInstrument({ ...v, symbol: v.symbol! })
              app.toast(L('Ativo salvo', 'Asset saved'), 'ok')
              onClose()
            }}
          >
            {L('Salvar', 'Save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={L('Símbolo', 'Symbol')}>
          <input className="input" value={v.symbol ?? ''} onChange={(e) => set('symbol', e.target.value.toUpperCase())} autoFocus />
        </Field>
        <Field label={L('Classe', 'Class')}>
          <select className="select" value={v.asset_class} onChange={(e) => set('asset_class', e.target.value as AssetClass)}>
            {ASSET_CLASSES.map(([k, l]) => (
              <option key={k} value={k}>
                {l()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={L('Nome', 'Name')} className="full">
          <input className="input" value={v.name ?? ''} onChange={(e) => set('name', e.target.value || null)} />
        </Field>
        <Field label={L('Multiplicador / contrato', 'Multiplier / contract')}>
          <NumInput value={v.multiplier} onChange={(x) => set('multiplier', x ?? 1)} />
        </Field>
        <Field label={L('Moeda de cotação', 'Quote currency')}>
          <select className="select" value={v.quote_currency ?? ''} onChange={(e) => set('quote_currency', e.target.value || null)}>
            <option value="">{L('— Igual à carteira —', '— Same as portfolio —')}</option>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Tick">
          <NumInput value={v.tick_size} onChange={(x) => set('tick_size', x)} />
        </Field>
        <Field label={L('Bolsa', 'Exchange')}>
          <input className="input" value={v.exchange ?? ''} onChange={(e) => set('exchange', e.target.value || null)} />
        </Field>
      </div>
    </Modal>
  )
}

function Options() {
  const app = useApp()
  const [newS, setNewS] = useState('')
  return (
    <div>
      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <h3>{L('Estratégias / setups', 'Strategies / setups')}</h3>
            <Help text={L('Desativar esconde a estratégia de novas operações sem mexer no histórico.', 'Deactivating hides a strategy from new trades without touching history.')} />
          </div>
          <div className="card-body">
            {strategies().map((s) => {
              const n = trades().filter((t) => t.strategy_id === s.id).length
              return (
                <div key={s.id} className="opt-row">
                  <input type="color" className="color-in" value={s.color} onChange={(e) => saveStrategy({ ...s, color: e.target.value })} aria-label={L('Cor', 'Color')} />
                  <input className="input grow" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && saveStrategy({ ...s, name: e.target.value })} />
                  <input className="input grow hide-sm" placeholder={L('Descrição / regras', 'Description / rules')} defaultValue={s.description ?? ''} onBlur={(e) => e.target.value !== (s.description ?? '') && saveStrategy({ ...s, description: e.target.value || null })} />
                  <span className="xs muted" style={{ width: 52, textAlign: 'right' }}>{n} ops</span>
                  <label className="chk xs" title={L('Ativa', 'Active')}>
                    <input type="checkbox" checked={!!s.active} onChange={(e) => saveStrategy({ ...s, active: e.target.checked ? 1 : 0 })} />
                  </label>
                  <button
                    className="icon-btn red"
                    onClick={async () => (await app.confirm({ title: L('Excluir estratégia?', 'Delete strategy?'), message: n ? L(`${n} operação(ões) ficarão sem estratégia.`, `${n} trade(s) will have no strategy.`) : s.name, ok: L('Excluir', 'Delete'), danger: true })) && deleteStrategy(s.id)}
                    aria-label={L('Excluir', 'Delete')}
                  >
                    <I.trash />
                  </button>
                </div>
              )
            })}
            <form
              className="row mt"
              onSubmit={(e) => {
                e.preventDefault()
                if (newS.trim()) (saveStrategy({ name: newS }), setNewS(''))
              }}
            >
              <input className="input grow" placeholder={L('Nova estratégia…', 'New strategy…')} value={newS} onChange={(e) => setNewS(e.target.value)} />
              <button className="btn" disabled={!newS.trim()}>
                <I.plus /> {L('Adicionar', 'Add')}
              </button>
            </form>
          </div>
        </div>
        <TagsCard />
      </div>
      <div className="grid g3 mt">
        <LookupCard kind="session" title={L('Sessões de mercado', 'Market sessions')} />
        <LookupCard kind="sentiment" title={L('Sentimentos', 'Sentiments')} />
        <LookupCard kind="mistake" title={L('Erros comuns', 'Common mistakes')} />
      </div>
      <div className="card mt">
        <div className="card-head">
          <h3>{L('Padrões para novas operações', 'Defaults for new trades')}</h3>
        </div>
        <div className="card-body">
          <TradingDefaults />
        </div>
      </div>
    </div>
  )
}

function TagsCard() {
  const app = useApp()
  const [n, setN] = useState('')
  const [color, setColor] = useState('#8b5cf6')
  return (
    <div className="card">
      <div className="card-head">
        <h3>Tags</h3>
      </div>
      <div className="card-body">
        <div className="chips">
          {tags().map((t) => (
            <span key={t.id} className="chip tag-edit" style={{ borderColor: t.color, color: t.color }}>
              #
              <input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && saveTag({ ...t, name: e.target.value })} size={Math.max(4, t.name.length)} aria-label="Tag" />
              <button onClick={async () => (await app.confirm({ title: L('Excluir tag?', 'Delete tag?'), message: '#' + t.name, ok: L('Excluir', 'Delete'), danger: true })) && deleteTag(t.id)} aria-label={L('Excluir', 'Delete')}>
                ✕
              </button>
            </span>
          ))}
        </div>
        <form
          className="col mt"
          onSubmit={(e) => {
            e.preventDefault()
            if (!n.trim()) return
            if (tags().some((t) => t.name.toLowerCase() === n.trim().toLowerCase())) return app.toast(L('Essa tag já existe', 'That tag already exists'), 'err')
            saveTag({ name: n.replace(/^#/, ''), color })
            setN('')
          }}
        >
          <Swatches value={color} onChange={setColor} />
          <div className="row">
            <input className="input grow" placeholder={L('Nova tag…', 'New tag…')} value={n} onChange={(e) => setN(e.target.value)} />
            <button className="btn" disabled={!n.trim()}>
              <I.plus /> {L('Adicionar', 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LookupCard({ kind, title }: { kind: LookupKind; title: string }) {
  const app = useApp()
  const [n, setN] = useState('')
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
      </div>
      <div className="card-body">
        {lookups(kind).map((l, i, arr) => (
          <div key={l.id} className="opt-row">
            <input type="color" className="color-in" value={l.color} onChange={(e) => saveLookup({ ...l, color: e.target.value })} aria-label={L('Cor', 'Color')} />
            <input className="input grow" defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && saveLookup({ ...l, name: e.target.value })} />
            <button className="icon-btn" disabled={i === 0} onClick={() => (saveLookup({ ...l, sort: arr[i - 1].sort - 1 }))} aria-label={L('Subir', 'Move up')}>
              ▲
            </button>
            <button className="icon-btn red" onClick={async () => (await app.confirm({ title: L('Excluir opção?', 'Delete option?'), message: l.name, ok: L('Excluir', 'Delete'), danger: true })) && deleteLookup(l.id)} aria-label={L('Excluir', 'Delete')}>
              <I.trash />
            </button>
          </div>
        ))}
        <form
          className="row mt"
          onSubmit={(e) => {
            e.preventDefault()
            if (n.trim()) (saveLookup({ kind, name: n, color: kind === 'mistake' ? '#ef4444' : '#64748b' }), setN(''))
          }}
        >
          <input className="input grow" placeholder={L('Nova opção…', 'New option…')} value={n} onChange={(e) => setN(e.target.value)} />
          <button className="btn" disabled={!n.trim()}>
            <I.plus />
          </button>
        </form>
      </div>
    </div>
  )
}

function DataTab() {
  const app = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState<string | null>(null)
  const [fname, setFname] = useState('')
  const [fallback, setFallback] = useState(settings().defaultPortfolioId ?? '')
  const [skipDup, setSkipDup] = useState(true)
  const [cur, setCur] = useState(settings().currency)
  const [restoreBytes, setRestoreBytes] = useState<Uint8Array | null>(null)
  const preview: ImportPreview | null = text ? previewImport(text, fallback || null) : null
  const okRows = preview ? preview.rows.filter((r) => !r.errors.length && !(skipDup && r.duplicate)) : []
  const errRows = preview ? preview.rows.filter((r) => r.errors.length) : []

  const exportAll = (what: 'trades' | 'portfolios' | 'flows') => {
    const d = todayIso()
    const p =
      what === 'trades'
        ? download(`trades-${d}.csv`, tradesCsv())
        : what === 'portfolios'
          ? download(`portfolios-${d}.csv`, portfoliosCsv((id) => portfolioMetrics(portfolios().find((x) => x.id === id)!)))
          : download(`cash-movements-${d}.csv`, cashFlowsCsv())
    p.then((f) => f && app.toast(L('Arquivo exportado', 'File exported'), 'ok'))
  }
  return (
    <div>
      <div className="grid g-main">
        <div className="card">
          <div className="card-head">
            <h3>{L('Importar operações (CSV)', 'Import trades (CSV)')}</h3>
            <button className="btn sm" onClick={() => download('smart-trader-template.csv', templateCsv())}>
              <I.download /> {L('Baixar modelo', 'Download template')}
            </button>
          </div>
          <div className="card-body">
            {!preview ? (
              <div
                className="drop"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) (setFname(f.name), setText(await f.text()))
                }}
              >
                <I.upload className="drop-ico" />
                <h4 style={{ marginTop: 8 }}>{L('Arraste um CSV ou clique para escolher', 'Drop a CSV or click to choose')}</h4>
                <p className="small muted">{L('Colunas em inglês ou português (carteira, ativo, tipo, entrada, saída, quantidade, resultado…). Separador vírgula ou ponto e vírgula.', 'Columns in English or Portuguese (portfolio, symbol, direction, entry, exit, quantity, result…). Comma or semicolon separated.')}</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) (setFname(f.name), setText(await f.text())); e.target.value = '' }} />
              </div>
            ) : (
              <>
                <div className="row wrap" style={{ marginBottom: 12 }}>
                  <span className="file-chip">
                    <I.statement /> {fname}
                  </span>
                  <span className="badge green">{okRows.length} {L('prontas', 'ready')}</span>
                  {errRows.length > 0 && <span className="badge red">{errRows.length} {L('com erro', 'with errors')}</span>}
                  {preview.rows.some((r) => r.duplicate) && <span className="badge amber">{preview.rows.filter((r) => r.duplicate).length} {L('duplicadas', 'duplicates')}</span>}
                  <button className="btn ghost sm" onClick={() => setText(null)}>
                    {L('Trocar arquivo', 'Change file')}
                  </button>
                </div>
                <div className="form-grid" style={{ marginBottom: 12 }}>
                  <Field label={L('Carteira para linhas sem carteira', 'Portfolio for rows without one')}>
                    <select className="select" value={fallback} onChange={(e) => setFallback(e.target.value)}>
                      <option value="">{L('— Nenhuma —', '— None —')}</option>
                      {portfolios().map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {preview.newPortfolios.length > 0 && (
                    <Field label={L(`Moeda das novas carteiras (${preview.newPortfolios.join(', ')})`, `Currency for new portfolios (${preview.newPortfolios.join(', ')})`)}>
                      <select className="select" value={cur} onChange={(e) => setCur(e.target.value)}>
                        {CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <label className="chk small">
                    <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> {L('Ignorar duplicadas', 'Skip duplicates')}
                  </label>
                </div>
                {preview.unknown.length > 0 && <div className="alert amber small" style={{ marginBottom: 10 }}>{L('Colunas ignoradas', 'Ignored columns')}: {preview.unknown.join(', ')}</div>}
                {preview.newStrategies.length > 0 && <div className="alert blue small" style={{ marginBottom: 10 }}>{L('Novas estratégias serão criadas', 'New strategies will be created')}: {preview.newStrategies.join(', ')}</div>}
                <div className="table-wrap" style={{ maxHeight: 360 }}>
                  <table className="t">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{L('Carteira', 'Portfolio')}</th>
                        <th>{L('Ativo', 'Asset')}</th>
                        <th>{L('Status', 'Status')}</th>
                        <th>{L('Entrada', 'Entry')}</th>
                        <th>{L('Validação', 'Validation')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 300).map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'row-err' : r.duplicate && skipDup ? 'dim' : ''}>
                          <td className="xs muted">{r.line}</td>
                          <td className="small">{r.data.portfolioName}</td>
                          <td>
                            <b>{r.data.symbol}</b> <span className="xs muted">{r.data.direction}</span>
                          </td>
                          <td className="small">{r.data.status}</td>
                          <td className="small">{fdatetime(r.data.entry_at)}</td>
                          <td className="xs">
                            {r.errors.map((e) => (
                              <div key={e} className="neg">✕ {e}</div>
                            ))}
                            {r.warnings.map((e) => (
                              <div key={e} className="warn-txt">! {e}</div>
                            ))}
                            {!r.errors.length && !r.warnings.length && <span className="pos">✓ OK</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <button
                    className="btn primary"
                    disabled={!okRows.length}
                    onClick={async () => {
                      const ok = await app.confirm({
                        title: L('Importar operações?', 'Import trades?'),
                        message: L(`${okRows.length} operação(ões) serão importadas.${errRows.length ? ` ${errRows.length} linha(s) com erro serão ignoradas.` : ''} Ctrl+Z desfaz.`, `${okRows.length} trade(s) will be imported.${errRows.length ? ` ${errRows.length} row(s) with errors will be skipped.` : ''} Ctrl+Z undoes it.`),
                        ok: L('Importar', 'Import')
                      })
                      if (!ok) return
                      const nimp = commitImport(preview, { skipDuplicates: skipDup, currency: cur })
                      app.toast(L(`${nimp} operação(ões) importada(s)`, `${nimp} trade(s) imported`), 'ok')
                      setText(null)
                    }}
                  >
                    <I.upload /> {L(`Importar ${okRows.length} operação(ões)`, `Import ${okRows.length} trade(s)`)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <h3>{L('Exportar', 'Export')}</h3>
            </div>
            <div className="card-body col">
              <button className="btn" onClick={() => exportAll('trades')}>
                <I.download /> {L('Operações (CSV)', 'Trades (CSV)')}
              </button>
              <button className="btn" onClick={() => exportAll('portfolios')}>
                <I.download /> {L('Carteiras com saldos (CSV)', 'Portfolios with balances (CSV)')}
              </button>
              <button className="btn" onClick={() => exportAll('flows')}>
                <I.download /> {L('Movimentações de caixa (CSV)', 'Cash movements (CSV)')}
              </button>
              <button className="btn" onClick={() => app.nav('tools', { tab: 'journal' })}>
                <I.statement /> {L('Relatório de performance (PDF/CSV)…', 'Performance report (PDF/CSV)…')}
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h3>{L('Backup completo', 'Full backup')}</h3>
              <Help text={L('Arquivo .sqlite com todos os registros e configurações (criptografado se houver senha). Os prints ficam na pasta de dados.', 'A .sqlite file with every record and setting (encrypted when a password is set). Screenshots stay in the data folder.')} />
            </div>
            <div className="card-body col">
              <button className="btn primary" onClick={async () => (await download(`smart-trader-backup-${todayIso()}.sqlite`, await backupBytes(), 'application/octet-stream')) && app.toast(L('Backup salvo', 'Backup saved'), 'ok')}>
                <I.download /> {L('Salvar backup', 'Save backup')}
              </button>
              <button className="btn danger" onClick={() => restoreRef.current?.click()}>
                <I.upload /> {L('Restaurar backup…', 'Restore backup…')}
              </button>
              <input ref={restoreRef} type="file" accept=".sqlite,.db" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRestoreBytes(new Uint8Array(await f.arrayBuffer())); e.target.value = '' }} />
            </div>
          </div>
        </div>
      </div>
      {restoreBytes && (
        <SecureAction
          title={L('Restaurar backup?', 'Restore backup?')}
          message={L('Todos os dados atuais serão substituídos pelo backup. Se o backup tiver senha, digite-a abaixo.', 'All current data will be replaced by the backup. If the backup has a password, type it below.')}
          ok={L('Restaurar', 'Restore')}
          askBackupPassword
          onClose={() => setRestoreBytes(null)}
          onConfirm={async (bpw) => {
            try {
              await replaceWith(restoreBytes, bpw || undefined)
              app.toast(L('Backup restaurado', 'Backup restored'), 'ok')
              setRestoreBytes(null)
            } catch (er) {
              app.toast(String((er as Error).message) === 'PASSWORD_REQUIRED' ? L('Este backup tem senha', 'This backup is password protected') : L('Arquivo inválido ou senha errada', 'Invalid file or wrong password'), 'err')
            }
          }}
        />
      )}
    </div>
  )
}

function CheckTab() {
  const app = useApp()
  const issues = checkRecords()
  const [img, setImg] = useState<Awaited<ReturnType<typeof checkImages>> | null>(null)
  const [busy, setBusy] = useState(false)
  const runImg = async () => {
    setBusy(true)
    setImg(await checkImages())
    setBusy(false)
  }
  useEffect(() => {
    runImg()
  }, [])
  const lvl = (l: Issue['level']) => (l === 'error' ? 'red' : l === 'warn' ? 'amber' : 'blue')
  return (
    <div>
      {!issues.length && img && !img.missing.length && !img.orphans.length ? (
        <div className="card success-card">
          <div className="card-body row">
            <Icon3D icon="ok" size="lg" sec="business" />
            <div>
              <h3>{L('Tudo certo!', 'All good!')}</h3>
              <p className="muted small">{L('Nenhuma inconsistência encontrada nos registros.', 'No inconsistencies found in your records.')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {issues.map((i) => (
            <div key={i.id} className={'card issue ' + lvl(i.level)}>
              <div className="card-body">
                <div className="row between wrap">
                  <div className="row">
                    <span className={'badge ' + lvl(i.level)}>{i.level === 'error' ? L('Erro', 'Error') : i.level === 'warn' ? L('Atenção', 'Warning') : 'Info'}</span>
                    <b>{i.title}</b>
                    {i.tradeIds.length > 0 && <span className="badge gray">{i.tradeIds.length}</span>}
                  </div>
                  {i.id === 'rates' && (
                    <button className="btn sm" onClick={() => app.nav('settings', { tab: 'currency' })}>
                      {L('Configurar câmbio', 'Set rates')}
                    </button>
                  )}
                </div>
                <p className="small muted" style={{ margin: '6px 0' }}>{i.detail}</p>
                {i.tradeIds.length > 0 && (
                  <div className="chips">
                    {i.tradeIds.slice(0, 20).map((id) => {
                      const t = trades().find((x) => x.id === id)
                      return (
                        <button key={id} className="chip" onClick={() => app.viewTrade(id)}>
                          {t?.symbol} · {fdate(t?.entry_at)}
                        </button>
                      )
                    })}
                    {i.tradeIds.length > 20 && <span className="xs muted">+{i.tradeIds.length - 20}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="card">
            <div className="card-head">
              <h3>{L('Arquivos de prints', 'Screenshot files')}</h3>
              <button className="btn sm" onClick={runImg} disabled={busy}>
                {busy ? <Spinner size={13} /> : <I.refresh />} {L('Verificar de novo', 'Check again')}
              </button>
            </div>
            <div className="card-body">
              {!img ? (
                <Spinner />
              ) : (
                <>
                  <p className="small">
                    {img.missing.length ? <span className="neg">{L(`${img.missing.length} print(s) sem arquivo`, `${img.missing.length} screenshot(s) missing their file`)}</span> : <span className="pos">{L('Todos os prints têm arquivo.', 'Every screenshot has its file.')}</span>}
                    {' · '}
                    {img.orphans.length ? <span className="warn-txt">{L(`${img.orphans.length} arquivo(s) sem operação`, `${img.orphans.length} file(s) not linked to any trade`)}</span> : L('Nenhum arquivo solto.', 'No orphan files.')}
                  </p>
                  <div className="row" style={{ marginTop: 8 }}>
                    {img.missing.length > 0 && (
                      <button className="btn sm" onClick={async () => { for (const m of img.missing) await deleteImage(m.id); runImg(); app.toast(L('Registros removidos', 'Records removed'), 'ok') }}>
                        {L('Remover registros sem arquivo', 'Remove records without file')}
                      </button>
                    )}
                    {img.orphans.length > 0 && (
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          if (!(await app.confirm({ title: L('Apagar arquivos soltos?', 'Delete orphan files?'), message: L(`${img.orphans.length} arquivo(s) de imagem que nenhuma operação usa serão apagados.`, `${img.orphans.length} image file(s) no trade uses will be deleted.`), ok: L('Apagar', 'Delete'), danger: true }))) return
                          for (const f of img.orphans) await removeImageFile(f)
                          runImg()
                        }}
                      >
                        {L('Apagar arquivos soltos', 'Delete orphan files')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
