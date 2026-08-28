import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Slab Lab",
        short_name: "Slab Lab",
        description: "Slab & remnant material inventory",
        theme_color: "#1c2321",
        background_color: "#f7f6f1",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App data lives in Supabase, not the cache — this just lets the app
        // shell (HTML/JS/CSS) load instantly and work if the connection drops
        // briefly. It won't serve stale inventory data offline.
        globPatterns: ["**/*.{js,css,html,png,svg}"],
      },
    }),
  ],
});
