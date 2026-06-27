import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "prompt",
      injectAutoRegister: false,
      includeAssets: ["icon.svg", "wisemoney-icon.svg", "logo.svg", "icons/*.png"],
      manifest: {
        name: "WiseMoney",
        short_name: "WiseMoney",
        description: "Local-first personal finance with AI guidance",
        theme_color: "#0077b6",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/wisemoney-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/wisemoney-icon-180.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/wisemoney-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/wisemoney-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/wisemoney-icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Offline-first: cache all navigation to index.html (INV-PERS-01).
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,wasm}"],
        // hash-wasm Argon2id .wasm must be cached for offline unlock.
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": "/src" },
  },
  // VITE_EDGE_BASE_URL is the only env variable the client consumes (managed mode).
  // BYO-key mode requires no env variables — it runs fully client-side (INV-AUTH-05).
});
