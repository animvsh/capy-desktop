/**
 * useChatBrowserIntegration Hook
 * 
 * Bridges the chat interface with browser automation.
 * Detects browser commands in chat messages and executes them.
 * 
 * Usage:
 * const { processChatMessage, browserResult, isProcessing } = useChatBrowserIntegration();
 * 
 * // In chat message handler:
 * const result = await processChatMessage(userMessage);
 * if (result.handled) {
 *   // Browser command was executed
 *   displayBotMessage(result.response);
 * } else {
 *   // Not a browser command, continue with normal AI processing
 * }
 */

import { useState, useCallback } from 'react';
import { useBrowserAutomation, detectBrowserCommand, DetectedBrowserCommand } from './useBrowserAutomation';

export interface BrowserCommandResult {
  handled: boolean;
  success: boolean;
  response: string;
  command?: DetectedBrowserCommand;
  error?: string;
}

export function useChatBrowserIntegration() {
  const {
    isInitialized,
    isLoading,
    isLoggedIn,
    currentRun,
    pendingApproval,
    liveFrame,
    browserState,
    error,
    initialize,
    executeCommand,
    linkedInConnect,
    linkedInMessage,
    twitterFollow,
    twitterDM,
    navigate,
    approveAction,
    rejectAction,
    stopRun,
  } = useBrowserAutomation();

  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<BrowserCommandResult | null>(null);

  /**
   * Process a chat message and execute browser commands if detected
   */
  const processChatMessage = useCallback(async (message: string): Promise<BrowserCommandResult> => {
    // Detect if this is a browser command
    const command = detectBrowserCommand(message);
    
    if (!command || command.confidence < 0.7) {
      return {
        handled: false,
        success: false,
        response: '',
      };
    }

    setIsProcessing(true);

    try {
      // Initialize browser if needed
      if (!isInitialized) {
        await initialize();
      }

      // Execute the command
      const result = await executeCommand(message);

      const commandResult: BrowserCommandResult = {
        handled: true,
        success: result.success,
        response: result.message,
        command,
        error: result.success ? undefined : result.message,
      };

      setLastResult(commandResult);
      return commandResult;

    } catch (err) {
      const errorResult: BrowserCommandResult = {
        handled: true,
        success: false,
        response: `Failed to execute browser command: ${(err as Error).message}`,
        command,
        error: (err as Error).message,
      };

      setLastResult(errorResult);
      return errorResult;

    } finally {
      setIsProcessing(false);
    }
  }, [isInitialized, initialize, executeCommand]);

  /**
   * Generate a helpful response based on the command type
   */
  const generateCommandResponse = useCallback((command: DetectedBrowserCommand, success: boolean): string => {
    if (!success) {
      return `I couldn't complete that action. Please make sure you're logged into ${command.platform}.`;
    }

    switch (command.type) {
      case 'linkedin_connect':
        return `🔗 Starting LinkedIn connection request to ${command.target}. You'll see the live view and can approve before sending.`;
      
      case 'linkedin_message':
        return `💬 Opening LinkedIn to message ${command.target}. You can review the message before sending.`;
      
      case 'twitter_follow':
        return `🐦 Following @${command.target} on Twitter. Confirm in the approval dialog.`;
      
      case 'twitter_dm':
        return `📨 Opening Twitter DM to @${command.target}. You can review before sending.`;
      
      case 'navigate':
        return `🌐 Navigating to ${command.target}...`;
      
      default:
        return `Processing your request...`;
    }
  }, []);

  /**
   * Check if a message looks like a browser command
   */
  const isBrowserCommand = useCallback((message: string): boolean => {
    const command = detectBrowserCommand(message);
    return command !== null && command.confidence >= 0.7;
  }, []);

  /**
   * Get command type from message (for UI hints)
   */
  const getCommandType = useCallback((message: string): DetectedBrowserCommand | null => {
    return detectBrowserCommand(message);
  }, []);

  return {
    // Processing state
    isProcessing,
    isLoading,
    
    // Browser state
    isInitialized,
    isLoggedIn,
    currentRun,
    pendingApproval,
    liveFrame,
    browserState,
    error,

    // Results
    lastResult,

    // Actions
    processChatMessage,
    isBrowserCommand,
    getCommandType,
    generateCommandResponse,

    // Run control (for UI)
    approveAction,
    rejectAction,
    stopRun,
  };
}

export default useChatBrowserIntegration;
