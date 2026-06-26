import { defineConfig } from "vitest/config";

// Los tests del adaptador SQLite de la cola usan `node:sqlite` (SQLite real,
// sin Tauri), que requiere `--experimental-sqlite` en los workers.
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
