import { defaultClientConditions, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { createReadStream, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// The ONNX runtime files transformers.js loads for the voice lab (ADR-0014 follow-up), served from
// our own origin under /ort/ instead of the library's default CDN. Never precached: about 27 MB.
const ORT_FILES = [
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

function onnxRuntimeAssets(): Plugin {
  // pnpm keeps onnxruntime-web next to transformers.js, not in this package's node_modules.
  const transformersDir = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "node_modules/@huggingface/transformers"));
  const ortDist = path.resolve(transformersDir, "../../onnxruntime-web/dist");
  return {
    name: "wisemoney-onnx-runtime-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = req.url?.startsWith("/ort/") ? req.url.slice("/ort/".length).split("?")[0] : undefined;
        if (file == null || !ORT_FILES.includes(file)) return next();
        res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        createReadStream(path.join(ortDist, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of ORT_FILES) {
        this.emitFile({ type: "asset", fileName: `ort/${file}`, source: readFileSync(path.join(ortDist, file)) });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    onnxRuntimeAssets(),
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
        // The voice lab's runtime and library are downloaded only by whoever opens /lab/voice; the push
        // lab page only by whoever opens /lab/push (ADR-0016 step 1).
        globIgnores: ["ort/**", "**/voice-lab-*.js", "**/PushLabPage-*.js"],
      },
    }),
  ],
  resolve: {
    alias: { "@": "/src" },
    // onnxruntime-web's build without an embedded WASM: the runtime comes from /ort/ only, not a second copy.
    conditions: [...defaultClientConditions, "onnxruntime-web-use-extern-wasm"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/@huggingface/") || id.includes("/onnxruntime-")) return "voice-lab";
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
