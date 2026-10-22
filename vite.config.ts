import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aippyUserCompat } from "./build/aippy-user-compat";
export default defineConfig({
  base: "./",
  plugins: [aippyUserCompat(), react()],
  server: { host: "0.0.0.0", port: 8080 },
  build: { assetsInlineLimit: 8192 },
});
