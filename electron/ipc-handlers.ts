/**
 * IPC Handlers for Browser Control
 * Handles communication between renderer and main process
 */

import { ipcMain, BrowserWindow } from 'electron';
import { browserControl, BrowserViewConfig, ClickOptions, TypeOptions, ScrollOptions } from './browser-control';

/**
 * Register all browser control IPC handlers
 */
export function registerBrowserIpcHandlers(mainWindow: BrowserWindow): void {
  // Browser: Create
  ipcMain.handle('browser:create', async (_, config?: BrowserViewConfig) => {
    return browserControl.create(mainWindow, config);
  });

  // Browser: Destroy
  ipcMain.handle('browser:destroy', async () => {
    return browserControl.destroy();
  });

  // Browser: Navigate
  ipcMain.handle('browser:navigate', async (_, url: string) => {
    return browserControl.navigate(url);
  });

  // Browser: Execute JavaScript
  ipcMain.handle('browser:execute', async (_, script: string) => {
    return browserControl.executeScript(script);
  });

  // Browser: Screenshot
  ipcMain.handle('browser:screenshot', async (_, options?: { fullPage?: boolean }) => {
    return browserControl.screenshot(options);
  });

  // Browser: Click at coordinates
  ipcMain.handle('browser:click', async (_, options: ClickOptions) => {
    return browserControl.click(options);
  });

  // Browser: Click on selector
  ipcMain.handle('browser:click-selector', async (_, selector: string) => {
    return browserControl.clickSelector(selector);
  });

  // Browser: Type text
  ipcMain.handle('browser:type', async (_, options: TypeOptions) => {
    return browserControl.type(options);
  });

  // Browser: Type into selector
  ipcMain.handle('browser:type-selector', async (_, selector: string, text: string, options?: Omit<TypeOptions, 'text'>) => {
    return browserControl.typeIntoSelector(selector, text, options);
  });

  // Browser: Scroll
  ipcMain.handle('browser:scroll', async (_, options: ScrollOptions) => {
    return browserControl.scroll(options);
  });

  // Browser: Go Back
  ipcMain.handle('browser:back', async () => {
    return browserControl.goBack();
  });

  // Browser: Go Forward
  ipcMain.handle('browser:forward', async () => {
    return browserControl.goForward();
  });

  // Browser: Reload
  ipcMain.handle('browser:reload', async () => {
    return browserControl.reload();
  });

  // Browser: Get State
  ipcMain.handle('browser:get-state', async () => {
    return browserControl.getState();
  });

  // Browser: Set Bounds
  ipcMain.handle('browser:set-bounds', async (_, bounds: { x: number; y: number; width: number; height: number }) => {
    browserControl.setBounds(bounds);
    return { success: true };
  });

  // Browser: Get Bounds
  ipcMain.handle('browser:get-bounds', async () => {
    return browserControl.getBounds();
  });

  // Browser: Wait for Navigation
  ipcMain.handle('browser:wait-navigation', async (_, timeout?: number) => {
    return browserControl.waitForNavigation(timeout);
  });

  // Browser: Wait for Selector
  ipcMain.handle('browser:wait-selector', async (_, selector: string, options?: { timeout?: number; visible?: boolean }) => {
    return browserControl.waitForSelector(selector, options);
  });

  // Browser: Execute Automation Sequence
  ipcMain.handle('browser:execute-sequence', async (_, steps: AutomationStepInput[]) => {
    return executeAutomationSequence(steps, mainWindow);
  });
}

/**
 * Unregister all browser control IPC handlers
 */
export function unregisterBrowserIpcHandlers(): void {
  const channels = [
    'browser:create',
    'browser:destroy',
    'browser:navigate',
    'browser:execute',
    'browser:screenshot',
    'browser:click',
    'browser:click-selector',
    'browser:type',
    'browser:type-selector',
    'browser:scroll',
    'browser:back',
    'browser:forward',
    'browser:reload',
    'browser:get-state',
    'browser:set-bounds',
    'browser:get-bounds',
    'browser:wait-navigation',
    'browser:wait-selector',
    'browser:execute-sequence',
  ];

  channels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
}

// Types for automation sequences
interface AutomationStepInput {
  type: 'click' | 'click-selector' | 'type' | 'type-selector' | 'scroll' | 'navigate' | 'wait' | 'wait-selector' | 'execute';
  params: Record<string, unknown>;
  description?: string;
}

interface AutomationStepResult {
  step: AutomationStepInput;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Execute a sequence of automation steps
 */
async function executeAutomationSequence(
  steps: AutomationStepInput[],
  mainWindow: BrowserWindow
): Promise<{ success: boolean; results: AutomationStepResult[]; error?: string }> {
  const results: AutomationStepResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const startTime = Date.now();

    // Emit step start event
    mainWindow.webContents.send('browser:step-started', {
      index: i,
      step,
      total: steps.length,
    });

    try {
      let result: { success: boolean; error?: string };

      switch (step.type) {
        case 'click':
          result = await browserControl.click(step.params as ClickOptions);
          break;

        case 'click-selector':
          result = await browserControl.clickSelector(step.params.selector as string);
          break;

        case 'type':
          result = await browserControl.type(step.params as TypeOptions);
          break;

        case 'type-selector':
          result = await browserControl.typeIntoSelector(
            step.params.selector as string,
            step.params.text as string,
            step.params.options as Omit<TypeOptions, 'text'>
          );
          break;

        case 'scroll':
          result = await browserControl.scroll(step.params as ScrollOptions);
          break;

        case 'navigate':
          result = await browserControl.navigate(step.params.url as string);
          break;

        case 'wait':
          await new Promise((resolve) => setTimeout(resolve, (step.params.ms as number) || 1000));
          result = { success: true };
          break;

        case 'wait-selector':
          result = await browserControl.waitForSelector(
            step.params.selector as string,
            step.params.options as { timeout?: number; visible?: boolean }
          );
          break;

        case 'execute':
          const execResult = await browserControl.executeScript(step.params.script as string);
          result = { success: execResult.success, error: execResult.error };
          break;

        default:
          result = { success: false, error: `Unknown step type: ${step.type}` };
      }

      const duration = Date.now() - startTime;
      const stepResult: AutomationStepResult = {
        step,
        success: result.success,
        error: result.error,
        duration,
      };

      results.push(stepResult);

      // Emit step completed event
      mainWindow.webContents.send('browser:step-completed', {
        index: i,
        result: stepResult,
        total: steps.length,
      });

      if (!result.success) {
        return {
          success: false,
          results,
          error: `Step ${i + 1} failed: ${result.error}`,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const stepResult: AutomationStepResult = {
        step,
        success: false,
        error: errorMessage,
        duration,
      };

      results.push(stepResult);

      mainWindow.webContents.send('browser:step-completed', {
        index: i,
        result: stepResult,
        total: steps.length,
      });

      return {
        success: false,
        results,
        error: `Step ${i + 1} failed: ${errorMessage}`,
      };
    }
  }

  return { success: true, results };
}
