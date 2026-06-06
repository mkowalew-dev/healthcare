/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SPLUNK_RUM_TOKEN: string;
  readonly VITE_SPLUNK_REALM: string;
  readonly VITE_APP_ENV: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_CLINICAL_HOST: string;
  readonly VITE_PATIENT_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
