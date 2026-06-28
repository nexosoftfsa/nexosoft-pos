import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Panel web de reportes. Corre en el navegador contra el cloud-api del servidor
// de sucursal. La URL del backend se toma de VITE_API_URL (ver src/api/config.ts).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // 5174 para no chocar con el POS (5173).
    port: 5174,
    strictPort: false,
  },
});
