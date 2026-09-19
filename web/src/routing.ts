/**
 * Two pages, no router dependency.
 *
 * A routing library would earn its weight with nested routes, params, loaders
 * or code splitting. This application has a wagering console and a review
 * walkthrough, so what it actually needs is the current pathname and a way to
 * change it without a full page load. That is the History API.
 *
 * Vercel rewrites every path to `/`, so a direct load or a refresh of /review
 * serves the same bundle and the switch below picks the page.
 */
export type Route = 'app' | 'review';

export const routeOf = (pathname: string): Route =>
  pathname.replace(/\/+$/, '') === '/review' ? 'review' : 'app';

/** Client-side navigation, with the browser's back button still working. */
export const navigate = (to: '/' | '/review'): void => {
  if (window.location.pathname.replace(/\/+$/, '') === to.replace(/\/+$/, '')) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'auto' });
};

export const LINKS = {
  repo: 'https://github.com/Shelunagori/provable-settlement-engine',
  readme: 'https://github.com/Shelunagori/provable-settlement-engine#readme',
  invariants:
    'https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/INVARIANTS.md',
  refusals:
    'https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/REFUSALS.md',
  decisions:
    'https://github.com/Shelunagori/provable-settlement-engine/blob/main/docs/DECISIONS.md',
  liveDemo: 'https://provable-settlement-engine-api.vercel.app',
} as const;
