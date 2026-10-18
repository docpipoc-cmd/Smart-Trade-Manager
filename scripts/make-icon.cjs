// Renders build/logo.svg to build/icon.png (512) and build/icon.ico (256, PNG-compressed) using Electron.
// Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const root = path.join(__dirname, '..')
  const svg = fs.readFileSync(path.join(root, 'build/logo.svg'), 'utf8').replace('<svg ', '<svg width="512" height="512" ')
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, backgroundColor: '#00000000', webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`))
  await new Promise((r) => setTimeout(r, 600))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const png512 = img.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  const png256 = img.resize({ width: 256, height: 256, quality: 'best' }).toPNG()
  fs.writeFileSync(path.join(root, 'build/icon.png'), png512)
  // ICO container with a single 256×256 PNG entry
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0) // 0 = 256 px
  entry.writeUInt8(0, 1)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png256.length, 8)
  entry.writeUInt32LE(22, 12)
  fs.writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([head, entry, png256]))
  console.log('icon written', png512.length, png256.length)
  app.quit()
})
