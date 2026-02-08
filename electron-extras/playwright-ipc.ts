/**
 * Playwright IPC Handlers
 * 
 * Full browser automation backend with:
 * - Profile management (LinkedIn/Twitter/Generic)
 * - Live view streaming
 * - LinkedIn automation (connect, message)
 * - Twitter automation (follow, DM)
 * - Human-in-the-loop approval
 * - Step-by-step run management
 * 
 * CHAOS-TESTED: Handles race conditions, concurrent operations,
 * browser crashes, and rapid stop/start cycles gracefully.
 */

import { BrowserWindow, ipcMain, app } from 'electron'
// Lazy-load playwright-core to avoid chromium-bidi bundling issues
// Types only - no runtime import
import type { Browser, BrowserContext, Page, ChromiumBrowser } from 'playwright-core'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { logger } from '../electron/logger'

// Lazy-loaded playwright chromium launcher
let playwrightChromium: typeof import('playwright-core').chromium | null = null

async function getChromium() {
  if (!playwrightChromium) {
    const pw = await import('playwright-core')
    playwrightChromium = pw.chromium
  }
  return playwrightChromium
}

// ============================================
// TYPES
// ============================================

interface BrowserProfile {
  id: string
  name: string
  platform: 'linkedin' | 'twitter' | 'generic'
  userDataDir: string
  isLoggedIn: boolean
  lastUsed: number
}

interface AutomationStep {
  id: string
  name: string
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped'
  description?: string
  requiresApproval?: boolean
}

interface AutomationRun {
  id: string
  type: 'linkedin_connect' | 'linkedin_message' | 'twitter_follow' | 'twitter_dm'
  status: 'idle' | 'running' | 'paused' | 'complete' | 'stopped' | 'failed'
  steps: AutomationStep[]
  currentStepIndex: number
  target?: {
    name: string
    headline?: string
    company?: string
    location?: string
    profileUrl: string
  }
  message?: string
  error?: string
  startTime?: number
  endTime?: number
  profileId: string  // Track which profile this run belongs to
}

// ============================================
// STATE
// ============================================

let mainWindow: BrowserWindow | null = null
let browser: Browser | null = null
const contexts: Map<string, BrowserContext> = new Map()
const pages: Map<string, Page> = new Map()
let profiles: BrowserProfile[] = []
let activeProfileId: string | null = null

// CHAOS FIX: Use Maps for concurrent operation support
const activeRuns: Map<string, AutomationRun> = new Map()  // runId -> run
const approvalResolvers: Map<string, (approved: boolean) => void> = new Map()  // runId -> resolver
const approvalTimeouts: Map<string, NodeJS.Timeout> = new Map()  // runId -> timeout

// CHAOS FIX: Per-profile operation locks to prevent concurrent operations
const profileLocks: Map<string, boolean> = new Map()

// Streaming state - one stream per profile for efficiency
const streamingIntervals: Map<string, NodeJS.Timeout> = new Map()

// Profile storage path
const getProfilesDir = () => join(app.getPath('userData'), 'browser-profiles')
const getProfilesFile = () => join(app.getPath('userData'), 'profiles.json')

// Shutdown flag to prevent new operations during shutdown
let isShuttingDown = false

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * CHAOS FIX: Safe event emission with proper null/destroyed checks
 */
function emitEvent(type: string, data: Record<string, any>) {
  try {
    // Triple-check window validity
    if (!mainWindow) {
      logger.playwright.warn(' Cannot emit event: mainWindow is null')
      return
    }
    if (mainWindow.isDestroyed()) {
      logger.playwright.warn(' Cannot emit event: mainWindow is destroyed')
      return
    }
    if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
      logger.playwright.warn(' Cannot emit event: webContents is destroyed')
      return
    }
    
    mainWindow.webContents.send('automation:event', {
      type,
      timestamp: Date.now(),
      data,
    })
  } catch (err) {
    logger.playwright.error(' Failed to emit event:', err)
  }
}

function saveProfiles() {
  const file = getProfilesFile()
  const dir = getProfilesDir()
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(profiles, null, 2))
  } catch (err) {
    logger.playwright.error(' Failed to save profiles:', err)
  }
}

function loadProfiles(): BrowserProfile[] {
  const file = getProfilesFile()
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf-8'))
    } catch {
      return []
    }
  }
  return []
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function humanLikeDelay(): Promise<void> {
  // Random delay between 500ms and 2000ms to appear human
  await delay(500 + Math.random() * 1500)
}

/**
 * CHAOS FIX: Acquire lock for profile operations
 * Returns true if lock acquired, false if profile is busy
 */
function acquireProfileLock(profileId: string): boolean {
  if (profileLocks.get(profileId)) {
    console.warn(`[Playwright] Profile ${profileId} is busy - operation rejected`)
    return false
  }
  profileLocks.set(profileId, true)
  return true
}

function releaseProfileLock(profileId: string): void {
  profileLocks.delete(profileId)
}

/**
 * CHAOS FIX: Check if a run is still active (not stopped/failed/complete)
 */
function isRunActive(runId: string): boolean {
  const run = activeRuns.get(runId)
  if (!run) return false
  return run.status === 'running' || run.status === 'paused'
}

/**
 * CHAOS FIX: Get active run for a profile, if any
 */
function getActiveRunForProfile(profileId: string): AutomationRun | null {
  for (const run of activeRuns.values()) {
    if (run.profileId === profileId && (run.status === 'running' || run.status === 'paused')) {
      return run
    }
  }
  return null
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

function createProfile(platform: 'linkedin' | 'twitter' | 'generic', name?: string): BrowserProfile {
  const id = generateId()
  const profileDir = join(getProfilesDir(), id)
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true })

  const profile: BrowserProfile = {
    id,
    name: name || `${platform}-${id.substring(0, 6)}`,
    platform,
    userDataDir: profileDir,
    isLoggedIn: false,
    lastUsed: Date.now(),
  }

  profiles.push(profile)
  saveProfiles()
  return profile
}

function getOrCreateProfile(platform: 'linkedin' | 'twitter' | 'generic'): BrowserProfile {
  let profile = profiles.find(p => p.platform === platform)
  if (!profile) {
    profile = createProfile(platform)
  }
  return profile
}

async function getBrowserContext(profile: BrowserProfile): Promise<BrowserContext> {
  if (!browser) {
    throw new Error('Browser not initialized')
  }

  let context = contexts.get(profile.id)
  if (!context) {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      storageState: existsSync(join(profile.userDataDir, 'state.json'))
        ? join(profile.userDataDir, 'state.json')
        : undefined,
    })
    contexts.set(profile.id, context)
  }
  return context
}

/**
 * CHAOS FIX: Safe page getter with stale reference handling
 */
async function getPage(profile: BrowserProfile): Promise<Page> {
  const context = await getBrowserContext(profile)
  let page = pages.get(profile.id)
  
  // Check if page exists and is still valid
  if (page) {
    try {
      // Try to access the page - will throw if it's closed
      if (page.isClosed()) {
        pages.delete(profile.id)
        page = undefined
      }
    } catch {
      pages.delete(profile.id)
      page = undefined
    }
  }
  
  if (!page) {
    page = await context.newPage()
    pages.set(profile.id, page)
    
    // CHAOS FIX: Handle page close events to clean up state
    page.on('close', () => {
      pages.delete(profile.id)
      // If there's an active run using this page, mark it as failed
      const activeRun = getActiveRunForProfile(profile.id)
      if (activeRun) {
        failRun(activeRun.id, 'Browser page was closed unexpectedly')
      }
    })
  }
  return page
}

async function saveContextState(profile: BrowserProfile): Promise<void> {
  const context = contexts.get(profile.id)
  if (context) {
    const statePath = join(profile.userDataDir, 'state.json')
    try {
      await context.storageState({ path: statePath })
    } catch (e) {
      logger.playwright.error(' Failed to save state:', e)
    }
  }
}

// ============================================
// LIVE VIEW STREAMING
// ============================================

/**
 * CHAOS FIX: Safe frame capture with error handling
 */
async function captureFrame(profileId: string): Promise<string | null> {
  const page = pages.get(profileId)
  if (!page) return null
  
  try {
    // Quick check if page is closed
    if (page.isClosed()) {
      pages.delete(profileId)
      return null
    }
    
    const buffer = await page.screenshot({ type: 'jpeg', quality: 60, timeout: 5000 })
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch (err) {
    // Page might have closed during screenshot
    logger.playwright.warn(' Frame capture failed:', err)
    return null
  }
}

/**
 * CHAOS FIX: Streaming with per-profile intervals
 */
function startStreaming(profileId: string, fps: number = 2): void {
  // Stop any existing stream for this profile
  stopStreaming(profileId)
  
  const intervalMs = 1000 / fps

  const interval = setInterval(async () => {
    // Safety check: stop streaming if window is gone
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopStreaming(profileId)
      return
    }
    
    const frame = await captureFrame(profileId)
    const page = pages.get(profileId)
    if (frame && page && !page.isClosed()) {
      try {
        emitEvent('BROWSER_FRAME', {
          frameData: frame,
          url: page.url(),
          title: await page.title().catch(() => ''),
          profileId,
        })
      } catch {
        // Page closed during event emission
        stopStreaming(profileId)
      }
    }
  }, intervalMs)
  
  streamingIntervals.set(profileId, interval)
}

function stopStreaming(profileId?: string): void {
  if (profileId) {
    const interval = streamingIntervals.get(profileId)
    if (interval) {
      clearInterval(interval)
      streamingIntervals.delete(profileId)
    }
  } else {
    // Stop all streams
    for (const [id, interval] of streamingIntervals) {
      clearInterval(interval)
    }
    streamingIntervals.clear()
  }
}

// ============================================
// RUN MANAGEMENT (CHAOS-HARDENED)
// ============================================

/**
 * CHAOS FIX: Create run with proper tracking
 */
function createRun(
  type: AutomationRun['type'],
  steps: Omit<AutomationStep, 'id' | 'status'>[],
  profileId: string,
  target?: AutomationRun['target']
): AutomationRun {
  const run: AutomationRun = {
    id: generateId(),
    type,
    status: 'running',
    steps: steps.map((s, i) => ({
      ...s,
      id: `step-${i}`,
      status: i === 0 ? 'running' : 'pending',
    })),
    currentStepIndex: 0,
    target,
    startTime: Date.now(),
    profileId,
  }
  
  activeRuns.set(run.id, run)
  emitEvent('RUN_UPDATE', { run })
  return run
}

function updateStepStatus(runId: string, status: AutomationStep['status'], error?: string): void {
  const run = activeRuns.get(runId)
  if (!run) return

  const step = run.steps[run.currentStepIndex]
  if (step) {
    step.status = status
    if (status === 'complete' && run.currentStepIndex < run.steps.length - 1) {
      run.currentStepIndex++
      run.steps[run.currentStepIndex].status = 'running'
    }
  }

  if (error) {
    run.error = error
    run.status = 'failed'
  }

  emitEvent('RUN_UPDATE', { run })
}

function completeRun(runId: string): AutomationRun | null {
  const run = activeRuns.get(runId)
  if (!run) return null
  
  run.status = 'complete'
  run.endTime = Date.now()
  const completedRun = { ...run }
  
  // Clean up
  activeRuns.delete(runId)
  clearApproval(runId)
  releaseProfileLock(run.profileId)
  
  emitEvent('RUN_FINISHED', { run: completedRun })
  return completedRun
}

function failRun(runId: string, error: string): AutomationRun | null {
  const run = activeRuns.get(runId)
  if (!run) return null
  
  run.status = 'failed'
  run.error = error
  run.endTime = Date.now()
  const failedRun = { ...run }
  
  // Clean up
  activeRuns.delete(runId)
  clearApproval(runId)
  releaseProfileLock(run.profileId)
  
  emitEvent('RUN_FINISHED', { run: failedRun })
  return failedRun
}

/**
 * CHAOS FIX: Stop run with proper cleanup
 */
function stopRun(runId?: string): void {
  if (runId) {
    // Stop specific run
    const run = activeRuns.get(runId)
    if (!run) return
    
    run.status = 'stopped'
    run.endTime = Date.now()
    
    // Clear any pending approval
    clearApproval(runId)
    
    // Clean up
    activeRuns.delete(runId)
    releaseProfileLock(run.profileId)
    
    emitEvent('STOP_ACKNOWLEDGED', { run })
  } else {
    // Stop all runs
    for (const [id, run] of activeRuns) {
      run.status = 'stopped'
      run.endTime = Date.now()
      clearApproval(id)
      releaseProfileLock(run.profileId)
      emitEvent('STOP_ACKNOWLEDGED', { run })
    }
    activeRuns.clear()
  }
}

/**
 * CHAOS FIX: Clear approval resolver and timeout for a run
 */
function clearApproval(runId: string): void {
  const resolver = approvalResolvers.get(runId)
  if (resolver) {
    resolver(false) // Auto-reject
    approvalResolvers.delete(runId)
  }
  
  const timeout = approvalTimeouts.get(runId)
  if (timeout) {
    clearTimeout(timeout)
    approvalTimeouts.delete(runId)
  }
}

/**
 * CHAOS FIX: Approval with proper timeout handling and cleanup
 */
async function waitForApproval(runId: string, action: string, preview: { target: string; content: string }, timeoutMs: number = 300000): Promise<boolean> {
  const run = activeRuns.get(runId)
  if (!run) return false

  run.status = 'paused'
  emitEvent('NEEDS_APPROVAL', {
    runId,
    action,
    preview,
  })

  return new Promise(resolve => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      approvalResolvers.delete(runId)
      approvalTimeouts.delete(runId)
      resolve(false) // Auto-reject on timeout
    }, timeoutMs)
    
    approvalTimeouts.set(runId, timeoutId)
    
    // Store resolver
    approvalResolvers.set(runId, (approved: boolean) => {
      const tid = approvalTimeouts.get(runId)
      if (tid) clearTimeout(tid)
      approvalTimeouts.delete(runId)
      approvalResolvers.delete(runId)
      resolve(approved)
    })
  })
}

// ============================================
// LINKEDIN AUTOMATION (CHAOS-HARDENED)
// ============================================

async function checkLinkedInLogin(profileId: string): Promise<boolean> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) return false

  try {
    const page = await getPage(profile)
    
    // Navigate to LinkedIn feed (requires login)
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle', timeout: 15000 })
    
    // Check if we're logged in by looking for the nav bar
    const isLoggedIn = await page.locator('.global-nav__me').isVisible().catch(() => false)
    
    profile.isLoggedIn = isLoggedIn
    saveProfiles()
    
    return isLoggedIn
  } catch (err) {
    logger.playwright.error(' LinkedIn login check failed:', err)
    return false
  }
}

async function linkedInConnect(profileId: string, targetUrl: string, note?: string): Promise<AutomationRun> {
  // CHAOS FIX: Check shutdown state
  if (isShuttingDown) {
    throw new Error('System is shutting down')
  }
  
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')
  
  // CHAOS FIX: Check for existing active run on this profile
  const existingRun = getActiveRunForProfile(profileId)
  if (existingRun) {
    throw new Error(`Profile ${profile.name} already has an active automation (${existingRun.type}). Stop it first.`)
  }
  
  // CHAOS FIX: Acquire profile lock
  if (!acquireProfileLock(profileId)) {
    throw new Error(`Profile ${profile.name} is busy with another operation`)
  }

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: 'Opening LinkedIn profile' },
    { name: 'Extract profile info', description: 'Reading profile details' },
    { name: 'Click Connect', description: 'Initiating connection' },
    ...(note ? [{ name: 'Add note', description: 'Adding personalized note' }] : []),
    { name: 'Send request', description: 'Sending connection request', requiresApproval: true },
  ]

  const run = createRun('linkedin_connect', steps, profileId)

  // Start streaming
  startStreaming(profileId)

  try {
    // CHAOS FIX: Check if run was stopped before each step
    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 1: Navigate
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 2: Extract profile info
    const name = await page.locator('h1.text-heading-xlarge').textContent().catch(() => 'Unknown')
    const headline = await page.locator('.text-body-medium.break-words').first().textContent().catch(() => '')
    
    const currentRun = activeRuns.get(run.id)
    if (currentRun) {
      currentRun.target = {
        name: name?.trim() || 'Unknown',
        headline: headline?.trim(),
        profileUrl: targetUrl,
      }
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 3: Click Connect button
    await humanLikeDelay()
    
    // Try different selectors for the connect button
    const connectButton = page.locator('button:has-text("Connect")').first()
    const moreButton = page.locator('button:has-text("More")').first()
    
    if (await connectButton.isVisible()) {
      await connectButton.click()
    } else if (await moreButton.isVisible()) {
      await moreButton.click()
      await delay(500)
      await page.locator('div[role="menuitem"]:has-text("Connect")').click()
    } else {
      throw new Error('Connect button not found - they may already be connected')
    }
    
    await delay(1000)
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 4: Add note if provided
    if (note) {
      await humanLikeDelay()
      const addNoteButton = page.locator('button:has-text("Add a note")')
      if (await addNoteButton.isVisible()) {
        await addNoteButton.click()
        await delay(500)
        await page.locator('textarea[name="message"]').fill(note)
      }
      updateStepStatus(run.id, 'complete')
    }

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 5: Wait for approval before sending
    const approved = await waitForApproval(run.id, 'SEND_CONNECTION', {
      target: activeRuns.get(run.id)?.target?.name || targetUrl,
      content: note || 'No note added',
    })

    if (!approved) {
      // Close the modal
      await page.locator('button[aria-label="Dismiss"]').click().catch(() => {})
      throw new Error('Connection cancelled by user')
    }

    // Send the request
    const sendButton = page.locator('button:has-text("Send")').last()
    await sendButton.click()
    await delay(1000)
    updateStepStatus(run.id, 'complete')

    // Save state
    await saveContextState(profile)
    const completedRun = completeRun(run.id)
    return completedRun!

  } catch (error) {
    failRun(run.id, (error as Error).message)
    throw error
  } finally {
    stopStreaming(profileId)
    releaseProfileLock(profileId)
  }
}

async function linkedInMessage(profileId: string, targetUrl: string, message: string): Promise<AutomationRun> {
  // CHAOS FIX: Check shutdown state
  if (isShuttingDown) {
    throw new Error('System is shutting down')
  }
  
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')
  
  // CHAOS FIX: Check for existing active run
  const existingRun = getActiveRunForProfile(profileId)
  if (existingRun) {
    throw new Error(`Profile ${profile.name} already has an active automation. Stop it first.`)
  }
  
  if (!acquireProfileLock(profileId)) {
    throw new Error(`Profile ${profile.name} is busy with another operation`)
  }

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: 'Opening LinkedIn profile' },
    { name: 'Open message dialog', description: 'Opening messaging' },
    { name: 'Type message', description: 'Composing message' },
    { name: 'Send message', description: 'Sending message', requiresApproval: true },
  ]

  const run = createRun('linkedin_message', steps, profileId)
  startStreaming(profileId)

  try {
    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 1: Navigate
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    const name = await page.locator('h1.text-heading-xlarge').textContent().catch(() => 'Unknown')
    const currentRun = activeRuns.get(run.id)
    if (currentRun) {
      currentRun.target = {
        name: name?.trim() || 'Unknown',
        profileUrl: targetUrl,
      }
      currentRun.message = message
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 2: Click Message button
    await humanLikeDelay()
    const messageButton = page.locator('button:has-text("Message")').first()
    await messageButton.click()
    await delay(1500)
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 3: Type message
    await humanLikeDelay()
    const messageInput = page.locator('div.msg-form__contenteditable').first()
    await messageInput.click()
    await delay(300)
    
    // Type slowly like a human
    for (const char of message) {
      if (!isRunActive(run.id)) throw new Error('Run was stopped')
      await page.keyboard.type(char, { delay: 30 + Math.random() * 50 })
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 4: Wait for approval
    const approved = await waitForApproval(run.id, 'SEND_MESSAGE', {
      target: activeRuns.get(run.id)?.target?.name || targetUrl,
      content: message,
    })

    if (!approved) {
      // Close the modal
      await page.keyboard.press('Escape')
      throw new Error('Message cancelled by user')
    }

    // Send
    const sendButton = page.locator('button.msg-form__send-button')
    await sendButton.click()
    await delay(1000)
    updateStepStatus(run.id, 'complete')

    await saveContextState(profile)
    const completedRun = completeRun(run.id)
    return completedRun!

  } catch (error) {
    failRun(run.id, (error as Error).message)
    throw error
  } finally {
    stopStreaming(profileId)
    releaseProfileLock(profileId)
  }
}

// ============================================
// TWITTER AUTOMATION (CHAOS-HARDENED)
// ============================================

async function checkTwitterLogin(profileId: string): Promise<boolean> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) return false

  try {
    const page = await getPage(profile)
    
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle', timeout: 15000 })
    
    // Check if we see the home timeline
    const isLoggedIn = await page.locator('[data-testid="primaryColumn"]').isVisible().catch(() => false)
    
    profile.isLoggedIn = isLoggedIn
    saveProfiles()
    
    return isLoggedIn
  } catch (err) {
    logger.playwright.error(' Twitter login check failed:', err)
    return false
  }
}

async function twitterFollow(profileId: string, username: string): Promise<AutomationRun> {
  if (isShuttingDown) throw new Error('System is shutting down')
  
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')
  
  // STRESS TEST FIX: Validate username format before proceeding
  const cleanUsername = username.replace(/^@/, '').trim()
  if (!cleanUsername) {
    throw new Error('Username cannot be empty')
  }
  if (cleanUsername.length > 15) {
    throw new Error('Twitter usernames cannot exceed 15 characters')
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    throw new Error('Invalid Twitter username format (only letters, numbers, and underscores allowed)')
  }
  
  const existingRun = getActiveRunForProfile(profileId)
  if (existingRun) {
    throw new Error(`Profile ${profile.name} already has an active automation. Stop it first.`)
  }
  
  if (!acquireProfileLock(profileId)) {
    throw new Error(`Profile ${profile.name} is busy with another operation`)
  }

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: `Opening @${cleanUsername}` },
    { name: 'Click Follow', description: 'Following user', requiresApproval: true },
  ]

  const run = createRun('twitter_follow', steps, profileId)
  startStreaming(profileId)

  try {
    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 1: Navigate
    await page.goto(`https://twitter.com/${cleanUsername}`, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    // STRESS TEST FIX: Check if user exists
    // Twitter shows specific elements when user doesn't exist
    const userNotFound = await page.locator('[data-testid="error-detail"]').isVisible().catch(() => false) ||
                         await page.locator('text="This account doesn\'t exist"').isVisible().catch(() => false) ||
                         await page.locator('text="Account suspended"').isVisible().catch(() => false) ||
                         await page.locator('span:has-text("Hmm...this page doesn\'t exist")').isVisible().catch(() => false)
    
    if (userNotFound) {
      throw new Error(`User @${cleanUsername} does not exist or is suspended`)
    }
    
    const displayName = await page.locator('[data-testid="UserName"] span').first().textContent().catch(() => cleanUsername)
    const currentRun = activeRuns.get(run.id)
    if (currentRun) {
      currentRun.target = {
        name: displayName || cleanUsername,
        profileUrl: `https://twitter.com/${cleanUsername}`,
      }
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 2: Follow
    // STRESS TEST FIX: Wait a bit for the button to appear
    await delay(500)
    
    const followButton = page.locator('[data-testid$="-follow"]')
    const isFollowButton = await followButton.isVisible({ timeout: 3000 }).catch(() => false)
    
    if (!isFollowButton) {
      // Check if already following
      const unfollowButton = await page.locator('[data-testid$="-unfollow"]').isVisible({ timeout: 1000 }).catch(() => false)
      if (unfollowButton) {
        throw new Error('Already following this user')
      }
      // Check if this is your own profile
      const editProfileButton = await page.locator('[data-testid="editProfileButton"]').isVisible().catch(() => false)
      if (editProfileButton) {
        throw new Error('Cannot follow your own account')
      }
      throw new Error('Follow button not found - user may have blocked you or restricted who can follow')
    }

    const approved = await waitForApproval(run.id, 'FOLLOW_USER', {
      target: `@${cleanUsername}`,
      content: `Follow ${displayName || cleanUsername}`,
    })

    if (!approved) {
      throw new Error('Follow cancelled by user')
    }

    await followButton.click()
    await delay(1000)
    updateStepStatus(run.id, 'complete')

    await saveContextState(profile)
    const completedRun = completeRun(run.id)
    return completedRun!

  } catch (error) {
    failRun(run.id, (error as Error).message)
    throw error
  } finally {
    stopStreaming(profileId)
    releaseProfileLock(profileId)
  }
}

async function twitterDM(profileId: string, username: string, message: string): Promise<AutomationRun> {
  if (isShuttingDown) throw new Error('System is shutting down')
  
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')
  
  // STRESS TEST FIX: Validate username format
  const cleanUsername = username.replace(/^@/, '').trim()
  if (!cleanUsername) {
    throw new Error('Username cannot be empty')
  }
  if (cleanUsername.length > 15) {
    throw new Error('Twitter usernames cannot exceed 15 characters')
  }
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
    throw new Error('Invalid Twitter username format (only letters, numbers, and underscores allowed)')
  }
  
  // STRESS TEST FIX: Validate message
  if (!message || message.trim().length === 0) {
    throw new Error('Message cannot be empty')
  }
  // Twitter DM limit is 10,000 characters
  if (message.length > 10000) {
    throw new Error('Message exceeds Twitter DM limit of 10,000 characters')
  }
  
  const existingRun = getActiveRunForProfile(profileId)
  if (existingRun) {
    throw new Error(`Profile ${profile.name} already has an active automation. Stop it first.`)
  }
  
  if (!acquireProfileLock(profileId)) {
    throw new Error(`Profile ${profile.name} is busy with another operation`)
  }

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: `Opening @${cleanUsername}` },
    { name: 'Open DM dialog', description: 'Starting conversation' },
    { name: 'Type message', description: 'Composing message' },
    { name: 'Send DM', description: 'Sending message', requiresApproval: true },
  ]

  const run = createRun('twitter_dm', steps, profileId)
  startStreaming(profileId)

  try {
    if (!isRunActive(run.id)) throw new Error('Run was stopped')
    
    // Step 1: Navigate
    await page.goto(`https://twitter.com/${cleanUsername}`, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    // STRESS TEST FIX: Check if user exists
    const userNotFound = await page.locator('[data-testid="error-detail"]').isVisible().catch(() => false) ||
                         await page.locator('text="This account doesn\'t exist"').isVisible().catch(() => false) ||
                         await page.locator('text="Account suspended"').isVisible().catch(() => false) ||
                         await page.locator('span:has-text("Hmm...this page doesn\'t exist")').isVisible().catch(() => false)
    
    if (userNotFound) {
      throw new Error(`User @${cleanUsername} does not exist or is suspended`)
    }
    
    const displayName = await page.locator('[data-testid="UserName"] span').first().textContent().catch(() => cleanUsername)
    const currentRun = activeRuns.get(run.id)
    if (currentRun) {
      currentRun.target = {
        name: displayName || cleanUsername,
        profileUrl: `https://twitter.com/${cleanUsername}`,
      }
      currentRun.message = message
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 2: Click DM button
    await humanLikeDelay()
    await delay(500) // STRESS TEST FIX: Wait for button to render
    const dmButton = page.locator('[data-testid="sendDMFromProfile"]')
    if (!await dmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check if it's your own profile
      const editProfileButton = await page.locator('[data-testid="editProfileButton"]').isVisible().catch(() => false)
      if (editProfileButton) {
        throw new Error('Cannot DM your own account')
      }
      throw new Error('Cannot DM this user - they may not follow you, have DMs disabled, or have blocked you')
    }
    await dmButton.click()
    await delay(1500)
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 3: Type message
    await humanLikeDelay()
    const messageInput = page.locator('[data-testid="dmComposerTextInput"]')
    await messageInput.click()
    await delay(300)
    
    for (const char of message) {
      if (!isRunActive(run.id)) throw new Error('Run was stopped')
      await page.keyboard.type(char, { delay: 30 + Math.random() * 50 })
    }
    updateStepStatus(run.id, 'complete')

    if (!isRunActive(run.id)) throw new Error('Run was stopped')

    // Step 4: Approval
    const approved = await waitForApproval(run.id, 'SEND_DM', {
      target: `@${cleanUsername}`,
      content: message,
    })

    if (!approved) {
      await page.keyboard.press('Escape')
      throw new Error('DM cancelled by user')
    }

    const sendButton = page.locator('[data-testid="dmComposerSendButton"]')
    await sendButton.click()
    await delay(1000)
    updateStepStatus(run.id, 'complete')

    await saveContextState(profile)
    const completedRun = completeRun(run.id)
    return completedRun!

  } catch (error) {
    failRun(run.id, (error as Error).message)
    throw error
  } finally {
    stopStreaming(profileId)
    releaseProfileLock(profileId)
  }
}

// ============================================
// SHUTDOWN (CHAOS-HARDENED)
// ============================================

/**
 * CHAOS FIX: Graceful shutdown with active operation cleanup
 */
async function shutdown(): Promise<void> {
  isShuttingDown = true
  
  // Stop all streaming
  stopStreaming()
  
  // Stop all active runs
  stopRun()
  
  // Save all context states
  for (const [id, context] of contexts) {
    const profile = profiles.find(p => p.id === id)
    if (profile) {
      try {
        await saveContextState(profile)
      } catch (err) {
        console.error(`[Playwright] Failed to save state for ${id}:`, err)
      }
    }
    try {
      await context.close()
    } catch (err) {
      console.error(`[Playwright] Failed to close context ${id}:`, err)
    }
  }
  contexts.clear()
  pages.clear()
  
  // Close browser
  if (browser) {
    try {
      await browser.close()
    } catch (err) {
      logger.playwright.error(' Failed to close browser:', err)
    }
    browser = null
  }
  
  activeProfileId = null
  isShuttingDown = false
}

// ============================================
// IPC HANDLERS
// ============================================

export function registerPlaywrightIpcHandlers(window: BrowserWindow) {
  mainWindow = window
  profiles = loadProfiles()

  // Initialize browser
  ipcMain.handle('playwright:initialize', async () => {
    try {
      if (browser) {
        return { success: true, message: 'Already initialized' }
      }
      
      const chromium = await getChromium()
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
      })
      
      // CHAOS FIX: Handle browser disconnection
      browser.on('disconnected', () => {
        logger.playwright.warn(' Browser disconnected unexpectedly')
        browser = null
        // Stop all active runs
        stopRun()
        // Clear all contexts and pages
        contexts.clear()
        pages.clear()
        emitEvent('browser_error', { error: 'Browser disconnected unexpectedly' })
      })
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Shutdown browser
  ipcMain.handle('playwright:shutdown', async () => {
    try {
      await shutdown()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Profile management
  ipcMain.handle('playwright:get-profiles', () => profiles)

  ipcMain.handle('playwright:create-profile', async (_, platform: 'linkedin' | 'twitter' | 'generic', name?: string) => {
    try {
      const profile = createProfile(platform, name)
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:get-or-create-profile', async (_, platform: 'linkedin' | 'twitter' | 'generic') => {
    try {
      const profile = getOrCreateProfile(platform)
      activeProfileId = profile.id
      return { success: true, profile }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Streaming
  ipcMain.handle('playwright:start-streaming', async (_, profileId: string, fps?: number) => {
    try {
      startStreaming(profileId, fps || 2)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:stop-streaming', async (_, profileId?: string) => {
    stopStreaming(profileId)
    return { success: true }
  })

  ipcMain.handle('playwright:capture-frame', async (_, profileId: string) => {
    try {
      const frame = await captureFrame(profileId)
      return { success: true, frame }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Navigation - with abort handling for rapid navigation
  // STRESS TEST FIX: Track pending navigations and abort old ones
  const pendingNavigations = new Map<string, AbortController>()
  
  ipcMain.handle('playwright:navigate', async (_, profileId: string, url: string) => {
    try {
      const profile = profiles.find(p => p.id === profileId)
      if (!profile) throw new Error('Profile not found')
      
      // STRESS TEST FIX: Abort any pending navigation for this profile
      const existingController = pendingNavigations.get(profileId)
      if (existingController) {
        existingController.abort()
        logger.playwright.info(` Aborted pending navigation for profile ${profileId}`)
      }
      
      // Create new abort controller for this navigation
      const controller = new AbortController()
      pendingNavigations.set(profileId, controller)
      
      const page = await getPage(profile)
      
      // Use a race between navigation and abort signal
      try {
        await page.goto(url, { 
          waitUntil: 'networkidle',
          timeout: 30000 
        })
      } catch (navError) {
        if (controller.signal.aborted) {
          return { success: false, error: 'Navigation cancelled by newer request', cancelled: true }
        }
        throw navError
      } finally {
        // Clean up if this was the current controller
        if (pendingNavigations.get(profileId) === controller) {
          pendingNavigations.delete(profileId)
        }
      }
      
      return { success: true, url: page.url() }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // LinkedIn
  ipcMain.handle('playwright:linkedin-check-login', async (_, profileId: string) => {
    try {
      const isLoggedIn = await checkLinkedInLogin(profileId)
      return { success: true, isLoggedIn }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:linkedin-navigate', async (_, profileId: string) => {
    try {
      const profile = profiles.find(p => p.id === profileId)
      if (!profile) throw new Error('Profile not found')
      
      const page = await getPage(profile)
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle' })
      startStreaming(profileId)
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:linkedin-connect', async (_, profileId: string, targetUrl: string, note?: string) => {
    try {
      const run = await linkedInConnect(profileId, targetUrl, note)
      return { success: true, run }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:linkedin-message', async (_, profileId: string, targetUrl: string, message: string) => {
    try {
      const run = await linkedInMessage(profileId, targetUrl, message)
      return { success: true, run }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Twitter
  ipcMain.handle('playwright:twitter-check-login', async (_, profileId: string) => {
    try {
      const isLoggedIn = await checkTwitterLogin(profileId)
      return { success: true, isLoggedIn }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:twitter-follow', async (_, profileId: string, username: string) => {
    try {
      const run = await twitterFollow(profileId, username)
      return { success: true, run }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:twitter-dm', async (_, profileId: string, username: string, message: string) => {
    try {
      const run = await twitterDM(profileId, username, message)
      return { success: true, run }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Run control - CHAOS HARDENED
  ipcMain.handle('playwright:approve-action', async (_, runId: string) => {
    const resolver = approvalResolvers.get(runId)
    if (resolver) {
      resolver(true)
      return { success: true }
    }
    return { success: false, error: 'No pending approval for this run' }
  })

  ipcMain.handle('playwright:reject-action', async (_, runId: string) => {
    const resolver = approvalResolvers.get(runId)
    if (resolver) {
      resolver(false)
      return { success: true }
    }
    return { success: false, error: 'No pending approval for this run' }
  })

  ipcMain.handle('playwright:stop-run', async (_, runId?: string) => {
    stopRun(runId)
    return { success: true }
  })
  
  // CHAOS FIX: New handler to get all active runs
  ipcMain.handle('playwright:get-active-runs', async () => {
    return Array.from(activeRuns.values())
  })
  
  // CHAOS FIX: New handler to check if profile is busy
  ipcMain.handle('playwright:is-profile-busy', async (_, profileId: string) => {
    return profileLocks.get(profileId) || false
  })

  // Legacy handlers for backwards compatibility
  ipcMain.handle('playwright:launch', async (_, options?: { headless?: boolean }) => {
    try {
      if (browser) {
        return { success: true, message: 'Browser already launched' }
      }
      
      const chromium = await getChromium()
      browser = await chromium.launch({
        headless: options?.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      })
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:screenshot', async () => {
    try {
      if (activeProfileId) {
        const frame = await captureFrame(activeProfileId)
        return { success: true, data: frame }
      }
      return { success: false, error: 'No active profile' }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:close', async () => {
    try {
      await shutdown()
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:evaluate', async (_, script: string) => {
    try {
      if (activeProfileId) {
        const page = pages.get(activeProfileId)
        if (page && !page.isClosed()) {
          const result = await page.evaluate(script)
          return { success: true, result }
        }
      }
      return { success: false, error: 'No active page' }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })
}

export function unregisterPlaywrightIpcHandlers() {
  // Clean up before unregistering
  shutdown().catch((err) => logger.main.error("Shutdown error", err))
  
  const handlers = [
    'playwright:initialize',
    'playwright:shutdown',
    'playwright:get-profiles',
    'playwright:create-profile',
    'playwright:get-or-create-profile',
    'playwright:start-streaming',
    'playwright:stop-streaming',
    'playwright:capture-frame',
    'playwright:navigate',
    'playwright:linkedin-check-login',
    'playwright:linkedin-navigate',
    'playwright:linkedin-connect',
    'playwright:linkedin-message',
    'playwright:twitter-check-login',
    'playwright:twitter-follow',
    'playwright:twitter-dm',
    'playwright:approve-action',
    'playwright:reject-action',
    'playwright:stop-run',
    'playwright:get-active-runs',
    'playwright:is-profile-busy',
    'playwright:launch',
    'playwright:screenshot',
    'playwright:close',
    'playwright:evaluate',
  ]

  handlers.forEach(h => ipcMain.removeHandler(h))
  mainWindow = null
}
