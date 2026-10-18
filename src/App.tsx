import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSyncExternalStore } from 'react'
import { Sidebar, defaultTab, type NavGroup } from './components/Sidebar'
import { IsoScene } from './components/visual'
import { SECTION_OF, sceneFor, type Page } from './lib/sections'
import { AppCtx, Modal, type LightboxImage, type NavParams } from './components/ui'
import { I } from './components/icons'
import { ContextMenu, type MenuItem } from './components/ContextMenu'
import { useDbVersion, useSaveState, undo, canUndo } from './lib/db'
import { L, setLang, subscribeLang, getLang } from './lib/i18n'
import { applyTheme, saveSettings, settings, useTheme } from './lib/settings'
import type { Trade } from './lib/types'
import { TradeModal } from './components/TradeModal'
import { TradeView } from './components/TradeView'
import { PortfolioModal, CashFlowModal } from './components/PortfolioModal'
import { Lightbox } from './components/Lightbox'
import { Dashboard } from './pages/Dashboard'
import { Portfolios } from './pages/Portfolios'
import { Trades } from './pages/Trades'
import { Analytics } from './pages/Analytics'
import { Tools } from './pages/Tools'
import { Admin } from './pages/Admin'
import { SettingsPage } from './pages/Settings'

const useLang = () => useSyncExternalStore(subscribeLang, getLang)

const NAV: NavGroup[] = [
  {
    id: 'overview',
    sec: 'overview',
    label: () => L('Visão geral', 'Overview'),
    items: [
      { page: 'dashboard', label: () => 'Dashboard', icon: 'dashboard' },
      { page: 'analytics', label: () => L('Análises', 'Analytics'), icon: 'pl' }
    ]
  },
  {
    id: 'trading',
    sec: 'banking',
    label: () => 'Trading',
    items: [
      { page: 'portfolios', label: () => L('Carteiras', 'Portfolios'), icon: 'wallet' },
      { page: 'trades', label: () => L('Operações', 'Trades'), icon: 'candles' }
    ]
  },
  {
    id: 'tools',
    sec: 'tax',
    label: () => L('Ferramentas', 'Tools'),
    items: [
      { page: 'tools', tab: 'size', label: () => L('Tamanho de posição', 'Position size'), icon: 'target' },
      { page: 'tools', tab: 'risk', label: () => L('Gestão de risco', 'Risk management'), icon: 'shield' },
      { page: 'tools', tab: 'pnl', label: () => L('Calculadora de P&L', 'P&L calculator'), icon: 'percent' },
      { page: 'tools', tab: 'journal', label: () => L('Diário & relatórios', 'Journal & reports'), icon: 'book' },
      { page: 'tools', tab: 'assets', label: () => L('Busca de ativos', 'Asset search'), icon: 'search' }
    ]
  },
  {
    id: 'admin',
    sec: 'setup',
    label: () => L('Administração', 'Administration'),
    items: [
      { page: 'admin', tab: 'records', label: () => L('Registros', 'Records'), icon: 'database' },
      { page: 'admin', tab: 'options', label: () => L('Estratégias & opções', 'Strategies & options'), icon: 'layers' },
      { page: 'admin', tab: 'data', label: () => L('Importar / exportar', 'Import / export'), icon: 'upload' },
      { page: 'admin', tab: 'check', label: () => L('Verificação de dados', 'Data check'), icon: 'shield' },
      { page: 'settings', label: () => L('Configurações', 'Settings'), icon: 'settings' }
    ]
  }
]

const TITLE: Record<Page, () => string> = {
  dashboard: () => 'Dashboard',
  analytics: () => L('Análises', 'Analytics'),
  portfolios: () => L('Carteiras', 'Portfolios'),
  trades: () => L('Operações', 'Trades'),
  tools: () => L('Ferramentas', 'Tools'),
  admin: () => L('Administração', 'Administration'),
  settings: () => L('Configurações', 'Settings')
}

class PageBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) {
    return { err }
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="card" style={{ maxWidth: 680, margin: '40px auto' }}>
        <div className="card-body col">
          <h3>{L('Algo deu errado nesta tela', 'Something went wrong on this screen')}</h3>
          <p className="small muted">{L('Seus dados estão seguros. Tente outra tela ou recarregue (Ctrl+R).', 'Your data is safe. Try another screen or reload (Ctrl+R).')}</p>
          <pre className="xs mono" style={{ whiteSpace: 'pre-wrap', color: 'var(--red)' }}>{String(this.state.err.message)}</pre>
        </div>
      </div>
    )
  }
}

/** Puts the section's animated iso scene inside the page header (`.page-head`) of whatever page is open. */
function HeroScene({ page }: { page: Page }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const content = document.querySelector('.content')
    if (!content) return
    const attach = () => {
      const head = content.querySelector<HTMLElement>('.page-head')
      if (!head) return setHost(null)
      let h = head.querySelector<HTMLElement>(':scope > .hero-scene')
      if (!h) {
        h = document.createElement('div')
        h.className = 'hero-scene'
        head.appendChild(h)
      }
      setHost((cur) => (cur === h ? cur : h))
    }
    attach()
    const mo = new MutationObserver(attach)
    mo.observe(content, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [page])
  return host ? createPortal(<IsoScene key={page} kind={sceneFor(page)} />, host) : null
}

interface ConfirmState {
  title: string
  message: ReactNode
  ok?: string
  danger?: boolean
  resolve(v: boolean): void
}

export function App() {
  const lang = useLang()
  return <Shell key={lang} />
}

function Shell() {
  useDbVersion()
  const lang = useLang()
  const save = useSaveState()
  const theme = useTheme()
  const [page, setPage] = useState<Page>('dashboard')
  const [params, setParams] = useState<NavParams>({})
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: string }[]>([])
  const [confirmS, setConfirmS] = useState<ConfirmState | null>(null)
  const [tradeModal, setTradeModal] = useState<{ id: string | null; defaults?: Partial<Trade> } | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const [pfModal, setPfModal] = useState<{ id: string | null } | null>(null)
  const [cfModal, setCfModal] = useState<{ id?: string; portfolioId?: string; kind?: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [lb, setLb] = useState<{ images: LightboxImage[]; index: number } | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [q, setQ] = useState('')
  const tid = useRef(0)

  const section = SECTION_OF[page]
  useEffect(() => {
    const cl = document.documentElement.classList
    cl.forEach((c) => c.startsWith('sec-') && c !== 'sec-' + section && cl.remove(c))
    cl.add('sec-' + section)
  }, [section])

  const nav = useCallback((p: Page, prm: NavParams = {}) => {
    setPage(p)
    setParams(prm)
    setDrawer(false)
    document.querySelector('.content')?.scrollTo(0, 0)
  }, [])
  const toast = useCallback((msg: string, kind = 'info') => {
    const id = ++tid.current
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600)
  }, [])
  const confirm = useCallback((o: Omit<ConfirmState, 'resolve'>) => new Promise<boolean>((resolve) => setConfirmS({ ...o, resolve })), [])
  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }, [])
  const doUndo = useCallback(() => {
    const what = undo()
    toast(what ? `${L('Desfeito', 'Undone')}: ${what}` : L('Nada para desfazer', 'Nothing to undo'), what ? 'ok' : 'info')
  }, [toast])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !typing) (e.preventDefault(), doUndo())
      else if (key === 'n' && !typing) (e.preventDefault(), setTradeModal({ id: null }))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [doUndo])

  const ctx = useMemo(
    () => ({
      page,
      params,
      nav,
      toast,
      confirm,
      editTrade: (id: string | null, defaults?: Partial<Trade>) => setTradeModal({ id, defaults }),
      viewTrade: (id: string) => setViewId(id),
      editPortfolio: (id: string | null) => setPfModal({ id }),
      editCashFlow: (o: { id?: string; portfolioId?: string; kind?: string }) => setCfModal(o),
      openMenu,
      lightbox: (images: LightboxImage[], index: number) => setLb({ images, index })
    }),
    [page, params, nav, toast, confirm, openMenu]
  )

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    saveSettings({ ...settings(), theme: next })
  }
  const undoLabel = canUndo()

  const P: Record<Page, () => ReactNode> = {
    dashboard: () => <Dashboard />,
    portfolios: () => <Portfolios key={params.portfolioId ?? 'list'} />,
    trades: () => <Trades key={JSON.stringify(params)} />,
    analytics: () => <Analytics key={JSON.stringify(params)} />,
    tools: () => <Tools tab={params.tab ?? 'size'} />,
    admin: () => <Admin tab={params.tab ?? 'records'} />,
    settings: () => <SettingsPage tab={params.tab ?? 'general'} />
  }
  const group = NAV.find((g) => g.items.some((i) => i.page === page))!
  const sub = group.items.find((i) => i.page === page && i.tab && i.tab === (params.tab ?? defaultTab(page)))

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        {drawer && <div className="drawer-dim" onClick={() => setDrawer(false)} />}
        <Sidebar
          nav={NAV}
          page={page}
          tab={params.tab}
          open={drawer}
          go={nav}
          newTrade={() => (setDrawer(false), setTradeModal({ id: null }))}
          newPortfolio={() => (setDrawer(false), setPfModal({ id: null }))}
          theme={theme}
          toggleTheme={toggleTheme}
          close={() => setDrawer(false)}
        />
        <main className="main">
          <header className="topbar">
            <button className="icon-btn mob-only menu-btn" onClick={() => setDrawer(true)} aria-label={L('Abrir menu', 'Open menu')}>
              <I.menu />
            </button>
            <div className={'crumb grow sec-' + section}>
              <span className="sb-gem" />
              <span>{group.label()}</span>
              <span>›</span>
              <b>{sub ? sub.label() : TITLE[page]()}</b>
            </div>
            <form
              className="search desk-only"
              onSubmit={(e) => {
                e.preventDefault()
                if (q.trim()) nav('trades', { symbol: q.trim().toUpperCase() })
                setQ('')
              }}
            >
              <I.search width={15} height={15} className="muted" />
              <input placeholder={L('Buscar ativo nas operações…', 'Find a symbol in trades…')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={L('Buscar', 'Search')} />
            </form>
            <div className="seg desk-only" title="Language / Idioma">
              <button className={lang === 'pt' ? 'on' : ''} onClick={() => setLang('pt')}>
                PT
              </button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
                EN
              </button>
            </div>
            <button className="btn ghost desk-only" onClick={doUndo} disabled={!undoLabel} title={undoLabel ? `${L('Desfazer', 'Undo')}: ${undoLabel} (Ctrl+Z)` : L('Nada para desfazer', 'Nothing to undo')}>
              ↶
            </button>
            <div className="save-state" title={save === 'error' ? L('Erro ao salvar', 'Save failed') : L('Dados salvos automaticamente', 'Saved automatically')}>
              <span className={'save-dot ' + save} />
              <span className="desk-only">{save === 'saving' ? L('Salvando…', 'Saving…') : save === 'error' ? L('Erro ao salvar', 'Save failed') : L('Salvo', 'Saved')}</span>
            </div>
            <button className="btn primary" onClick={() => setTradeModal({ id: null })}>
              <I.plus /> <span className="desk-only">{L('Nova operação', 'New trade')}</span>
            </button>
          </header>
          <div className="content">
            {/* Settings keeps one draft across its sections, so changing section must not remount it */}
            <div className="page" key={page + (page === 'settings' ? '' : params.tab ?? '')}>
              <PageBoundary>{P[page]()}</PageBoundary>
            </div>
            <HeroScene page={page} />
          </div>
        </main>
      </div>

      {tradeModal && <TradeModal id={tradeModal.id} defaults={tradeModal.defaults} onClose={() => setTradeModal(null)} onSaved={(id) => setViewId((v) => (v === id ? v : v))} />}
      {viewId && <TradeView id={viewId} onClose={() => setViewId(null)} />}
      {pfModal && <PortfolioModal id={pfModal.id} onClose={() => setPfModal(null)} />}
      {cfModal && <CashFlowModal {...cfModal} onClose={() => setCfModal(null)} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {lb && <Lightbox images={lb.images} index={lb.index} onClose={() => setLb(null)} />}
      {confirmS && (
        <Modal
          title={confirmS.title}
          onClose={() => {
            confirmS.resolve(false)
            setConfirmS(null)
          }}
          foot={
            <>
              <button
                className="btn"
                onClick={() => {
                  confirmS.resolve(false)
                  setConfirmS(null)
                }}
              >
                {L('Cancelar', 'Cancel')}
              </button>
              <button
                className={'btn ' + (confirmS.danger ? 'danger solid' : 'primary')}
                autoFocus
                onClick={() => {
                  confirmS.resolve(true)
                  setConfirmS(null)
                }}
              >
                {confirmS.ok ?? L('Confirmar', 'Confirm')}
              </button>
            </>
          }
        >
          <div style={{ color: 'var(--text-2)' }}>{confirmS.message}</div>
        </Modal>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind}>
            {t.kind === 'ok' && <I.ok width={16} height={16} />}
            {t.kind === 'err' && <I.warn width={16} height={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </AppCtx.Provider>
  )
}
