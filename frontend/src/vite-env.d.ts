/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ENABLE_ERROR_REPORTING: string;
  readonly VITE_ERROR_RETRY_ATTEMPTS: string;
  readonly VITE_ERROR_RETRY_DELAY: string;
  readonly VITE_SENTRY_ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}