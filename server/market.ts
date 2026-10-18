// Market data, run on the server side (Electron main process, or the Vite dev server in web mode).
//
// Providers
//  • CoinGecko (no key)   — crypto search, logos and prices.
//  • Yahoo Finance        — stocks, ETFs, forex, indices, futures search and quotes. Unofficial public
//                           endpoints: quotes can be delayed (often 15–20 min) and may stop working.
//  • Finnhub (optional key) — stock search, company logos and quotes.
//
// Nothing here invents data: when a provider fails or has no answer, the caller gets an error/empty
// result and the UI says so. Every quote carries its source and the provider's own timestamp.
import type { KeyStore } from './keys'

export type AssetClass = 'stock' | 'etf' | 'forex' | 'crypto' | 'index' | 'futures' | 'commodity' | 'option' | 'other'

export interface AssetHit {
  symbol: string
  name: string
  assetClass: AssetClass
  exchange: string | null
  currency: string | null
  logo: string | null // data: URL (fetched + cached here so the renderer never loads remote images)
  provider: 'coingecko' | 'yahoo' | 'finnhub'
  providerId: string
}

export interface Quote {
  price: number
  currency: string | null
  at: string // ISO time of the price, as reported by the provider
  source: string
  note: string
  delayed: boolean
}

export interface ProviderPrefs {
  coingecko?: boolean
  yahoo?: boolean
  finnhub?: boolean
}

type Msg =
  | { op: 'status' }
  | { op: 'setKey'; name: string; value: string | null }
  | { op: 'search'; q: string; providers?: ProviderPrefs }
  | { op: 'quote'; symbol: string; provider: AssetHit['provider']; providerId: string; providers?: ProviderPrefs }
  | { op: 'logo'; symbol: string; provider: AssetHit['provider']; providerId: string }
  | { op: 'fx'; from: string; to: string; providers?: ProviderPrefs }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const KEY_NAMES = ['finnhub'] as const

async function getJson<T>(url: string, ms = 8000): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) })
  if (r.status === 429) throw new Error('rate limited by provider (HTTP 429) — try again in a minute')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as T
}

// ───────── small in-memory caches (the renderer also caches assets in SQLite)
const cache = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(key)
  if (c && Date.now() - c.at < ttlMs) return c.v as T
  const v = await fn()
  cache.set(key, { at: Date.now(), v })
  if (cache.size > 800) cache.delete(cache.keys().next().value as string)
  return v
}

async function imageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const type = r.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 120 || buf.length > 400_000) return null
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

// ───────── CoinGecko
interface CgSearch {
  coins: { id: string; name: string; symbol: string; large?: string; thumb?: string; market_cap_rank?: number | null }[]
}
async function cgSearch(q: string): Promise<AssetHit[]> {
  const d = await cached('cg:s:' + q.toLowerCase(), 10 * 60_000, () => getJson<CgSearch>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`))
  const top = d.coins.slice(0, 8)
  const logos = await Promise.all(top.map((c) => (c.large || c.thumb ? cached('logo:' + (c.large || c.thumb), 24 * 3600_000, () => imageAsDataUrl((c.large || c.thumb)!)) : null)))
  return top.map((c, i) => ({
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    assetClass: 'crypto',
    exchange: null,
    currency: null,
    logo: logos[i],
    provider: 'coingecko',
    providerId: c.id
  }))
}
async function cgQuote(id: string): Promise<Quote> {
  const d = await getJson<Record<string, { usd?: number; last_updated_at?: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_last_updated_at=true`
  )
  const p = d[id]
  if (!p || typeof p.usd !== 'number') throw new Error('no price returned for this coin')
  const at = p.last_updated_at ? new Date(p.last_updated_at * 1000) : new Date()
  return { price: p.usd, currency: 'USD', at: at.toISOString(), source: 'CoinGecko', note: 'Aggregated spot price (USD); updated every few minutes', delayed: Date.now() - at.getTime() > 15 * 60_000 }
}

// ───────── Yahoo Finance (unofficial)
interface YSearch {
  quotes?: { symbol: string; shortname?: string; longname?: string; quoteType?: string; exchange?: string; exchDisp?: string; typeDisp?: string }[]
}
const Y_TYPE: Record<string, AssetClass> = {
  EQUITY: 'stock',
  ETF: 'etf',
  CURRENCY: 'forex',
  INDEX: 'index',
  FUTURE: 'futures',
  CRYPTOCURRENCY: 'crypto',
  MUTUALFUND: 'other',
  OPTION: 'option'
}
async function ySearch(q: string): Promise<AssetHit[]> {
  const d = await cached('y:s:' + q.toLowerCase(), 10 * 60_000, () =>
    getJson<YSearch>(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`)
  )
  const list = (d.quotes ?? []).filter((x) => x.symbol && x.quoteType && Y_TYPE[x.quoteType])
  const hits: AssetHit[] = list.slice(0, 10).map((x) => ({
    symbol: x.symbol,
    name: x.longname || x.shortname || x.symbol,
    assetClass: Y_TYPE[x.quoteType!],
    exchange: x.exchDisp || x.exchange || null,
    currency: null,
    logo: null,
    provider: 'yahoo',
    providerId: x.symbol
  }))
  // Company logos for stocks/ETFs (public logo CDN; missing ones simply stay null)
  await Promise.all(hits.slice(0, 6).map(async (h) => {
    if (h.assetClass === 'stock' || h.assetClass === 'etf') h.logo = await stockLogo(h.symbol)
  }))
  return hits
}
interface YChart {
  chart: { result?: { meta: { regularMarketPrice?: number; currency?: string; regularMarketTime?: number; exchangeName?: string; exchangeDataDelayedBy?: number } }[]; error?: { description?: string } | null }
}
async function yQuote(symbol: string): Promise<Quote> {
  const d = await getJson<YChart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`)
  const m = d.chart.result?.[0]?.meta
  if (!m || typeof m.regularMarketPrice !== 'number') throw new Error(d.chart.error?.description || 'no price returned for this symbol')
  const at = m.regularMarketTime ? new Date(m.regularMarketTime * 1000) : new Date()
  const delayMin = m.exchangeDataDelayedBy ?? 0
  return {
    price: m.regularMarketPrice,
    currency: m.currency ?? null,
    at: at.toISOString(),
    source: 'Yahoo Finance',
    note: `Unofficial feed${m.exchangeName ? ' · ' + m.exchangeName : ''}${delayMin ? ` · exchange delay ${delayMin} min` : ' · may be delayed'}`,
    delayed: delayMin > 0 || Date.now() - at.getTime() > 15 * 60_000
  }
}

// ───────── Finnhub (optional key)
async function fhSearch(q: string, key: string): Promise<AssetHit[]> {
  const d = await getJson<{ result?: { symbol: string; description: string; type: string; displaySymbol: string }[] }>(
    `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${encodeURIComponent(key)}`
  )
  return (d.result ?? []).slice(0, 8).map((x) => ({
    symbol: x.displaySymbol || x.symbol,
    name: x.description || x.symbol,
    assetClass: /ETF|ETP/i.test(x.type) ? 'etf' : /Common|Stock|ADR|REIT/i.test(x.type) ? 'stock' : 'other',
    exchange: null,
    currency: null,
    logo: null,
    provider: 'finnhub',
    providerId: x.symbol
  }))
}
async function fhQuote(symbol: string, key: string): Promise<Quote> {
  const d = await getJson<{ c?: number; t?: number }>(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`)
  if (!d.c || !d.t) throw new Error('no price returned for this symbol')
  const at = new Date(d.t * 1000)
  return { price: d.c, currency: null, at: at.toISOString(), source: 'Finnhub', note: 'Last price reported by Finnhub (coverage and delay depend on your plan)', delayed: Date.now() - at.getTime() > 15 * 60_000 }
}
async function fhLogo(symbol: string, key: string): Promise<string | null> {
  const d = await getJson<{ logo?: string }>(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`).catch(() => ({}) as { logo?: string })
  return d.logo ? imageAsDataUrl(d.logo) : null
}

let keyStoreRef: KeyStore | null = null
async function stockLogo(symbol: string): Promise<string | null> {
  return cached('slogo:' + symbol, 24 * 3600_000, async () => {
    const fk = keyStoreRef?.get('finnhub')
    if (fk) {
      const l = await fhLogo(symbol, fk)
      if (l) return l
    }
    // US listings: plain ticker; others (PETR4.SA) — try the base ticker as listed by the CDN
    return imageAsDataUrl(`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.toUpperCase())}.png`)
  })
}

const on = (p: ProviderPrefs | undefined, k: keyof ProviderPrefs) => p?.[k] !== false

export async function handleMarket(msg: Msg, keys: KeyStore): Promise<unknown> {
  keyStoreRef = keys
  switch (msg.op) {
    case 'status':
      return { keys: Object.fromEntries(KEY_NAMES.map((k) => [k, !!keys.get(k)])) }
    case 'setKey': {
      if (!KEY_NAMES.includes(msg.name as (typeof KEY_NAMES)[number])) throw new Error('unknown key')
      keys.set(msg.name, msg.value?.trim() || null)
      cache.clear()
      return { ok: true }
    }
    case 'search': {
      const q = msg.q.trim()
      if (q.length < 1) return { results: [], errors: [] }
      const jobs: [string, Promise<AssetHit[]>][] = []
      if (on(msg.providers, 'yahoo')) jobs.push(['Yahoo Finance', ySearch(q)])
      if (on(msg.providers, 'coingecko')) jobs.push(['CoinGecko', cgSearch(q)])
      const fk = keys.get('finnhub')
      if (fk && on(msg.providers, 'finnhub')) jobs.push(['Finnhub', fhSearch(q, fk)])
      const settled = await Promise.allSettled(jobs.map((j) => j[1]))
      const errors: string[] = []
      const results: AssetHit[] = []
      const seen = new Set<string>()
      settled.forEach((s, i) => {
        if (s.status === 'rejected') errors.push(`${jobs[i][0]}: ${String((s.reason as Error)?.message ?? s.reason)}`)
        else
          for (const h of s.value) {
            const k = h.assetClass + ':' + h.symbol
            if (seen.has(k)) continue
            seen.add(k)
            results.push(h)
          }
      })
      return { results, errors }
    }
    case 'quote': {
      const p = msg.providers
      if (msg.provider === 'coingecko') {
        if (!on(p, 'coingecko')) throw new Error('CoinGecko is turned off in Settings')
        return cached('q:cg:' + msg.providerId, 60_000, () => cgQuote(msg.providerId))
      }
      if (msg.provider === 'finnhub') {
        const fk = keys.get('finnhub')
        if (!fk || !on(p, 'finnhub')) throw new Error('Finnhub key not configured')
        return cached('q:fh:' + msg.providerId, 60_000, () => fhQuote(msg.providerId, fk))
      }
      if (!on(p, 'yahoo')) throw new Error('Yahoo Finance is turned off in Settings')
      return cached('q:y:' + msg.providerId, 60_000, () => yQuote(msg.providerId))
    }
    case 'logo': {
      if (msg.provider === 'coingecko') {
        const d = await cgSearch(msg.symbol).catch(() => [])
        return { logo: d.find((x) => x.providerId === msg.providerId)?.logo ?? null }
      }
      return { logo: await stockLogo(msg.providerId.split('.')[0]) }
    }
    case 'fx': {
      if (!on(msg.providers, 'yahoo')) throw new Error('Yahoo Finance is turned off in Settings')
      const sym = `${msg.from}${msg.to}=X`
      return cached('fx:' + sym, 10 * 60_000, () => yQuote(sym))
    }
  }
}
