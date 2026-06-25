import { defineConfig } from "vitest/config";

// Los tests del adaptador SQLite usan `node:sqlite` (SQLite real, sin Tauri),
// que requiere el flag `--experimental-sqlite` en el proceso de Node. Se pasa a
// los workers (pool de forks) para no depender de variables de entorno externas.
export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--experimental-sqlite"],
      },
    },
  },
});
