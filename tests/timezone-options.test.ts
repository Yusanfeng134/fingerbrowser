import { describe, expect, it } from 'vitest';
import { TIMEZONE_OPTIONS, normalizeTimezone } from '../src/shared/timezones';

describe('timezone options', () => {
  it('contains selectable IANA timezones that Chromium can resolve', () => {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(10);
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).toContain('America/New_York');
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).toContain('Europe/London');
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).toContain('Asia/Shanghai');

    for (const option of TIMEZONE_OPTIONS) {
      expect(normalizeTimezone(option.value)).toBe(option.value);
    }
  });

  it('normalizes aliases and rejects invalid timezones', () => {
    expect(normalizeTimezone('US/Eastern')).toBe('America/New_York');
    expect(() => normalizeTimezone('Mars/Colony')).toThrow('时区无效');
  });
});
