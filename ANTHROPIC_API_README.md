# Anthropic Claude 3.7 Sonnet API Integration

This document describes the implementation of the Anthropic Claude 3.7 Sonnet API in the application.

## Overview

The backend service has been replaced with a direct integration to the Anthropic Claude 3.7 Sonnet API. This implementation allows the application to:

1. Extract code problems from screenshots
2. Generate solutions to programming problems 
3. Debug code with error screenshots

## API Key Configuration

The API key is loaded from the following locations (in order of priority):
1. Environment variable `ANTHROPIC_API_KEY`
2. Global environment variable `anthropic_key`

You can set the global environment variable in your shell profile with: `export anthropic_key="your-key-here"`

## Implementation Details

### Directory Structure

New files were added in the following locations:
- `/electron/api/anthropicClient.ts` - Main API client implementation
- `/electron/api/index.ts` - Module exports
- `/electron/types.d.ts` - Type declarations for external modules

### API Client Implementation

The Anthropic client (`anthropicClient.ts`) provides the following methods:
- `isConfigured()` - Checks if API key is available
- `generateResponse()` - Generic method to send messages to Claude
- `processImages()` - Extracts problem details from screenshots
- `generateSolution()` - Creates solutions for programming problems
- `debugSolution()` - Debugs existing solutions based on error screenshots

### Changes to Existing Files

Modified files:
- `ProcessingHelper.ts` - Updated to use the Anthropic API client
- `ipcHandlers.ts` - Updated IPC handlers to work with the new API
- `preload.ts` - Updated exposed APIs for the renderer process
- `main.ts` - Updated environment variable loading logic to check for `anthropic_key`

### Authentication Changes

- The application no longer requires user authentication
- Subscription-related logic has been removed
- Credits are still tracked locally for usage monitoring

## API Integration Flow

1. **Problem Extraction**:
   - User captures screenshots of a programming problem
   - Screenshots are processed by Claude with vision capabilities
   - Claude extracts and structures the problem details

2. **Solution Generation**:
   - The structured problem is sent to Claude with language preferences
   - Claude generates a detailed solution with explanation and code

3. **Debugging**:
   - User captures screenshots of error messages
   - Claude first extracts error details from the screenshots
   - Claude debugs the existing solution, providing fix explanations and corrected code

## API Documentation

For more details on the Anthropic Claude API, refer to the official documentation:
https://docs.anthropic.com/en/api/getting-started 