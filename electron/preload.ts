import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  loadDb: () => ipcRenderer.invoke('db:load'),
  saveDb: (bytes: Uint8Array) => ipcRenderer.invoke('db:save', bytes),
  saveFile: (opts: unknown) => ipcRenderer.invoke('file:save', opts),
  reportPdf: (opts: unknown) => ipcRenderer.invoke('report:pdf', opts),
  imgSave: (o: unknown) => ipcRenderer.invoke('img:save', o),
  imgRead: (file: string) => ipcRenderer.invoke('img:read', file),
  imgDelete: (file: string) => ipcRenderer.invoke('img:delete', file),
  imgList: () => ipcRenderer.invoke('img:list'),
  market: (msg: unknown) => ipcRenderer.invoke('market', msg),
  info: () => ipcRenderer.invoke('app:info'),
  openFolder: (which: string) => ipcRenderer.invoke('app:openFolder', which)
})
