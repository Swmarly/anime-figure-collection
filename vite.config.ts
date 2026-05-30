import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/site",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    assetsDir: "assets",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787"
    }
  }
});
