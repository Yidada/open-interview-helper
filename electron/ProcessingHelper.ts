// ProcessingHelper.ts
import fs from "node:fs"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import axios from "axios"
import { app } from "electron"
import { BrowserWindow } from "electron"
import { anthropicClient } from "./api"

const isDev = !app.isPackaged

export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 0

    try {
      await this.waitForInitialization(mainWindow)
      const credits = await mainWindow.webContents.executeJavaScript(
        "window.__CREDITS__"
      )

      if (
        typeof credits !== "number" ||
        credits === undefined ||
        credits === null
      ) {
        console.warn("Credits not properly initialized")
        return 0
      }

      return credits
    } catch (error) {
      console.error("Error getting credits:", error)
      return 0
    }
  }

  private async getLanguage(): Promise<string> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return "python"

    try {
      await this.waitForInitialization(mainWindow)
      const language = await mainWindow.webContents.executeJavaScript(
        "window.__LANGUAGE__"
      )

      if (
        typeof language !== "string" ||
        language === undefined ||
        language === null
      ) {
        console.warn("Language not properly initialized")
        return "python"
      }

      return language
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  private async getAuthToken(): Promise<string | null> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return null

    try {
      await this.waitForInitialization(mainWindow)
      const token = await mainWindow.webContents.executeJavaScript(
        "window.__AUTH_TOKEN__"
      )

      if (!token) {
        console.warn("No auth token found")
        return null
      }

      return token
    } catch (error) {
      console.error("Error getting auth token:", error)
      return null
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // Check if we have any credits left
    const credits = await this.getCredits()
    if (credits < 1) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.OUT_OF_CREDITS)
      return
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          screenshotQueue.map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString("base64")
          }))
        )

        // Use the helper to process screenshots
        const result = await this.processScreenshotsHelper(
          screenshots.map(({ path, data }) => ({ path, data })),
          signal
        )

        if (!result.success) {
          // If processing failed, notify the renderer
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            result.error
          )
        }

        // Decrement credits if successful processing
        if (result.success) {
          // Go to solutions view
          this.deps.setView("solutions")
          // Decrement credits
          const mainWindow = this.deps.getMainWindow()
          if (mainWindow) {
            await mainWindow.webContents.executeJavaScript(
              "window.api.decrementCredits()"
            )
          }
        }
      } catch (error: any) {
        const errorMessage = error.message || "Unknown error"
        console.error("Error processing screenshots:", errorMessage)
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          errorMessage
        )
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      if (extraScreenshotQueue.length === 0) {
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        const screenshots = await Promise.all(
          [
            ...this.screenshotHelper.getScreenshotQueue(),
            ...extraScreenshotQueue
          ].map(async (path) => ({
            path,
            preview: await this.screenshotHelper.getImagePreview(path),
            data: fs.readFileSync(path).toString("base64")
          }))
        )
        console.log(
          "Combined screenshots for processing:",
          screenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          screenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    const MAX_RETRIES = 0
    let retryCount = 0

    while (retryCount <= MAX_RETRIES) {
      try {
        const imageDataList = screenshots.map((screenshot) => screenshot.data)
        const mainWindow = this.deps.getMainWindow()
        const language = await this.getLanguage()
        let problemInfo

        // First API call - extract problem info using Anthropic API
        try {
          // Check if Anthropic client is configured
          if (!anthropicClient.isConfigured()) {
            return {
              success: false,
              error: "Anthropic API key not configured. Please check your .zshrc file or environment variables."
            }
          }

          // Use Anthropic client to process images
          problemInfo = await anthropicClient.processImages(
            imageDataList,
            language,
            { signal }
          )

          // Store problem info in AppState
          this.deps.setProblemInfo(problemInfo)

          // Send first success event
          if (mainWindow) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
              problemInfo
            )

            // Generate solutions after successful extraction
            const solutionsResult = await this.generateSolutionsHelper(signal)
            if (solutionsResult.success) {
              // Clear any existing extra screenshots before transitioning to solutions view
              this.screenshotHelper.clearExtraScreenshotQueue()
              mainWindow.webContents.send(
                this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
                solutionsResult.data
              )
              return { success: true, data: solutionsResult.data }
            } else {
              throw new Error(
                solutionsResult.error || "Failed to generate solutions"
              )
            }
          }
        } catch (error: any) {
          // If the request was cancelled, don't retry
          if (axios.isCancel(error)) {
            return {
              success: false,
              error: "Processing was canceled by the user."
            }
          }

          console.error("API Error Details:", {
            message: error.message,
            code: error.code
          })

          // If we get here, it's an unknown error
          throw new Error(error.message || "Server error. Please try again.")
        }
      } catch (error: any) {
        // Log the full error for debugging
        console.error("Processing error details:", {
          message: error.message,
          code: error.code,
          retryCount
        })

        // If it's a cancellation or we've exhausted retries, return the error
        if (axios.isCancel(error) || retryCount >= MAX_RETRIES) {
          return { success: false, error: error.message }
        }

        // Increment retry count and continue
        retryCount++
      }
    }

    // If we get here, all retries failed
    return {
      success: false,
      error: "Failed to process after multiple attempts. Please try again."
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo()
      const language = await this.getLanguage()

      if (!problemInfo) {
        throw new Error("No problem info available")
      }

      // Check if Anthropic client is configured
      if (!anthropicClient.isConfigured()) {
        return {
          success: false,
          error: "Anthropic API key not configured. Please check your .zshrc file or environment variables."
        }
      }

      // Use Anthropic client to generate solution
      const solutionData = await anthropicClient.generateSolution(
        problemInfo,
        language,
        { signal }
      )

      return { success: true, data: solutionData }
    } catch (error: any) {
      const mainWindow = this.deps.getMainWindow()

      // Handle cancellation errors
      if (axios.isCancel(error)) {
        console.log("Solution generation was canceled")
        return {
          success: false,
          error: "Solution generation was canceled."
        }
      }

      console.error("Solution generation error:", error.message)
      
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error.message
        )
      }

      return {
        success: false,
        error: error.message || "Failed to generate solution"
      }
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    const MAX_RETRIES = 0
    let retryCount = 0

    while (retryCount <= MAX_RETRIES) {
      try {
        const imageDataList = screenshots.map((screenshot) => screenshot.data)
        const mainWindow = this.deps.getMainWindow()
        const language = await this.getLanguage()
        const problemInfo = this.deps.getProblemInfo()

        if (!problemInfo) {
          throw new Error("No problem info available")
        }

        // Get existing solution
        let existingSolution = ""
        if (
          problemInfo.solution &&
          typeof problemInfo.solution === "string" &&
          problemInfo.solution.trim().length > 0
        ) {
          existingSolution = problemInfo.solution
        } else if (
          problemInfo.solution_data &&
          problemInfo.solution_data.solution &&
          typeof problemInfo.solution_data.solution === "string"
        ) {
          existingSolution = problemInfo.solution_data.solution
        }

        if (!existingSolution) {
          throw new Error("No existing solution found to debug")
        }

        // Get error details from the screenshots
        try {
          // Check if Anthropic client is configured
          if (!anthropicClient.isConfigured()) {
            return {
              success: false,
              error: "Anthropic API key not configured. Please check your .zshrc file or environment variables."
            }
          }

          // First extract error details from the screenshots
          const errorData = await anthropicClient.processImages(
            imageDataList,
            language,
            { 
              signal,
              maxTokens: 1000, // Smaller token limit for extracting error
              temperature: 0.2 // Lower temperature for more focused response
            }
          )

          // Use the error details and the existing solution to debug
          const errorDescription = typeof errorData === "string" 
            ? errorData 
            : errorData.description || JSON.stringify(errorData);

          // Generate debug solution
          const debugResult = await anthropicClient.debugSolution(
            problemInfo,
            existingSolution,
            errorDescription,
            language,
            { signal }
          )

          // Combine and update the problem info
          const updatedProblemInfo = {
            ...problemInfo,
            debug_solution: debugResult.debug_solution,
            debug_data: debugResult
          }

          // Store updated problem info
          this.deps.setProblemInfo(updatedProblemInfo)

          if (mainWindow) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
              debugResult
            )
          }

          return { success: true, data: debugResult }
        } catch (error: any) {
          // If the request was cancelled, don't retry
          if (axios.isCancel(error)) {
            return {
              success: false,
              error: "Debug processing was canceled by the user."
            }
          }

          console.error("Debug API Error Details:", {
            message: error.message,
            code: error.code
          })

          throw new Error(error.message || "Debug error. Please try again.")
        }
      } catch (error: any) {
        // Log the full error for debugging
        console.error("Debug error details:", {
          message: error.message,
          code: error.code,
          retryCount
        })

        // If it's a cancellation or we've exhausted retries, return the error
        if (axios.isCancel(error) || retryCount >= MAX_RETRIES) {
          const mainWindow = this.deps.getMainWindow()
          if (mainWindow) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
              error.message
            )
          }
          return { success: false, error: error.message }
        }

        // Increment retry count and continue
        retryCount++
      }
    }

    // If we get here, all retries failed
    return {
      success: false,
      error: "Failed to debug after multiple attempts. Please try again."
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    // Reset hasDebugged flag
    this.deps.setHasDebugged(false)

    // Clear any pending state
    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      // Send a clear message that processing was cancelled
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }

  // Add the processExtraScreenshots method for debugging
  public async processExtraScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // Check if we have any credits left
    const credits = await this.getCredits()
    if (credits < 1) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.OUT_OF_CREDITS)
      return
    }

    // Notify the renderer that debug processing is starting
    mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

    // Get the current view and ensure we're in the solutions view
    const view = this.deps.getView()
    if (view !== "solutions") {
      console.warn("Attempted to process extra screenshots outside of solutions view")
      return
    }

    // Get the extra screenshot queue
    const extraScreenshotQueue = this.screenshotHelper.getExtraScreenshotQueue()
    console.log("Processing extra screenshots for debugging:", extraScreenshotQueue)
    
    if (extraScreenshotQueue.length === 0) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
      return
    }

    try {
      // Initialize AbortController for this operation
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      // Process the screenshots
      const screenshots = await Promise.all(
        extraScreenshotQueue.map(async (path) => ({
          path,
          preview: await this.screenshotHelper.getImagePreview(path),
          data: fs.readFileSync(path).toString("base64")
        }))
      )

      // Use the helper to process the extra screenshots
      const result = await this.processExtraScreenshotsHelper(
        screenshots.map(({ path, data }) => ({ path, data })),
        signal
      )

      if (!result.success) {
        // If processing failed, notify the renderer
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
          result.error
        )
      }

      // Decrement credits if successful processing
      if (result.success) {
        // Update view to debug
        this.deps.setView("debug")
        this.deps.setHasDebugged(true)
        
        // Decrement credits
        if (mainWindow) {
          await mainWindow.webContents.executeJavaScript(
            "window.api.decrementCredits()"
          )
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error"
      console.error("Error processing extra screenshots:", errorMessage)
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
        errorMessage
      )
    }
  }
}
