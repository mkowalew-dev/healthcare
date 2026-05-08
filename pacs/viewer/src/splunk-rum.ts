// ── Splunk Observability Cloud — Real User Monitoring (RUM)
// Must be the FIRST import in main.tsx so RUM captures the full page
// lifecycle, including the Cornerstone.js DICOM image loads that are
// the critical path ThousandEyes monitors.
//
// Required env vars (baked in at Vite build time):
//   VITE_SPLUNK_RUM_TOKEN  — Browser ingest token (type: RUM) from Splunk O11y Cloud
//   VITE_SPLUNK_REALM      — e.g. us0, us1, eu0 (default: us1)
//   VITE_APP_ENV           — e.g. production, staging (default: production)
//   VITE_APP_VERSION       — semver string from config.env APP_VERSION

import SplunkOtelWeb from '@splunk/otel-web';

const rumToken   = import.meta.env.VITE_SPLUNK_RUM_TOKEN;
const realm      = import.meta.env.VITE_SPLUNK_REALM      || 'us1';
const environment = import.meta.env.VITE_APP_ENV           || 'production';
const version    = import.meta.env.VITE_APP_VERSION        || '1.0.0';

if (rumToken) {
  SplunkOtelWeb.init({
    realm,
    rumAccessToken: rumToken,
    applicationName: 'careconnect-pacs-viewer',
    version,
    deploymentEnvironment: environment,
    globalAttributes: {
      'app.name':      'CareConnect PACS Viewer',
      'app.component': 'pacs-viewer',
    },
  });

  console.debug('[RUM] Splunk RUM initialized', { realm, environment });
} else {
  console.debug('[RUM] VITE_SPLUNK_RUM_TOKEN not set — RUM disabled');
}
