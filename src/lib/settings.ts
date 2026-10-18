// User preferences, persisted in the database (meta.settings) so they travel with backups.
// The theme and language are also mirrored in localStorage so the first paint already uses them.
import { useSyncExternalStore } from 'react'
import { getMeta, setMeta, useDbVersion } from './db'
import type { AssetClass } from './types'
import type { Grouping, PeriodPreset } from './stats'

export type WidgetId =
  | 'kpis'
  | 'equity'
  | 'portfolios'
  | 'quality'
  | 'avgWinLoss'
  | 'sessions'
  | 'sentiment'
  | 'hours'
  | 'discipline'
  | 'rr'
  | 'calendar'
  | 'recent'

export const WIDGETS: WidgetId[] = ['kpis', 'equity', 'portfolios', 'quality', 'avgWinLoss', 'rr', 'discipline', 'sessions', 'sentiment', 'hours', 'calendar', 'recent']

export interface Settings {
  profileName: string
  profileEmail: string
  avatarColor: string
  theme: 'light' | 'dark' | 'system'
  currency: string
  defaultPortfolioId: string | null
  defaultRiskPct: number
  defaultFees: number
  defaultAssetClass: AssetClass
  defaultStrategyId: string | null
  beTolerance: number
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat: '24h' | '12h'
  numberLocale: string
  moneyDecimals: number
  priceDecimals: number | 'auto'
  currencyDisplay: 'symbol' | 'code' | 'narrowSymbol'
  widgets: Record<WidgetId, boolean>
  widgetOrder: WidgetId[]
  defaultPeriod: PeriodPreset
  chartGrouping: Grouping
  chartCurve: 'monotone' | 'linear' | 'stepAfter'
  chartGrid: boolean
  chartShowEquity: boolean
  remindJournal: boolean
  remindNoStop: boolean
  staleOpenDays: number
  providers: { yahoo: boolean; coingecko: boolean; finnhub: boolean }
  autoRefreshQuotes: boolean
  pageSize: number
}

export const DEFAULTS: Settings = {
  profileName: '',
  profileEmail: '',
  avatarColor: '#f7931a',
  theme: 'dark',
  currency: 'USD',
  defaultPortfolioId: null,
  defaultRiskPct: 1,
  defaultFees: 0,
  defaultAssetClass: 'stock',
  defaultStrategyId: null,
  beTolerance: 0,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberLocale: 'pt-BR',
  moneyDecimals: 2,
  priceDecimals: 'auto',
  currencyDisplay: 'symbol',
  widgets: Object.fromEntries(WIDGETS.map((w) => [w, true])) as Record<WidgetId, boolean>,
  widgetOrder: WIDGETS,
  defaultPeriod: '30d',
  chartGrouping: 'day',
  chartCurve: 'monotone',
  chartGrid: true,
  chartShowEquity: true,
  remindJournal: true,
  remindNoStop: true,
  staleOpenDays: 14,
  providers: { yahoo: true, coingecko: true, finnhub: true },
  autoRefreshQuotes: false,
  pageSize: 25
}

let cache: Settings | null = null
let cacheKey = ''

/** Current settings merged over the defaults (new options get their default automatically). */
export function settings(): Settings {
  let raw: string | null = null
  try {
    raw = getMeta('settings')
  } catch {
    return cache ?? DEFAULTS
  }
  if (cache && raw === cacheKey) return cache
  let saved: Partial<Settings> = {}
  try {
    saved = raw ? JSON.parse(raw) : {}
  } catch {
    saved = {}
  }
  const order = (saved.widgetOrder ?? []).filter((w) => WIDGETS.includes(w))
  cache = {
    ...DEFAULTS,
    ...saved,
    widgets: { ...DEFAULTS.widgets, ...(saved.widgets ?? {}) },
    widgetOrder: [...order, ...WIDGETS.filter((w) => !order.includes(w))],
    providers: { ...DEFAULTS.providers, ...(saved.providers ?? {}) }
  }
  cacheKey = raw ?? ''
  return cache
}

export function saveSettings(next: Settings): void {
  setMeta('settings', JSON.stringify(next))
  applyTheme(next.theme)
}

export function useSettings(): Settings {
  useDbVersion()
  return settings()
}

// ───────── theme
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null
const themeSubs = new Set<() => void>()
export function resolvedTheme(pref: Settings['theme']): 'light' | 'dark' {
  return pref === 'system' ? (mq?.matches ? 'dark' : 'light') : pref
}
export function applyTheme(pref: Settings['theme']): void {
  document.documentElement.dataset.theme = resolvedTheme(pref)
  try {
    localStorage.setItem('theme_pref', pref)
  } catch {
    /* private mode */
  }
  themeSubs.forEach((s) => s())
}
mq?.addEventListener('change', () => {
  try {
    if (localStorage.getItem('theme_pref') === 'system') applyTheme('system')
  } catch {
    /* ignore */
  }
})
export function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => {
      themeSubs.add(cb)
      return () => themeSubs.delete(cb)
    },
    () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  )
}
