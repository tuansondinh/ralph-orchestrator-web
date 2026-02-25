import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.ralph/**',
      '**/.ralph-ui/**',
      '**/.worktrees/**',
      '**/*.d.ts',
      'packages/*/vite.config.js',
      'packages/*/vitest.config.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/backend/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
)
