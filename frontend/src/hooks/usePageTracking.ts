import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackEvent } from '../analytics';

// Replace UUID and numeric path segments so /patient/123 and /patient/456
// collapse to the same route name in Splunk RUM dashboards.
const normalizeRoute = (path: string): string =>
  path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');

export function usePageTracking(): void {
  const location = useLocation();
  const previous = useRef('');

  useEffect(() => {
    const route = normalizeRoute(location.pathname);
    if (previous.current === route) return;
    previous.current = route;
    trackEvent('page.view', {
      'page.path': location.pathname,
      'page.route': route,
    });
  }, [location.pathname]);
}

// Convenience component — drop inside any BrowserRouter subtree.
export function PageTracker(): null {
  usePageTracking();
  return null;
}
