import { useState } from 'react'
import { Modal, useApp, Money, Outcome, StatusBadge, DirBadge, Spinner } from './ui'
import { fetchQuote, quoteAge, yahooSymbol } from '../lib/market'
import { I } from './icons'
import { AssetLogo } from './visual'
import { ImageDrop } from './ImageDrop'
import { RiskBar, translateIssue } from './TradeModal'
import { classLabel } from './AssetPicker'
import { L } from '../lib/i18n'
import { fdatetime, money, num, pct, ratio, duration, price } from '../lib/format'
import {
  addImage, addNote, calcOf, deleteImage, deleteNote, deleteTrade, duplicateTrade, instrumentMap, lookupMap, portfolio, strategyMap, setMark,
  tagMap, trade as getTrade, tradeImages, tradeMistakeIndex, tradeNotes, tradeTagIndex
} from '../lib/repo'
import { useDbVersion } from '../lib/db'

/** Read view of one trade: results, plan vs execution, journal, notes timeline and screenshots. */
export function TradeView({ id, onClose }: { id: string; onClose(): void }) {
  useDbVersion()
  const app = useApp()
  const t = getTrade(id)
  const [note, setNote] = useState('')
  const [quoting, setQuoting] = useState(false)
  if (!t) return null
  const refresh = async () => {
    setQuoting(true)
    try {
      const i = t.instrument_id ? instrumentMap()[t.instrument_id] : undefined
      const [prov, pid] = i?.provider && i.provider_id ? [i.provider, i.provider_id] : ['yahoo', yahooSymbol(t.symbol, t.asset_class)]
      const q = await fetchQuote(prov, pid, t.symbol)
      setMark(id, q.price, q.at, `${q.source}${q.delayed ? ' (delayed)' : ''}`)
      app.toast(`${t.symbol}: ${price(q.price)} · ${q.source} · ${quoteAge(q.at)}`, 'ok')
    } catch (e) {
      app.toast(L('Cotação indisponível: ', 'Quote unavailable: ') + String((e as Error).message ?? e), 'err')
    } finally {
      setQuoting(false)
    }
  }
  const c = calcOf(t)
  const p = portfolio(t.portfolio_id)
  const cur = p?.currency
  const ins = t.instrument_id ? instrumentMap()[t.instrument_id] : undefined
  const lk = lookupMap()
  const imgs = tradeImages(id)
  const notes = tradeNotes(id)
  const tg = (tradeTagIndex()[id] ?? []).map((x) => tagMap()[x]).filter(Boolean)
  const mistakes = (tradeMistakeIndex()[id] ?? []).map((x) => lk[x]).filter(Boolean)
  const st = t.strategy_id ? strategyMap()[t.strategy_id] : undefined

  const addFiles = (kind: 'entry' | 'exit' | 'other') => async (files: File[]) => {
    for (const f of files) await addImage(id, kind, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || 'image/png' })
    app.toast(L('Imagem adicionada', 'Image added'), 'ok')
  }
  const removeStored = async (iid: string) => {
    if (await app.confirm({ title: L('Remover imagem?', 'Remove image?'), message: L('O arquivo será apagado.', 'The file will be deleted.'), ok: L('Remover', 'Remove'), danger: true })) await deleteImage(iid)
  }
  const del = async () => {
    if (await app.confirm({ title: L('Excluir operação?', 'Delete trade?'), message: `${t.symbol} · ${fdatetime(t.entry_at)} — ${L('inclui prints e notas. Ctrl+Z desfaz o registro (as imagens apagadas não voltam).', 'includes screenshots and notes. Ctrl+Z restores the record (deleted images are not restored).')}`, ok: L('Excluir', 'Delete'), danger: true })) {
      await deleteTrade(id)
      app.toast(L('Operação excluída', 'Trade deleted'), 'ok')
      onClose()
    }
  }

  return (
    <Modal
      xl
      className="trade-view"
      onClose={onClose}
      title={
        <span className="row" style={{ gap: 12 }}>
          <AssetLogo symbol={t.symbol} logo={ins?.logo} cls={t.asset_class} size={38} />
          <span className="col" style={{ gap: 2 }}>
            <span className="row" style={{ gap: 8 }}>
              {t.symbol} <DirBadge d={t.direction} /> <StatusBadge s={t.status} /> <Outcome o={c.outcome} />
            </span>
            <span className="small muted" style={{ fontWeight: 500 }}>
              {[t.asset_name ?? ins?.name, classLabel(t.asset_class), p?.name, st?.name].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
      }
      foot={
        <>
          <button className="btn danger" onClick={del} style={{ marginRight: 'auto' }}>
            <I.trash /> {L('Excluir', 'Delete')}
          </button>
          <button
            className="btn"
            onClick={() => {
              const nid = duplicateTrade(id)
              if (nid) {
                app.toast(L('Cópia criada como operação planejada', 'Copy created as a planned trade'), 'ok')
                onClose()
                app.editTrade(nid)
              }
            }}
          >
            <I.copy /> {L('Duplicar', 'Duplicate')}
          </button>
          {t.status === 'open' && (
            <button className="btn" onClick={() => (onClose(), app.editTrade(id, { status: 'closed' }))}>
              <I.ok /> {L('Fechar operação', 'Close trade')}
            </button>
          )}
          <button className="btn primary" onClick={() => (onClose(), app.editTrade(id))}>
            <I.edit /> {L('Editar', 'Edit')}
          </button>
        </>
      }
    >
      <div className="tv-kpis">
        <div className="tv-kpi big">
          <span>{t.status === 'open' ? L('Não realizado', 'Unrealized') : L('Resultado líquido', 'Net result')}</span>
          <b className={(c.net ?? c.unrealized ?? 0) >= 0 ? 'pos' : 'neg'}>{t.status === 'open' ? money(c.unrealized, cur, { sign: true }) : money(c.net, cur, { sign: true })}</b>
          {t.status === 'open' && c.unrealized === null && <small className="muted">{L('Sem preço atual', 'No current price')}</small>}
        </div>
        <div className="tv-kpi">
          <span>{L('Bruto', 'Gross')}</span>
          <b><Money v={c.gross} currency={cur} sign /></b>
        </div>
        <div className="tv-kpi">
          <span>{L('Taxas', 'Fees')}</span>
          <b>{money(t.fees, cur)}</b>
        </div>
        <div className="tv-kpi">
          <span>{L('Retorno', 'Return')}</span>
          <b>{pct(c.returnPct, 2, { sign: true })}</b>
        </div>
        <div className="tv-kpi">
          <span>R</span>
          <b>{c.rMultiple !== null ? num(c.rMultiple, 2, { sign: true }) + 'R' : '—'}</b>
        </div>
        <div className="tv-kpi">
          <span>{L('R:R plan.', 'Plan R:R')}</span>
          <b>{c.plannedRR ? '1:' + ratio(c.plannedRR) : '—'}</b>
        </div>
      </div>

      {c.issues.length > 0 && (
        <div className="alert amber" style={{ marginBottom: 14 }}>
          <I.warn width={16} height={16} />
          <div>{c.issues.map((i) => translateIssue(i)).join(' · ')}</div>
        </div>
      )}

      <div className="tv-grid">
        <div className="card">
          <div className="card-head">
            <h3>{L('Execução', 'Execution')}</h3>
          </div>
          <div className="card-body">
            <dl className="kv2">
              <dt>{L('Entrada', 'Entry')}</dt>
              <dd>{fdatetime(t.entry_at)} · <b>{price(t.entry_price)}</b></dd>
              <dt>{L('Saída', 'Exit')}</dt>
              <dd>{t.status === 'closed' ? <>{fdatetime(t.exit_at)} · <b>{t.exit_price !== null ? price(t.exit_price) : L('resultado manual', 'manual result')}</b></> : '—'}</dd>
              <dt>{L('Quantidade', 'Quantity')}</dt>
              <dd>{num(t.quantity, 8, { min: 0 })} × {num(t.multiplier, 6, { min: 0 })}</dd>
              <dt>Stop / {L('Alvo', 'Target')}</dt>
              <dd>{price(t.stop_loss)} / {price(t.take_profit)}</dd>
              <dt>{L('Risco', 'Risk')}</dt>
              <dd>{c.risk ? money(c.risk, cur) : '—'}</dd>
              <dt>{L('Lucro potencial', 'Potential')}</dt>
              <dd>{c.reward ? money(c.reward, cur) : '—'}</dd>
              <dt>{L('Duração', 'Duration')}</dt>
              <dd>{duration(c.holdMinutes)}</dd>
              {t.status === 'open' && (
                <>
                  <dt>{L('Preço atual', 'Mark')}</dt>
                  <dd className="row wrap" style={{ gap: 6 }}>
                    <span>{t.mark_price !== null ? `${price(t.mark_price)} · ${t.mark_source ?? ''} · ${quoteAge(t.mark_at ?? new Date().toISOString())} ${L('atrás', 'ago')}` : '—'}</span>
                    <button className="btn sm" onClick={refresh} disabled={quoting}>
                      {quoting ? <Spinner size={12} /> : <I.refresh />} {L('Atualizar', 'Refresh')}
                    </button>
                  </dd>
                </>
              )}
              {c.fx.rate !== 1 && (
                <>
                  <dt>{L('Câmbio', 'FX')}</dt>
                  <dd>{num(c.fx.rate, 6)} {c.fx.auto ? L('(automático)', '(automatic)') : ''}</dd>
                </>
              )}
            </dl>
            <div style={{ marginTop: 18 }}>
              <RiskBar dir={t.direction} entry={t.entry_price} stop={t.stop_loss} target={t.take_profit} exit={t.exit_price ?? t.mark_price} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>{L('Diário', 'Journal')}</h3>
          </div>
          <div className="card-body">
            <dl className="kv2">
              <dt>{L('Sessão', 'Session')}</dt>
              <dd>{t.session_id ? lk[t.session_id]?.name : '—'}</dd>
              <dt>{L('Sentimento', 'Sentiment')}</dt>
              <dd>{t.sentiment_id ? lk[t.sentiment_id]?.name : '—'}</dd>
              <dt>{L('Seguiu o plano', 'Followed plan')}</dt>
              <dd>{t.followed_plan === 1 ? <span className="badge green">{L('Sim', 'Yes')}</span> : t.followed_plan === 0 ? <span className="badge red">{L('Não', 'No')}</span> : '—'}</dd>
              <dt>{L('Erros', 'Mistakes')}</dt>
              <dd className="chips">{mistakes.length ? mistakes.map((m) => <span key={m.id} className="badge red">{m.name}</span>) : '—'}</dd>
              <dt>Tags</dt>
              <dd className="chips">{tg.length ? tg.map((x) => <span key={x.id} className="badge" style={{ background: x.color + '22', color: x.color }}>#{x.name}</span>) : '—'}</dd>
            </dl>
            {t.notes && <p className="tv-notes">{t.notes}</p>}
            <div className="note-list">
              {notes.map((n) => (
                <div key={n.id} className="note-item">
                  <span className="xs muted">{fdatetime(n.at)}</span>
                  <p>{n.text}</p>
                  <button className="icon-btn red" onClick={() => deleteNote(n.id)} title={L('Excluir nota', 'Delete note')}>
                    <I.trash />
                  </button>
                </div>
              ))}
            </div>
            <form
              className="row"
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                addNote(id, note)
                setNote('')
              }}
            >
              <input className="input grow" placeholder={L('Adicionar nota de revisão…', 'Add a review note…')} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" disabled={!note.trim()}>
                <I.plus /> {L('Nota', 'Note')}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="img-grid" style={{ marginTop: 16 }}>
        <ImageDrop kind="entry" title={L('Prints da entrada', 'Entry screenshots')} stored={imgs.filter((i) => i.kind === 'entry')} pending={[]} onAdd={addFiles('entry')} onRemovePending={() => undefined} onRemoveStored={removeStored} />
        <ImageDrop kind="exit" title={L('Prints da saída', 'Exit screenshots')} stored={imgs.filter((i) => i.kind === 'exit')} pending={[]} onAdd={addFiles('exit')} onRemovePending={() => undefined} onRemoveStored={removeStored} />
      </div>
    </Modal>
  )
}
