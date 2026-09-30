/// <reference types="vitest/config" />
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Icons: white ampersand from zekerenmobiel.nl on the app's navy; generated PNGs in public/.
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Z&M Sales",
        short_name: "Z&M Sales",
        description: "Sales formulier Zeker en Mobiel",
        theme_color: "#0a2e42",
        background_color: "#0a2e42",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
    }),
  ],
  // PORT lets tooling (e.g. a preview runner) pick a free port; 5173 is Vite's default.
  server: { port: Number(process.env.PORT) || 5173 },
  test: {
    // Unit tests for the app (src) and for pure backend modules (supabase/functions/_shared).
    include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./supabase/functions/_shared"),
    },
  },
})
