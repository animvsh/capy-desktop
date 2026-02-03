/**
 * STRESS TEST V2: Command Detection Pattern Testing
 * Tests with FIXED patterns
 */

// FIXED detection function
const detectBrowserCommand = (input) => {
  const lower = input.toLowerCase().trim();
  
  // Early return for empty input
  if (!lower) return null;
  
  // LinkedIn connection patterns
  const linkedinConnectPatterns = [
    /connect\s+(?:with\s+)?(.+?)(?:\s+on\s+linkedin)?$/i,
    /send\s+(?:a\s+)?connection\s+(?:request\s+)?to\s+(.+)/i,
    /linkedin\s+connect\s+(?:with\s+)?(.+)/i,
    /add\s+(.+?)(?:\s+on\s+linkedin)/i,
  ];
  
  for (const pattern of linkedinConnectPatterns) {
    const match = input.match(pattern);
    if (match && (lower.includes('linkedin') || lower.includes('connect'))) {
      const target = match[1]?.trim();
      // Skip if target is empty or just "on linkedin"
      if (!target || target.toLowerCase() === 'on linkedin' || target.length < 2) {
        continue;
      }
      return {
        type: 'linkedin_connect',
        platform: 'linkedin',
        target,
        confidence: 0.9,
      };
    }
  }
  
  // LinkedIn message patterns
  const linkedinMessagePatterns = [
    /message\s+(.+?)\s+(?:on\s+linkedin\s+)?(?:saying|with|:)\s*["""]?(.+)["""]?/i,
    /send\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:on\s+linkedin\s+)?(?:saying|:)\s*["""]?(.+)["""]?/i,
    /dm\s+(.+?)\s+on\s+linkedin\s*["""]?(.+)?["""]?/i,
  ];
  
  for (const pattern of linkedinMessagePatterns) {
    const match = input.match(pattern);
    if (match && lower.includes('linkedin')) {
      const target = match[1]?.trim();
      const message = match[2]?.trim()?.replace(/^["'"]|["'"]$/g, ''); // Remove surrounding quotes
      
      // Skip if target is empty
      if (!target || target.length < 2) {
        continue;
      }
      
      return {
        type: 'linkedin_message',
        platform: 'linkedin',
        target,
        message,
        confidence: 0.85,
      };
    }
  }
  
  // Twitter follow patterns - more robust with better username extraction
  // Must start with "follow" or "twitter follow" - anchored patterns
  const twitterFollowPatterns = [
    // "follow @user on twitter" or "follow @user on x"
    /^follow\s+@?([a-zA-Z0-9_]{1,15})(?:\s+on\s+(?:twitter|x))?$/i,
    // "twitter follow @user"
    /^twitter\s+follow\s+@?([a-zA-Z0-9_]{1,15})$/i,
    // "follow @user" (without platform)
    /^follow\s+@([a-zA-Z0-9_]{1,15})$/i,
  ];
  
  for (const pattern of twitterFollowPatterns) {
    const match = input.trim().match(pattern);
    if (match) {
      const target = match[1]?.trim()?.replace('@', '');
      // Validate target exists and looks like a username
      if (!target || target.length < 1 || target.length > 15) {
        continue;
      }
      // Skip if target contains invalid characters or looks like "on twitter"
      if (/^on\s/i.test(target) || /\s/.test(target)) {
        continue;
      }
      return {
        type: 'twitter_follow',
        platform: 'twitter',
        target,
        confidence: 0.9,
      };
    }
  }
  
  // Also support natural "follow X on twitter" where X can have spaces (person names)
  // But validate it doesn't match "follow on twitter" (empty target)
  const twitterFollowLoosePattern = /^follow\s+(.+?)\s+on\s+(?:twitter|x)$/i;
  const looseMatch = input.trim().match(twitterFollowLoosePattern);
  if (looseMatch) {
    let target = looseMatch[1]?.trim()?.replace(/^@/, '');
    if (target && target.length >= 1 && !/^on$/i.test(target)) {
      return {
        type: 'twitter_follow',
        platform: 'twitter',
        target,
        confidence: 0.85,
      };
    }
  }
  
  // Twitter DM patterns - more robust
  const twitterDMPatterns = [
    // "dm @user on twitter saying message" or "dm @user on x saying message"
    /^dm\s+@?([a-zA-Z0-9_]{1,15})\s+(?:on\s+(?:twitter|x)\s+)?(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "send a dm to @user on twitter saying message"
    /^send\s+(?:a\s+)?dm\s+to\s+@?([a-zA-Z0-9_]{1,15})\s+(?:on\s+(?:twitter|x)\s+)?(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "message @user on twitter saying message"
    /^message\s+@?([a-zA-Z0-9_]{1,15})\s+on\s+(?:twitter|x)\s+(?:saying|with|:)\s*["""]?(.+?)["""]?$/i,
    // "message @user on twitter" followed by quoted/unquoted message
    /^message\s+@?([a-zA-Z0-9_]{1,15})\s+on\s+(?:twitter|x)\s+["""](.+)["""]$/i,
  ];
  
  for (const pattern of twitterDMPatterns) {
    const match = input.trim().match(pattern);
    if (match) {
      const target = match[1]?.trim()?.replace('@', '');
      const message = match[2]?.trim()?.replace(/^["'"""]|["'"""]$/g, ''); // Remove surrounding quotes
      
      // Validate target
      if (!target || target.length < 1) {
        continue;
      }
      // Validate message exists
      if (!message || message.length < 1) {
        continue;
      }
      
      return {
        type: 'twitter_dm',
        platform: 'twitter',
        target,
        message,
        confidence: 0.9,
      };
    }
  }
  
  // Generic navigation
  const navigatePatterns = [
    /(?:go\s+to|open|navigate\s+to|browse\s+to)\s+(.+)/i,
    /visit\s+(.+)/i,
  ];
  
  for (const pattern of navigatePatterns) {
    const match = input.match(pattern);
    if (match) {
      const target = match[1]?.trim();
      if (!target) continue;
      
      let platform = 'generic';
      if (target?.includes('linkedin')) platform = 'linkedin';
      if (target?.includes('twitter') || target?.includes('x.com')) platform = 'twitter';
      
      return {
        type: 'navigate',
        platform,
        target,
        confidence: 0.8,
      };
    }
  }
  
  return null;
};

// ============================================
// TEST CASES - Updated expected results
// ============================================

const testCases = [
  // ============================================
  // TWITTER FOLLOW TESTS
  // ============================================
  {
    input: "follow @elonmusk on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "elonmusk",
    description: "Basic follow with @ and platform"
  },
  {
    input: "follow elonmusk on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "elonmusk",
    description: "Follow without @"
  },
  {
    input: "follow @openai on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "openai",
    description: "Follow @openai"
  },
  {
    input: "twitter follow @openai",
    expectedType: "twitter_follow",
    expectedTarget: "openai",
    description: "Twitter prefix style"
  },
  {
    input: "follow @test",
    expectedType: "twitter_follow",
    expectedTarget: "test",
    description: "Follow without platform"
  },
  {
    input: "follow on twitter",
    expectedType: null,
    description: "Empty follow - FIXED: should return null"
  },
  {
    input: "follow @elonmusk on x",
    expectedType: "twitter_follow",
    expectedTarget: "elonmusk",
    description: "Follow on X platform"
  },
  {
    input: "FOLLOW @OPENAI ON TWITTER",
    expectedType: "twitter_follow",
    expectedTarget: "OPENAI",
    description: "All uppercase"
  },
  {
    input: "follow @user_name on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "user_name",
    description: "Username with underscore"
  },
  {
    input: "follow @user123 on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "user123",
    description: "Username with numbers"
  },
  
  // ============================================
  // TWITTER DM TESTS
  // ============================================
  {
    input: "dm @openai on twitter saying Hello!",
    expectedType: "twitter_dm",
    expectedTarget: "openai",
    expectedMessage: "Hello!",
    description: "Basic DM"
  },
  {
    input: "dm @X saying Hello world",
    expectedType: "twitter_dm",
    expectedTarget: "X",
    expectedMessage: "Hello world",
    description: "DM to @X"
  },
  {
    input: "dm @test saying 你好 🚀 مرحبا",
    expectedType: "twitter_dm",
    expectedTarget: "test",
    expectedMessage: "你好 🚀 مرحبا",
    description: "Unicode message"
  },
  {
    input: "dm @user on x saying hello",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: "hello",
    description: "DM on X platform - FIXED"
  },
  {
    input: "send a dm to @user on twitter saying Hi there",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: "Hi there",
    description: "Send a DM style - FIXED"
  },
  {
    input: "message @user on twitter saying test message",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: "test message",
    description: "Message style for Twitter DM - FIXED"
  },
  {
    input: "dm @user",
    expectedType: null,
    description: "DM without message - should return null"
  },
  {
    input: "dm saying hello",
    expectedType: null,
    description: "DM without target - should return null"
  },
  
  // ============================================
  // NAVIGATION TESTS
  // ============================================
  {
    input: "go to twitter",
    expectedType: "navigate",
    expectedTarget: "twitter",
    description: "Simple navigation"
  },
  {
    input: "go to linkedin",
    expectedType: "navigate",
    expectedTarget: "linkedin",
    description: "Navigate to LinkedIn"
  },
  {
    input: "open https://twitter.com/elonmusk",
    expectedType: "navigate",
    expectedTarget: "https://twitter.com/elonmusk",
    description: "Navigate to URL"
  },
  
  // ============================================
  // EDGE CASES
  // ============================================
  {
    input: "",
    expectedType: null,
    description: "Empty input"
  },
  {
    input: "   ",
    expectedType: null,
    description: "Whitespace only"
  },
  {
    input: "hello",
    expectedType: null,
    description: "Random text"
  },
  {
    input: "follow",
    expectedType: null,
    description: "Just 'follow'"
  },
  {
    input: "dm",
    expectedType: null,
    description: "Just 'dm'"
  },
  {
    input: "I want to follow @elonmusk on twitter please",
    expectedType: null,
    description: "Natural sentence - FIXED: should return null (not anchored)"
  },
  {
    input: "can you follow @user on twitter?",
    expectedType: null,
    description: "Question format - FIXED: should return null (not anchored)"
  },
];

// ============================================
// RUN TESTS
// ============================================

console.log("=" .repeat(60));
console.log("STRESS TEST V2: Command Detection Patterns (FIXED)");
console.log("=".repeat(60));
console.log("");

let passed = 0;
let failed = 0;
const failures = [];

for (const test of testCases) {
  const result = detectBrowserCommand(test.input);
  
  let testPassed = true;
  let failureReason = "";
  
  // Check type
  if (test.expectedType === null) {
    if (result !== null) {
      testPassed = false;
      failureReason = `Expected null, got ${result.type}`;
    }
  } else {
    if (!result) {
      testPassed = false;
      failureReason = `Expected ${test.expectedType}, got null`;
    } else if (result.type !== test.expectedType) {
      testPassed = false;
      failureReason = `Expected type ${test.expectedType}, got ${result.type}`;
    } else {
      // Check target if specified
      if (test.expectedTarget && result.target !== test.expectedTarget) {
        testPassed = false;
        failureReason = `Expected target '${test.expectedTarget}', got '${result.target}'`;
      }
      // Check message if specified
      if (test.expectedMessage && result.message !== test.expectedMessage) {
        testPassed = false;
        failureReason = `Expected message '${test.expectedMessage}', got '${result.message}'`;
      }
    }
  }
  
  if (testPassed) {
    passed++;
    console.log(`✅ PASS: ${test.description}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Reason: ${failureReason}`);
    console.log(`   Result: ${JSON.stringify(result)}`);
    failures.push({ test, result, reason: failureReason });
  }
}

console.log("");
console.log("=".repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log("=".repeat(60));

if (failures.length > 0) {
  console.log("\n❌ FAILURES:");
  failures.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.test.description}: ${f.reason}`);
  });
}

// Exit with error code if tests failed
if (failed > 0) {
  process.exit(1);
}
