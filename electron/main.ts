import { app, BrowserWindow, dialog, ipcMain, shell, Menu, safeStorage } from 'electron'
import { join } from 'path'
import { promises as fs, existsSync, mkdirSync, statSync } from 'fs'
import { handleMarket } from '../server/market'
import { fileKeyStore } from '../server/keys'

if (process.env.TM_USER_DATA) app.setPath('userData', process.env.TM_USER_DATA)
app.setName('Smart Trader')

const dataDir = () => join(app.getPath('userData'), 'data')
const dbPath = () => join(dataDir(), 'trader.sqlite')
const backupDir = () => join(dataDir(), 'backups')
const imageDir = () => join(dataDir(), 'screenshots')

function ensureDirs(): void {
  for (const d of [dataDir(), backupDir(), imageDir()]) if (!existsSync(d)) mkdirSync(d, { recursive: true })
}

/** One automatic backup per day, last 30 days. */
async function dailyBackup(): Promise<void> {
  if (!existsSync(dbPath())) return
  const today = new Date().toISOString().slice(0, 10)
  const target = join(backupDir(), `trader-${today}.sqlite`)
  if (!existsSync(target)) await fs.copyFile(dbPath(), target)
  const files = (await fs.readdir(backupDir())).filter((f) => f.endsWith('.sqlite')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - 30))) await fs.unlink(join(backupDir(), old))
}

// Provider API keys: encrypted with the OS keychain (safeStorage) when available.
const keys = fileKeyStore(join(app.getPath('userData'), 'provider-keys.bin'), {
  enc: (s) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8')),
  dec: (b) => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : b.toString('utf8'))
})

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: '$mart Trader',
    backgroundColor: '#080c18',
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/preload.js'), contextIsolation: true, sandbox: false }
  })
  win.once('ready-to-show', () => win.show())
  // TM_SMOKE=1: load the UI, print what rendered and exit (startup check after a build).
  if (process.env.TM_SMOKE) {
    win.webContents.on('console-message', (_e, level, message) => level >= 2 && console.log('[renderer error]', message))
    win.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        const r = await win.webContents.executeJavaScript(
          "JSON.stringify({shell: !!document.querySelector('.shell'), title: document.querySelector('.crumb b')?.textContent, nav: document.querySelectorAll('.sb-item[data-nav]').length, head: !!document.querySelector('.page-head'), error: document.querySelector('.content pre')?.textContent ?? null})"
        )
        console.log('[smoke]', r)
        app.quit()
      }, 2500)
    )
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('db:load', async () => {
  ensureDirs()
  if (!existsSync(dbPath())) return null
  return new Uint8Array(await fs.readFile(dbPath()))
})
ipcMain.handle('db:save', async (_e, bytes: Uint8Array) => {
  ensureDirs()
  const tmp = dbPath() + '.tmp'
  await fs.writeFile(tmp, Buffer.from(bytes))
  await fs.rename(tmp, dbPath())
  return true
})
ipcMain.handle('file:save', async (_e, opts: { name: string; data: string | Uint8Array; filters?: Electron.FileFilter[] }) => {
  const r = await dialog.showSaveDialog({ defaultPath: opts.name, filters: opts.filters })
  if (r.canceled || !r.filePath) return null
  await fs.writeFile(r.filePath, typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data))
  return r.filePath
})
ipcMain.handle('report:pdf', async (_e, opts: { html: string; name: string }) => {
  const r = await dialog.showSaveDialog({ defaultPath: opts.name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
  if (r.canceled || !r.filePath) return null
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(opts.html))
  const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } })
  w.destroy()
  await fs.writeFile(r.filePath, pdf)
  shell.openPath(r.filePath)
  return r.filePath
})

// Trade screenshots: data/screenshots/<random>-<name>
const safeName = (f: string) => f.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120)
ipcMain.handle('img:save', async (_e, o: { name: string; bytes: Uint8Array }) => {
  ensureDirs()
  const file = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}-${safeName(o.name)}`
  await fs.writeFile(join(imageDir(), file), Buffer.from(o.bytes))
  return file
})
ipcMain.handle('img:read', async (_e, file: string) => {
  const p = join(imageDir(), safeName(file))
  return existsSync(p) ? new Uint8Array(await fs.readFile(p)) : null
})
ipcMain.handle('img:delete', async (_e, file: string) => {
  const p = join(imageDir(), safeName(file))
  if (existsSync(p)) await fs.unlink(p)
})
ipcMain.handle('img:list', async () => {
  ensureDirs()
  return fs.readdir(imageDir())
})

ipcMain.handle('market', (_e, msg) => handleMarket(msg, keys))

ipcMain.handle('app:info', () => ({
  dataDir: dataDir(),
  backupDir: backupDir(),
  version: app.getVersion(),
  dbSize: existsSync(dbPath()) ? statSync(dbPath()).size : 0,
  platform: `${process.platform} ${process.arch}`,
  electron: process.versions.electron,
  keyEncryption: safeStorage.isEncryptionAvailable()
}))
ipcMain.handle('app:openFolder', (_e, which: 'data' | 'backups') => shell.openPath(which === 'data' ? dataDir() : backupDir()))

app.whenReady().then(async () => {
  ensureDirs()
  await dailyBackup().catch(() => undefined)
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { label: '$mart Trader', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
          { role: 'editMenu' },
          { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
          { role: 'windowMenu' }
        ])
      : null
  )
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
