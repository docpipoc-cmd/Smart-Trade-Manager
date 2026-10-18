import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { openDb, unlock } from './lib/db'
import { App } from './App'
import './styles.css'
import './theme.css'
import './app.css'
import { L } from './lib/i18n'
import { Logo } from './components/visual'
import { applyTheme, settings } from './lib/settings'

document.documentElement.classList.add('sec-overview')
const pref = (() => {
  try {
    return (localStorage.getItem('theme_pref') as 'light' | 'dark' | 'system' | null) ?? 'dark'
  } catch {
    return 'dark'
  }
})()
applyTheme(pref)

const root = createRoot(document.getElementById('root')!)

function start() {
  // Settings live in the database; apply the saved theme once it is open
  applyTheme(settings().theme)
  root.render(<App />)
}

/** Shown when the data file is password protected. */
function Lock() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    if (await unlock(pw)) start()
    else {
      setErr(L('Senha incorreta', 'Wrong password'))
      setBusy(false)
    }
  }
  return (
    <div className="lock">
      <form className="lock-card" onSubmit={go}>
        <Logo size={64} className="lock-logo" />
        <h2 style={{ fontSize: 24, fontWeight: 850, letterSpacing: -0.6, marginTop: 8 }}>
          <span className="wm-dollar">$</span>mart Trader
        </h2>
        <p className="muted small" style={{ margin: '6px 0 16px' }}>
          {L('Seus dados estão protegidos por senha.', 'Your data is password protected.')}
        </p>
        <input className="input" style={{ width: '100%' }} type="password" autoFocus placeholder={L('Senha', 'Password')} value={pw} onChange={(e) => setPw(e.target.value)} aria-label={L('Senha', 'Password')} />
        {err && <div className="neg small" style={{ marginTop: 8 }}>{err}</div>}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} disabled={busy || !pw}>
          {busy ? L('Abrindo…', 'Opening…') : L('Entrar', 'Unlock')}
        </button>
      </form>
    </div>
  )
}

openDb()
  .then((s) => (s === 'locked' ? root.render(<Lock />) : start()))
  .catch((e) => {
    console.error(e)
    root.render(
      <div style={{ padding: 40 }}>
        <h2>{L('Não foi possível abrir o banco de dados', 'Could not open the database')}</h2>
        <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{String(e?.stack ?? e)}</pre>
      </div>
    )
  })
