// preload.js — contextBridge: only exposes file dialog + version. Nothing else.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aether', {
  openImage:    () => ipcRenderer.invoke('dialog:openImage'),
  openAudio:    () => ipcRenderer.invoke('dialog:openAudio'),
  openDocument: () => ipcRenderer.invoke('dialog:openDocument'),
  saveTTS:      () => ipcRenderer.invoke('dialog:saveTTS'),
  version:      process.versions.electron,
})
