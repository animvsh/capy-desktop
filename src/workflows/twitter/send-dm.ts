/**
 * Send DM Workflow
 * 
 * Sends a direct message to a Twitter user.
 * Includes an APPROVAL_GATE before sending the message.
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowContext,
  SendDMInput,
  SendDMOutput,
} from './types';
import {
  ACTION_SELECTORS,
  DM_SELECTORS,
  NAV_SELECTORS,
  getAllSelectors,
  buildProfileUrl,
  TWITTER_URL_PATTERNS,
} from './selectors';

// ============================================================================
// Workflow Configuration
// ============================================================================

const SEND_DM_CONFIG = {
  id: 'twitter-send-dm',
  name: 'Send Twitter DM',
  description: 'Send a direct message to a Twitter user with approval gate',
  platform: 'twitter' as const,
  maxDuration: 120000, // 2 minutes (includes approval wait)
  defaultStepTimeout: 15000,
  maxRetries: 2,
  stepDelay: 500,
};

// ============================================================================
// Internal State
// ============================================================================

interface SendDMState extends Partial<SendDMOutput> {
  dmDrawerOpen?: boolean;
  messageTyped?: boolean;
  approvalGranted?: boolean;
}

// ============================================================================
// Workflow Steps
// ============================================================================

type SendDMContext = WorkflowContext<SendDMInput, SendDMState>;

const steps: WorkflowStep<SendDMContext>[] = [
  // Step 1: Navigate to profile or DM page
  {
    id: 'navigate-to-dm',
    name: 'Navigate to DM',
    description: 'Navigate to the DM interface for the recipient',
    timeout: 20000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      ctx.data.recipientUsername = input.recipientUsername.replace(/^@/, '');

      if (input.navigateToProfile) {
        // Navigate to profile first
        const profileUrl = buildProfileUrl(input.recipientUsername);
        const success = await browser.navigate(profileUrl);
        
        if (!success) {
          throw new Error('Failed to navigate to profile');
        }

        await browser.waitForNavigation(10000);

        // Wait for profile to load
        await browser.waitForSelector(
          getAllSelectors('primaryColumn'),
          10000
        );
      } else {
        // Navigate directly to messages
        const messagesUrl = 'https://x.com/messages';
        const currentUrl = await browser.getCurrentUrl();
        
        if (!currentUrl.includes('/messages')) {
          await browser.navigate(messagesUrl);
          await browser.waitForNavigation(10000);
        }
      }

      return true;
    },
  },

  // Step 2: Open DM interface
  {
    id: 'open-dm-interface',
    name: 'Open DM Interface',
    description: 'Click the Message button or open DM compose',
    timeout: 15000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      if (input.navigateToProfile) {
        // Click the Message button on profile
        const messageButtonExists = await browser.elementExists(
          getAllSelectors('messageButton')
        );

        if (!messageButtonExists) {
          throw new Error('Message button not found - user may have DMs disabled');
        }

        const clicked = await browser.click(getAllSelectors('messageButton'));
        if (!clicked) {
          throw new Error('Failed to click Message button');
        }

        // Wait for DM interface to open
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } else {
        // Use compose button in messages
        const composeExists = await browser.elementExists(
          getAllSelectors('dmComposeButton')
        );

        if (composeExists) {
          await browser.click(getAllSelectors('dmComposeButton'));
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Search for recipient
        const searchLoaded = await browser.waitForSelector(
          getAllSelectors('dmSearchInput'),
          5000
        );

        if (searchLoaded) {
          // Type recipient username
          const typed = await browser.type(
            getAllSelectors('dmSearchInput'),
            ctx.data.recipientUsername!,
            { delay: 50 }
          );

          if (!typed) {
            throw new Error('Failed to type recipient username');
          }

          // Wait for search results
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Click on first result (should be the user)
          const firstResult = await browser.execute<boolean>(`
            const results = document.querySelectorAll('[data-testid="TypeaheadUser"]');
            if (results.length > 0) {
              results[0].click();
              return true;
            }
            return false;
          `);

          if (!firstResult) {
            throw new Error('Could not find user in search results');
          }

          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      ctx.data.dmDrawerOpen = true;

      emit({
        type: 'TWITTER_DM_READY',
        workflowName: SEND_DM_CONFIG.name,
        data: {
          recipient: ctx.data.recipientUsername,
          dmInterfaceOpen: true,
        },
      });

      return true;
    },
  },

  // Step 3: Wait for message input
  {
    id: 'wait-for-input',
    name: 'Wait for Input Field',
    description: 'Wait for the message input field to be ready',
    timeout: 10000,
    execute: async (ctx) => {
      const { browser } = ctx;

      // Wait for the DM textarea/input to appear
      const inputReady = await browser.waitForSelector(
        getAllSelectors('dmTextarea'),
        8000
      );

      if (!inputReady) {
        // Try alternative: check if we're in a conversation
        const conversationExists = await browser.elementExists(
          getAllSelectors('dmConversation')
        );

        if (!conversationExists) {
          throw new Error('DM input field not found');
        }

        // Conversation exists, wait a bit more for input
        await browser.waitForSelector(
          getAllSelectors('dmTextarea'),
          3000
        );
      }

      return true;
    },
  },

  // Step 4: Type the message
  {
    id: 'type-message',
    name: 'Type Message',
    description: 'Type the message content into the input field',
    timeout: 15000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      // Focus and type into the DM textarea
      // First, try clicking on it
      await browser.click(getAllSelectors('dmTextarea'));
      await new Promise(resolve => setTimeout(resolve, 200));

      // For contenteditable divs, we need special handling
      const typed = await browser.execute<boolean>(`
        const selectors = ${JSON.stringify(getAllSelectors('dmTextarea'))};
        let input = null;
        
        for (const sel of selectors) {
          input = document.querySelector(sel);
          if (input) break;
        }
        
        if (!input) return false;
        
        // Focus the element
        input.focus();
        
        // For contenteditable divs
        if (input.contentEditable === 'true') {
          input.textContent = ${JSON.stringify(input.message)};
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } else {
          // For regular inputs/textareas
          input.value = ${JSON.stringify(input.message)};
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        return true;
      `);

      if (!typed) {
        // Fallback: use keyboard typing
        const fallbackTyped = await browser.type(
          getAllSelectors('dmTextarea'),
          input.message,
          { delay: 30, clearFirst: true }
        );

        if (!fallbackTyped) {
          throw new Error('Failed to type message');
        }
      }

      ctx.data.messageTyped = true;

      emit({
        type: 'TWITTER_DM_READY',
        workflowName: SEND_DM_CONFIG.name,
        data: {
          recipient: ctx.data.recipientUsername,
          messageTyped: true,
          messagePreview: input.message.substring(0, 100) + (input.message.length > 100 ? '...' : ''),
        },
      });

      return true;
    },
  },

  // Step 5: APPROVAL GATE - Wait for approval before sending
  {
    id: 'approval-gate',
    name: 'Approval Gate',
    description: 'Wait for user approval before sending the message',
    timeout: 300000, // 5 minutes for approval
    requiresApproval: true,
    execute: async (ctx) => {
      const { input, requestApproval, emit } = ctx;

      // Request approval for sending the message
      const approved = await requestApproval(
        {
          id: `dm-${Date.now()}`,
          kind: 'send_message',
          timestamp: Date.now(),
          recipient: ctx.data.recipientUsername!,
          message: input.message,
          platform: 'twitter',
        } as any,
        `Send DM to @${ctx.data.recipientUsername}: "${input.message.substring(0, 100)}${input.message.length > 100 ? '...' : ''}"`
      );

      if (!approved) {
        throw new Error('Message send was not approved');
      }

      ctx.data.approvalGranted = true;

      emit({
        type: 'TWITTER_DM_READY',
        workflowName: SEND_DM_CONFIG.name,
        data: {
          recipient: ctx.data.recipientUsername,
          approvalGranted: true,
        },
      });

      return true;
    },
  },

  // Step 6: Click Send button
  {
    id: 'click-send',
    name: 'Click Send',
    description: 'Click the send button to send the message',
    timeout: 10000,
    execute: async (ctx) => {
      const { browser } = ctx;

      // Check if send button is enabled
      const sendButtonExists = await browser.elementExists(
        getAllSelectors('dmSendButton')
      );

      if (!sendButtonExists) {
        throw new Error('Send button not found');
      }

      // Check if button is disabled
      const isDisabled = await browser.execute<boolean>(`
        const selectors = ${JSON.stringify(getAllSelectors('dmSendButton'))};
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled && !btn.getAttribute('aria-disabled')) {
            return false;
          }
        }
        return true;
      `);

      if (isDisabled) {
        throw new Error('Send button is disabled - message may be empty or too long');
      }

      // Click send
      const clicked = await browser.click(getAllSelectors('dmSendButton'));

      if (!clicked) {
        // Fallback: use keyboard shortcut
        await browser.execute(`
          const event = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            ctrlKey: true,
            bubbles: true
          });
          document.activeElement.dispatchEvent(event);
        `);
      }

      // Wait for send to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      return true;
    },
  },

  // Step 7: Verify message sent
  {
    id: 'verify-sent',
    name: 'Verify Sent',
    description: 'Verify that the message was sent successfully',
    timeout: 15000,
    execute: async (ctx) => {
      const { input, browser, emit } = ctx;

      // Wait a moment for the message to appear
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check if message appears in conversation
      const messageSent = await browser.execute<boolean>(`
        const messages = document.querySelectorAll('[data-testid="dmConversationMessage"], [data-testid*="message"]');
        const messageText = ${JSON.stringify(input.message)};
        
        for (const msg of messages) {
          if (msg.textContent && msg.textContent.includes(messageText.substring(0, 50))) {
            return true;
          }
        }
        return false;
      `);

      // Alternative check: input field should be cleared
      const inputCleared = await browser.execute<boolean>(`
        const selectors = ${JSON.stringify(getAllSelectors('dmTextarea'))};
        for (const sel of selectors) {
          const input = document.querySelector(sel);
          if (input) {
            const content = input.textContent || input.value || '';
            return content.trim() === '';
          }
        }
        return false;
      `);

      if (!messageSent && !inputCleared) {
        // Check for error message
        const errorExists = await browser.elementExists('[data-testid="toast"]');
        if (errorExists) {
          const errorText = await browser.getElementText('[data-testid="toast"]');
          throw new Error(`Message send failed: ${errorText ?? 'Unknown error'}`);
        }

        throw new Error('Could not verify message was sent');
      }

      ctx.data.sent = true;

      // Try to extract message ID from conversation
      const messageId = await browser.execute<string | null>(`
        const messages = document.querySelectorAll('[data-testid="dmConversationMessage"]');
        if (messages.length > 0) {
          const lastMessage = messages[messages.length - 1];
          return lastMessage.getAttribute('data-message-id') || null;
        }
        return null;
      `);

      ctx.data.messageId = messageId ?? undefined;

      emit({
        type: 'TWITTER_DM_READY',
        workflowName: SEND_DM_CONFIG.name,
        data: {
          recipient: ctx.data.recipientUsername,
          sent: true,
          messageId: ctx.data.messageId,
          verified: true,
        },
      });

      return true;
    },
  },
];

// ============================================================================
// Workflow Definition
// ============================================================================

export const sendDMWorkflow: WorkflowDefinition<SendDMInput, SendDMOutput> = {
  config: SEND_DM_CONFIG,
  steps,

  initialize: (input) => ({
    sent: false,
    recipientUsername: input.recipientUsername.replace(/^@/, ''),
    messageId: undefined,
    dmDrawerOpen: false,
    messageTyped: false,
    approvalGranted: false,
  }),

  validateInput: (input) => {
    const errors: string[] = [];
    
    if (!input.recipientUsername) {
      errors.push('recipientUsername is required');
    }
    
    if (!input.message) {
      errors.push('message is required');
    }
    
    if (input.message && input.message.length > 10000) {
      errors.push('message exceeds maximum length of 10,000 characters');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },

  finalize: (data) => ({
    sent: data.sent ?? false,
    recipientUsername: data.recipientUsername ?? 'unknown',
    messageId: data.messageId,
  }),
};

export default sendDMWorkflow;
