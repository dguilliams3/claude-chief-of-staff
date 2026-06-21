/**
 * Tests: `agent/parse-sections.ts::parseSections`
 */
import { describe, expect, it } from 'vitest';
import { parseSections } from '../parse-sections';

const sectionJson = JSON.stringify([
  {
    key: 'ACTIVE',
    label: 'Active Work',
    content: 'Project Alpha progressed.',
    severity: 'info',
  },
]);

describe('parseSections', () => {
  it('parses a clean JSON array', () => {
    const parsed = parseSections(sectionJson);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].key).toBe('ACTIVE');
    expect(parsed[0].severity).toBe('info');
  });

  it('parses a double-encoded JSON string', () => {
    const doubleEncoded = JSON.stringify(sectionJson);
    const parsed = parseSections(doubleEncoded);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe('Active Work');
  });

  it('parses JSON array embedded in surrounding text', () => {
    const raw = `preamble text\n${sectionJson}\ntrailing text`;
    const parsed = parseSections(raw);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].content).toContain('Alpha');
  });

  it('throws for invalid section payloads', () => {
    expect(() => parseSections('[{"key":"X","label":"L","content":"C","severity":"urgent"}]'))
      .toThrow('Could not parse sections from Claude response');
  });
});
