// Capacitor / local build config — no Replit-specific plugins, no PORT requirement.
// Used by: pnpm run cap:build
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { execSync } from "child_process";

function buildNumber(): number {
  // Keep in sync with src/version.ts APP_BUILD, iOS CURRENT_PROJECT_VERSION,
  // and Android versionCode.
  const fromEnv = process.env.EARVANA_BUILD_NUMBER ?? process.env.BUILD_NUMBER;
  if (fromEnv && !Number.isNaN(Number(fromEnv))) return Number(fromEnv);
  return 23;
}

export default defineConfig({
  base: "/",
  // Must match vite.config.ts — App.tsx reads these at module load.
  // Missing defines crash the WebView with a black screen.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_NUMBER__: buildNumber(),
  },
  plugins: [react(), tailwindcss()],
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
});
