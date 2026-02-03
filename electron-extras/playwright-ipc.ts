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
 */

import { BrowserWindow, ipcMain, app } from 'electron'
import { chromium, Browser, BrowserContext, Page } from 'playwright-core'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'

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
let currentRun: AutomationRun | null = null
let streamingInterval: NodeJS.Timeout | null = null
let approvalResolver: ((approved: boolean) => void) | null = null

// Profile storage path
const getProfilesDir = () => join(app.getPath('userData'), 'browser-profiles')
const getProfilesFile = () => join(app.getPath('userData'), 'profiles.json')

// ============================================
// HELPERS
// ============================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

function emitEvent(type: string, data: Record<string, any>) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    try {
      mainWindow.webContents.send('automation:event', {
        type,
        timestamp: Date.now(),
        data,
      })
    } catch (err) {
      console.error('Failed to emit event:', err)
    }
  }
}

function saveProfiles() {
  const file = getProfilesFile()
  const dir = getProfilesDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(profiles, null, 2))
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

async function getPage(profile: BrowserProfile): Promise<Page> {
  const context = await getBrowserContext(profile)
  let page = pages.get(profile.id)
  if (!page || page.isClosed()) {
    page = await context.newPage()
    pages.set(profile.id, page)
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
      console.error('Failed to save state:', e)
    }
  }
}

// ============================================
// LIVE VIEW STREAMING
// ============================================

async function captureFrame(profileId: string): Promise<string | null> {
  const page = pages.get(profileId)
  if (!page || page.isClosed()) return null

  try {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 60 })
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function startStreaming(profileId: string, fps: number = 2): void {
  stopStreaming()
  const intervalMs = 1000 / fps

  streamingInterval = setInterval(async () => {
    const frame = await captureFrame(profileId)
    const page = pages.get(profileId)
    if (frame && page) {
      emitEvent('BROWSER_FRAME', {
        frameData: frame,
        url: page.url(),
        title: await page.title(),
      })
    }
  }, intervalMs)
}

function stopStreaming(): void {
  if (streamingInterval) {
    clearInterval(streamingInterval)
    streamingInterval = null
  }
}

// ============================================
// RUN MANAGEMENT
// ============================================

function createRun(
  type: AutomationRun['type'],
  steps: Omit<AutomationStep, 'id' | 'status'>[],
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
  }
  currentRun = run
  emitEvent('RUN_UPDATE', { run })
  return run
}

function updateStepStatus(status: AutomationStep['status'], error?: string): void {
  if (!currentRun) return

  const step = currentRun.steps[currentRun.currentStepIndex]
  if (step) {
    step.status = status
    if (status === 'complete' && currentRun.currentStepIndex < currentRun.steps.length - 1) {
      currentRun.currentStepIndex++
      currentRun.steps[currentRun.currentStepIndex].status = 'running'
    }
  }

  if (error) {
    currentRun.error = error
    currentRun.status = 'failed'
  }

  emitEvent('RUN_UPDATE', { run: currentRun })
}

function completeRun(): AutomationRun | null {
  if (!currentRun) return null
  currentRun.status = 'complete'
  currentRun.endTime = Date.now()
  const completedRun = { ...currentRun } // Clone before nulling
  emitEvent('RUN_FINISHED', { run: completedRun })
  currentRun = null
  return completedRun
}

function failRun(error: string): AutomationRun | null {
  if (!currentRun) return null
  currentRun.status = 'failed'
  currentRun.error = error
  currentRun.endTime = Date.now()
  const failedRun = { ...currentRun } // Clone before nulling
  emitEvent('RUN_FINISHED', { run: failedRun })
  currentRun = null
  return failedRun
}

function stopRun(): void {
  if (!currentRun) return
  currentRun.status = 'stopped'
  currentRun.endTime = Date.now()
  if (approvalResolver) {
    approvalResolver(false)
    approvalResolver = null
  }
  emitEvent('STOP_ACKNOWLEDGED', { run: currentRun })
  currentRun = null
}

async function waitForApproval(action: string, preview: { target: string; content: string }, timeoutMs: number = 300000): Promise<boolean> {
  if (!currentRun) return false

  currentRun.status = 'paused'
  emitEvent('NEEDS_APPROVAL', {
    runId: currentRun.id,
    action,
    preview,
  })

  return new Promise(resolve => {
    // Set up timeout to prevent memory leak from unresolved promises
    const timeoutId = setTimeout(() => {
      if (approvalResolver === resolve) {
        approvalResolver = null
        resolve(false) // Auto-reject on timeout
      }
    }, timeoutMs)

    approvalResolver = (approved: boolean) => {
      clearTimeout(timeoutId)
      resolve(approved)
    }
  })
}

// ============================================
// LINKEDIN AUTOMATION
// ============================================

async function checkLinkedInLogin(profileId: string): Promise<boolean> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) return false

  const page = await getPage(profile)
  
  try {
    // Navigate to LinkedIn feed (requires login)
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle', timeout: 15000 })
    
    // Check if we're logged in by looking for the nav bar
    const isLoggedIn = await page.locator('.global-nav__me').isVisible().catch(() => false)
    
    profile.isLoggedIn = isLoggedIn
    saveProfiles()
    
    return isLoggedIn
  } catch {
    return false
  }
}

async function linkedInConnect(profileId: string, targetUrl: string, note?: string): Promise<AutomationRun> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: 'Opening LinkedIn profile' },
    { name: 'Extract profile info', description: 'Reading profile details' },
    { name: 'Click Connect', description: 'Initiating connection' },
    ...(note ? [{ name: 'Add note', description: 'Adding personalized note' }] : []),
    { name: 'Send request', description: 'Sending connection request', requiresApproval: true },
  ]

  const run = createRun('linkedin_connect', steps)

  // Start streaming
  startStreaming(profileId)

  try {
    // Step 1: Navigate
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    updateStepStatus('complete')

    // Step 2: Extract profile info
    const name = await page.locator('h1.text-heading-xlarge').textContent().catch(() => 'Unknown')
    const headline = await page.locator('.text-body-medium.break-words').first().textContent().catch(() => '')
    
    if (currentRun) {
      currentRun.target = {
        name: name?.trim() || 'Unknown',
        headline: headline?.trim(),
        profileUrl: targetUrl,
      }
    }
    updateStepStatus('complete')

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
    updateStepStatus('complete')

    // Step 4: Add note if provided
    if (note) {
      await humanLikeDelay()
      const addNoteButton = page.locator('button:has-text("Add a note")')
      if (await addNoteButton.isVisible()) {
        await addNoteButton.click()
        await delay(500)
        await page.locator('textarea[name="message"]').fill(note)
      }
      updateStepStatus('complete')
    }

    // Step 5: Wait for approval before sending
    const approved = await waitForApproval('SEND_CONNECTION', {
      target: currentRun?.target?.name || targetUrl,
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
    updateStepStatus('complete')

    // Save state
    await saveContextState(profile)
    const completedRun = completeRun()
    return completedRun!

  } catch (error) {
    const failedRun = failRun((error as Error).message)
    throw error
  } finally {
    stopStreaming()
  }
}

async function linkedInMessage(profileId: string, targetUrl: string, message: string): Promise<AutomationRun> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')

  const page = await getPage(profile)

  const steps = [
    { name: 'Navigate to profile', description: 'Opening LinkedIn profile' },
    { name: 'Open message dialog', description: 'Opening messaging' },
    { name: 'Type message', description: 'Composing message' },
    { name: 'Send message', description: 'Sending message', requiresApproval: true },
  ]

  const run = createRun('linkedin_message', steps)
  startStreaming(profileId)

  try {
    // Step 1: Navigate
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    const name = await page.locator('h1.text-heading-xlarge').textContent().catch(() => 'Unknown')
    if (currentRun) {
      currentRun.target = {
        name: name?.trim() || 'Unknown',
        profileUrl: targetUrl,
      }
      currentRun.message = message
    }
    updateStepStatus('complete')

    // Step 2: Click Message button
    await humanLikeDelay()
    const messageButton = page.locator('button:has-text("Message")').first()
    await messageButton.click()
    await delay(1500)
    updateStepStatus('complete')

    // Step 3: Type message
    await humanLikeDelay()
    const messageInput = page.locator('div.msg-form__contenteditable').first()
    await messageInput.click()
    await delay(300)
    
    // Type slowly like a human
    for (const char of message) {
      await page.keyboard.type(char, { delay: 30 + Math.random() * 50 })
    }
    updateStepStatus('complete')

    // Step 4: Wait for approval
    const approved = await waitForApproval('SEND_MESSAGE', {
      target: currentRun?.target?.name || targetUrl,
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
    updateStepStatus('complete')

    await saveContextState(profile)
    const completedRun = completeRun()
    return completedRun!

  } catch (error) {
    const failedRun = failRun((error as Error).message)
    throw error
  } finally {
    stopStreaming()
  }
}

// ============================================
// TWITTER AUTOMATION
// ============================================

async function checkTwitterLogin(profileId: string): Promise<boolean> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) return false

  const page = await getPage(profile)
  
  try {
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle', timeout: 15000 })
    
    // Check if we see the home timeline
    const isLoggedIn = await page.locator('[data-testid="primaryColumn"]').isVisible().catch(() => false)
    
    profile.isLoggedIn = isLoggedIn
    saveProfiles()
    
    return isLoggedIn
  } catch {
    return false
  }
}

async function twitterFollow(profileId: string, username: string): Promise<AutomationRun> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')

  const page = await getPage(profile)
  const cleanUsername = username.replace('@', '')

  const steps = [
    { name: 'Navigate to profile', description: `Opening @${cleanUsername}` },
    { name: 'Click Follow', description: 'Following user', requiresApproval: true },
  ]

  const run = createRun('twitter_follow', steps)
  startStreaming(profileId)

  try {
    // Step 1: Navigate
    await page.goto(`https://twitter.com/${cleanUsername}`, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    const displayName = await page.locator('[data-testid="UserName"] span').first().textContent().catch(() => cleanUsername)
    if (currentRun) {
      currentRun.target = {
        name: displayName || cleanUsername,
        profileUrl: `https://twitter.com/${cleanUsername}`,
      }
    }
    updateStepStatus('complete')

    // Step 2: Follow
    const followButton = page.locator('[data-testid$="-follow"]')
    const isFollowButton = await followButton.isVisible()
    
    if (!isFollowButton) {
      // Check if already following
      const unfollowButton = await page.locator('[data-testid$="-unfollow"]').isVisible()
      if (unfollowButton) {
        throw new Error('Already following this user')
      }
      throw new Error('Follow button not found')
    }

    const approved = await waitForApproval('FOLLOW_USER', {
      target: `@${cleanUsername}`,
      content: `Follow ${displayName || cleanUsername}`,
    })

    if (!approved) {
      throw new Error('Follow cancelled by user')
    }

    await followButton.click()
    await delay(1000)
    updateStepStatus('complete')

    await saveContextState(profile)
    const completedRun = completeRun()
    return completedRun!

  } catch (error) {
    const failedRun = failRun((error as Error).message)
    throw error
  } finally {
    stopStreaming()
  }
}

async function twitterDM(profileId: string, username: string, message: string): Promise<AutomationRun> {
  const profile = profiles.find(p => p.id === profileId)
  if (!profile) throw new Error('Profile not found')

  const page = await getPage(profile)
  const cleanUsername = username.replace('@', '')

  const steps = [
    { name: 'Navigate to profile', description: `Opening @${cleanUsername}` },
    { name: 'Open DM dialog', description: 'Starting conversation' },
    { name: 'Type message', description: 'Composing message' },
    { name: 'Send DM', description: 'Sending message', requiresApproval: true },
  ]

  const run = createRun('twitter_dm', steps)
  startStreaming(profileId)

  try {
    // Step 1: Navigate
    await page.goto(`https://twitter.com/${cleanUsername}`, { waitUntil: 'networkidle', timeout: 20000 })
    await humanLikeDelay()
    
    const displayName = await page.locator('[data-testid="UserName"] span').first().textContent().catch(() => cleanUsername)
    if (currentRun) {
      currentRun.target = {
        name: displayName || cleanUsername,
        profileUrl: `https://twitter.com/${cleanUsername}`,
      }
      currentRun.message = message
    }
    updateStepStatus('complete')

    // Step 2: Click DM button
    await humanLikeDelay()
    const dmButton = page.locator('[data-testid="sendDMFromProfile"]')
    if (!await dmButton.isVisible()) {
      throw new Error('Cannot DM this user - they may not follow you or have DMs disabled')
    }
    await dmButton.click()
    await delay(1500)
    updateStepStatus('complete')

    // Step 3: Type message
    await humanLikeDelay()
    const messageInput = page.locator('[data-testid="dmComposerTextInput"]')
    await messageInput.click()
    await delay(300)
    
    for (const char of message) {
      await page.keyboard.type(char, { delay: 30 + Math.random() * 50 })
    }
    updateStepStatus('complete')

    // Step 4: Approval
    const approved = await waitForApproval('SEND_DM', {
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
    updateStepStatus('complete')

    await saveContextState(profile)
    const completedRun = completeRun()
    return completedRun!

  } catch (error) {
    const failedRun = failRun((error as Error).message)
    throw error
  } finally {
    stopStreaming()
  }
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
      
      browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
      })
      
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // Shutdown browser
  ipcMain.handle('playwright:shutdown', async () => {
    try {
      stopStreaming()
      stopRun()
      
      for (const [id, context] of contexts) {
        const profile = profiles.find(p => p.id === id)
        if (profile) await saveContextState(profile)
        await context.close()
      }
      contexts.clear()
      pages.clear()
      
      if (browser) {
        await browser.close()
        browser = null
      }
      
      activeProfileId = null
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

  ipcMain.handle('playwright:stop-streaming', async () => {
    stopStreaming()
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

  // Navigation
  ipcMain.handle('playwright:navigate', async (_, profileId: string, url: string) => {
    try {
      const profile = profiles.find(p => p.id === profileId)
      if (!profile) throw new Error('Profile not found')
      
      const page = await getPage(profile)
      await page.goto(url, { waitUntil: 'networkidle' })
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

  // Run control
  ipcMain.handle('playwright:approve-action', async (_, runId: string) => {
    if (currentRun?.id === runId && approvalResolver) {
      const resolver = approvalResolver
      approvalResolver = null
      resolver(true)
      return { success: true }
    }
    return { success: false, error: 'No pending approval' }
  })

  ipcMain.handle('playwright:reject-action', async (_, runId: string) => {
    if (currentRun?.id === runId && approvalResolver) {
      const resolver = approvalResolver
      approvalResolver = null
      resolver(false)
      return { success: true }
    }
    return { success: false, error: 'No pending approval' }
  })

  ipcMain.handle('playwright:stop-run', async () => {
    stopRun()
    return { success: true }
  })

  // Legacy handlers for backwards compatibility
  ipcMain.handle('playwright:launch', async (_, options?: { headless?: boolean }) => {
    try {
      if (browser) {
        return { success: true, message: 'Browser already launched' }
      }
      
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
      if (browser) {
        await browser.close()
        browser = null
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('playwright:evaluate', async (_, script: string) => {
    try {
      if (activeProfileId) {
        const page = pages.get(activeProfileId)
        if (page) {
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
    'playwright:launch',
    'playwright:screenshot',
    'playwright:close',
    'playwright:evaluate',
  ]

  handlers.forEach(h => ipcMain.removeHandler(h))
  mainWindow = null
}
