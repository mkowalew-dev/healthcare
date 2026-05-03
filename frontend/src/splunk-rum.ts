// ── Splunk Observability Cloud — Real User Monitoring (RUM)
// This file must be the FIRST import in main.tsx so that RUM
// captures the full page lifecycle from initial navigation.
//
// Required env vars (baked in at build time):
//   VITE_SPLUNK_RUM_TOKEN  — Browser ingest token from Splunk O11y Cloud
//   VITE_SPLUNK_REALM      — e.g. us0, us1, eu0 (default: us1)
//   VITE_APP_ENV           — e.g. production, staging (default: production)
//   VITE_APP_VERSION       — semver string from config.env APP_VERSION

import SplunkOtelWeb from '@splunk/otel-web';

const rumToken = import.meta.env.VITE_SPLUNK_RUM_TOKEN;
const realm = import.meta.env.VITE_SPLUNK_REALM || 'us1';
const environment = import.meta.env.VITE_APP_ENV || 'production';
const version = import.meta.env.VITE_APP_VERSION || '1.0.0';

if (rumToken) {
  SplunkOtelWeb.init({
    realm,
    rumAccessToken: rumToken,
    applicationName: 'careconnect-clinical',
    version,
    deploymentEnvironment: environment,

    // Attach custom attributes to every span — visible in Splunk APM
    // and RUM dashboards as tag filters
    globalAttributes: {
      'app.name': 'CareConnect Clinical',
      'app.component': 'clinical-portal',
    },
  });

  console.debug('[RUM] Splunk RUM initialized', { realm, environment });
} else {
  console.debug('[RUM] VITE_SPLUNK_RUM_TOKEN not set — RUM disabled');
}
