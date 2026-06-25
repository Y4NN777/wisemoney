import "./index.css";
import "./i18n.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";

if (import.meta.env.PROD) {
  const edgeBaseUrl: string | undefined = import.meta.env.VITE_EDGE_BASE_URL;
  if (edgeBaseUrl !== undefined && !edgeBaseUrl.startsWith("https://")) {
    throw new Error("VITE_EDGE_BASE_URL must be https:// when set in production builds");
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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
