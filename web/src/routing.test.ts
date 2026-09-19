import { describe, expect, it } from 'vitest';
import { routeOf } from './routing.ts';

describe('routeOf', () => {
  it('sends /review to the review page', () => {
    expect(routeOf('/review')).toBe('review');
  });

  it('tolerates a trailing slash, which is what a pasted link often has', () => {
    expect(routeOf('/review/')).toBe('review');
  });

  it('sends everything else to the wagering console', () => {
    expect(routeOf('/')).toBe('app');
    expect(routeOf('')).toBe('app');
    expect(routeOf('/anything')).toBe('app');
    // Not a prefix match: only the exact path is the review page.
    expect(routeOf('/reviews')).toBe('app');
    expect(routeOf('/review/extra')).toBe('app');
  });
});
