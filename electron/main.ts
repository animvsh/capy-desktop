import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { registerPlaywrightIpcHandlers, unregisterPlaywrightIpcHandlers } from '../electron-extras/playwright-ipc'
import { registerBrowserIpcHandlers, unregisterBrowserIpcHandlers } from '../electron-extras/ipc-handlers'
import { logger } from './logger'

const store = new Store()

let mainWindow: BrowserWindow | null = null
let isQuitting = false  // CHAOS FIX: Track if app is quitting

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

  // CHAOS FIX: Handle close events gracefully
  mainWindow.on('close', (event) => {
    // On macOS, prevent window close from quitting app unless explicitly quitting
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      return
    }
  })

  mainWindow.on('closed', () => {
    // Cleanup IPC handlers - this will also clean up any active automations
    unregisterBrowserIpcHandlers()
    unregisterPlaywrightIpcHandlers()
    mainWindow = null
  })
  
  // CHAOS FIX: Handle renderer crashes
  mainWindow.webContents.on('crashed', () => {
    logger.main.error('Renderer process crashed')
    // Clean up automation state
    unregisterPlaywrightIpcHandlers()
  })
  
  // CHAOS FIX: Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    logger.main.warn('Window became unresponsive')
  })
  
  mainWindow.on('responsive', () => {
    logger.main.info('Window is responsive again')
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
    // CHAOS FIX: On macOS, re-show window instead of creating new one
    if (mainWindow) {
      mainWindow.show()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// CHAOS FIX: Handle before-quit to set quitting flag
app.on('before-quit', () => {
  isQuitting = true
})

// CHAOS FIX: Handle uncaught exceptions in main process
process.on('uncaughtException', (error) => {
  logger.main.error('Uncaught exception', error)
  // Try to clean up gracefully
  try {
    unregisterPlaywrightIpcHandlers()
  } catch {
    // Ignore cleanup errors
  }
})

process.on('unhandledRejection', (reason, promise) => {
  logger.main.error('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)))
})
