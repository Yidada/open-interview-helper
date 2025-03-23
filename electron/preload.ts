console.log("Preload script starting...")
import { contextBridge, ipcRenderer } from "electron"
const { shell } = require("electron")

// Types for the exposed Electron API
interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  clearStore: () => Promise<{ success: boolean; error?: string }>
  getScreenshots: () => Promise<{
    success: boolean
    previews?: Array<{ path: string; preview: string }> | null
    error?: string
  }>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void
  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  openExternal: (url: string) => void
  toggleMainWindow: () => Promise<{ success: boolean; error?: string }>
  triggerScreenshot: () => Promise<{ success: boolean; error?: string }>
  processScreenshots: () => Promise<{ success: boolean; error?: string }>
  processExtraScreenshots: () => Promise<{ success: boolean; error?: string }>
  reset: () => Promise<{ success: boolean; error?: string }>
  moveLeft: () => Promise<{ success: boolean; error?: string }>
  moveRight: () => Promise<{ success: boolean; error?: string }>
  moveUp: () => Promise<{ success: boolean; error?: string }>
  moveDown: () => Promise<{ success: boolean; error?: string }>
  onOutOfCredits: (callback: () => void) => () => void
  onUpdateAvailable: (callback: (info: any) => void) => () => void
  onUpdateDownloaded: (callback: (info: any) => void) => () => void
  decrementCredits: () => Promise<void>
  onCreditsUpdated: (callback: (credits: number) => void) => () => void
  getPlatform: () => Promise<string>
}

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  OUT_OF_CREDITS: "out-of-credits",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",
  RESET: "reset",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// At the top of the file
console.log("Preload script is running")

const electronAPI = {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  clearStore: () => ipcRenderer.invoke("clear-store"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),
  toggleMainWindow: async () => {
    console.log("toggleMainWindow called from preload")
    try {
      const result = await ipcRenderer.invoke("toggle-window")
      console.log("toggle-window result:", result)
      return result
    } catch (error) {
      console.error("Error in toggleMainWindow:", error)
      throw error
    }
  },
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("initial-start", subscription)
    return () => {
      ipcRenderer.removeListener("initial-start", subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("debug-start", subscription)
    return () => {
      ipcRenderer.removeListener("debug-start", subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on("solution-error", subscription)
    return () => {
      ipcRenderer.removeListener("solution-error", subscription)
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on("debug-error", subscription)
    return () => {
      ipcRenderer.removeListener("debug-error", subscription)
    }
  },
  onDebugSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("debug-success", subscription)
    return () => {
      ipcRenderer.removeListener("debug-success", subscription)
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("processing-no-screenshots", subscription)
    return () => {
      ipcRenderer.removeListener("processing-no-screenshots", subscription)
    }
  },
  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("problem-extracted", subscription)
    return () => {
      ipcRenderer.removeListener("problem-extracted", subscription)
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("solution-success", subscription)
    return () => {
      ipcRenderer.removeListener("solution-success", subscription)
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("procesing-unauthorized", subscription)
    return () => {
      ipcRenderer.removeListener("procesing-unauthorized", subscription)
    }
  },
  onOutOfCredits: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("out-of-credits", subscription)
    return () => {
      ipcRenderer.removeListener("out-of-credits", subscription)
    }
  },
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  processScreenshots: () => ipcRenderer.invoke("process-screenshots"),
  processExtraScreenshots: () => ipcRenderer.invoke("process-extra-screenshots"),
  reset: () => ipcRenderer.invoke("reset"),
  moveLeft: () => ipcRenderer.invoke("move-left"),
  moveRight: () => ipcRenderer.invoke("move-right"),
  moveUp: () => ipcRenderer.invoke("move-up"),
  moveDown: () => ipcRenderer.invoke("move-down"),

  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-available", subscription)
    }
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-downloaded", subscription)
    return () => {
      ipcRenderer.removeListener("update-downloaded", subscription)
    }
  },
  decrementCredits: () => ipcRenderer.invoke("decrement-credits"),
  onCreditsUpdated: (callback: (credits: number) => void) => {
    const subscription = (_event: any, credits: number) => callback(credits)
    ipcRenderer.on("credits-updated", subscription)
    return () => {
      ipcRenderer.removeListener("credits-updated", subscription)
    }
  },
  getPlatform: () => ipcRenderer.invoke("get-platform")
}

// Expose the API to the renderer process
contextBridge.exposeInMainWorld("api", electronAPI)

// Add a global initialization flag that ProcessingHelper can check
contextBridge.exposeInMainWorld("__IS_INITIALIZED__", false)

// Add a global credits counter
contextBridge.exposeInMainWorld("__CREDITS__", 3)

// Add a global language preference
contextBridge.exposeInMainWorld("__LANGUAGE__", "python")

console.log("Preload script completed")
