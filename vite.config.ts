import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

const alias = {
  react: 'preact/compat',
  'react-dom': 'preact/compat',
  'react/jsx-runtime': 'preact/jsx-runtime',
};

// Default build: islands (vendor built separately via scripts/build.js).
// preact/zustand are external — loaded from window.__vendor at runtime.
export default defineConfig({
  resolve: { alias },
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    manifest: true,
    target: 'es2015',
    minify: 'esbuild',

    rollupOptions: {
      input: {
        approvalStatus: resolve(__dirname, 'src/islands/approvalStatus/index.tsx'),
      },
      external: [
        'preact',
        'preact/compat',
        'preact/hooks',
        'preact/jsx-runtime',
        'zustand',
      ],
      output: {
        format: 'iife',
        entryFileNames: 'islands/[name].[hash].js',
        globals: {
          preact: '__vendor.preact',
          'preact/compat': '__vendor.compat',
          'preact/hooks': '__vendor.hooks',
          'preact/jsx-runtime': '__vendor.jsxRuntime',
          zustand: '__vendor.zustand',
        },
      },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
    // Force zustand through Vite transform pipeline so react→preact alias applies
    server: {
      deps: {
        inline: ['zustand'],
      },
    },
  },
});
