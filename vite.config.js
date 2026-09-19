import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/futebol/api": { target: "http://127.0.0.1:8787", ws: true } },
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          physics: ["@dimforge/rapier3d-compat"],
          three: ["three"],
        },
      },
    },
  },
});
