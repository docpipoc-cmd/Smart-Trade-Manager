// SQLite (sql.js / WebAssembly) running in the renderer — same design as $mart.
// Desktop: the file lives in <userData>/data/trader.sqlite (saved through the Electron main process,
// with daily backups). Browser (`npm run web`): kept in IndexedDB.
// Also here: optional password (file encrypted with AES-256-GCM), undo snapshots and the activity history.

import initSqlJs, { type Database, type SqlValue, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { useSyncExternalStore } from 'react'
import { SCHEMA, seed, migrateSchema } from './schema'
import { L } from './i18n'

export interface AppInfo {
  dataDir: string
  backupDir: string
  version: string
  dbSize: number
  platform: string
  electron: string
  keyEncryption: boolean
}

declare global {
  interface Window {
    api?: {
      loadDb(): Promise<Uint8Array | null>
      saveDb(bytes: Uint8Array): Promise<boolean>
      saveFile(o: { name: string; data: string | Uint8Array; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>
      reportPdf(o: { html: string; name: string }): Promise<string | null>
      imgSave(o: { name: string; bytes: Uint8Array }): Promise<string>
      imgRead(file: string): Promise<Uint8Array | null>
      imgDelete(file: string): Promise<void>
      imgList(): Promise<string[]>
      market(msg: unknown): Promise<unknown>
      info(): Promise<AppInfo>
      openFolder(which: 'data' | 'backups'): Promise<void>
    }
  }
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let version = 0
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
export let saveState: 'saved' | 'saving' | 'error' = 'saved'

// ---------- encryption
const MAGIC = new TextEncoder().encode('STRENC01')
let cryptoKey: CryptoKey | null = null
let cryptoSalt: Uint8Array | null = null
let passwordCheck: string | null = null

export function isEncryptedFile(b: Uint8Array | null): boolean {
  return !!b && b.length > 36 && MAGIC.every((c, i) => b[i] === c)
}
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.slice().buffer, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
async function encrypt(plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey!, plain.slice().buffer))
  const out = new Uint8Array(MAGIC.length + 16 + 12 + c.length)
  out.set(MAGIC, 0)
  out.set(cryptoSalt!, 8)
  out.set(iv, 24)
  out.set(c, 36)
  return out
}
async function decrypt(file: Uint8Array, password: string): Promise<{ plain: Uint8Array; key: CryptoKey; salt: Uint8Array }> {
  const salt = file.slice(8, 24)
  const iv = file.slice(24, 36)
  const key = await deriveKey(password, salt)
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, file.slice(36).buffer))
  return { plain, key, salt }
}
async function hashPw(pw: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('smart-trader:' + pw))
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}
export const hasPassword = () => !!cryptoKey

/** Turns the password on, changes it, or removes it (null). */
export async function setPassword(password: string | null): Promise<void> {
  if (password) {
    cryptoSalt = crypto.getRandomValues(new Uint8Array(16))
    cryptoKey = await deriveKey(password, cryptoSalt)
    passwordCheck = await hashPw(password)
  } else {
    cryptoKey = null
    cryptoSalt = null
    passwordCheck = null
  }
  await flush()
}
/** Re-asks the password before sensitive actions (wipe, restore, removing the password). */
export async function verifyPassword(pw: string): Promise<boolean> {
  return !!passwordCheck && (await hashPw(pw)) === passwordCheck
}

// ---------- browser persistence (IndexedDB)
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('smart-trader', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('files')
      r.result.createObjectStore('images')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
export async function idbGet(store: 'files' | 'images', key: string): Promise<Uint8Array | null> {
  const d = await idb()
  return new Promise((res) => {
    const g = d.transaction(store).objectStore(store).get(key)
    g.onsuccess = () => res((g.result as Uint8Array) ?? null)
    g.onerror = () => res(null)
  })
}
export async function idbPut(store: 'files' | 'images', key: string, bytes: Uint8Array): Promise<void> {
  const d = await idb()
  return new Promise((res, rej) => {
    const t = d.transaction(store, 'readwrite')
    t.objectStore(store).put(bytes, key)
    t.oncomplete = () => res()
    t.onerror = () => rej(t.error)
  })
}
export async function idbDelete(store: 'files' | 'images', key: string): Promise<void> {
  const d = await idb()
  return new Promise((res) => {
    const t = d.transaction(store, 'readwrite')
    t.objectStore(store).delete(key)
    t.oncomplete = () => res()
    t.onerror = () => res()
  })
}
export async function idbKeys(store: 'files' | 'images'): Promise<string[]> {
  const d = await idb()
  return new Promise((res) => {
    const g = d.transaction(store).objectStore(store).getAllKeys()
    g.onsuccess = () => res(g.result.map(String))
    g.onerror = () => res([])
  })
}

export const isDesktop = () => !!window.api

let pendingFile: Uint8Array | null = null

/** Opens the database. Returns 'locked' when the file is password protected. */
export async function openDb(): Promise<'ok' | 'locked'> {
  SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const bytes = window.api ? await window.api.loadDb() : await idbGet('files', 'db')
  if (isEncryptedFile(bytes)) {
    pendingFile = bytes
    return 'locked'
  }
  await start(bytes)
  return 'ok'
}

export async function unlock(password: string): Promise<boolean> {
  if (!pendingFile) return true
  try {
    const r = await decrypt(pendingFile, password)
    cryptoKey = r.key
    cryptoSalt = r.salt
    passwordCheck = await hashPw(password)
    pendingFile = null
    await start(r.plain)
    return true
  } catch {
    return false
  }
}

async function start(bytes: Uint8Array | null): Promise<void> {
  db = bytes ? new SQL!.Database(bytes) : new SQL!.Database()
  prepare()
  undoStack.length = 0
  await flush()
}

function prepare(): void {
  db!.exec('PRAGMA foreign_keys = ON;')
  db!.exec(SCHEMA)
  silent = true
  try {
    if (!get<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'")) seed()
    migrateSchema()
  } finally {
    silent = false
  }
}

function d(): Database {
  if (!db) throw new Error('Database not open')
  return db
}

type Params = SqlValue[] | Record<string, SqlValue>

export function all<T = Record<string, unknown>>(sql: string, params: Params = []): T[] {
  const st = d().prepare(sql)
  st.bind(params as never)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}
export function get<T = Record<string, unknown>>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0]
}
/** Raw exec for schema work (no undo snapshot). */
export function exec(sql: string): void {
  d().exec(sql)
}

// ---------- undo
interface Snap {
  bytes: Uint8Array
  label: string
  at: number
}
const undoStack: Snap[] = []
let depth = 0
let silent = false
let lastSnapAt = 0
const UNDO_MAX = 30

function snapshot(): void {
  if (silent || depth > 0) return
  const now = Date.now()
  if (now - lastSnapAt < 800 && undoStack.length) {
    lastSnapAt = now
    return
  }
  lastSnapAt = now
  undoStack.push({ bytes: d().export(), label: '', at: now })
  d().exec('PRAGMA foreign_keys = ON;')
  if (undoStack.length > UNDO_MAX) undoStack.shift()
}
export function canUndo(): string | null {
  const s = undoStack[undoStack.length - 1]
  return s ? s.label || L('última alteração', 'last change') : null
}
export function undo(): string | null {
  const s = undoStack.pop()
  if (!s) return null
  db?.close()
  db = new SQL!.Database(s.bytes)
  db.exec('PRAGMA foreign_keys = ON;')
  lastSnapAt = 0
  changed()
  return s.label || L('última alteração', 'last change')
}

/** Records what the user did (Administration › History) and names the pending undo step. */
export function audit(action: string, detail = ''): void {
  const top = undoStack[undoStack.length - 1]
  if (top && Date.now() - top.at < 5000 && !top.label) top.label = action
  const was = silent
  silent = true
  try {
    d().run("INSERT INTO history(at, action, detail) VALUES(datetime('now','localtime'), ?, ?)", [action, detail.slice(0, 500)])
    d().run('DELETE FROM history WHERE id <= (SELECT MAX(id) - 3000 FROM history)')
  } finally {
    silent = was
  }
  changed()
}

/** Runs a statement and schedules a save + UI refresh. */
export function run(sql: string, params: Params = []): void {
  snapshot()
  d().run(sql, params as never)
  changed()
}

/** Runs several writes atomically (one undo step). */
export function transaction<T>(fn: () => T): T {
  if (depth > 0) return fn()
  snapshot()
  depth++
  d().exec('BEGIN')
  try {
    const r = fn()
    d().exec('COMMIT')
    return r
  } catch (e) {
    d().exec('ROLLBACK')
    throw e
  } finally {
    depth--
    changed()
  }
}

function changed(): void {
  version++
  listeners.forEach((l) => l())
  if (saveTimer) clearTimeout(saveTimer)
  saveState = 'saving'
  saveTimer = setTimeout(() => void flush(), 400)
}

export async function flush(): Promise<void> {
  if (!db) return
  try {
    let bytes = db.export()
    db.exec('PRAGMA foreign_keys = ON;')
    if (cryptoKey) bytes = await encrypt(bytes)
    if (window.api) await window.api.saveDb(bytes)
    else await idbPut('files', 'db', bytes)
    saveState = 'saved'
  } catch (e) {
    console.error(e)
    saveState = 'error'
  }
  listeners.forEach((l) => l())
}

/** Bytes for a manual backup (encrypted when a password is set). */
export async function backupBytes(): Promise<Uint8Array> {
  const b = d().export()
  d().exec('PRAGMA foreign_keys = ON;')
  return cryptoKey ? encrypt(b) : b
}
export function rawSize(): number {
  const b = d().export()
  d().exec('PRAGMA foreign_keys = ON;')
  return b.length
}

/** Restores a backup file. Encrypted backups need their password. */
export async function replaceWith(bytes: Uint8Array, password?: string): Promise<void> {
  let plain = bytes
  if (isEncryptedFile(bytes)) {
    if (!password) throw new Error('PASSWORD_REQUIRED')
    plain = (await decrypt(bytes, password)).plain
  }
  const next = new SQL!.Database(plain)
  next.exec('SELECT COUNT(*) FROM trades') // throws if not our file
  snapshot()
  db?.close()
  db = next
  prepare()
  changed()
  await flush()
}

/** Erases every record and starts a fresh database (options re-seeded). */
export async function wipe(): Promise<void> {
  snapshot()
  db?.close()
  db = new SQL!.Database()
  prepare()
  changed()
  await flush()
}

export const dbVersion = () => version

export function useDbVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version
  )
}
export function useSaveState(): typeof saveState {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => saveState
  )
  return saveState
}

export function setMeta(key: string, value: string): void {
  run('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)', [key, value])
}
export function getMeta(key: string): string | null {
  return get<{ value: string }>('SELECT value FROM meta WHERE key=?', [key])?.value ?? null
}
