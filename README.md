# InterviewCoder

An invisible desktop application to help you pass your technical interviews.

## Overview

InterviewCoder is an Electron-based desktop application designed to assist developers during technical interviews. It allows users to take screenshots of coding problems, processes them using Anthropic Claude 3.7 Sonnet API, and provides solutions and debugging help.

## Features

- **Screenshot Capture**: Take screenshots of coding problems with global keyboard shortcuts
- **AI-Powered Solutions**: Process screenshots to extract problem information and generate solutions with Claude 3.7 Sonnet
- **Debugging Support**: Get help debugging your code with additional context
- **Movable UI**: Position the app window anywhere on your screen with keyboard shortcuts
- **Auto-Updates**: Automatic application updates

## Technical Stack

- **Frontend**: React, TypeScript, TailwindCSS
- **Backend**: Electron, Node.js
- **AI Integration**: Anthropic Claude 3.7 Sonnet API
- **State Management**: React Query
- **UI Components**: Radix UI

## Application Structure

### Electron (Main Process)

- `main.ts`: Entry point for the Electron application, handles window creation and management
- `ipcHandlers.ts`: IPC handlers for communication between main and renderer processes
- `ProcessingHelper.ts`: Handles the processing of screenshots and API interactions
- `ScreenshotHelper.ts`: Manages screenshot capturing and management
- `shortcuts.ts`: Registers global keyboard shortcuts
- `autoUpdater.ts`: Handles application updates
- `preload.ts`: Preload script that exposes APIs to the renderer process
- `api/anthropicClient.ts`: Client for interacting with the Anthropic Claude API

### React (Renderer Process)

- `App.tsx`: Main React component handling app state
- `components/`: UI components
- `contexts/`: React contexts for state management
- `lib/`: Utility libraries and service integrations
- `_pages/`: Main application pages
- `utils/`: Utility functions

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn
- Anthropic API Key (from https://console.anthropic.com/)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your API key using one of these methods:
   - Create a `.env` file based on the `.env.example` template and add your Anthropic API key: `ANTHROPIC_API_KEY=your_key_here`
   - Set the global environment variable `anthropic_key` with your API key: `export anthropic_key=your_key_here`
4. Start the development server:
   ```
   npm run dev
   ```

### Building for Production

```
npm run build
```

## Keyboard Shortcuts

- Take Screenshot: [Custom shortcut]
- Toggle Window Visibility: [Custom shortcut]
- Move Window Left/Right/Up/Down: [Custom shortcut]

## License

ISC

## Version

Current version: 1.0.20 