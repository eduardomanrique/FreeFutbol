import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
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
