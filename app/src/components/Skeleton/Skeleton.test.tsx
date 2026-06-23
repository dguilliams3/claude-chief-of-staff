/**
 * Tests for the `Skeleton` primitive — pure presentational, no DOM render
 * required. Invokes the component as a function and inspects the returned
 * React element.
 *
 * Tests: `app/src/components/Skeleton/Skeleton.tsx::Skeleton`
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from './Skeleton';

interface SkeletonElProps {
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
}

function getEl(props: Parameters<typeof Skeleton>[0] = {}) {
  const element = Skeleton(props);
  if (!React.isValidElement<SkeletonElProps>(element)) {
    throw new Error('Expected Skeleton to return a valid React element');
  }
  return element;
}

describe('Skeleton', () => {
  it('default render: 100% width, 1rem height, card radius, shimmer animation class', () => {
    const el = getEl();
    expect(el.props.style?.width).toBe('100%');
    expect(el.props.style?.height).toBe('1rem');
    expect(el.props.className).toMatch(/rounded-card/);
    expect(el.props.className).toMatch(/bg-surface-raised/);
    expect(el.props.className).toMatch(/animate-skeleton-shimmer/);
  });

  it('numeric width and height are converted to px strings', () => {
    const el = getEl({ width: 200, height: 16 });
    expect(el.props.style?.width).toBe('200px');
    expect(el.props.style?.height).toBe('16px');
  });

  it('string width and height pass through verbatim', () => {
    const el = getEl({ width: '50%', height: '2.5rem' });
    expect(el.props.style?.width).toBe('50%');
    expect(el.props.style?.height).toBe('2.5rem');
  });

  it('rounded="full" renders rounded-full', () => {
    const el = getEl({ rounded: 'full' });
    expect(el.props.className).toMatch(/rounded-full/);
    expect(el.props.className).not.toMatch(/rounded-card/);
  });

  it('rounded="none" renders no rounding utility', () => {
    const el = getEl({ rounded: 'none' });
    expect(el.props.className).not.toMatch(/rounded-/);
  });

  it('className prop is appended after defaults', () => {
    const el = getEl({ className: 'my-extra-class' });
    expect(el.props.className).toMatch(/my-extra-class/);
    expect(el.props.className).toMatch(/animate-skeleton-shimmer/);
  });

  it('default ARIA: role="status" and aria-label="Loading"', () => {
    const el = getEl();
    expect(el.props.role).toBe('status');
    expect(el.props['aria-label']).toBe('Loading');
    expect(el.props['aria-hidden']).toBeUndefined();
  });

  it('decorative=true: role and aria-label dropped, aria-hidden true', () => {
    const el = getEl({ decorative: true });
    expect(el.props.role).toBeUndefined();
    expect(el.props['aria-label']).toBeUndefined();
    expect(el.props['aria-hidden']).toBe(true);
  });
});
