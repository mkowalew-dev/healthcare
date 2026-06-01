import SplunkOtelWeb from '@splunk/otel-web';

const rumToken = import.meta.env.VITE_SPLUNK_RUM_TOKEN;
const realm = import.meta.env.VITE_SPLUNK_REALM || 'us1';
const environment = import.meta.env.VITE_APP_ENV || 'production';
const version = import.meta.env.VITE_APP_VERSION || '1.0.0';

if (rumToken) {
  SplunkOtelWeb.init({
    realm,
    rumAccessToken: rumToken,
    applicationName: 'careconnect-haiku',
    version,
    deploymentEnvironment: environment,
    globalAttributes: {
      'app.name': 'CareConnect Haiku',
      'app.component': 'haiku-mobile',
    },
  });
}
