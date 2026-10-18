// Renderer side of market data. The requests run on the server side (Electron main process or the
// Vite dev server), which holds any API keys. Results are never invented: failures come back as errors.
import { settings } from './settings'
import type { AssetClass } from './types'

export interface AssetHit {
  symbol: string
  name: string
  assetClass: AssetClass
  exchange: string | null
  currency: string | null
  logo: string | null
  provider: 'coingecko' | 'yahoo' | 'finnhub'
  providerId: string
}
export interface Quote {
  price: number
  currency: string | null
  at: string
  source: string
  note: string
  delayed: boolean
}

async function call<T>(msg: Record<string, unknown>): Promise<T> {
  const body = { ...msg, providers: settings().providers }
  if (window.api) return (await window.api.market(body)) as T
  const r = await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok || (j && typeof j === 'object' && 'error' in j)) throw new Error((j as { error: string }).error || `HTTP ${r.status}`)
  return j as T
}

export const searchAssets = (q: string) => call<{ results: AssetHit[]; errors: string[] }>({ op: 'search', q })
export const fetchQuote = (provider: string, providerId: string, symbol: string) => call<Quote>({ op: 'quote', provider, providerId, symbol })
export const fetchLogo = (provider: string, providerId: string, symbol: string) => call<{ logo: string | null }>({ op: 'logo', provider, providerId, symbol })
/** Price of 1 `from` in `to` (e.g. BRL→USD). */
export const fetchFx = (from: string, to: string) => call<Quote>({ op: 'fx', from, to })
export const marketStatus = () => call<{ keys: Record<string, boolean> }>({ op: 'status' })
export const setProviderKey = (name: string, value: string | null) => call<{ ok: boolean }>({ op: 'setKey', name, value })

/** Human age of a quote ("2 min", "3 h"). */
export function quoteAge(at: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`
}

/** Yahoo symbol guess for a manually typed instrument (used to fetch a mark price for open trades). */
export function yahooSymbol(symbol: string, cls: AssetClass): string {
  const s = symbol.toUpperCase().replace(/\s/g, '')
  if (cls === 'forex' && /^[A-Z]{6}$/.test(s.replace('/', ''))) return s.replace('/', '') + '=X'
  if (cls === 'crypto' && !s.includes('-')) return s.replace(/USDT?$/, '') + '-USD'
  return s
}
