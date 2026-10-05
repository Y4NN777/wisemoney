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
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectAutoRegister: false,
      includeAssets: ["wisemoney-icon.svg", "logo.svg", "icons/wisemoney-icon-*.png"],
      manifest: {
        id: "/",
        name: "WiseMoney",
        short_name: "WiseMoney",
        description: "Local-first personal finance with AI guidance",
        lang: "en",
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
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,wasm}"],
      },
    }),
  ],
  resolve: {
    alias: { "@": "/src" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/write-excel-file/") || id.includes("/fflate/")) return "excel-export";
          if (id.includes("/@tanstack/")) return "data-router-vendor";
          if (id.includes("/hash-wasm/") || id.includes("/@simplewebauthn/") || id.includes("/dexie/")) {
            return "crypto-storage-vendor";
          }
          if (id.includes("/i18next") || id.includes("/react-i18next/")) return "i18n-vendor";
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor";
          // Icons are a few hundred bytes each: one shared file instead of one request per icon.
          if (id.includes("/lucide-react/")) return "icons";
          // Other UI libraries are left to Rollup, which groups them by the screens that use them:
          // one shared chunk made the landing page download the select, dialog and toast code.
          return undefined;
        },
      },
    },
  },
  // VITE_EDGE_BASE_URL is the only env variable the client consumes (managed mode).
  // BYO-key mode requires no env variables — it runs fully client-side (INV-AUTH-05).
});
