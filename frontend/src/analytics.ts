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
