import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { execSync } from "child_process";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  define: {
    // Injected at build/dev-server-start time so the UI can show which
    // build is running — lets you confirm the latest deploy is live.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_NUMBER__: (() => {
      try {
        return Number(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim());
      } catch {
        return 0;
      }
    })(),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // main.tsx manually registers /sw.js, so don't inject a second registration
      injectRegister: null,
      registerType: "autoUpdate",
      filename: "sw.js",
      strategies: "generateSW",
      // Only active during production build — dev uses the fallback public/sw-dev.js stub
      devOptions: { enabled: false },
      // Don't auto-generate manifest.json; we keep the one in public/
      manifest: false,
      workbox: {
        // Precache every JS/CSS/HTML/image produced by the build
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff,woff2}"],
        // Audio files are too large to precache upfront — cache them at runtime instead
        globIgnores: ["**/sounds/**"],
        // Background and diag art can exceed 2 MiB; raise limit so they're precached
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // SPA fallback so any navigation offline lands on index.html
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/sounds\//],
        runtimeCaching: [
          {
            // Audio: cache-first after first play; served offline thereafter
            urlPattern: /\/sounds\/.+/,
            handler: "CacheFirst",
            options: {
              cacheName: "earvana-audio-v1",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Carousel thumbnails: network-first so swapped images stay fresh;
            // cached copy serves offline
            urlPattern: /\/sounds\/TR_tn_.*\.png$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "earvana-thumbnails-v1",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          runtimeErrorOverlay(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
