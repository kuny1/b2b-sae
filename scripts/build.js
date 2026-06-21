#!/usr/bin/env node
/**
 * Build script — orchestrates vendor + island IIFE builds.
 *
 * Two-phase build for IIFE format with shared vendor:
 *   Phase 1: Build vendor (Preact + Zustand → window.__vendor)
 *   Phase 2: Build each Island (preact/zustand as external globals)
 *
 * Output:
 *   dist/vendor/vendor.[hash].js    — shared runtime (~10KB gzipped)
 *   dist/islands/[name].[hash].js   — Island components (~0.5-3KB each)
 *   dist/.vite/manifest.json        — merged manifest for TCC
 *
 * Usage:
 *   node scripts/build.js
 */

import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  console.log('🏗️  Building vendor...');

  // ── Phase 1: Vendor ──
  const vendorResult = await build({
    root,
    configFile: false,
    resolve: {
      alias: {
        react: 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      lib: {
        entry: resolve(root, 'src/vendor.ts'),
        formats: ['iife'],
        name: '__vendor',
        fileName: () => 'vendor/vendor.[hash].js',
      },
      manifest: true,
      target: 'es2015',
      minify: 'esbuild',
    },
    logLevel: 'info',
  });

  // Save vendor manifest before second build overwrites it
  const vendorManifestPath = resolve(root, 'dist/.vite/manifest.json');
  let vendorFile = null;
  if (exists(vendorManifestPath)) {
    const vendorManifest = JSON.parse(readFileSync(vendorManifestPath, 'utf-8'));
    for (const [, value] of Object.entries(vendorManifest)) {
      if (value.file && value.file.startsWith('vendor/')) {
        vendorFile = value.file;
        break;
      }
    }
  }
  console.log('✅ Vendor built:', vendorFile);

  // Collect island entry points
  const islands = [
    { name: 'approvalStatus', entry: 'src/islands/approvalStatus/index.tsx' },
    // Add new islands here as they are created
  ];

  // ── Phase 2: Each Island ──
  for (const island of islands) {
    console.log(`🏗️  Building island: ${island.name}...`);

    await build({
      root,
      configFile: false,
      resolve: {
        alias: {
          react: 'preact/compat',
          'react-dom': 'preact/compat',
          'react/jsx-runtime': 'preact/jsx-runtime',
        },
      },
      build: {
        outDir: 'dist',
        emptyOutDir: false, // preserve vendor output
        manifest: true,     // merge into existing manifest
        target: 'es2015',
        minify: 'esbuild',
        rollupOptions: {
          input: {
            [island.name]: resolve(root, island.entry),
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
            entryFileNames: `islands/[name].[hash].js`,
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
      logLevel: 'info',
    });

    console.log(`✅ Island built: ${island.name}`);
  }

  // ── Post-process: normalize manifest ──
  // Vite's manifest uses paths relative to root. We want simple keys
  // matching TCC convention: "approvalStatus" → "islands/approvalStatus.[hash].js"
  const manifestPath = resolve(root, 'dist/.vite/manifest.json');
  if (exists(manifestPath)) {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const normalized = {};
    // Include vendor (saved from phase 1)
    if (vendorFile) {
      normalized.vendor = vendorFile;
    }
    for (const [key, value] of Object.entries(raw)) {
      const islandMatch = key.match(/src\/islands\/(\w+)\/index\.tsx/);
      if (islandMatch) {
        normalized[islandMatch[1]] = value.file;
      }
    }
    writeFileSync(manifestPath, JSON.stringify(normalized, null, 2));
    console.log('📋 Manifest:', JSON.stringify(normalized));
  }

  console.log('🎉 Build complete');
}

function exists(path) {
  try { readFileSync(path); return true; } catch { return false; }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
