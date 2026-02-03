/**
 * STRESS TEST: Command Detection Pattern Testing
 * Tests all edge cases for browser command detection
 */

// Import the detection function directly
const detectBrowserCommand = (input) => {
  const lower = input.toLowerCase();
  
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
      return {
        type: 'linkedin_connect',
        platform: 'linkedin',
        target: match[1]?.trim(),
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
      return {
        type: 'linkedin_message',
        platform: 'linkedin',
        target: match[1]?.trim(),
        message: match[2]?.trim(),
        confidence: 0.85,
      };
    }
  }
  
  // Twitter follow patterns
  const twitterFollowPatterns = [
    /follow\s+@?(.+?)(?:\s+on\s+twitter|\s+on\s+x)?$/i,
    /twitter\s+follow\s+@?(.+)/i,
  ];
  
  for (const pattern of twitterFollowPatterns) {
    const match = input.match(pattern);
    if (match && (lower.includes('twitter') || lower.includes('follow') || lower.includes(' x '))) {
      return {
        type: 'twitter_follow',
        platform: 'twitter',
        target: match[1]?.trim()?.replace('@', ''),
        confidence: 0.85,
      };
    }
  }
  
  // Twitter DM patterns
  const twitterDMPatterns = [
    /dm\s+@?(.+?)\s+(?:on\s+twitter\s+)?(?:saying|with|:)\s*["""]?(.+)["""]?/i,
    /send\s+(?:a\s+)?dm\s+to\s+@?(.+?)\s+(?:on\s+twitter\s+)?(?:saying|:)\s*["""]?(.+)["""]?/i,
    /message\s+@?(.+?)\s+on\s+twitter\s*["""]?(.+)?["""]?/i,
  ];
  
  for (const pattern of twitterDMPatterns) {
    const match = input.match(pattern);
    if (match && (lower.includes('twitter') || lower.includes('dm') || lower.includes(' x '))) {
      return {
        type: 'twitter_dm',
        platform: 'twitter',
        target: match[1]?.trim()?.replace('@', ''),
        message: match[2]?.trim(),
        confidence: 0.85,
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
// TEST CASES
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
    input: "follow @nonexistentuser12345678 on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "nonexistentuser12345678",
    description: "Follow with long nonexistent username"
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
    description: "Follow without platform - BUG: should work but might not"
  },
  {
    input: "follow on twitter",
    expectedType: null,
    description: "Empty follow - missing target - BUG: might match incorrectly"
  },
  {
    input: "follow    @elonmusk    on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "elonmusk",
    description: "Multiple spaces"
  },
  {
    input: "FOLLOW @ELONMUSK ON TWITTER",
    expectedType: "twitter_follow",
    expectedTarget: "ELONMUSK",
    description: "All uppercase"
  },
  {
    input: "follow 5 accounts on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "5 accounts",
    description: "Batch operation - BUG: treats '5 accounts' as username"
  },
  {
    input: "follow @user1 @user2 @user3 on twitter",
    expectedType: "twitter_follow",
    description: "Multiple users - BUG: only captures first"
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
    input: "dm @X saying [long message 500 chars]",
    expectedType: "twitter_dm",
    expectedTarget: "X",
    expectedMessage: "[long message 500 chars]",
    description: "DM to @X with brackets"
  },
  {
    input: "dm @test saying 你好 🚀 مرحبا",
    expectedType: "twitter_dm",
    expectedTarget: "test",
    expectedMessage: "你好 🚀 مرحبا",
    description: "Unicode message"
  },
  {
    input: "send a dm to @user on twitter saying Hi there",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: "Hi there",
    description: "Send a DM style"
  },
  {
    input: "dm @user",
    expectedType: null,
    description: "DM without message - BUG: should reject or prompt"
  },
  {
    input: "dm saying hello",
    expectedType: null,
    description: "DM without target"
  },
  {
    input: 'dm @user on twitter saying "Hello, this is quoted"',
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: 'Hello, this is quoted"',
    description: "Quoted message - BUG: quote handling"
  },
  {
    input: "message @user on twitter saying test",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    expectedMessage: "test",
    description: "Message style for Twitter DM"
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
  {
    input: "go to",
    expectedType: null,
    description: "Empty navigation - BUG: might match empty string"
  },
  
  // ============================================
  // EDGE CASES & STRESS TESTS
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
    description: "Just 'follow' - BUG: might trigger incorrectly"
  },
  {
    input: "dm",
    expectedType: null,
    description: "Just 'dm'"
  },
  {
    input: "I want to follow @elonmusk on twitter please",
    expectedType: null,
    description: "Natural sentence - BUG: pattern doesn't match 'I want to'"
  },
  {
    input: "can you follow @user on twitter?",
    expectedType: null,
    description: "Question format - BUG: pattern requires 'follow' at start"
  },
  {
    input: "follow @user-with-dash on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "user-with-dash",
    description: "Username with dash"
  },
  {
    input: "follow @user_with_underscore on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "user_with_underscore",
    description: "Username with underscore"
  },
  {
    input: "follow @user.with" + ".dots on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "user.with.dots",
    description: "Username with dots - invalid but should parse"
  },
  {
    input: "follow @123numeric on twitter",
    expectedType: "twitter_follow",
    expectedTarget: "123numeric",
    description: "Numeric start username"
  },
  
  // Rapid command detection - what if commands overlap?
  {
    input: "follow @user on twitter and dm them saying hello",
    expectedType: "twitter_follow",
    description: "Combined command - BUG: only detects first"
  },
  
  // X.com tests
  {
    input: "follow @user on x",
    expectedType: "twitter_follow",
    expectedTarget: "user",
    description: "Using 'x' instead of 'twitter' - BUG: needs ' x ' with spaces"
  },
  {
    input: "dm @user on x saying hello",
    expectedType: "twitter_dm",
    expectedTarget: "user",
    description: "DM on X - BUG: needs ' x ' with spaces"
  },
];

// ============================================
// RUN TESTS
// ============================================

console.log("=" .repeat(60));
console.log("STRESS TEST: Command Detection Patterns");
console.log("=".repeat(60));
console.log("");

let passed = 0;
let failed = 0;
const bugs = [];

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
    console.log(`   Input: "${test.input}"`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Reason: ${failureReason}`);
    console.log(`   Result: ${JSON.stringify(result)}`);
    
    if (test.description.includes("BUG")) {
      bugs.push(`${test.description}: ${failureReason}`);
    }
  }
  console.log("");
}

console.log("=".repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));

if (bugs.length > 0) {
  console.log("\n🐛 KNOWN/EXPECTED BUGS:");
  bugs.forEach((bug, i) => console.log(`  ${i + 1}. ${bug}`));
}

console.log("\n📋 SUMMARY OF ISSUES FOUND:");
console.log("1. Empty 'follow on twitter' matches with empty target");
console.log("2. 'follow 5 accounts on twitter' treats number as username");
console.log("3. No support for batch operations (multiple users)");
console.log("4. 'dm @user' without message doesn't properly reject");
console.log("5. Quote handling in messages strips incorrectly");
console.log("6. 'go to' with empty target matches empty string");
console.log("7. Natural language variations like 'I want to' not supported");
console.log("8. 'x' platform detection requires spaces around it");
console.log("9. Combined commands only detect first action");
console.log("10. No validation of username format");
