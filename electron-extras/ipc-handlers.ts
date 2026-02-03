import { BrowserWindow, ipcMain, shell, dialog } from 'electron'

export function registerBrowserIpcHandlers(mainWindow: BrowserWindow) {
  // Open external links in system browser
  ipcMain.handle('browser:openExternal', async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Show save dialog
  ipcMain.handle('browser:showSaveDialog', async (_event, options: Electron.SaveDialogOptions) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, options)
      return result
    } catch (error) {
      return { canceled: true, error: String(error) }
    }
  })

  // Show open dialog
  ipcMain.handle('browser:showOpenDialog', async (_event, options: Electron.OpenDialogOptions) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, options)
      return result
    } catch (error) {
      return { canceled: true, filePaths: [], error: String(error) }
    }
  })

  // Get window state
  ipcMain.handle('browser:getWindowState', () => {
    return {
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
      isFullScreen: mainWindow.isFullScreen(),
      bounds: mainWindow.getBounds(),
    }
  })

  // Window controls
  ipcMain.handle('browser:minimize', () => {
    mainWindow.minimize()
    return { success: true }
  })

  ipcMain.handle('browser:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
    return { success: true, isMaximized: mainWindow.isMaximized() }
  })

  ipcMain.handle('browser:close', () => {
    mainWindow.close()
    return { success: true }
  })
}

export function unregisterBrowserIpcHandlers() {
  ipcMain.removeHandler('browser:openExternal')
  ipcMain.removeHandler('browser:showSaveDialog')
  ipcMain.removeHandler('browser:showOpenDialog')
  ipcMain.removeHandler('browser:getWindowState')
  ipcMain.removeHandler('browser:minimize')
  ipcMain.removeHandler('browser:maximize')
  ipcMain.removeHandler('browser:close')
}
