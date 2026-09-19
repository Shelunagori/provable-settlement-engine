/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import Root from './Root.tsx';

/**
 * What a reviewer is promised: one link, /review, that loads directly, explains
 * the POC, and hands them the live demo. These tests hold that promise in place.
 *
 * The API is stubbed rather than reached. The review page treats /health as an
 * embellishment, and the point of several of these assertions is that it still
 * renders when that call never resolves.
 */
const setPath = (path: string) => {
  window.history.replaceState({}, '', path);
};

describe('/review', () => {
  beforeEach(() => {
    // Never resolves: the page must not wait on the API to be readable.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    setPath('/review');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setPath('/');
  });

  it('renders the review page rather than the wagering console', () => {
    render(<Root />);
    expect(
      screen.getByRole('heading', { name: /provable settlement for wagering systems/i }),
    ).toBeDefined();
  });

  it('answers the questions a first-time reviewer arrives with', () => {
    render(<Root />);
    for (const heading of [
      /what did i build\?/i,
      /what does the user actually do\?/i,
      /how does a bet work\?/i,
      /what happens behind the button\?/i,
      /how does the money move\?/i,
      /how can the result be independently verified\?/i,
      /who decides what\?/i,
      /system architecture/i,
      /how was correctness tested\?/i,
      /what must always remain true\?/i,
      /what does this poc prove\?/i,
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeDefined();
    }
  });

  it('explains the bet mechanic with a worked win and a worked loss', () => {
    render(<Root />);
    expect(screen.getByText(/41\.72 < 50\.00/)).toBeDefined();
    expect(screen.getByText(/81\.11 ≥ 50\.00/)).toBeDefined();
  });

  it('states what the POC does not claim, so nothing is overclaimed', () => {
    render(<Root />);
    expect(screen.getByText(/what would a production platform still need\?/i)).toBeDefined();
    expect(screen.getByText(/real payment-provider integration/i)).toBeDefined();
    expect(screen.getByText(/customer onboarding and kyc/i)).toBeDefined();
  });

  it('sends the reviewer to the live demo at /', async () => {
    const { container } = render(<Root />);
    const open = screen.getAllByRole('button', { name: /open live demo/i })[0]!;
    open.click();
    await Promise.resolve();
    expect(window.location.pathname).toBe('/');
    expect(container).toBeDefined();
  });

  it('does not put the interactive betting form on the review page', () => {
    render(<Root />);
    expect(screen.queryByRole('button', { name: /^place bet$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^add 10 credits$/i })).toBeNull();
    expect(screen.queryByLabelText(/^bet amount$/i)).toBeNull();
  });

  it('renders even though the health check never answers', () => {
    render(<Root />);
    // The status line degrades; the page does not.
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: /what did i build\?/i })).toBeDefined();
  });
});

describe('the wagering console', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    setPath('/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders at / and offers a way to reach the review page', () => {
    render(<Root />);
    expect(screen.getAllByRole('heading', { name: /place a bet/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /review poc/i }).length).toBeGreaterThan(0);
  });

  it('navigates to /review from the console', async () => {
    render(<Root />);
    screen.getAllByRole('button', { name: /review poc/i })[0]!.click();
    await Promise.resolve();
    expect(window.location.pathname).toBe('/review');
  });
});
