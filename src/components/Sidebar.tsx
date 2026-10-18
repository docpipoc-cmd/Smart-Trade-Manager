import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { I } from './icons'
import { Icon3D, initials, Logo, Wordmark } from './visual'
import type { NavParams, Page } from './ui'
import { portfolios, portfolioMetrics } from '../lib/repo'
import { SECTION_OF, type SectionId } from '../lib/sections'
import { money } from '../lib/format'
import { L } from '../lib/i18n'
import { useSettings } from '../lib/settings'

type IconName = keyof typeof I
export interface NavItem {
  page: Page
  tab?: string
  label: () => string
  icon: IconName
}
export interface NavGroup {
  id: string
  sec: SectionId
  label: () => string
  items: NavItem[]
}

const readLS = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
const writeLS = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* private mode */
  }
}

interface Props {
  nav: NavGroup[]
  page: Page
  tab?: string
  open: boolean
  go(p: Page, params?: NavParams): void
  newTrade(): void
  newPortfolio(): void
  theme: 'light' | 'dark'
  toggleTheme(): void
  close(): void
}

/** Sidebar in the $mart style: sections with 3D icons and a sliding highlight, rail mode, and the portfolios "wallet". */
export function Sidebar(p: Props) {
  const s = useSettings()
  const [rail, setRail] = useState<boolean>(() => readLS('sb_rail', false))
  const [closed, setClosed] = useState<Record<string, boolean>>(() => readLS('nav_groups', {}))
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const list = portfolios().filter((x) => x.status !== 'archived')

  const toggleRail = () => (setRail(!rail), writeLS('sb_rail', !rail))
  const toggleGroup = (id: string) => {
    const n = { ...closed, [id]: !closed[id] }
    setClosed(n)
    writeLS('nav_groups', n)
  }
  const isActive = (it: NavItem) => it.page === p.page && (!it.tab || it.tab === (p.tab ?? defaultTab(it.page)))
  const activeKey = p.page + ':' + (p.tab ?? '')

  useLayoutEffect(() => {
    const measure = () => {
      const el = scrollRef.current?.querySelector<HTMLElement>('.sb-item.active')
      setPill(el && el.offsetHeight ? { top: el.offsetTop, height: el.offsetHeight } : null)
    }
    measure()
    const t = setTimeout(measure, 340)
    return () => clearTimeout(t)
  }, [activeKey, closed, rail, list.length])

  return (
    <aside className={'sidebar' + (rail ? ' rail' : '') + (p.open ? ' open' : '')} aria-label={L('Navegação', 'Navigation')}>
      <div className="sb-top">
        <div className="sb-brand" onClick={() => p.go('dashboard')}>
          <Logo size={38} />
          <Wordmark />
        </div>
        <button className="sb-collapse desk-only" onClick={toggleRail} title={rail ? L('Expandir', 'Expand') : L('Recolher (só ícones)', 'Collapse (icons only)')}>
          <I.chevronLeft />
        </button>
        <button className="sb-collapse mob-only" onClick={p.close} aria-label={L('Fechar menu', 'Close menu')}>
          <I.x />
        </button>
      </div>
      <button className="sb-new" onClick={p.newTrade} data-tip={L('Nova operação', 'New trade')}>
        <I.plus /> <span>{L('Nova operação', 'New trade')}</span>
      </button>

      <div className="sb-scroll" ref={scrollRef}>
        <span className={'sb-pill sec-' + SECTION_OF[p.page] + (pill ? ' on' : '')} style={pill ? { top: pill.top, height: pill.height } : undefined} />
        {p.nav.map((g) => {
          const isClosed = !!closed[g.id] && !g.items.some(isActive)
          return (
            <div key={g.id} className={'sec-' + g.sec}>
              <button className={'sb-group-head' + (isClosed ? ' closed' : '')} onClick={() => toggleGroup(g.id)} data-tip={g.label()}>
                <span className="sb-gem" />
                <span className="ellipsis">{g.label()}</span>
                <span className="chev">▾</span>
              </button>
              <div className={'sb-items' + (isClosed ? ' closed' : '')}>
                <div>
                  {g.items.map((it) => (
                    <button
                      key={it.page + (it.tab ?? '')}
                      data-nav={it.page}
                      data-tip={it.label()}
                      aria-label={it.label()}
                      className={'sb-item tilt sec-' + g.sec + (isActive(it) ? ' active' : '')}
                      onClick={() => p.go(it.page, it.tab ? { tab: it.tab } : {})}
                      aria-current={isActive(it) ? 'page' : undefined}
                    >
                      <Icon3D icon={it.icon} />
                      <span className="lbl">{it.label()}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}

        <div className="sb-wallet-head">
          <span className="grow">{L('Minhas carteiras', 'My portfolios')}</span>
          <button className="sb-ico-btn" title={L('Nova carteira', 'New portfolio')} onClick={p.newPortfolio}>
            <I.wallet />+
          </button>
        </div>
        {list.map((pf) => {
          const m = portfolioMetrics(pf)
          return (
            <div key={pf.id} className="sb-prof" style={{ '--pc': pf.color } as CSSProperties}>
              <div className="sb-prof-row" data-tip={`${pf.name} · ${money(m.equity, pf.currency)}`} onClick={() => p.go('portfolios', { portfolioId: pf.id })}>
                <span className="sb-avatar">{initials(pf.name)}</span>
                <span className="sb-prof-name">
                  <b>{pf.name}</b>
                  <small>
                    {pf.currency} · {m.open} {L('abertas', 'open')}
                    {m.state === 'locked' ? ' · 🔒' : ''}
                  </small>
                </span>
                <span className={'sb-amt' + (m.realized < 0 ? ' neg' : '')}>{money(m.equity, pf.currency, { decimals: Math.abs(m.equity) >= 100000 ? 0 : undefined })}</span>
              </div>
            </div>
          )
        })}
        {!list.length && (
          <div className="sb-empty-acc" onClick={p.newPortfolio}>
            + {L('Criar primeira carteira', 'Create your first portfolio')}
          </div>
        )}
      </div>

      <div className="sb-user" onClick={() => p.go('settings', { tab: 'profile' })} data-tip={s.profileName || L('Perfil', 'Profile')}>
        <span className="sb-avatar round" style={{ '--pc': s.avatarColor } as CSSProperties}>
          {initials(s.profileName || 'Trader')}
        </span>
        <span className="sb-prof-name">
          <b>{s.profileName || L('Seu perfil', 'Your profile')}</b>
          <small>{s.profileEmail || L('Configure em Configurações', 'Set it up in Settings')}</small>
        </span>
      </div>
      <div className="sb-foot">
        <button className="sb-item" onClick={p.toggleTheme} data-tip={p.theme === 'dark' ? L('Tema claro', 'Light theme') : L('Tema escuro', 'Dark theme')}>
          <Icon3D icon={p.theme === 'dark' ? 'sun' : 'moon'} sec="setup" size={24} />
          <span className="lbl">{p.theme === 'dark' ? L('Tema claro', 'Light theme') : L('Tema escuro', 'Dark theme')}</span>
        </button>
      </div>
    </aside>
  )
}

export function defaultTab(p: Page): string {
  return p === 'tools' ? 'size' : p === 'admin' ? 'records' : p === 'settings' ? 'general' : ''
}
