import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.VITE_DEV_PORT ?? process.env.PORT ?? 5173)
  }
});
