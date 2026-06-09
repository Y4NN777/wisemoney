/// <reference types="vite/client" />

// Typed surface for environment variables consumed by the client.
// Add each VITE_* variable here so unknown keys are caught at compile time.
interface ImportMetaEnv {
  readonly VITE_EDGE_BASE_URL: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
