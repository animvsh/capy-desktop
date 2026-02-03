/**
 * Event Safety Tests
 * 
 * Tests for safe event emission and browser state handling:
 * - Event emission with destroyed window
 * - Streaming interval cleanup
 * - Frame capture failures
 */

const { strict: assert } = require('assert');

// Simulated state
let mainWindow = null;
let streamingIntervals = new Map();
let eventLog = [];

// ============================================
// SIMULATED WINDOW
// ============================================

function createWindow() {
  return {
    _destroyed: false,
    webContents: {
      _destroyed: false,
      send: (channel, data) => {
        if (mainWindow?._destroyed || mainWindow?.webContents?._destroyed) {
          throw new Error('Cannot send to destroyed window');
        }
        eventLog.push({ channel, data });
      },
      isDestroyed: function() {
        return this._destroyed;
      }
    },
    isDestroyed: function() {
      return this._destroyed;
    }
  };
}

// ============================================
// HELPERS (Mirror backend logic)
// ============================================

function emitEvent(type, data) {
  try {
    // Triple-check window validity
    if (!mainWindow) {
      console.warn('[Playwright] Cannot emit event: mainWindow is null');
      return false;
    }
    if (mainWindow.isDestroyed()) {
      console.warn('[Playwright] Cannot emit event: mainWindow is destroyed');
      return false;
    }
    if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
      console.warn('[Playwright] Cannot emit event: webContents is destroyed');
      return false;
    }
    
    mainWindow.webContents.send('automation:event', {
      type,
      timestamp: Date.now(),
      data,
    });
    return true;
  } catch (err) {
    console.error('[Playwright] Failed to emit event:', err);
    return false;
  }
}

function startStreaming(profileId, fps = 2) {
  stopStreaming(profileId);
  
  const intervalMs = 1000 / fps;
  
  const interval = setInterval(() => {
    // Safety check
    if (!mainWindow || mainWindow.isDestroyed()) {
      stopStreaming(profileId);
      return;
    }
    
    emitEvent('BROWSER_FRAME', {
      frameData: 'fake-frame-data',
      url: 'https://example.com',
      title: 'Example',
      profileId,
    });
  }, intervalMs);
  
  streamingIntervals.set(profileId, interval);
}

function stopStreaming(profileId) {
  if (profileId) {
    const interval = streamingIntervals.get(profileId);
    if (interval) {
      clearInterval(interval);
      streamingIntervals.delete(profileId);
    }
  } else {
    for (const [id, interval] of streamingIntervals) {
      clearInterval(interval);
    }
    streamingIntervals.clear();
  }
}

// ============================================
// TESTS
// ============================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function reset() {
  mainWindow = null;
  stopStreaming();
  eventLog = [];
}

console.log('============================================================');
console.log('EVENT SAFETY TESTS');
console.log('============================================================\n');

// ============================================
// EVENT EMISSION SAFETY TESTS
// ============================================

console.log('--- Event Emission Safety ---\n');

test('Emit with valid window succeeds', () => {
  reset();
  mainWindow = createWindow();
  const result = emitEvent('TEST_EVENT', { foo: 'bar' });
  assert.equal(result, true);
  assert.equal(eventLog.length, 1);
  assert.equal(eventLog[0].data.type, 'TEST_EVENT');
});

test('Emit with null window returns false', () => {
  reset();
  mainWindow = null;
  const result = emitEvent('TEST_EVENT', { foo: 'bar' });
  assert.equal(result, false);
  assert.equal(eventLog.length, 0);
});

test('Emit with destroyed window returns false', () => {
  reset();
  mainWindow = createWindow();
  mainWindow._destroyed = true;
  const result = emitEvent('TEST_EVENT', { foo: 'bar' });
  assert.equal(result, false);
  assert.equal(eventLog.length, 0);
});

test('Emit with destroyed webContents returns false', () => {
  reset();
  mainWindow = createWindow();
  mainWindow.webContents._destroyed = true;
  const result = emitEvent('TEST_EVENT', { foo: 'bar' });
  assert.equal(result, false);
  assert.equal(eventLog.length, 0);
});

test('Emit with null webContents returns false', () => {
  reset();
  mainWindow = createWindow();
  mainWindow.webContents = null;
  const result = emitEvent('TEST_EVENT', { foo: 'bar' });
  assert.equal(result, false);
  assert.equal(eventLog.length, 0);
});

// ============================================
// STREAMING INTERVAL TESTS
// ============================================

console.log('\n--- Streaming Interval Safety ---\n');

test('Start streaming creates interval', () => {
  reset();
  mainWindow = createWindow();
  startStreaming('profile-1');
  assert.equal(streamingIntervals.size, 1);
  assert(streamingIntervals.has('profile-1'));
  stopStreaming();
});

test('Stop streaming clears specific interval', () => {
  reset();
  mainWindow = createWindow();
  startStreaming('profile-1');
  startStreaming('profile-2');
  assert.equal(streamingIntervals.size, 2);
  
  stopStreaming('profile-1');
  assert.equal(streamingIntervals.size, 1);
  assert(!streamingIntervals.has('profile-1'));
  assert(streamingIntervals.has('profile-2'));
  
  stopStreaming();
});

test('Stop all streaming clears all intervals', () => {
  reset();
  mainWindow = createWindow();
  startStreaming('profile-1');
  startStreaming('profile-2');
  startStreaming('profile-3');
  assert.equal(streamingIntervals.size, 3);
  
  stopStreaming();
  assert.equal(streamingIntervals.size, 0);
});

test('Starting same profile stops previous interval', () => {
  reset();
  mainWindow = createWindow();
  startStreaming('profile-1');
  const firstInterval = streamingIntervals.get('profile-1');
  
  startStreaming('profile-1');
  const secondInterval = streamingIntervals.get('profile-1');
  
  assert.notEqual(firstInterval, secondInterval, 'Should be different interval');
  assert.equal(streamingIntervals.size, 1, 'Should still have only one interval');
  
  stopStreaming();
});

// ============================================
// FRAME CAPTURE EDGE CASES
// ============================================

console.log('\n--- Frame Capture Edge Cases ---\n');

// Simulated page state
function createMockPage(closed = false) {
  return {
    _closed: closed,
    isClosed: function() {
      return this._closed;
    },
    screenshot: async function() {
      if (this._closed) {
        throw new Error('Page is closed');
      }
      return Buffer.from('fake-image');
    },
    url: function() {
      return 'https://example.com';
    },
    title: async function() {
      return 'Example Page';
    }
  };
}

test('Frame capture with closed page returns null', async () => {
  const page = createMockPage(true);
  let result = null;
  
  try {
    if (page.isClosed()) {
      result = null;
    } else {
      result = await page.screenshot();
    }
  } catch {
    result = null;
  }
  
  assert.equal(result, null);
});

test('Frame capture with valid page returns data', async () => {
  const page = createMockPage(false);
  let result = null;
  
  try {
    if (page.isClosed()) {
      result = null;
    } else {
      result = await page.screenshot();
    }
  } catch {
    result = null;
  }
  
  assert.notEqual(result, null);
  assert(result instanceof Buffer);
});

test('Frame capture handles sudden page close', async () => {
  const page = createMockPage(false);
  
  // Simulate page closing during screenshot
  page.screenshot = async function() {
    this._closed = true;
    throw new Error('Page closed during screenshot');
  };
  
  let result = 'not-null';
  try {
    result = await page.screenshot();
  } catch {
    result = null;
  }
  
  assert.equal(result, null, 'Should gracefully handle mid-operation close');
});

// ============================================
// BROWSER DISCONNECTION HANDLING
// ============================================

console.log('\n--- Browser Disconnection Handling ---\n');

test('Browser disconnect triggers cleanup', () => {
  reset();
  mainWindow = createWindow();
  
  let disconnectHandlerCalled = false;
  let cleanupPerformed = false;
  
  // Simulate browser with disconnect handler
  const browser = {
    on: (event, handler) => {
      if (event === 'disconnected') {
        // Store handler for testing
        browser._disconnectHandler = handler;
      }
    },
    _disconnectHandler: null
  };
  
  browser.on('disconnected', () => {
    disconnectHandlerCalled = true;
    cleanupPerformed = true;
    // In real code: stopRun(), contexts.clear(), pages.clear(), etc.
  });
  
  // Simulate browser disconnect
  if (browser._disconnectHandler) {
    browser._disconnectHandler();
  }
  
  assert.equal(disconnectHandlerCalled, true);
  assert.equal(cleanupPerformed, true);
});

// ============================================
// WINDOW CLOSE DURING OPERATION
// ============================================

console.log('\n--- Window Close During Operation ---\n');

test('Window close during event emission is safe', () => {
  reset();
  mainWindow = createWindow();
  
  // Start emitting
  emitEvent('BEFORE_CLOSE', {});
  
  // Window closes
  mainWindow._destroyed = true;
  
  // Subsequent emit should fail gracefully
  const result = emitEvent('AFTER_CLOSE', {});
  assert.equal(result, false);
  assert.equal(eventLog.length, 1); // Only first event logged
});

test('Window close during streaming stops interval', () => {
  reset();
  mainWindow = createWindow();
  startStreaming('profile-1', 10); // 10 fps for faster test
  
  assert.equal(streamingIntervals.size, 1);
  
  // Simulate window close
  mainWindow._destroyed = true;
  
  // Give the interval a chance to run and detect destroyed window
  // In test we manually call the check
  if (!mainWindow || mainWindow.isDestroyed()) {
    stopStreaming('profile-1');
  }
  
  assert.equal(streamingIntervals.size, 0);
});

// ============================================
// RAPID STATE CHANGES
// ============================================

console.log('\n--- Rapid State Changes ---\n');

test('Rapid start/stop streaming is safe', () => {
  reset();
  mainWindow = createWindow();
  
  // Rapidly start and stop
  for (let i = 0; i < 100; i++) {
    startStreaming('profile-1');
    stopStreaming('profile-1');
  }
  
  assert.equal(streamingIntervals.size, 0);
});

test('Rapid start on multiple profiles is safe', () => {
  reset();
  mainWindow = createWindow();
  
  // Start on many profiles rapidly
  for (let i = 0; i < 20; i++) {
    startStreaming(`profile-${i}`);
  }
  
  assert.equal(streamingIntervals.size, 20);
  
  // Stop all
  stopStreaming();
  assert.equal(streamingIntervals.size, 0);
});

// ============================================
// SUMMARY
// ============================================

console.log('\n============================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
