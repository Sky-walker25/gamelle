import { describe, expect, it } from 'vitest';
import { angleDelta, pointAlongPolyline, polylineLength, rotateTowards } from '@/core/math';

describe('polyline helpers', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
  ];

  it('measures total length', () => {
    expect(polylineLength(path)).toBe(150);
  });

  it('interpolates along segments', () => {
    const p = pointAlongPolyline(path, 120);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(20);
    expect(p.segment).toBe(1);
  });

  it('clamps beyond the end', () => {
    const p = pointAlongPolyline(path, 999);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });
});

describe('angles', () => {
  it('angleDelta wraps around', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });
  it('rotateTowards is bounded by the max step', () => {
    expect(rotateTowards(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(rotateTowards(0, 0.1, 0.25)).toBeCloseTo(0.1);
  });
});
