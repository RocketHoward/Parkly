import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const basePath = (process.env.PARKLY_BASE_PATH || "/").replace(/^\/+|\/+$/g, "");

export default defineConfig({
  base: basePath ? `/${basePath}/` : "/",
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 700 },
});
