import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

// Configuración base (flat config, ESLint 9). Cada paquete/app puede extenderla.
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/target/**",
      "**/node_modules/**",
      "**/src-tauri/**",
      // El panel web compilado que el cloud-api sirve estático: es el build
      // de admin-web copiado ahí (ver instalacion-primer-cliente.md), no
      // código de este paquete. Sin esto, lintear un bundle minificado tira
      // más de mil errores.
      "apps/cloud-api/panel/**",
      // Bundles que arma `wrangler dev` para servir el Worker. Es código
      // generado y ya empaquetado; lintearlo repite cada error del fuente.
      "**/.wrangler/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // El dinero NUNCA se maneja con number: ver ADR-0007.
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSNumberKeyword[parent.type='TSTypeAnnotation'][parent.parent.id.name=/(monto|precio|importe|total|saldo)/i]",
          message: "Los montos monetarios no se tipan como number. Usá Money/Decimal (ADR-0007).",
        },
      ],
    },
  },
  {
    // Reglas de hooks de React para los componentes (apps pos-desktop y admin-web).
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // El Worker de licencias corre en el runtime de Cloudflare, no en Node:
    // sus globals son los de la plataforma web (Request/Response/crypto/...).
    // Sin esto ESLint los marca como no-undef y el lint del repo queda rojo.
    files: ["apps/licencias-worker/**/*.ts"],
    languageOptions: {
      globals: {
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        URL: "readonly",
        crypto: "readonly",
        atob: "readonly",
        btoa: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        console: "readonly",
        fetch: "readonly",
      },
    },
  },
  {
    // Scripts Node ESM (e2e, utilidades): corren fuera del build de TS, con los
    // globals de Node. Sin esto, ESLint marca console/process/fetch como no-undef.
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
);
