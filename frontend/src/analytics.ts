import SplunkOtelWeb from '@splunk/otel-web';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { User } from './types';

const tracer = trace.getTracer('careconnect.analytics');

function setGlobal(attrs: Record<string, string>): void {
  try {
    SplunkOtelWeb.setGlobalAttributes(attrs);
  } catch {
    // RUM not initialized — VITE_SPLUNK_RUM_TOKEN absent in dev/test
  }
}

// Call after login or session restore so every subsequent RUM span carries user identity.
export function identifyUser(user: User): void {
  setGlobal({
    'enduser.id': String(user.id),
    'enduser.role': user.role,
    'enduser.email': user.email,
  });
}

// Call on logout to scrub identity from future spans.
export function clearIdentity(): void {
  setGlobal({ 'enduser.id': '', 'enduser.role': '', 'enduser.email': '' });
}

// Emit a named zero-duration span — appears in Splunk RUM session timeline.
export function trackEvent(name: string, attributes?: Record<string, string>): void {
  const span = tracer.startSpan(name);
  if (attributes) span.setAttributes(attributes);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ── In-app analytics (stored in Postgres, surfaced in /admin/analytics) ───────

function getSessionId(): string {
  let id = sessionStorage.getItem('cc_analytics_sid');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('cc_analytics_sid', id);
  }
  return id;
}

function getUserIdFromToken(): string | null {
  const token = localStorage.getItem('cc_token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id ?? null;
  } catch { return null; }
}

function getApp(path: string): string {
  if (path.startsWith('/haiku')) return 'haiku';
  if (path.startsWith('/patient')) return 'mychart';
  return 'clinical';
}

// Fire-and-forget — sends a pageview event to the in-app analytics store.
export function trackPageView(path: string, route: string): void {
  try {
    const payload = {
      sessionId: getSessionId(),
      userId: getUserIdFromToken(),
      app: getApp(path),
      path,
      route,
      referrer: document.referrer || null,
    };
    fetch('/api/analytics/pageview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* analytics failure must not break the app */ });
  } catch { /* same */ }
}
