import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { registerPlaywrightIpcHandlers, unregisterPlaywrightIpcHandlers } from '../electron-extras/playwright-ipc'
import { registerBrowserIpcHandlers, unregisterBrowserIpcHandlers } from '../electron-extras/ipc-handlers'

const store = new Store()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d1117',
    show: false,
  })

  // Register browser automation IPC handlers
  registerBrowserIpcHandlers(mainWindow)
  registerPlaywrightIpcHandlers(mainWindow)

  // Show window when ready to prevent white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    // Cleanup IPC handlers
    unregisterBrowserIpcHandlers()
    unregisterPlaywrightIpcHandlers()
    mainWindow = null
  })
}

// IPC handlers for electron-store
ipcMain.handle('store:get', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('store:delete', (_event, key: string) => {
  store.delete(key)
})

ipcMain.handle('store:clear', () => {
  store.clear()
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
