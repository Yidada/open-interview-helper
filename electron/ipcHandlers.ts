// ipcHandlers.ts

import { ipcMain, shell } from "electron"
import { randomBytes } from "crypto"
import { IIpcHandlerDeps } from "./main"

export function initializeIpcHandlers(deps: IIpcHandlerDeps): void {
  console.log("Initializing IPC handlers")

  // Credits handlers
  ipcMain.handle("set-initial-credits", async (_event, credits: number) => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      // Set the credits in a way that ensures atomicity
      await mainWindow.webContents.executeJavaScript(
        `window.__CREDITS__ = ${credits}`
      )
      mainWindow.webContents.send("credits-updated", credits)
    } catch (error) {
      console.error("Error setting initial credits:", error)
      throw error
    }
  })

  ipcMain.handle("decrement-credits", async () => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      const currentCredits = await mainWindow.webContents.executeJavaScript(
        "window.__CREDITS__"
      )
      if (currentCredits > 0) {
        const newCredits = currentCredits - 1
        await mainWindow.webContents.executeJavaScript(
          `window.__CREDITS__ = ${newCredits}`
        )
        mainWindow.webContents.send("credits-updated", newCredits)
      }
    } catch (error) {
      console.error("Error decrementing credits:", error)
    }
  })

  // Screenshot queue handlers
  ipcMain.handle("get-screenshot-queue", () => {
    return deps.getScreenshotQueue()
  })

  ipcMain.handle("get-extra-screenshot-queue", () => {
    return deps.getExtraScreenshotQueue()
  })

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return deps.deleteScreenshot(path)
  })

  ipcMain.handle("get-image-preview", async (event, path: string) => {
    return deps.getImagePreview(path)
  })

  // Screenshot processing handlers
  ipcMain.handle("process-screenshots", async () => {
    await deps.processingHelper?.processScreenshots()
  })

  ipcMain.handle("process-extra-screenshots", async () => {
    await deps.processingHelper?.processExtraScreenshots()
    return { success: true }
  })

  // Window dimension handlers
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        deps.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle(
    "set-window-dimensions",
    (event, width: number, height: number) => {
      deps.setWindowDimensions(width, height)
    }
  )

  // Screenshot management handlers
  ipcMain.handle("get-screenshots", async () => {
    try {
      let previews = []
      const currentView = deps.getView()

      if (currentView === "queue") {
        const queue = deps.getScreenshotQueue()
        previews = await Promise.all(
          queue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      } else {
        const queue = deps.getExtraScreenshotQueue()
        previews = await Promise.all(
          queue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      }

      return { success: true, previews }
    } catch (error) {
      console.error("Error getting screenshots:", error)
      return { success: false, error: "Failed to get screenshots" }
    }
  })

  // Screenshot action handlers
  ipcMain.handle("trigger-screenshot", async () => {
    try {
      const newScreenshotPath = await deps.takeScreenshot()
      return { success: true, path: newScreenshotPath }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      return { success: false, error: "Failed to take screenshot" }
    }
  })

  // Reset view handlers
  ipcMain.handle("reset", async () => {
    try {
      deps.clearQueues()
      deps.setView("queue")
      const mainWindow = deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("reset-view")
      }
      return { success: true }
    } catch (error) {
      console.error("Error resetting:", error)
      return { success: false, error: "Failed to reset" }
    }
  })

  // Handle opening external links
  ipcMain.handle("open-external", (event, url: string) => {
    shell.openExternal(url)
  })

  // Window control handlers
  ipcMain.handle("toggle-window", async () => {
    try {
      deps.toggleMainWindow()
      return { success: true }
    } catch (error) {
      console.error("Error toggling window:", error)
      return { success: false, error: "Failed to toggle window" }
    }
  })

  // Window movement handlers
  ipcMain.handle("move-left", async () => {
    try {
      deps.moveWindowLeft()
      return { success: true }
    } catch (error) {
      console.error("Error moving window left:", error)
      return { success: false, error: "Failed to move window left" }
    }
  })

  ipcMain.handle("move-right", async () => {
    try {
      deps.moveWindowRight()
      return { success: true }
    } catch (error) {
      console.error("Error moving window right:", error)
      return { success: false, error: "Failed to move window right" }
    }
  })

  ipcMain.handle("move-up", async () => {
    try {
      deps.moveWindowUp()
      return { success: true }
    } catch (error) {
      console.error("Error moving window up:", error)
      return { success: false, error: "Failed to move window up" }
    }
  })

  ipcMain.handle("move-down", async () => {
    try {
      deps.moveWindowDown()
      return { success: true }
    } catch (error) {
      console.error("Error moving window down:", error)
      return { success: false, error: "Failed to move window down" }
    }
  })

  // Platform info handlers
  ipcMain.handle("get-platform", () => {
    return process.platform
  })
}
