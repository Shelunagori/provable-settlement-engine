import { useEffect, useState } from 'react';
import { routeOf, type Route } from '../routing.ts';

/** The current page, kept in step with the History API and the back button. */
export const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.pathname));

  useEffect(() => {
    const sync = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return route;
};
