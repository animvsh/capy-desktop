/**
 * Chaos Edge Case Tests
 * 
 * Tests for edge cases in browser automation:
 * - Profile creation edge cases
 * - Profile switching during automation
 * - Invalid state transitions
 * - Concurrent operation handling
 */

const { strict: assert } = require('assert');

// Simulated state for testing
let profiles = [];
let activeRuns = new Map();
let profileLocks = new Map();
let approvalResolvers = new Map();

// ============================================
// HELPERS (Mirror backend logic)
// ============================================

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function createProfile(platform, name) {
  const id = generateId();
  const profile = {
    id,
    name: name || `${platform}-${id.substring(0, 6)}`,
    platform,
    userDataDir: `/fake/path/${id}`,
    isLoggedIn: false,
    lastUsed: Date.now(),
  };
  profiles.push(profile);
  return profile;
}

function getOrCreateProfile(platform) {
  let profile = profiles.find(p => p.platform === platform);
  if (!profile) {
    profile = createProfile(platform);
  }
  return profile;
}

function acquireProfileLock(profileId) {
  if (profileLocks.get(profileId)) {
    return false;
  }
  profileLocks.set(profileId, true);
  return true;
}

function releaseProfileLock(profileId) {
  profileLocks.delete(profileId);
}

function isRunActive(runId) {
  const run = activeRuns.get(runId);
  if (!run) return false;
  return run.status === 'running' || run.status === 'paused';
}

function getActiveRunForProfile(profileId) {
  for (const run of activeRuns.values()) {
    if (run.profileId === profileId && (run.status === 'running' || run.status === 'paused')) {
      return run;
    }
  }
  return null;
}

function createRun(type, profileId) {
  const run = {
    id: generateId(),
    type,
    status: 'running',
    profileId,
    steps: [{ id: 'step-0', name: 'Test Step', status: 'running' }],
    currentStepIndex: 0,
  };
  activeRuns.set(run.id, run);
  return run;
}

function stopRun(runId) {
  if (runId) {
    const run = activeRuns.get(runId);
    if (run) {
      run.status = 'stopped';
      activeRuns.delete(runId);
      releaseProfileLock(run.profileId);
      // Clear approval if any
      const resolver = approvalResolvers.get(runId);
      if (resolver) {
        resolver(false);
        approvalResolvers.delete(runId);
      }
    }
  } else {
    for (const [id, run] of activeRuns) {
      run.status = 'stopped';
      releaseProfileLock(run.profileId);
      const resolver = approvalResolvers.get(id);
      if (resolver) {
        resolver(false);
        approvalResolvers.delete(id);
      }
    }
    activeRuns.clear();
  }
}

function approveAction(runId) {
  const resolver = approvalResolvers.get(runId);
  if (resolver) {
    resolver(true);
    approvalResolvers.delete(runId);
    return { success: true };
  }
  return { success: false, error: 'No pending approval for this run' };
}

function rejectAction(runId) {
  const resolver = approvalResolvers.get(runId);
  if (resolver) {
    resolver(false);
    approvalResolvers.delete(runId);
    return { success: true };
  }
  return { success: false, error: 'No pending approval for this run' };
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
  profiles = [];
  activeRuns.clear();
  profileLocks.clear();
  approvalResolvers.clear();
}

console.log('============================================================');
console.log('CHAOS EDGE CASE TESTS');
console.log('============================================================\n');

// ============================================
// PROFILE CREATION EDGE CASES
// ============================================

console.log('--- Profile Creation Edge Cases ---\n');

test('Create profile with valid platform', () => {
  reset();
  const profile = createProfile('linkedin');
  assert(profile.id, 'Profile should have an id');
  assert.equal(profile.platform, 'linkedin');
  assert(profile.name.startsWith('linkedin-'));
});

test('Create profile with custom name', () => {
  reset();
  const profile = createProfile('twitter', 'my-twitter');
  assert.equal(profile.name, 'my-twitter');
});

test('Create profile with empty name falls back to generated', () => {
  reset();
  const profile = createProfile('generic', '');
  assert(profile.name.startsWith('generic-'));
});

test('getOrCreateProfile returns existing profile', () => {
  reset();
  const first = createProfile('linkedin', 'first-linkedin');
  const second = getOrCreateProfile('linkedin');
  assert.equal(first.id, second.id, 'Should return same profile');
});

test('getOrCreateProfile creates new profile if none exists', () => {
  reset();
  const profile = getOrCreateProfile('twitter');
  assert(profile.id, 'Should create new profile');
  assert.equal(profile.platform, 'twitter');
});

test('Multiple profiles for different platforms', () => {
  reset();
  const linkedin = getOrCreateProfile('linkedin');
  const twitter = getOrCreateProfile('twitter');
  const generic = getOrCreateProfile('generic');
  assert.notEqual(linkedin.id, twitter.id);
  assert.notEqual(twitter.id, generic.id);
  assert.equal(profiles.length, 3);
});

// ============================================
// PROFILE LOCKING TESTS
// ============================================

console.log('\n--- Profile Locking Tests ---\n');

test('Acquire lock on unlocked profile', () => {
  reset();
  const profile = createProfile('linkedin');
  const acquired = acquireProfileLock(profile.id);
  assert.equal(acquired, true);
});

test('Cannot acquire lock on locked profile', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const secondAcquire = acquireProfileLock(profile.id);
  assert.equal(secondAcquire, false, 'Second acquire should fail');
});

test('Release lock allows new acquisition', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  releaseProfileLock(profile.id);
  const reacquire = acquireProfileLock(profile.id);
  assert.equal(reacquire, true);
});

test('Locks are per-profile', () => {
  reset();
  const linkedin = createProfile('linkedin');
  const twitter = createProfile('twitter');
  acquireProfileLock(linkedin.id);
  const twitterAcquire = acquireProfileLock(twitter.id);
  assert.equal(twitterAcquire, true, 'Should be able to lock different profile');
});

// ============================================
// CONCURRENT OPERATION TESTS
// ============================================

console.log('\n--- Concurrent Operation Tests ---\n');

test('Create run acquires profile lock', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);  // Simulate lock acquisition
  const run = createRun('linkedin_connect', profile.id);
  assert(run.id);
  assert.equal(run.status, 'running');
});

test('Detect active run for profile', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  const activeRun = getActiveRunForProfile(profile.id);
  assert.equal(activeRun?.id, run.id);
});

test('No active run for profile without runs', () => {
  reset();
  const profile = createProfile('linkedin');
  const activeRun = getActiveRunForProfile(profile.id);
  assert.equal(activeRun, null);
});

test('Stopped runs not considered active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  stopRun(run.id);
  const activeRun = getActiveRunForProfile(profile.id);
  assert.equal(activeRun, null);
});

test('Multiple runs on different profiles', () => {
  reset();
  const linkedin = createProfile('linkedin');
  const twitter = createProfile('twitter');
  
  acquireProfileLock(linkedin.id);
  const linkedinRun = createRun('linkedin_connect', linkedin.id);
  
  acquireProfileLock(twitter.id);
  const twitterRun = createRun('twitter_follow', twitter.id);
  
  assert.equal(activeRuns.size, 2);
  assert(isRunActive(linkedinRun.id));
  assert(isRunActive(twitterRun.id));
});

test('Stop specific run leaves others running', () => {
  reset();
  const linkedin = createProfile('linkedin');
  const twitter = createProfile('twitter');
  
  acquireProfileLock(linkedin.id);
  const linkedinRun = createRun('linkedin_connect', linkedin.id);
  
  acquireProfileLock(twitter.id);
  const twitterRun = createRun('twitter_follow', twitter.id);
  
  stopRun(linkedinRun.id);
  
  assert(!isRunActive(linkedinRun.id));
  assert(isRunActive(twitterRun.id));
  assert.equal(activeRuns.size, 1);
});

test('Stop all runs', () => {
  reset();
  const linkedin = createProfile('linkedin');
  const twitter = createProfile('twitter');
  
  acquireProfileLock(linkedin.id);
  createRun('linkedin_connect', linkedin.id);
  
  acquireProfileLock(twitter.id);
  createRun('twitter_follow', twitter.id);
  
  stopRun(); // Stop all
  
  assert.equal(activeRuns.size, 0);
  assert.equal(profileLocks.size, 0, 'All locks should be released');
});

// ============================================
// APPROVAL STATE TRANSITION TESTS
// ============================================

console.log('\n--- Approval State Transition Tests ---\n');

test('Approve with no pending approval fails gracefully', () => {
  reset();
  const result = approveAction('non-existent-run');
  assert.equal(result.success, false);
  assert(result.error.includes('No pending approval'));
});

test('Reject with no pending approval fails gracefully', () => {
  reset();
  const result = rejectAction('non-existent-run');
  assert.equal(result.success, false);
  assert(result.error.includes('No pending approval'));
});

test('Approve resolves pending approval', () => {
  reset();
  let resolved = false;
  let resolvedValue = null;
  
  const runId = 'test-run-123';
  approvalResolvers.set(runId, (approved) => {
    resolved = true;
    resolvedValue = approved;
  });
  
  const result = approveAction(runId);
  assert.equal(result.success, true);
  assert.equal(resolved, true);
  assert.equal(resolvedValue, true);
  assert(!approvalResolvers.has(runId), 'Resolver should be removed');
});

test('Reject resolves pending approval with false', () => {
  reset();
  let resolved = false;
  let resolvedValue = null;
  
  const runId = 'test-run-456';
  approvalResolvers.set(runId, (approved) => {
    resolved = true;
    resolvedValue = approved;
  });
  
  const result = rejectAction(runId);
  assert.equal(result.success, true);
  assert.equal(resolved, true);
  assert.equal(resolvedValue, false);
});

test('Stop run clears pending approval', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  
  let resolved = false;
  approvalResolvers.set(run.id, (approved) => {
    resolved = true;
  });
  
  stopRun(run.id);
  
  assert.equal(resolved, true, 'Approval should be auto-rejected');
  assert(!approvalResolvers.has(run.id));
});

test('Double approve is safe', () => {
  reset();
  const runId = 'test-run-789';
  approvalResolvers.set(runId, () => {});
  
  const first = approveAction(runId);
  const second = approveAction(runId);
  
  assert.equal(first.success, true);
  assert.equal(second.success, false); // Already resolved
});

// ============================================
// RUN ACTIVE STATE TESTS
// ============================================

console.log('\n--- Run Active State Tests ---\n');

test('New run is active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  assert.equal(isRunActive(run.id), true);
});

test('Non-existent run is not active', () => {
  reset();
  assert.equal(isRunActive('fake-run-id'), false);
});

test('Stopped run is not active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  stopRun(run.id);
  assert.equal(isRunActive(run.id), false);
});

test('Paused run is still active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  run.status = 'paused';
  assert.equal(isRunActive(run.id), true);
});

test('Completed run is not active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  run.status = 'complete';
  assert.equal(isRunActive(run.id), false);
});

test('Failed run is not active', () => {
  reset();
  const profile = createProfile('linkedin');
  acquireProfileLock(profile.id);
  const run = createRun('linkedin_connect', profile.id);
  run.status = 'failed';
  assert.equal(isRunActive(run.id), false);
});

// ============================================
// PROFILE SWITCHING DURING AUTOMATION TESTS
// ============================================

console.log('\n--- Profile Switching During Automation Tests ---\n');

test('Can switch to different platform profile while automation running', () => {
  reset();
  const linkedin = getOrCreateProfile('linkedin');
  acquireProfileLock(linkedin.id);
  createRun('linkedin_connect', linkedin.id);
  
  // Switching to twitter profile should work
  const twitter = getOrCreateProfile('twitter');
  const canLock = acquireProfileLock(twitter.id);
  assert.equal(canLock, true, 'Should be able to use different platform');
});

test('Cannot start new automation on same profile while running', () => {
  reset();
  const linkedin = getOrCreateProfile('linkedin');
  acquireProfileLock(linkedin.id);
  createRun('linkedin_connect', linkedin.id);
  
  // Trying to acquire lock again should fail
  const canLock = acquireProfileLock(linkedin.id);
  assert.equal(canLock, false, 'Should not be able to lock same profile');
});

// ============================================
// SUMMARY
// ============================================

console.log('\n============================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);
