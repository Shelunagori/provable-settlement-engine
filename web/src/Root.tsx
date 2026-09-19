import { useCallback, useState } from 'react';
import App from './App.tsx';
import { ReviewPage } from './components/review/ReviewPage.tsx';
import { useRoute } from './hooks/useRoute.ts';
import { applyTheme, readTheme, storeTheme, type Theme } from './theme.ts';

/**
 * Two pages behind one bundle. The theme lives here rather than in either page,
 * so switching between them keeps the choice — and so a person who picks dark
 * on the review page does not arrive at the demo in light.
 */
export default function Root() {
  const route = useRoute();
  const [theme, setThemeState] = useState<Theme>(() => readTheme());

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    storeTheme(next);
  }, []);

  return route === 'review' ? (
    <ReviewPage theme={theme} setTheme={setTheme} />
  ) : (
    <App theme={theme} setTheme={setTheme} />
  );
}
