import { useEffect, useRef, useState } from 'react'
import { I } from './icons'
import { AssetLogo } from './visual'
import { Spinner } from './ui'
import { L } from '../lib/i18n'
import { instruments, saveInstrument } from '../lib/repo'
import { searchAssets, type AssetHit } from '../lib/market'
import { CLASS_MULTIPLIER, knownSpec, forexPair } from '../lib/calc'
import type { AssetClass, Instrument } from '../lib/types'

export const ASSET_CLASSES: [AssetClass, () => string][] = [
  ['stock', () => L('Ações', 'Stocks')],
  ['etf', () => 'ETFs'],
  ['forex', () => 'Forex'],
  ['crypto', () => L('Cripto', 'Crypto')],
  ['index', () => L('Índices / CFD', 'Indices / CFD')],
  ['futures', () => L('Futuros', 'Futures')],
  ['commodity', () => 'Commodities'],
  ['option', () => L('Opções', 'Options')],
  ['other', () => L('Outros', 'Other')]
]
export const classLabel = (c: string) => ASSET_CLASSES.find((x) => x[0] === c)?.[1]() ?? c

/** Saves a provider search result into the local asset catalog, with contract defaults. */
export function instrumentFromHit(h: AssetHit): string {
  const spec = knownSpec(h.symbol, h.assetClass)
  const pair = h.assetClass === 'forex' ? forexPair(h.symbol) : null
  return saveInstrument({
    symbol: h.assetClass === 'forex' && pair ? pair.join('') : h.symbol,
    name: h.name,
    asset_class: h.assetClass,
    exchange: h.exchange,
    quote_currency: spec?.quoteCurrency ?? pair?.[1] ?? h.currency ?? (h.assetClass === 'crypto' ? 'USD' : null),
    multiplier: spec?.multiplier ?? CLASS_MULTIPLIER[h.assetClass],
    tick_size: spec?.tickSize ?? null,
    logo: h.logo,
    provider: h.provider,
    provider_id: h.providerId
  })
}

/**
 * Symbol field with suggestions from the local catalog and (optionally) online providers.
 * Typing a symbol that is not found still works — manual recording never depends on the internet.
 */
export function AssetPicker(p: { symbol: string; logo?: string | null; cls?: string; onType(symbol: string): void; onPick(i: Instrument): void; autoFocus?: boolean; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState<AssetHit[] | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const q = p.symbol.trim()
  const local = q ? instruments().filter((i) => i.symbol.includes(q.toUpperCase()) || (i.name ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 6) : instruments().slice(0, 6)

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => {
    setOnline(null)
    setErrors([])
  }, [q])

  const searchOnline = async () => {
    if (q.length < 1) return
    setBusy(true)
    try {
      const r = await searchAssets(q)
      setOnline(r.results)
      setErrors(r.errors)
    } catch (e) {
      setOnline([])
      setErrors([String((e as Error).message ?? e)])
    } finally {
      setBusy(false)
    }
  }
  const pickHit = (h: AssetHit) => {
    const id = instrumentFromHit(h)
    const ins = instruments().find((i) => i.id === id)
    if (ins) p.onPick(ins)
    setOpen(false)
  }
  const options: ({ kind: 'local'; i: Instrument } | { kind: 'hit'; h: AssetHit })[] = [...local.map((i) => ({ kind: 'local' as const, i })), ...(online ?? []).map((h) => ({ kind: 'hit' as const, h }))]

  return (
    <div className="asset-picker" ref={box}>
      <div className={'input-icon' + (p.invalid ? ' invalid' : '')}>
        <AssetLogo symbol={p.symbol || '?'} logo={p.logo} cls={p.cls} size={22} />
        <input
          className="input"
          autoFocus={p.autoFocus}
          placeholder={L('Ex: BTCUSDT, PETR4, EURUSD, WINZ25', 'e.g. AAPL, BTCUSDT, EURUSD, ESZ5')}
          value={p.symbol}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            p.onType(e.target.value.toUpperCase())
            setOpen(true)
            setHi(0)
          }}
          onKeyDown={(e) => {
            if (!open) return
            if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(options.length - 1, h + 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(0, h - 1)))
            else if (e.key === 'Enter' && options[hi]) {
              e.preventDefault()
              const o = options[hi]
              if (o.kind === 'local') (p.onPick(o.i), setOpen(false))
              else pickHit(o.h)
            } else if (e.key === 'Escape') setOpen(false)
          }}
          aria-label={L('Ativo', 'Asset')}
          aria-expanded={open}
        />
      </div>
      {open && (
        <div className="ap-menu">
          {local.length > 0 && <div className="ap-group">{L('Seu catálogo', 'Your catalog')}</div>}
          {local.map((i, k) => (
            <button type="button" key={i.id} className={'ap-item' + (hi === k ? ' on' : '')} onMouseEnter={() => setHi(k)} onClick={() => (p.onPick(i), setOpen(false))}>
              <AssetLogo symbol={i.symbol} logo={i.logo} cls={i.asset_class} size={26} />
              <span className="grow ellipsis">
                <b>{i.symbol}</b> <span className="muted small">{i.name}</span>
              </span>
              <span className="badge gray">{classLabel(i.asset_class)}</span>
            </button>
          ))}
          {q && (
            <>
              <div className="ap-group row between">
                <span>{L('Busca online', 'Online search')}</span>
                {online === null && (
                  <button type="button" className="btn sm" onClick={searchOnline} disabled={busy}>
                    {busy ? <Spinner size={12} /> : <I.globe />} {L('Buscar', 'Search')} “{q}”
                  </button>
                )}
              </div>
              {online?.map((h, k) => (
                <button type="button" key={h.provider + h.providerId} className={'ap-item' + (hi === local.length + k ? ' on' : '')} onMouseEnter={() => setHi(local.length + k)} onClick={() => pickHit(h)}>
                  <AssetLogo symbol={h.symbol} logo={h.logo} cls={h.assetClass} size={26} />
                  <span className="grow ellipsis">
                    <b>{h.symbol}</b> <span className="muted small">{h.name}</span>
                  </span>
                  <span className="xs muted">{h.exchange ?? h.provider}</span>
                  <span className="badge gray">{classLabel(h.assetClass)}</span>
                </button>
              ))}
              {online && !online.length && !errors.length && <div className="ap-note">{L('Nenhum ativo encontrado. Você pode registrar o símbolo digitado mesmo assim.', 'No asset found. You can still record the symbol you typed.')}</div>}
              {errors.map((er) => (
                <div key={er} className="ap-note warn">
                  <I.warn width={13} height={13} /> {er}
                </div>
              ))}
            </>
          )}
          {!q && !local.length && <div className="ap-note">{L('Digite um símbolo. Ativos que você usar ficam salvos no catálogo.', 'Type a symbol. Assets you use are saved to your catalog.')}</div>}
        </div>
      )}
    </div>
  )
}
