/**
 * Tests: `agent/prompts/compile.ts::compile`
 */
import { describe, expect, it } from 'vitest';
import { compile } from '../prompts/compile';
import type { Prompt } from '../prompts/types';

describe('compile', () => {
  it('splits persona into system and other components into user', () => {
    const prompt: Prompt = {
      name: 'sample',
      components: [
        { kind: 'persona', name: 'assistant', content: 'system voice' },
        { kind: 'focus', name: 'focus-area', content: 'focus content' },
        { kind: 'directive', name: 'style', content: 'be concise' },
      ],
    };

    const compiled = compile({
      prompt,
      vars: { DATE: '2026-03-12T16:00:00.000Z', DATE_HUMAN: 'Thursday, March 12, 2026' },
    });

    expect(compiled.system).toBe('system voice');
    expect(compiled.user).toContain('Today is 2026-03-12T16:00:00.000Z (Thursday, March 12, 2026).');
    expect(compiled.user).toContain('## focus-area');
    expect(compiled.user).toContain('focus content');
    expect(compiled.user).toContain('## style');
    expect(compiled.user).toContain('be concise');
  });

  it('returns empty system when persona is absent', () => {
    const prompt: Prompt = {
      name: 'no-persona',
      components: [{ kind: 'output', name: 'json', content: 'only json' }],
    };

    const compiled = compile({
      prompt,
      vars: { DATE: '2026-03-12T16:00:00.000Z', DATE_HUMAN: 'Thursday, March 12, 2026' },
    });

    expect(compiled.system).toBe('');
    expect(compiled.user).toContain('## json');
    expect(compiled.user).toContain('only json');
  });

  it('preserves non-persona component order in user output', () => {
    const prompt: Prompt = {
      name: 'ordered',
      components: [
        { kind: 'persona', name: 'p', content: 'system' },
        { kind: 'sources', name: 'first', content: 'A' },
        { kind: 'directive', name: 'second', content: 'B' },
        { kind: 'output', name: 'third', content: 'C' },
      ],
    };

    const compiled = compile({
      prompt,
      vars: { DATE: '2026-03-12T16:00:00.000Z', DATE_HUMAN: 'Thursday, March 12, 2026' },
    });

    const firstIndex = compiled.user.indexOf('## first');
    const secondIndex = compiled.user.indexOf('## second');
    const thirdIndex = compiled.user.indexOf('## third');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(secondIndex).toBeGreaterThan(firstIndex);
    expect(thirdIndex).toBeGreaterThan(secondIndex);
  });
});
