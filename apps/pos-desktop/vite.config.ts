import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Config de Vite para el POS. En desarrollo corre en el navegador (datos en
// memoria); el mismo build se empaqueta luego dentro de Tauri.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
  },
});
