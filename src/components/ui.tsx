import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { money, inputNum, parseNum, pct } from '../lib/format'
import { portfolios } from '../lib/repo'
import { useDbVersion } from '../lib/db'
import { I } from './icons'
import { L } from '../lib/i18n'
import type { Page } from '../lib/sections'
import type { MenuItem } from './ContextMenu'
import type { Trade } from '../lib/types'

export type { Page }

/** Filters that other screens can open the Trades list with (drill-down from charts and widgets). */
export interface NavParams {
  portfolioId?: string
  symbol?: string
  strategyId?: string
  direction?: 'long' | 'short'
  outcome?: 'win' | 'loss' | 'be'
  status?: Trade['status']
  from?: string
  to?: string
  weekday?: number
  hour?: number
  sessionId?: string
  sentimentId?: string
  assetClass?: string
  tagId?: string
  month?: string
  tab?: string
  tradeId?: string
}

export interface LightboxImage {
  url: string
  name: string
  caption?: string | null
  kind?: string
}

interface Ctx {
  page: Page
  params: NavParams
  nav(page: Page, params?: NavParams): void
  toast(msg: string, kind?: 'ok' | 'err' | 'info'): void
  confirm(o: { title: string; message: ReactNode; ok?: string; danger?: boolean }): Promise<boolean>
  editTrade(id: string | null, defaults?: Partial<Trade>): void
  viewTrade(id: string): void
  editPortfolio(id: string | null): void
  editCashFlow(o: { id?: string; portfolioId?: string; kind?: string }): void
  openMenu(e: React.MouseEvent, items: MenuItem[]): void
  lightbox(images: LightboxImage[], index: number): void
}
export const AppCtx = createContext<Ctx>(null as never)
export const useApp = () => useContext(AppCtx)

// ───────────── modal
export function Modal(p: { title: ReactNode; sub?: ReactNode; onClose(): void; children: ReactNode; foot?: ReactNode; wide?: boolean; xl?: boolean; className?: string }) {
  const close = useRef(p.onClose)
  close.current = p.onClose
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className={'modal' + (p.wide ? ' wide' : '') + (p.xl ? ' xl' : '') + (p.className ? ' ' + p.className : '')} role="dialog" aria-modal="true">
        <button className="modal-x icon-btn" onClick={p.onClose} aria-label={L('Fechar', 'Close')}>
          <I.x />
        </button>
        <div className="modal-head">
          <h3>{p.title}</h3>
          {p.sub && <p>{p.sub}</p>}
        </div>
        <div className="modal-body">{p.children}</div>
        {p.foot && <div className="modal-foot">{p.foot}</div>}
      </div>
    </div>
  )
}

export function Money({ v, currency, sign, className = '', color = true }: { v: number | null | undefined; currency?: string; sign?: boolean; className?: string; color?: boolean }) {
  const c = color && v ? (v < 0 ? 'neg' : v > 0 && sign !== false ? 'pos' : '') : ''
  return <span className={`money ${c} ${className}`}>{money(v, currency, { sign })}</span>
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon ?? <I.candles />}</div>
      <h4>{title}</h4>
      {children && <div className="small">{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  )
}

export function Seg<T extends string>(p: { value: T; options: [NoInfer<T>, ReactNode][]; onChange(v: NoInfer<T>): void; className?: string }) {
  return (
    <div className={'seg ' + (p.className ?? '')} role="tablist">
      {p.options.map(([v, l]) => (
        <button key={v} type="button" role="tab" aria-selected={v === p.value} className={v === p.value ? 'on' : ''} onClick={() => p.onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

/** Small "?" with an explanation on hover/focus. */
export function Help({ text }: { text: string }) {
  return (
    <span className="help" tabIndex={0} aria-label={text} data-help={text}>
      ?
    </span>
  )
}

export function Field(p: { label: ReactNode; help?: string; children: ReactNode; className?: string; error?: string | null; hint?: ReactNode }) {
  return (
    <div className={'field ' + (p.className ?? '') + (p.error ? ' has-error' : '')}>
      <label>
        {p.label}
        {p.help && <Help text={p.help} />}
      </label>
      {p.children}
      {p.error ? <span className="field-err">{p.error}</span> : p.hint ? <span className="field-hint">{p.hint}</span> : null}
    </div>
  )
}

/** Number input that accepts "1.234,56" or "1,234.56"; reports a number (or null when empty). */
export function NumInput(p: { value: number | null | undefined; onChange(v: number | null): void; placeholder?: string; className?: string; autoFocus?: boolean; disabled?: boolean; suffix?: ReactNode; id?: string; invalid?: boolean }) {
  const [txt, setTxt] = useState(() => inputNum(p.value))
  const last = useRef(p.value)
  useEffect(() => {
    if (p.value !== last.current) {
      last.current = p.value
      if (parseNum(txt) !== p.value) setTxt(inputNum(p.value))
    }
  }, [p.value])
  const input = (
    <input
      id={p.id}
      className={'input num ' + (p.className ?? '') + (p.invalid ? ' invalid' : '')}
      inputMode="decimal"
      placeholder={p.placeholder}
      value={txt}
      autoFocus={p.autoFocus}
      disabled={p.disabled}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,\-+]/g, '')
        setTxt(t)
        const v = t.trim() === '' ? null : parseNum(t)
        last.current = v
        p.onChange(v)
      }}
    />
  )
  if (!p.suffix) return input
  return (
    <div className="input-suffix">
      {input}
      <span>{p.suffix}</span>
    </div>
  )
}

export function PortfolioSelect(p: { value: string | null; onChange(id: string): void; allowAll?: boolean; className?: string; includeArchived?: boolean; allLabel?: string }) {
  useDbVersion()
  const list = portfolios().filter((x) => p.includeArchived || x.status !== 'archived' || x.id === p.value)
  return (
    <select className={'select ' + (p.className ?? '')} value={p.value ?? ''} onChange={(e) => p.onChange(e.target.value)}>
      {p.allowAll && <option value="">{p.allLabel ?? L('Todas as carteiras', 'All portfolios')}</option>}
      {!p.allowAll && !p.value && <option value="">{L('— Selecione uma carteira —', '— Select a portfolio —')}</option>}
      {list.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name} · {x.currency}
          {x.status === 'locked' ? ' 🔒' : ''}
        </option>
      ))}
    </select>
  )
}

/** "▲ 12%" comparison with the previous period. */
export function Delta({ cur, prev, invert, abs }: { cur: number | null; prev: number | null; invert?: boolean; abs?: boolean }) {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev)) return <span className="delta flat">—</span>
  const d = abs ? cur - prev : prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100
  if (d === null) return <span className="delta flat">{L('novo', 'new')}</span>
  if (Math.abs(d) < 0.05) return <span className="delta flat">= 0</span>
  const good = invert ? d < 0 : d > 0
  return (
    <span className={'delta ' + (good ? 'up' : 'down')}>
      {d > 0 ? '▲' : '▼'} {abs ? Math.abs(d).toFixed(1) + ' pp' : pct(Math.abs(d), 0)}
    </span>
  )
}

export function Outcome({ o }: { o: 'win' | 'loss' | 'be' | null }) {
  if (!o) return null
  return <span className={'badge ' + (o === 'win' ? 'green' : o === 'loss' ? 'red' : 'gray')}>{o === 'win' ? 'WIN' : o === 'loss' ? 'LOSS' : 'BE'}</span>
}

export function StatusBadge({ s }: { s: Trade['status'] }) {
  const m: Record<Trade['status'], [string, string]> = {
    planned: ['violet', L('Planejada', 'Planned')],
    open: ['blue', L('Aberta', 'Open')],
    closed: ['gray', L('Fechada', 'Closed')],
    cancelled: ['amber', L('Cancelada', 'Cancelled')]
  }
  return <span className={'badge ' + m[s][0]}>{m[s][1]}</span>
}

export function DirBadge({ d }: { d: 'long' | 'short' }) {
  return <span className={'dir ' + d}>{d === 'long' ? 'Long' : 'Short'}</span>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />
}

/** Small stateful helper for forms. */
export function useForm<T extends object>(init: T) {
  const [v, setV] = useState<T>(init)
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((o) => ({ ...o, [k]: val }))
  return [v, set, setV] as const
}

export const COLORS = ['#f7931a', '#ffc453', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#16a34a', '#84cc16', '#64748b']
export function Swatches({ value, onChange }: { value: string; onChange(c: string): void }) {
  return (
    <div className="swatches">
      {COLORS.map((c) => (
        <button key={c} type="button" className={'swatch' + (c === value ? ' on' : '')} style={{ background: c, color: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
    </div>
  )
}
