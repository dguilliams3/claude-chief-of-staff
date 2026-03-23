/**
 * Tests: agent/extract-json.ts
 *
 * Validates JSON extraction from clean, fenced, preamble-wrapped,
 * and missing-JSON CLI output scenarios.
 */
import { describe, it, expect } from 'vitest';
import { extractJson } from '../extract-json';

describe('extractJson', () => {
  it('returns clean JSON as-is (fast path)', () => {
    const input = '{"result": "hello", "session_id": "abc"}';
    expect(extractJson(input)).toBe(input);
  });

  it('handles leading/trailing whitespace', () => {
    const json = '{"result": "hello"}';
    expect(extractJson(`  \n  ${json}  \n  `)).toBe(json);
  });

  it('extracts JSON from markdown code fences', () => {
    const input = '```json\n{"result": "hello", "session_id": "abc"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ result: 'hello', session_id: 'abc' });
  });

  it('extracts JSON from bare markdown fences (no language tag)', () => {
    const input = '```\n{"result": "test"}\n```';
    expect(JSON.parse(extractJson(input))).toEqual({ result: 'test' });
  });

  it('extracts JSON from preamble text', () => {
    const input = 'Here is your JSON:\n{"result": "hello", "session_id": "abc"}';
    expect(JSON.parse(extractJson(input))).toEqual({ result: 'hello', session_id: 'abc' });
  });

  it('extracts JSON when trailing text follows', () => {
    const input = '{"result": "hello"}\n\nNote: this took 2.3 seconds.';
    expect(JSON.parse(extractJson(input))).toEqual({ result: 'hello' });
  });

  it('handles CLI warnings before JSON', () => {
    const input = 'Warning: Update available (v2.1.0)\n{"result": "data", "session_id": "s1"}';
    expect(JSON.parse(extractJson(input))).toEqual({ result: 'data', session_id: 's1' });
  });

  it('throws when no JSON object is found', () => {
    expect(() => extractJson('no json here')).toThrow('No JSON object found');
  });

  it('throws on empty input', () => {
    expect(() => extractJson('')).toThrow('No JSON object found');
  });
});
