// Runs the renderer alone in a normal browser (data saved in IndexedDB): `npm run web`.
// The market-data endpoints run here, inside the Vite server (Node), so provider
// keys stay on the server side exactly as in the desktop app's main process.
import { resolve } from 'path'
import { realpathSync } from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleMarket } from './server/market'
import { fileKeyStore } from './server/keys'

const root = realpathSync.native(resolve(__dirname, 'src'))
const keys = fileKeyStore(resolve(__dirname, '.data', 'keys.json'))

function marketApi(): Plugin {
  return {
    name: 'market-api',
    configureServer(server) {
      server.middlewares.use('/api/market', (req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', async () => {
          try {
            const msg = body ? JSON.parse(body) : {}
            const out = await handleMarket(msg, keys)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(out))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: String((e as Error).message ?? e) }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  root,
  plugins: [react(), marketApi()],
  server: { port: 5174, strictPort: true }
})
