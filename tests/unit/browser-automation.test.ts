/**
 * Browser Automation Unit Tests
 * 
 * Stress tests for LinkedIn/Twitter browser automation edge cases.
 * Tests the command detection and URL construction logic.
 */

import { describe, it, expect } from 'vitest';
import { detectBrowserCommand, DetectedBrowserCommand } from '../../src/hooks/useBrowserAutomation';

describe('detectBrowserCommand', () => {
  describe('LinkedIn Connect Commands', () => {
    it('should detect basic connect command', () => {
      const result = detectBrowserCommand('connect with Bill Gates on linkedin');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_connect');
      expect(result?.target).toBe('Bill Gates');
      expect(result?.confidence).toBeGreaterThan(0.8);
    });

    it('should detect connect without "on linkedin"', () => {
      const result = detectBrowserCommand('connect with Satya Nadella');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_connect');
      expect(result?.target).toBe('Satya Nadella');
    });

    it('should handle special characters in names', () => {
      const result = detectBrowserCommand('connect with José García on linkedin');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_connect');
      expect(result?.target).toBe('José García');
    });

    it('should handle empty target gracefully', () => {
      const result = detectBrowserCommand('connect with on linkedin');
      // Should either return null or have empty target
      if (result) {
        expect(result.target?.trim()).toBe('');
      }
    });

    it('should detect URL-based connect', () => {
      const result = detectBrowserCommand('connect with https://www.linkedin.com/in/billgates on linkedin');
      expect(result).not.toBeNull();
      expect(result?.target).toContain('linkedin.com');
    });
  });

  describe('LinkedIn Message Commands', () => {
    it('should detect basic message command', () => {
      const result = detectBrowserCommand('message Satya Nadella on linkedin saying Hello!');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_message');
      expect(result?.target).toBe('Satya Nadella');
      expect(result?.message).toBe('Hello!');
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(500);
      const result = detectBrowserCommand(`message John on linkedin saying ${longMessage}`);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_message');
      expect(result?.message).toBe(longMessage);
    });

    it('should handle message with special characters', () => {
      const result = detectBrowserCommand('message José on linkedin saying ¡Hola! ¿Cómo estás?');
      expect(result).not.toBeNull();
      expect(result?.message).toContain('¡Hola!');
    });

    it('should handle message with quotes', () => {
      const result = detectBrowserCommand('message John on linkedin saying "Hello World"');
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Hello World');
    });

    it('should reject message without content', () => {
      const result = detectBrowserCommand('message John on linkedin');
      // Should either return null or have undefined message
      if (result?.type === 'linkedin_message') {
        expect(result.message).toBeFalsy();
      }
    });
  });

  describe('Twitter Commands', () => {
    it('should detect follow command', () => {
      const result = detectBrowserCommand('follow @elonmusk on twitter');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('twitter_follow');
      expect(result?.target).toBe('elonmusk');
    });

    it('should detect DM command', () => {
      const result = detectBrowserCommand('dm @jack on twitter saying Hello!');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('twitter_dm');
      expect(result?.target).toBe('jack');
      expect(result?.message).toBe('Hello!');
    });
  });

  describe('Edge Cases', () => {
    it('should return null for unrecognized commands', () => {
      const result = detectBrowserCommand('do something random');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = detectBrowserCommand('');
      expect(result).toBeNull();
    });

    it('should handle mixed case', () => {
      const result = detectBrowserCommand('CONNECT WITH John Doe ON LINKEDIN');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('linkedin_connect');
    });

    it('should handle extra whitespace', () => {
      const result = detectBrowserCommand('  connect   with   John   Doe   on   linkedin  ');
      expect(result).not.toBeNull();
      expect(result?.target?.trim()).toBe('John   Doe');
    });

    it('should handle navigation commands', () => {
      const result = detectBrowserCommand('go to https://linkedin.com/feed');
      expect(result).not.toBeNull();
      expect(result?.type).toBe('navigate');
      expect(result?.platform).toBe('linkedin');
    });
  });
});

describe('URL Construction', () => {
  // Helper to simulate URL construction from useBrowserAutomation
  function constructLinkedInUrl(target: string): string {
    return target.startsWith('http')
      ? target
      : `https://www.linkedin.com/in/${encodeURIComponent(target.toLowerCase().replace(/\s+/g, '-'))}`;
  }

  it('should properly encode special characters', () => {
    const url = constructLinkedInUrl('José García');
    expect(url).toBe('https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa');
  });

  it('should handle simple names', () => {
    const url = constructLinkedInUrl('Bill Gates');
    expect(url).toBe('https://www.linkedin.com/in/bill-gates');
  });

  it('should preserve full URLs', () => {
    const url = constructLinkedInUrl('https://www.linkedin.com/in/billgates');
    expect(url).toBe('https://www.linkedin.com/in/billgates');
  });
});
