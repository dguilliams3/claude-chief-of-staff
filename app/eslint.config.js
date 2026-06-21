import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Ban deep relative imports (3+ levels) everywhere
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['../../..'],
          message: 'Use workspace imports or @/ aliases instead of deep relative paths.',
        }],
      }],
    },
  },

  // Tier boundary: ui/ must not import from components/, views/, or store/
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/components/*', '@/views/*', '@/store', '@/store/*'],
            message: 'ui/ components must not import from components/, views/, or store/. Only types/ and hooks/ are allowed.',
          },
          {
            group: ['../../..'],
            message: 'Use @/ aliases instead of deep relative paths.',
          },
        ],
      }],
    },
  },

  // Tier boundary: components/ must not import from views/
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/views/*'],
            message: 'components/ must not import from views/. Import direction: views → components → ui.',
          },
          {
            group: ['../../..'],
            message: 'Use @/ aliases instead of deep relative paths.',
          },
        ],
      }],
    },
  },
])
