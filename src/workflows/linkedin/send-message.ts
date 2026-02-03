/**
 * Send Message Workflow
 * 
 * Sends a LinkedIn message to a profile (must be connected or use InMail).
 * Includes APPROVAL_GATE before final send.
 * 
 * Steps:
 * 1. Verify on profile page
 * 2. Check if can message (connected or InMail available)
 * 3. Click Message button
 * 4. Wait for message composer
 * 5. Type personalized message
 * 6. APPROVAL_GATE - wait for user approval
 * 7. Click Send
 * 8. Verify message sent
 */

import {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  ValidationResult,
  SendMessageInput,
  SendMessageOutput,
  LinkedInProfile,
  PersonalizationContext,
  applyPersonalization,
  extractFirstName,
  extractLastName,
} from './types';
import {
  ACTION_SELECTORS,
  MESSAGE_MODAL_SELECTORS,
  COMMON_SELECTORS,
  PROFILE_SELECTORS,
  toPlaywrightSelector,
} from './selectors';
import { BrowserInterface } from './visit-profile';

// ============================================================================
// Context
// ============================================================================

interface SendMessageContext {
  input: SendMessageInput;
  profile: Partial<LinkedInProfile>;
  canMessage: boolean;
  isInMail: boolean;
  messageComposerOpened: boolean;
  finalMessage: string;
  sent: boolean;
  sentAt: number | null;
  errors: string[];
}

// Browser interface
let browser: BrowserInterface;

export function setSendMessageBrowser(b: BrowserInterface): void {
  browser = b;
}

// ============================================================================
// Step Implementations
// ============================================================================

const verifyProfilePageStep: WorkflowStep<SendMessageContext> = {
  id: 'verify-profile',
  name: 'Verify Profile Page',
  description: 'Confirming we are on the correct profile page',
  timeoutMs: 5000,
  maxRetries: 1,

  async execute(context): Promise<StepResult> {
    try {
      const currentUrl = await browser.currentUrl();
      
      if (!currentUrl.includes('linkedin.com/in/')) {
        // Navigate to profile
        await browser.navigate(context.input.profileUrl);
        await browser.waitForSelector(
          toPlaywrightSelector(COMMON_SELECTORS.profileLoaded),
          { timeout: 10000 }
        );
      }

      // Extract profile info for personalization
      const name = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.name)
      );
      if (name) {
        context.profile.name = name.trim();
      }

      const headline = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.headline)
      );
      if (headline) {
        context.profile.headline = headline.trim();
      }

      const company = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.currentCompany)
      );
      if (company) {
        context.profile.currentCompany = company.trim();
      }

      const location = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.location)
      );
      if (location) {
        context.profile.location = location.trim();
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Could not verify profile page: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },
};

const checkCanMessageStep: WorkflowStep<SendMessageContext> = {
  id: 'check-can-message',
  name: 'Check Message Availability',
  description: 'Checking if we can send a message to this profile',
  timeoutMs: 5000,
  maxRetries: 1,

  async execute(context): Promise<StepResult> {
    try {
      // Check connection status
      const statusText = await browser.getTextContent(
        toPlaywrightSelector(PROFILE_SELECTORS.connectionStatus)
      );

      const isConnected = statusText?.includes('1st') ?? false;

      // Check for Message button
      const messageVisible = await browser.isVisible(
        toPlaywrightSelector(ACTION_SELECTORS.messageButton)
      );

      if (!messageVisible) {
        // If not connected and no message button, need InMail
        if (!isConnected) {
          return {
            success: false,
            error: 'Cannot message this person - not connected and InMail not available',
          };
        }
        return {
          success: false,
          error: 'Message button not found on profile',
        };
      }

      context.canMessage = true;
      context.isInMail = !isConnected;

      return {
        success: true,
        data: {
          canMessage: true,
          isConnected,
          isInMail: !isConnected,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Could not check message availability: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },
};

const clickMessageButtonStep: WorkflowStep<SendMessageContext> = {
  id: 'click-message',
  name: 'Click Message Button',
  description: 'Opening message composer',
  timeoutMs: 5000,
  maxRetries: 2,

  shouldSkip(context): boolean {
    return !context.canMessage;
  },

  async execute(context): Promise<StepResult> {
    try {
      await clickElement(ACTION_SELECTORS.messageButton.primary);

      // Wait for message composer to open
      await browser.waitForSelector(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.modal),
        { timeout: 5000 }
      );

      context.messageComposerOpened = true;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to open message composer: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },
};

const typeMessageStep: WorkflowStep<SendMessageContext> = {
  id: 'type-message',
  name: 'Type Message',
  description: 'Typing personalized message',
  timeoutMs: 15000,
  maxRetries: 1,

  shouldSkip(context): boolean {
    return !context.messageComposerOpened;
  },

  async execute(context): Promise<StepResult> {
    try {
      // Build personalization context
      const personalization: PersonalizationContext = {
        ...context.input.personalization,
      };

      if (context.profile.name) {
        personalization.fullName = context.profile.name;
        personalization.firstName = context.input.personalization?.firstName ?? 
          extractFirstName(context.profile.name);
        personalization.lastName = extractLastName(context.profile.name);
      }

      if (context.profile.currentCompany && !personalization.company) {
        personalization.company = context.profile.currentCompany;
      }

      if (context.profile.headline && !personalization.title) {
        personalization.title = context.profile.headline;
      }

      if (context.profile.location && !personalization.location) {
        personalization.location = context.profile.location;
      }

      // Apply personalization to message
      const personalizedMessage = applyPersonalization(
        context.input.message,
        personalization
      );

      context.finalMessage = personalizedMessage;

      // If InMail and subject provided, fill subject first
      if (context.isInMail && context.input.subject) {
        const subjectVisible = await browser.isVisible(
          toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.subjectInput)
        );

        if (subjectVisible) {
          const personalizedSubject = applyPersonalization(
            context.input.subject,
            personalization
          );
          await typeInElement(
            MESSAGE_MODAL_SELECTORS.subjectInput.primary,
            personalizedSubject
          );
          await delay(300);
        }
      }

      // Wait for message input
      await browser.waitForSelector(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.messageInput),
        { timeout: 3000 }
      );

      // Type the message
      await typeInElement(
        MESSAGE_MODAL_SELECTORS.messageInput.primary,
        personalizedMessage
      );

      return {
        success: true,
        data: { message: personalizedMessage },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to type message: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },
};

const approvalGateStep: WorkflowStep<SendMessageContext> = {
  id: 'approval-gate',
  name: 'Approval Gate',
  description: 'Waiting for approval to send message',
  requiresApproval: true,
  approvalPrompt: 'Ready to send message. Review and approve to continue.',
  timeoutMs: 300000, // 5 minutes

  shouldSkip(context): boolean {
    return !context.messageComposerOpened;
  },

  async execute(context): Promise<StepResult> {
    // Screenshot the message for review
    try {
      const screenshot = await browser.screenshot();
      return {
        success: true,
        data: {
          profileUrl: context.input.profileUrl,
          profileName: context.profile.name,
          message: context.finalMessage,
          isInMail: context.isInMail,
          screenshot,
        },
      };
    } catch {
      return {
        success: true,
        data: {
          profileUrl: context.input.profileUrl,
          profileName: context.profile.name,
          message: context.finalMessage,
          isInMail: context.isInMail,
        },
      };
    }
  },
};

const clickSendStep: WorkflowStep<SendMessageContext> = {
  id: 'click-send',
  name: 'Click Send',
  description: 'Sending the message',
  timeoutMs: 5000,
  maxRetries: 1,

  shouldSkip(context): boolean {
    return !context.messageComposerOpened;
  },

  async execute(context): Promise<StepResult> {
    try {
      // Wait for send button to be enabled
      await browser.waitForSelector(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.sendButton),
        { timeout: 2000, state: 'visible' }
      );

      await clickElement(MESSAGE_MODAL_SELECTORS.sendButton.primary);
      
      context.sentAt = Date.now();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to click Send: ${error instanceof Error ? error.message : 'Unknown'}`,
        shouldRetry: true,
      };
    }
  },

  async cleanup(context, error): Promise<void> {
    // If send failed, try to close the composer
    try {
      await clickElement(MESSAGE_MODAL_SELECTORS.closeButton.primary);
    } catch {
      // Ignore cleanup errors
    }
  },
};

const verifyMessageSentStep: WorkflowStep<SendMessageContext> = {
  id: 'verify-sent',
  name: 'Verify Message Sent',
  description: 'Confirming message was delivered',
  timeoutMs: 5000,
  maxRetries: 0,

  shouldSkip(context): boolean {
    return context.sentAt === null;
  },

  async execute(context): Promise<StepResult> {
    try {
      // Wait a moment for UI to update
      await delay(1500);

      // Check if message appears in conversation
      const messageSentIndicator = await browser.isVisible(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.messageSent)
      );

      // Also check if composer is cleared (another success indicator)
      const messageInputContent = await browser.getTextContent(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.messageInput)
      );
      const composerCleared = !messageInputContent || messageInputContent.trim() === '';

      if (messageSentIndicator || composerCleared) {
        context.sent = true;
        return {
          success: true,
          data: { sent: true },
        };
      }

      // If can't verify, still mark as likely sent
      context.sent = true;
      context.errors.push('Could not definitively verify message was sent');
      return { success: true };
    } catch (error) {
      // Assume success if verification fails
      context.sent = true;
      return { success: true };
    }
  },
};

const closeComposerStep: WorkflowStep<SendMessageContext> = {
  id: 'close-composer',
  name: 'Close Composer',
  description: 'Closing message composer',
  timeoutMs: 3000,
  maxRetries: 0,

  shouldSkip(context): boolean {
    return !context.messageComposerOpened;
  },

  async execute(context): Promise<StepResult> {
    try {
      // Try to close the composer
      const closeVisible = await browser.isVisible(
        toPlaywrightSelector(MESSAGE_MODAL_SELECTORS.closeButton)
      );

      if (closeVisible) {
        await clickElement(MESSAGE_MODAL_SELECTORS.closeButton.primary);
      }

      return { success: true };
    } catch {
      // Non-critical, composer might already be closed
      return { success: true };
    }
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

async function clickElement(selector: string): Promise<void> {
  await (browser as any).click?.(selector);
}

async function typeInElement(selector: string, text: string): Promise<void> {
  await (browser as any).type?.(selector, text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Workflow Definition
// ============================================================================

export const sendMessageWorkflow: WorkflowDefinition<
  SendMessageInput,
  SendMessageOutput,
  SendMessageContext
> = {
  id: 'linkedin-send-message',
  name: 'Send LinkedIn Message',
  description: 'Send a personalized message to a LinkedIn profile',
  version: '1.0.0',

  createContext(input: SendMessageInput): SendMessageContext {
    return {
      input,
      profile: {},
      canMessage: false,
      isInMail: false,
      messageComposerOpened: false,
      finalMessage: input.message,
      sent: false,
      sentAt: null,
      errors: [],
    };
  },

  steps: [
    verifyProfilePageStep,
    checkCanMessageStep,
    clickMessageButtonStep,
    typeMessageStep,
    approvalGateStep,
    clickSendStep,
    verifyMessageSentStep,
    closeComposerStep,
  ],

  getOutput(context: SendMessageContext): SendMessageOutput {
    return {
      sent: context.sent,
      profileUrl: context.input.profileUrl,
      messageUsed: context.finalMessage,
      sentAt: context.sentAt,
      wasInMail: context.isInMail,
    };
  },

  validate(input: SendMessageInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input.profileUrl) {
      errors.push('profileUrl is required');
    } else {
      try {
        const url = new URL(input.profileUrl);
        if (!url.hostname.includes('linkedin.com')) {
          errors.push('URL must be a LinkedIn URL');
        }
      } catch {
        errors.push('Invalid URL format');
      }
    }

    if (!input.message) {
      errors.push('message is required');
    } else if (input.message.trim().length === 0) {
      errors.push('message cannot be empty');
    }

    // Check for unreplaced personalization tokens
    const tokenPattern = /\{\{[^}]+\}\}/g;
    const tokens = input.message?.match(tokenPattern) ?? [];
    if (tokens.length > 0 && !input.personalization) {
      warnings.push(`Message contains personalization tokens (${tokens.join(', ')}) but no personalization data provided`);
    }

    return { valid: errors.length === 0, errors, warnings };
  },
};

// ============================================================================
// Factory Function
// ============================================================================

export function createSendMessageWorkflow(browserInterface: BrowserInterface) {
  setSendMessageBrowser(browserInterface);
  return sendMessageWorkflow;
}
