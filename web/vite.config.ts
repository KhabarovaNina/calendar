import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api проксируется на Prism mock-сервер (см. корневой скрипт `npm run mock`).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4010",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
