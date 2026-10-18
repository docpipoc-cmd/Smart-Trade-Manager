import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'
import { I } from './icons'
import { L } from '../lib/i18n'
import type { SectionId } from '../lib/sections'

type IconName = keyof typeof I
type Vars = CSSProperties & Record<`--${string}`, string | number>

export const animOn = () => !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) && document.documentElement.dataset.motion !== 'off'

/** $mart Trader logo: the gold 3D tile with a "$" whose spine is a candlestick rising into an arrow. */
export function Logo({ size = 34, className = '' }: { size?: number; className?: string }) {
  const id = 'lg' + useId().replace(/:/g, '')
  return (
    <svg className={'logo ' + className} width={size} height={size} viewBox="0 0 64 64" aria-label="$mart Trader">
      <defs>
        <linearGradient id={id + 'f'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd77a" />
          <stop offset=".45" stopColor="#f7931a" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={id + 's'} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.2" floodColor="#7c2d12" floodOpacity=".55" />
        </filter>
      </defs>
      <rect x="4" y="9" width="56" height="52" rx="16" fill="#8a3409" />
      <rect x="4" y="4" width="56" height="52" rx="16" fill={`url(#${id}f)`} />
      <path d="M8 18a14 14 0 0114-14h20a14 14 0 0114 14v4c-12 5-34 5-48 0z" fill={`url(#${id}g)`} />
      <g filter={`url(#${id}s)`} fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M40 19.5c-1.6-2.6-4.6-4.1-8.2-4.1-5 0-8.4 2.7-8.4 6.3 0 8.2 17.3 4.2 17.3 12.6 0 3.8-3.8 6.6-9.1 6.6-4 0-7.4-1.7-9-4.5" strokeWidth="4.8" />
        <path d="M31.5 9.5v5M31.5 41v4" strokeWidth="4.2" />
      </g>
      <g filter={`url(#${id}s)`}>
        <rect x="45" y="36" width="5" height="9" rx="1.2" fill="#fff" />
        <path d="M47.5 32.5v3.5M47.5 45v3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M43 26l6-6M44.5 19.6h5v5" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  )
}
export function Wordmark({ sub = true }: { sub?: boolean }) {
  return (
    <div className="wordmark">
      <div className="wm-name">
        <span className="wm-dollar">$</span>mart <span className="wm-trader">Trader</span>
      </div>
      {sub && <div className="brand-sub">{L('Diário de trading', 'Trading journal')}</div>}
    </div>
  )
}

export function Icon3D({ icon, size, sec, className = '', title }: { icon: IconName; size?: 'sm' | 'lg' | 'xl' | number; sec?: SectionId; className?: string; title?: string }) {
  const G = I[icon]
  const cls = typeof size === 'string' ? ' ' + size : ''
  const style: Vars | undefined = typeof size === 'number' ? { '--s': size + 'px' } : undefined
  return (
    <span className={'i3d' + cls + (sec ? ' sec-' + sec : '') + (className ? ' ' + className : '')} style={style} title={title} aria-hidden={!title}>
      <G />
    </span>
  )
}

export { IsoScene } from './scenes'

export function ProgressRing({ value, size = 64, stroke = 7, children, color }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const id = useId()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const [shown, setShown] = useState(animOn() ? 0 : value)
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(t)
  }, [value])
  return (
    <span className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={'rg' + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color ?? 'var(--ba)'} />
            <stop offset="100%" stopColor={color ?? 'var(--bb)'} />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-bar" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, shown)))} style={{ stroke: `url(#rg${id})` }} />
      </svg>
      <span className="ring-label">{children}</span>
    </span>
  )
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : w[0][1] ?? '')).toUpperCase()
}

const CLASS_TINT: Record<string, string> = {
  stock: '#3b82f6',
  etf: '#0ea5e9',
  forex: '#14b8a6',
  crypto: '#f7931a',
  index: '#8b5cf6',
  futures: '#ec4899',
  commodity: '#d97706',
  option: '#64748b',
  other: '#64748b'
}
export const classColor = (c: string) => CLASS_TINT[c] ?? '#64748b'

/** Asset logo (cached data URL from the provider) or a colored monogram when none is available. */
export function AssetLogo({ symbol, logo, cls, size = 32 }: { symbol: string; logo?: string | null; cls?: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (logo && !broken) return <img className="asset-logo" src={logo} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size }} />
  const c = classColor(cls ?? 'other')
  return (
    <span className="asset-logo mono-logo" style={{ width: size, height: size, '--c': c, fontSize: size * 0.34 } as Vars}>
      {symbol.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || '?'}
    </span>
  )
}
