/**
 * Theme choice lives in this browser and nowhere else -- there is no endpoint
 * that stores a preference, and adding one would mean the interface holding
 * state the server does not know about.
 *
 * Absence of a stored choice resolves to light, deliberately: the default is
 * the light experience, not whatever the operating system happens to prefer.
 * "system" is something a person opts into.
 */
export type Theme = 'light' | 'dark' | 'system';

const KEY = 'ledgerproof:theme';

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';

/** Storage can throw in a private window; a theme is never worth a broken page. */
export const readTheme = (): Theme => {
  try {
    const stored = window.localStorage.getItem(KEY);
    return isTheme(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
};

export const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
};

export const storeTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* a preference that cannot be saved still applies for this visit */
  }
};
