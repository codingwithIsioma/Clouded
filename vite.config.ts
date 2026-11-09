import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative paths so the built site works at https://<you>.github.io/<repo>/
  base: "./",
  server: { port: 5173, strictPort: true },
});
