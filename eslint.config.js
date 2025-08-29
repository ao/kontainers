import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  { 
    files: ["src/**/*.{js,mjs,cjs,jsx,ts,tsx}"], 
    plugins: { 
      js,
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "@typescript-eslint": tseslint
    }, 
    languageOptions: { 
      globals: { ...globals.browser, ...globals.node },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...pluginReact.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": "error",
      "curly": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}", "tests/**/*"],
    rules: {
      // Disable all rules for test files to focus on functionality
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "no-unused-vars": "off",
      "no-undef": "off",
      "curly": "off",
      "no-useless-escape": "off",
      "no-inner-declarations": "off",
    },
  },
];
