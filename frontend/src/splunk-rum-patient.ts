// ── Splunk Observability Cloud — Real User Monitoring (RUM)
// Patient portal entry — must be the FIRST import in patient-main.tsx.
// Initializes RUM under the 'mychart-patient' application name so the
// patient portal appears as a separate node in Splunk RUM dashboards.

import SplunkOtelWeb from '@splunk/otel-web';

const rumToken = import.meta.env.VITE_SPLUNK_RUM_TOKEN;
const realm = import.meta.env.VITE_SPLUNK_REALM || 'us1';
const environment = import.meta.env.VITE_APP_ENV || 'production';
const version = import.meta.env.VITE_APP_VERSION || '1.0.0';

if (rumToken) {
  SplunkOtelWeb.init({
    realm,
    rumAccessToken: rumToken,
    applicationName: 'mychart-patient',
    version,
    deploymentEnvironment: environment,

    globalAttributes: {
      'app.name': 'MyChart Patient Portal',
      'app.component': 'patient-portal',
    },
  });

  console.debug('[RUM] Splunk RUM initialized', { realm, environment, app: 'mychart-patient' });
} else {
  console.debug('[RUM] VITE_SPLUNK_RUM_TOKEN not set — RUM disabled');
}
