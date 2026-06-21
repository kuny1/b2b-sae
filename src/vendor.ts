// Vendor entry — built to dist/vendor/vendor.[hash].js as a standalone IIFE.
// Attaches Preact + Zustand to window.__vendor for Island IIFE builds to consume.
//
// Loading order in JSP (island-router.jsp, React branch):
//   1. <script src="vendor.[hash].js"></script>          ← creates window.__vendor
//   2. <script src="islands/approvalStatus.[hash].js"></script>  ← reads __vendor.preact etc.
//
// Island builds (vite.config.ts) mark preact/zustand as external,
// resolving to these globals at runtime.

import * as preact from 'preact';
import * as compat from 'preact/compat';
import * as hooks from 'preact/hooks';
import * as jsxRuntime from 'preact/jsx-runtime';
import * as zustand from 'zustand';

(window as any).__vendor = {
  preact,
  compat,
  hooks,
  jsxRuntime,
  zustand,
};
