// Display helpers. Amounts are plain numbers in currency units; every format follows Settings
// (locale, decimals, currency display, date and time formats).
import { settings } from './settings'

const fmtCache = new Map<string, Intl.NumberFormat>()
function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = fmtCache.get(key)
  if (!f) {
    f = make()
    fmtCache.set(key, f)
  }
  return f
}

/** 1234.5 → "R$ 1.234,50" / "$1,234.50" (currency defaults to the preferred one). */
export function money(v: number | null | undefined, currency?: string, opts: { sign?: boolean; decimals?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = settings()
  const cur = currency || s.currency
  const dec = opts.decimals ?? s.moneyDecimals
  if (!/^[A-Z]{3}$/.test(cur)) {
    // Not an ISO code (USDT, points…): number + code
    const body = num(Math.abs(v), dec, { min: dec }) + ' ' + cur
    return v < 0 ? '-' + body : opts.sign && v > 0 ? '+' + body : body
  }
  const f = nf(`m|${s.numberLocale}|${cur}|${dec}|${s.currencyDisplay}`, () => {
    try {
      return new Intl.NumberFormat(s.numberLocale, { style: 'currency', currency: cur, currencyDisplay: s.currencyDisplay, minimumFractionDigits: dec, maximumFractionDigits: dec })
    } catch {
      return new Intl.NumberFormat(s.numberLocale, { minimumFractionDigits: dec, maximumFractionDigits: dec })
    }
  })
  const out = f.format(Math.abs(v))
  if (v < 0 && Math.abs(v) >= 0.5 * 10 ** -dec) return '-' + out
  return opts.sign && v > 0 && v >= 0.5 * 10 ** -dec ? '+' + out : out
}

/** Compact amount for chart axes: 12500 → "12,5 mil" / "12.5K". */
export function moneyShort(v: number, currency?: string): string {
  const s = settings()
  const cur = currency || s.currency
  if (Math.abs(v) < 100000) return money(v, cur, { decimals: Math.abs(v) < 100 && v % 1 !== 0 ? 2 : 0 })
  const f = nf(`ms|${s.numberLocale}|${cur}`, () => {
    try {
      return new Intl.NumberFormat(s.numberLocale, { style: 'currency', currency: cur, notation: 'compact', maximumFractionDigits: 1 })
    } catch {
      return new Intl.NumberFormat(s.numberLocale, { notation: 'compact', maximumFractionDigits: 1 })
    }
  })
  return f.format(v)
}

export function num(v: number | null | undefined, decimals = 2, opts: { sign?: boolean; min?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = settings()
  const f = nf(`n|${s.numberLocale}|${decimals}|${opts.min ?? decimals}`, () => new Intl.NumberFormat(s.numberLocale, { minimumFractionDigits: opts.min ?? decimals, maximumFractionDigits: decimals }))
  const out = f.format(v)
  return opts.sign && v > 0 ? '+' + out : out
}

/** Prices keep the precision they need (forex 5 decimals, crypto up to 8) unless fixed in Settings. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = settings()
  if (s.priceDecimals !== 'auto') return num(v, s.priceDecimals)
  const a = Math.abs(v)
  const d = a >= 1000 ? 2 : a >= 1 ? 5 : a >= 0.01 ? 6 : 8
  return num(v, d, { min: a >= 1000 ? 0 : 2 })
}

export function pct(v: number | null | undefined, decimals = 1, opts: { sign?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return num(v, decimals, { sign: opts.sign, min: decimals }) + '%'
}

export function ratio(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (v === Infinity) return '∞'
  return num(v, decimals, { min: decimals })
}

/** "2026-10-18" → per Settings date format. */
export function fdate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!d) return iso
  const f = settings().dateFormat
  return f === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : f === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`
}
export function ftime(iso: string | null | undefined): string {
  if (!iso || iso.length < 16) return ''
  const hh = +iso.slice(11, 13)
  const mm = iso.slice(14, 16)
  if (settings().timeFormat === '12h') return `${((hh + 11) % 12) + 1}:${mm} ${hh < 12 ? 'AM' : 'PM'}`
  return `${String(hh).padStart(2, '0')}:${mm}`
}
export function fdatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = ftime(iso)
  return t ? `${fdate(iso)} ${t}` : fdate(iso)
}

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes < 0) return '—'
  if (minutes < 60) return `${Math.round(minutes)} min`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`
  const d = Math.floor(minutes / 1440)
  return `${d}d ${Math.floor((minutes % 1440) / 60)}h`
}

/**
 * Parses what people type: "1.234,56", "1,234.56", "-50", "0,5". A lone comma is a decimal separator
 * when the locale writes decimals with a comma.
 */
export function parseNum(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  let t = input.trim().replace(/\s/g, '').replace(/[^\d.,\-+eE]/g, '')
  if (!t || t === '-' || t === '+') return null
  const lastC = t.lastIndexOf(',')
  const lastD = t.lastIndexOf('.')
  if (lastC >= 0 && lastD >= 0) {
    const dec = lastC > lastD ? ',' : '.'
    t = dec === ',' ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (lastC >= 0) {
    const commaDecimal = (1.5).toLocaleString(settings().numberLocale).includes(',')
    const parts = t.split(',')
    t = parts.length === 2 && (commaDecimal || parts[1].length !== 3) ? parts.join('.') : parts.join('')
  }
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** Value for an <input> from a stored number (no thousands separators). */
export function inputNum(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return ''
  const s = String(+v.toPrecision(12))
  return (1.5).toLocaleString(settings().numberLocale).includes(',') ? s.replace('.', ',') : s
}

export function todayIso(): string {
  return isoOf(new Date())
}
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function nowLocal(): string {
  const d = new Date()
  return `${isoOf(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}
export function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
export const CURRENCIES = ['USD', 'BRL', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'MXN', 'ARS', 'CLP', 'COP', 'HKD', 'SGD', 'CNY', 'INR', 'ZAR', 'USDT']
/** USDT isn't an ISO currency; Intl falls back to plain numbers for it. */
export const currencyLabel = (c: string) => c
