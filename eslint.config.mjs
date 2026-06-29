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
