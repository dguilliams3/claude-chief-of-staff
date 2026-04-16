/**
 * Tests: `agent/registry.ts::briefingTypes`, `agent/registry.ts::validTypes`
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIEFING_TIMEOUT_MS, briefingTypes, validTypes } from '../registry';

describe('briefing registry', () => {
  it('exposes all registered type keys via validTypes', () => {
    expect(validTypes.sort()).toEqual(Object.keys(briefingTypes).sort());
  });

  it('contains expected work, news, and community metadata', () => {
    expect(briefingTypes.work.label).toBe('Work');
    expect(briefingTypes.news.label).toBe('News');
    expect(briefingTypes.community.label).toBe('Community');
    expect(briefingTypes.work.prompt.name).toBe('work');
    expect(briefingTypes.news.prompt.name).toBe('news');
    expect(briefingTypes.community.prompt.name).toBe('community');
  });

  it('uses default timeout for all registered briefings', () => {
    for (const config of Object.values(briefingTypes)) {
      expect(config.timeoutMs).toBe(DEFAULT_BRIEFING_TIMEOUT_MS);
    }
  });
});
