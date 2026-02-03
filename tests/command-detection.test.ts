/**
 * Command Detection Tests
 * 
 * Run with: npx tsx tests/command-detection.test.ts
 * 
 * Tests the detectBrowserCommand function for edge cases.
 */

// Import the function - we need to extract it since it's in a React hook
// For testing, we'll inline the implementation

interface DetectedBrowserCommand {
  type: 'linkedin_connect' | 'linkedin_message' | 'twitter_follow' | 'twitter_dm' | 'navigate' | 'unknown';
  platform: 'linkedin' | 'twitter' | 'generic';
  target?: string;
  message?: string;
  confidence: number;
}

function detectBrowserCommand(input: string): DetectedBrowserCommand | null {
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
      const message = match[2]?.trim()?.replace(/^["'"]|["'"]$/g, '');
      
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
        target: match[1].trim().replace('@', ''),
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
        target: match[1].trim().replace('@', ''),
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
      const target = match[1].trim();
      let platform: 'linkedin' | 'twitter' | 'generic' = 'generic';
      if (target.includes('linkedin')) platform = 'linkedin';
      if (target.includes('twitter') || target.includes('x.com')) platform = 'twitter';
      
      return {
        type: 'navigate',
        platform,
        target,
        confidence: 0.8,
      };
    }
  }
  
  return null;
}

// Helper to construct LinkedIn profile URL from a name
function toLinkedInSlug(name: string): string {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalized.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return slug;
}

// ============================================
// TEST RUNNER
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
  }
}

function expect(value: any) {
  return {
    toBe(expected: any) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
      }
    },
    toBeNull() {
      if (value !== null) {
        throw new Error(`Expected null but got ${JSON.stringify(value)}`);
      }
    },
    not: {
      toBeNull() {
        if (value === null) {
          throw new Error(`Expected non-null but got null`);
        }
      }
    },
    toContain(substring: string) {
      if (typeof value !== 'string' || !value.includes(substring)) {
        throw new Error(`Expected "${value}" to contain "${substring}"`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    toBeTruthy() {
      if (!value) {
        throw new Error(`Expected truthy value but got ${JSON.stringify(value)}`);
      }
    },
    toBeFalsy() {
      if (value) {
        throw new Error(`Expected falsy value but got ${JSON.stringify(value)}`);
      }
    }
  };
}

// ============================================
// TESTS
// ============================================

console.log('\n=== LinkedIn Connect Commands ===\n');

test('should detect basic connect command', () => {
  const result = detectBrowserCommand('connect with Bill Gates on linkedin');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_connect');
  expect(result?.target).toBe('Bill Gates');
  expect(result?.confidence).toBeGreaterThan(0.8);
});

test('should detect connect without "on linkedin"', () => {
  const result = detectBrowserCommand('connect with Satya Nadella');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_connect');
  expect(result?.target).toBe('Satya Nadella');
});

test('should handle special characters in names', () => {
  const result = detectBrowserCommand('connect with José García on linkedin');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_connect');
  expect(result?.target).toBe('José García');
});

test('should reject empty target (BUG FIX)', () => {
  const result = detectBrowserCommand('connect with on linkedin');
  // Should return null because target is empty
  expect(result).toBeNull();
});

test('should detect URL-based connect', () => {
  const result = detectBrowserCommand('connect with https://www.linkedin.com/in/billgates on linkedin');
  expect(result).not.toBeNull();
  expect(result?.target).toContain('linkedin.com');
});

console.log('\n=== LinkedIn Message Commands ===\n');

test('should detect basic message command', () => {
  const result = detectBrowserCommand('message Satya Nadella on linkedin saying Hello!');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_message');
  expect(result?.target).toBe('Satya Nadella');
  expect(result?.message).toBe('Hello!');
});

test('should handle long messages (500 chars)', () => {
  const longMessage = 'A'.repeat(500);
  const result = detectBrowserCommand(`message John on linkedin saying ${longMessage}`);
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_message');
  expect(result?.message).toBe(longMessage);
});

test('should handle message with special characters', () => {
  const result = detectBrowserCommand('message José on linkedin saying ¡Hola! ¿Cómo estás?');
  expect(result).not.toBeNull();
  expect(result?.message).toContain('¡Hola!');
});

test('should handle message with quotes', () => {
  const result = detectBrowserCommand('message John on linkedin saying "Hello World"');
  expect(result).not.toBeNull();
  // Message may or may not have quotes stripped depending on implementation
  expect(result?.message).toBeTruthy();
});

test('should detect message without content but not crash', () => {
  const result = detectBrowserCommand('message John on linkedin');
  // This should either return null or have undefined message
  if (result?.type === 'linkedin_message') {
    expect(result.message).toBeFalsy();
  }
});

console.log('\n=== Twitter Commands ===\n');

test('should detect follow command', () => {
  const result = detectBrowserCommand('follow @elonmusk on twitter');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('twitter_follow');
  expect(result?.target).toBe('elonmusk');
});

test('should detect DM command', () => {
  const result = detectBrowserCommand('dm @jack on twitter saying Hello!');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('twitter_dm');
  expect(result?.target).toBe('jack');
  expect(result?.message).toBe('Hello!');
});

console.log('\n=== Edge Cases ===\n');

test('should return null for unrecognized commands', () => {
  const result = detectBrowserCommand('do something random');
  expect(result).toBeNull();
});

test('should return null for empty string', () => {
  const result = detectBrowserCommand('');
  expect(result).toBeNull();
});

test('should handle mixed case', () => {
  const result = detectBrowserCommand('CONNECT WITH John Doe ON LINKEDIN');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('linkedin_connect');
});

test('should handle navigation commands', () => {
  const result = detectBrowserCommand('go to https://linkedin.com/feed');
  expect(result).not.toBeNull();
  expect(result?.type).toBe('navigate');
  expect(result?.platform).toBe('linkedin');
});

console.log('\n=== URL Construction ===\n');

test('should properly normalize special characters in slugs', () => {
  const slug = toLinkedInSlug('José García');
  expect(slug).toBe('jose-garcia');
});

test('should handle simple names', () => {
  const slug = toLinkedInSlug('Bill Gates');
  expect(slug).toBe('bill-gates');
});

test('should remove special characters', () => {
  const slug = toLinkedInSlug('John O\'Brien III');
  expect(slug).toBe('john-obrien-iii');
});

// ============================================
// SUMMARY
// ============================================

console.log('\n=== Test Summary ===\n');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${results.length}`);

if (failed > 0) {
  console.log('\n=== Failed Tests ===\n');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\nAll tests passed! ✓');
  process.exit(0);
}
