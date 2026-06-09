/**
 * Application entry point.
 *
 * Registers the Vite PWA service worker (offline-first, INV-PERS-01).
 * Renders the React root with TanStack QueryClientProvider.
 *
 * TODO (T-S0-04+):
 * - Add TanStack Router <RouterProvider>.
 * - Add KeyUnlock gate: prompt for passphrase/WebAuthn before mounting App.
 *   No financial data is accessible until the IndexedDB store is unlocked
 *   (INV-PERS-02, ARCHITECTURE §7).
 * - Add error boundary at the root (AI failures must not crash State — NFR-MOD-01).
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";

// LOW-04 (CWE-311): Fail loudly at boot if the managed-mode transport base URL
// is not HTTPS in a production build. An http:// URL would send access JWTs and
// consent assertions over plaintext. undefined is also rejected — a missing URL
// would cause the transport to fall back to an unsafe relative path or fail
// silently, both of which are unacceptable in prod.
if (import.meta.env.PROD) {
  const edgeBaseUrl: string | undefined = import.meta.env.VITE_EDGE_BASE_URL;
  if (edgeBaseUrl === undefined || !edgeBaseUrl.startsWith("https://")) {
    throw new Error("VITE_EDGE_BASE_URL must be https:// in production builds");
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: 0 — financial data is always read from the local IndexedDB source.
      // Network queries (managed AI) handle their own stale times per query key.
      staleTime: 0,
    },
  },
});

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
