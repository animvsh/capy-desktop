/**
 * LinkedIn Selectors
 * 
 * All LinkedIn DOM selectors with fallbacks for A/B tests.
 * LinkedIn frequently changes their class names, so we use
 * multiple strategies: data attributes, aria labels, and class patterns.
 */

// ============================================================================
// Types
// ============================================================================

export interface SelectorSet {
  primary: string;
  fallbacks: string[];
  description: string;
}

export interface LinkedInVersion {
  version: 'classic' | 'redesign' | 'unknown';
  detectedAt: number;
  indicators: string[];
}

// ============================================================================
// Profile Page Selectors
// ============================================================================

export const PROFILE_SELECTORS = {
  // Profile header / main info
  name: {
    primary: 'h1.text-heading-xlarge',
    fallbacks: [
      '.pv-text-details__left-panel h1',
      '[data-generated-suggestion-target="urn:li:fsu_profileActionDelegate"] h1',
      '.ph5 h1',
      '.top-card-layout__title',
    ],
    description: 'Profile name heading',
  } as SelectorSet,

  headline: {
    primary: '.text-body-medium.break-words',
    fallbacks: [
      '.pv-text-details__left-panel .text-body-medium',
      '.top-card-layout__headline',
      '[data-generated-suggestion-target] .text-body-medium',
    ],
    description: 'Profile headline/title',
  } as SelectorSet,

  location: {
    primary: '.text-body-small.inline.t-black--light.break-words',
    fallbacks: [
      '.pv-text-details__left-panel .text-body-small',
      '.top-card-layout__first-subline',
      'span.text-body-small:has-text("Location")',
    ],
    description: 'Profile location',
  } as SelectorSet,

  about: {
    primary: '#about ~ .display-flex .inline-show-more-text',
    fallbacks: [
      '.pv-about__summary-text',
      '[data-generated-suggestion-target="urn:li:fsu_profileAbout"] .inline-show-more-text',
      '#about + div + div .visually-hidden ~ span',
    ],
    description: 'About section text',
  } as SelectorSet,

  profilePhoto: {
    primary: '.pv-top-card-profile-picture__image',
    fallbacks: [
      '.profile-photo-edit__preview',
      'img.presence-entity__image',
      '.top-card-layout__entity-image',
    ],
    description: 'Profile photo image',
  } as SelectorSet,

  // Connection status
  connectionStatus: {
    primary: '.pv-top-card--list .text-body-small',
    fallbacks: [
      '.distance-badge .dist-value',
      '.pvs-profile-actions .artdeco-button__text',
    ],
    description: 'Connection degree (1st, 2nd, 3rd)',
  } as SelectorSet,

  connectionCount: {
    primary: '.pv-top-card--list-bullet span.t-bold',
    fallbacks: [
      'a[href*="connections"] span.t-bold',
      '.top-card-layout__connections',
    ],
    description: 'Number of connections',
  } as SelectorSet,

  // Current position
  currentCompany: {
    primary: '.pv-text-details__right-panel .inline-show-more-text',
    fallbacks: [
      '.experience-item:first-child .t-bold span',
      '[data-field="experience_company_logo"] ~ div .t-bold',
    ],
    description: 'Current company name',
  } as SelectorSet,

  // Experience section
  experienceSection: {
    primary: '#experience',
    fallbacks: [
      '[data-generated-suggestion-target="urn:li:fsu_profileExperience"]',
      '.experience-section',
    ],
    description: 'Experience section container',
  } as SelectorSet,

  experienceItems: {
    primary: '#experience ~ .pvs-list__outer-container li.artdeco-list__item',
    fallbacks: [
      '.experience-section .pv-entity__position-group-role-item',
      '[data-generated-suggestion-target="urn:li:fsu_profileExperience"] li',
    ],
    description: 'Individual experience entries',
  } as SelectorSet,

  // Education section
  educationSection: {
    primary: '#education',
    fallbacks: [
      '[data-generated-suggestion-target="urn:li:fsu_profileEducation"]',
      '.education-section',
    ],
    description: 'Education section container',
  } as SelectorSet,

  educationItems: {
    primary: '#education ~ .pvs-list__outer-container li.artdeco-list__item',
    fallbacks: [
      '.education-section .pv-entity__degree-info',
      '[data-generated-suggestion-target="urn:li:fsu_profileEducation"] li',
    ],
    description: 'Individual education entries',
  } as SelectorSet,

  // Skills section
  skillsSection: {
    primary: '#skills',
    fallbacks: [
      '[data-generated-suggestion-target="urn:li:fsu_profileSkills"]',
      '.skills-section',
    ],
    description: 'Skills section container',
  } as SelectorSet,

  skillItems: {
    primary: '#skills ~ .pvs-list__outer-container li.artdeco-list__item',
    fallbacks: [
      '.skills-section .pv-skill-entity__skill-name',
      '[data-generated-suggestion-target="urn:li:fsu_profileSkills"] li span[aria-hidden="true"]',
    ],
    description: 'Individual skill entries',
  } as SelectorSet,

  // Contact info
  contactInfoLink: {
    primary: '#top-card-text-details-contact-info',
    fallbacks: [
      'a[href*="contact-info"]',
      '.pv-top-card--list a[href*="contact-info"]',
    ],
    description: 'Link to contact info modal',
  } as SelectorSet,

  contactInfoModal: {
    primary: '.artdeco-modal[role="dialog"]',
    fallbacks: [
      '.pv-contact-info',
      '[data-test-modal]',
    ],
    description: 'Contact info modal container',
  } as SelectorSet,

  contactEmail: {
    primary: '.ci-email .pv-contact-info__contact-link',
    fallbacks: [
      'section.ci-email a',
      'a[href^="mailto:"]',
    ],
    description: 'Email address in contact info',
  } as SelectorSet,

  contactPhone: {
    primary: '.ci-phone .t-black--light',
    fallbacks: [
      'section.ci-phone span',
      '.pv-contact-info__ci-container .t-14',
    ],
    description: 'Phone number in contact info',
  } as SelectorSet,

  contactWebsite: {
    primary: '.ci-websites .pv-contact-info__contact-link',
    fallbacks: [
      'section.ci-websites a',
      '.pv-contact-info__ci-container a[href^="http"]',
    ],
    description: 'Website in contact info',
  } as SelectorSet,
} as const;

// ============================================================================
// Action Button Selectors
// ============================================================================

export const ACTION_SELECTORS = {
  // Connect button
  connectButton: {
    primary: 'button.pvs-profile-actions__action:has-text("Connect")',
    fallbacks: [
      'button[aria-label*="connect" i]',
      '.pv-s-profile-actions--connect',
      '.pvs-profile-actions button:has(.artdeco-button__text:text("Connect"))',
      'button.artdeco-button--primary:has-text("Connect")',
    ],
    description: 'Main Connect button on profile',
  } as SelectorSet,

  // More button (reveals Connect if hidden)
  moreButton: {
    primary: 'button.pvs-profile-actions__action[aria-label="More actions"]',
    fallbacks: [
      'button[aria-label*="More"]',
      '.pvs-profile-actions button:has(.artdeco-button__text:text("More"))',
      '.pv-s-profile-actions--overflow',
    ],
    description: 'More actions dropdown button',
  } as SelectorSet,

  // Connect option in More dropdown
  connectDropdownOption: {
    primary: '.artdeco-dropdown__content-inner li:has-text("Connect")',
    fallbacks: [
      'div[data-control-name="connect"]',
      '.artdeco-dropdown__item:has-text("Connect")',
    ],
    description: 'Connect option in dropdown menu',
  } as SelectorSet,

  // Message button
  messageButton: {
    primary: 'button.pvs-profile-actions__action:has-text("Message")',
    fallbacks: [
      'button[aria-label*="message" i]',
      '.pv-s-profile-actions--message',
      '.pvs-profile-actions button:has(.artdeco-button__text:text("Message"))',
      'a.message-anywhere-button',
    ],
    description: 'Message button on profile',
  } as SelectorSet,

  // Follow button
  followButton: {
    primary: 'button.pvs-profile-actions__action:has-text("Follow")',
    fallbacks: [
      'button[aria-label*="follow" i]',
      '.pv-s-profile-actions--follow',
      '.follow-button',
    ],
    description: 'Follow button on profile',
  } as SelectorSet,

  // Pending connection indicator
  pendingButton: {
    primary: 'button.pvs-profile-actions__action:has-text("Pending")',
    fallbacks: [
      'button[aria-label*="pending" i]',
      '.pv-s-profile-actions--pending',
    ],
    description: 'Pending connection status button',
  } as SelectorSet,
} as const;

// ============================================================================
// Connection Modal Selectors
// ============================================================================

export const CONNECTION_MODAL_SELECTORS = {
  modal: {
    primary: '.send-invite',
    fallbacks: [
      '[data-test-modal="send-invite"]',
      '.artdeco-modal:has([aria-label*="connect" i])',
      '#send-invite-modal',
    ],
    description: 'Connection request modal',
  } as SelectorSet,

  addNoteButton: {
    primary: 'button[aria-label="Add a note"]',
    fallbacks: [
      '.send-invite__actions button:has-text("Add a note")',
      '.artdeco-modal button:has-text("Add a note")',
      'button.artdeco-button--muted:has-text("Add a note")',
    ],
    description: 'Add a note button in connection modal',
  } as SelectorSet,

  noteTextarea: {
    primary: '#custom-message',
    fallbacks: [
      '.send-invite textarea',
      'textarea[name="message"]',
      '.artdeco-modal textarea',
    ],
    description: 'Note textarea in connection modal',
  } as SelectorSet,

  sendButton: {
    primary: 'button[aria-label="Send now"]',
    fallbacks: [
      '.send-invite__actions button.artdeco-button--primary',
      '.artdeco-modal button:has-text("Send")',
      'button[data-control-name="send"]',
    ],
    description: 'Send connection request button',
  } as SelectorSet,

  cancelButton: {
    primary: 'button[aria-label="Dismiss"]',
    fallbacks: [
      '.send-invite button.artdeco-modal__dismiss',
      '.artdeco-modal__dismiss',
    ],
    description: 'Cancel/dismiss button in modal',
  } as SelectorSet,

  // Success indicators
  successToast: {
    primary: '.artdeco-toast-item--visible:has-text("sent")',
    fallbacks: [
      '.artdeco-toast-item:has-text("Invitation sent")',
      '.msg-overlay-bubble-header',
    ],
    description: 'Success toast notification',
  } as SelectorSet,
} as const;

// ============================================================================
// Message Modal Selectors
// ============================================================================

export const MESSAGE_MODAL_SELECTORS = {
  modal: {
    primary: '.msg-overlay-conversation-bubble',
    fallbacks: [
      '.msg-form',
      '.msg-overlay-bubble-header',
      '[data-control-name="overlay.send_message"]',
    ],
    description: 'Message compose modal/overlay',
  } as SelectorSet,

  messageInput: {
    primary: '.msg-form__contenteditable',
    fallbacks: [
      '[data-placeholder="Write a message…"]',
      '.msg-form__msg-content-container div[contenteditable="true"]',
      '.msg-form textarea',
    ],
    description: 'Message text input field',
  } as SelectorSet,

  sendButton: {
    primary: '.msg-form__send-button',
    fallbacks: [
      'button[data-control-name="send"]',
      '.msg-form button[type="submit"]',
      'button.msg-form__send-btn',
    ],
    description: 'Send message button',
  } as SelectorSet,

  closeButton: {
    primary: '.msg-overlay-bubble-header__control--close',
    fallbacks: [
      'button[data-control-name="overlay.close_conversation_window"]',
      '.artdeco-modal__dismiss',
    ],
    description: 'Close message modal button',
  } as SelectorSet,

  subjectInput: {
    primary: 'input[name="subject"]',
    fallbacks: [
      '.msg-form__subject input',
      'input[placeholder*="Subject"]',
    ],
    description: 'InMail subject input (if available)',
  } as SelectorSet,

  // Success indicators
  messageSent: {
    primary: '.msg-s-event-listitem--last-msg',
    fallbacks: [
      '.msg-s-message-list__event:last-child',
      '.msg-overlay-list-bubble__message-sent-body',
    ],
    description: 'Indicator that message was sent',
  } as SelectorSet,
} as const;

// ============================================================================
// Navigation & Common Selectors
// ============================================================================

export const COMMON_SELECTORS = {
  // Page load indicators
  pageLoaded: {
    primary: '.scaffold-layout__main',
    fallbacks: [
      '.authentication-outlet',
      '#main',
    ],
    description: 'Main layout container (indicates page loaded)',
  } as SelectorSet,

  profileLoaded: {
    primary: '.pv-top-card',
    fallbacks: [
      '.scaffold-layout__main .ph5',
      '.profile-detail',
    ],
    description: 'Profile page loaded indicator',
  } as SelectorSet,

  // Loading states
  loadingSpinner: {
    primary: '.artdeco-spinner',
    fallbacks: [
      '.loading-indicator',
      '[role="progressbar"]',
    ],
    description: 'Loading spinner',
  } as SelectorSet,

  // Error states
  profileNotFound: {
    primary: '.profile-unavailable',
    fallbacks: [
      '.not-found',
      'h1:has-text("Page not found")',
    ],
    description: 'Profile not found indicator',
  } as SelectorSet,

  loginRequired: {
    primary: '.login-form',
    fallbacks: [
      '[data-id="sign-in-form"]',
      'form.login__form',
    ],
    description: 'Login required indicator',
  } as SelectorSet,

  // Rate limiting
  rateLimited: {
    primary: '.ip-fencing-page',
    fallbacks: [
      'h1:has-text("unusual activity")',
      '.challenge-dialog',
    ],
    description: 'Rate limit or challenge page',
  } as SelectorSet,
} as const;

// ============================================================================
// Selector Utilities
// ============================================================================

/**
 * Try multiple selectors until one matches
 */
export function findSelector(
  selectorSet: SelectorSet,
  document: Document | Element
): Element | null {
  // Try primary first
  const primary = document.querySelector(selectorSet.primary);
  if (primary) return primary;

  // Try fallbacks
  for (const fallback of selectorSet.fallbacks) {
    try {
      const element = document.querySelector(fallback);
      if (element) return element;
    } catch {
      // Invalid selector, skip
    }
  }

  return null;
}

/**
 * Get all matching selectors (for lists)
 */
export function findAllSelectors(
  selectorSet: SelectorSet,
  document: Document | Element
): Element[] {
  // Try primary first
  const primary = document.querySelectorAll(selectorSet.primary);
  if (primary.length > 0) return Array.from(primary);

  // Try fallbacks
  for (const fallback of selectorSet.fallbacks) {
    try {
      const elements = document.querySelectorAll(fallback);
      if (elements.length > 0) return Array.from(elements);
    } catch {
      // Invalid selector, skip
    }
  }

  return [];
}

/**
 * Build a compound selector string for Playwright
 */
export function toPlaywrightSelector(selectorSet: SelectorSet): string {
  const allSelectors = [selectorSet.primary, ...selectorSet.fallbacks];
  // Playwright supports :is() for OR logic
  return `:is(${allSelectors.join(', ')})`;
}

/**
 * Detect LinkedIn version based on page structure
 */
export function detectLinkedInVersion(document: Document): LinkedInVersion {
  const indicators: string[] = [];
  let version: 'classic' | 'redesign' | 'unknown' = 'unknown';

  // Check for redesign indicators
  if (document.querySelector('.scaffold-layout')) {
    indicators.push('scaffold-layout');
    version = 'redesign';
  }

  if (document.querySelector('.pvs-profile-actions')) {
    indicators.push('pvs-profile-actions');
    version = 'redesign';
  }

  // Check for classic indicators
  if (document.querySelector('.pv-top-card-v3')) {
    indicators.push('pv-top-card-v3');
    version = 'classic';
  }

  return {
    version,
    detectedAt: Date.now(),
    indicators,
  };
}

// ============================================================================
// Export All Selector Groups
// ============================================================================

export const LINKEDIN_SELECTORS = {
  profile: PROFILE_SELECTORS,
  actions: ACTION_SELECTORS,
  connectionModal: CONNECTION_MODAL_SELECTORS,
  messageModal: MESSAGE_MODAL_SELECTORS,
  common: COMMON_SELECTORS,
} as const;

export type LinkedInSelectorGroup = keyof typeof LINKEDIN_SELECTORS;
