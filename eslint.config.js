import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },

  js.configs.recommended,

  // ---- Frontend (React, navegador) ----------------------------------------
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Solo las dos reglas clásicas de hooks: el preset de la v7 suma reglas
      // del React Compiler que este proyecto no usa.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/prop-types': 'off',
      // El POS enfoca el primer campo a propósito (código de factura, PIN,
      // formularios de alta) para operar sin tocar el mouse.
      'jsx-a11y/no-autofocus': 'off',
      // Etiquetas con ícono + título + descripción anidan el texto 3 niveles
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  // ---- Backend serverless, scripts, configuración y tests (Node) ----------
  {
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}', '*.config.js', 'e2e/**/*.js', 'src/**/__tests__/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  // ---- E2E: el código de page.evaluate() corre en el navegador -------------
  {
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
]
