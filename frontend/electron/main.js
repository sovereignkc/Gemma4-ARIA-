// electron/main.js — Electron main process
// Responsibilities: spawn FastAPI, open window, file dialogs ONLY.
// All model calls go direct React → http://localhost:8000. No IPC for inference.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

const BACKEND_PORT = 8000
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow = null
let backendProcess = null

app.commandLine.appendSwitch('enable-speech-dispatcher')

// ── Start FastAPI backend ────────────────────────────────────────────────────

function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath, 'backend')

  const venvPython = isDev
    ? path.join(__dirname, '../../.venv/bin/python')
    : path.join(process.resourcesPath, '.venv/bin/python')

  backendProcess = spawn(venvPython, [
    '-m', 'uvicorn', 'main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
    '--log-level', isDev ? 'info' : 'warning',
  ], { cwd: backendDir, stdio: isDev ? 'inherit' : 'ignore' })

  backendProcess.on('error', (err) => {
    console.error('Backend failed to start:', err)
  })
}

// ── Create window ────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',   // native macOS traffic lights
    backgroundColor: '#0a0f1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const url = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`

  mainWindow.loadURL(url)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  // Grant mic access for STT without a system permission dialog
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' })
}

// ── IPC: file dialog only (no model inference through IPC) ────────────────────

ipcMain.handle('dialog:openImage', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('dialog:openAudio', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio File',
    filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'webm', 'm4a'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('dialog:openDocument', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Document',
    filters: [
      { name: 'All Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'png', 'jpg', 'jpeg'] },
      { name: 'PDF', extensions: ['pdf'] },
      { name: 'Word', extensions: ['docx', 'doc'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
    ],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('dialog:saveTTS', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Audio',
    defaultPath: 'aether-speech.wav',
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
  })
  return canceled ? null : filePath
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startBackend()
  // Give FastAPI 1.5s to bind before showing window
  setTimeout(createWindow, 1500)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})
