# 任务 03：Vite + Preact 构建链 + Manifest

## 目标

在项目中新增一套 Vite 构建链，与现有 gulp 并行，产出：
- vendor.js（Preact + Zustand，共享运行时）
- Island.js（React Island 组件，IIFE 格式，带 hash）
- manifest.json（版本映射，推送到 TCC）

## 依赖

无。可立即启动。

## 与哪些任务可并行

- 任务 00（基线采集）— 完全独立
- 任务 01（Store 设计）— 独立（Store 不依赖构建）
- 任务 02（jQuery 改造）— 独立

## 输入

- 现有 gulp 构建配置（了解输出目录、文件命名约定）
- JSP 中 `<script>` 标签的引用路径约定
- CDN / 静态资源服务器信息

## 产出

1. `vite.config.ts` —— Vite 构建配置
2. `package.json` —— 新增依赖（preact、zustand、@vitejs/plugin-react）
3. CI 脚本 —— 构建 → 上传 CDN → 推送 manifest 到 TCC
4. 验证用空 Island —— 确认构建链 + JSP 挂载通路

## 步骤

### 步骤 1：安装依赖

```bash
npm install --save-dev vite @vitejs/plugin-react
npm install --save preact zustand
```

### 步骤 2：Vite 配置

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: { 'react': 'preact/compat', 'react-dom': 'preact/compat' }
  },
  build: {
    lib: {
      entry: {
        'islands/approvalStatus': 'src/islands/approvalStatus/index.tsx',
      },
      formats: ['iife'],
    },
    rollupOptions: {
      external: ['preact', 'preact/compat', 'preact/hooks', 'zustand'],
      output: {
        globals: {
          preact: 'preact',
          'preact/compat': 'React',      // compat 层兼容 React 生态
          'preact/hooks': 'ReactHooks',
          zustand: 'Zustand',
        },
        entryFileNames: '[name].[hash].js',
        manualChunks: {
          vendor: ['preact', 'preact/compat', 'preact/hooks', 'zustand'],
        },
        chunkFileNames: '[name].[hash].js',
      },
    },
    outDir: 'dist',
  },
});
```

### 步骤 3：Manifest 生成

在 `vite.config.ts` 中增加自定义插件，构建完成后生成 `manifest.json`：

```json
{
  "approvalStatus": "islands/approvalStatus.a3f2b1c.js",
  "vendor": "vendor.1a2b3c4.js"
}
```

### 步骤 4：CI 脚本

```
npm run build
  ↓
上传 dist/ 到 CDN（islands/*.js 带 hash，Cache-Control: immutable）
  ↓
读取 dist/manifest.json → 推送到 TCC 配置中心 key：island.manifest
```

### 步骤 5：验证空 Island

创建一个最小的 React Island，在 JSP 中挂载验证通路：

```tsx
// src/islands/__test__/index.tsx
export default function TestIsland() {
  return <div data-testid="island-loaded">Island OK</div>;
}
```

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：Vite build 通过 | `npm run build` 产出 dist/islands/* + dist/manifest.json |
| M2：空 Island 挂载成功 | JSP 中 `<script>` 引用 Island → 页面显示 "Island OK" |
| M3：Manifest 推送 TCC 成功 | TCC 中 island.manifest 值与 dist/manifest.json 一致 |
| M4：vendor.js 体积验证 | vendor.js gzipped < 6KB（Preact + Zustand） |

## 量化指标

| 指标 | 目标 |
|---|---|
| vendor.js gzipped 体积 | < 6KB |
| 单个 Island gzipped 体积 | < 5KB |
| Vite build 时间 | < 10s（增量），< 30s（全量） |
| Manifest 推送延迟 | < 5s（build 完成到 TCC 可读） |

## 验收标准

- [ ] `npm run build` 产出 dist/islands/*.js（带 hash）+ manifest.json
- [ ] vendor.js gzipped < 6KB
- [ ] 空 Island 在 JSP 中挂载成功
- [ ] manifest.json 成功推送到 TCC
- [ ] gulp 构建不受影响（两个构建命令并存）
- [ ] Island 文件名带 hash 且不写入 JSP（由 IslandResolver 动态寻址）
