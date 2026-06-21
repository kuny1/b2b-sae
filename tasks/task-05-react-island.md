# 任务 05：React Island 组件开发

## 目标

开发审批状态面板的 React Island 组件，包含 ErrorBoundary 降级保护。组件从 Zustand Store 读写状态，渲染到独立空 div（不与 JSP DOM 共存）。

## 依赖

- 任务 01（Zustand Store）— 组件读写同一 Store
- 任务 03（Vite + Preact 构建链）— 组件需要构建

## 与哪些任务可并行

- 任务 04（Java IslandResolver）— 独立，可并行
- 任务 02（jQuery 改造）— 独立（各自改不同的区域）

## 输入

- 审批详情页中审批状态面板的 HTML 模板 + jQuery 逻辑
- 任务 01 的 Zustand Store（`useApprovalStore`）
- 任务 03 的构建链

## 产出

1. `src/islands/approvalStatus/index.tsx` — 审批状态面板 Island
2. `src/components/ErrorBoundary.tsx` — 通用 ErrorBoundary（所有 Island 复用）
3. `src/components/IslandErrorBoundary.tsx` — Island 专用 ErrorBoundary（失败时保持 JSP DOM 可见）

## 步骤

### 步骤 1：开发通用 ErrorBoundary

```tsx
// src/components/IslandErrorBoundary.tsx
import { Component, ReactNode } from 'preact/compat';

interface Props {
  islandName: string;
  children: ReactNode;
}

export class IslandErrorBoundary extends Component<Props, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error) {
    // 上报监控
    console.error(`[Island:${this.props.islandName}] crashed:`, error.message);
    // Feature flag 的 else 分支中 JSP 旧代码自动兜底
  }

  render() {
    if (this.state.crashed) {
      return null; // 返回 null → 该区域空白，JSP 不受影响
    }
    return this.props.children;
  }
}
```

### 步骤 2：开发审批状态面板 Island

```tsx
// src/islands/approvalStatus/index.tsx
import { useApprovalStore } from '../../store/approvalStore';
import { IslandErrorBoundary } from '../../components/IslandErrorBoundary';

interface Props {
  orderId: string;  // 最小 props：只传 ID，其余数据从 window.$page 读取
}

function ApprovalStatusPanel({ orderId }: Props) {
  const status = useApprovalStore(s => s.status);
  const label = useApprovalStore(s => s.statusLabel());
  const canApprove = useApprovalStore(s => s.canApprove());
  const approve = useApprovalStore(s => s.approve);
  const reject = useApprovalStore(s => s.reject);

  const [comment, setComment] = useState('');

  // 初始化 store：从 window.$page 读数据（JSP 已输出 JSON）
  useEffect(() => {
    var pageData = (window as any).$page?.approval;
    if (pageData) {
      useApprovalStore.setState({
        status: pageData.status,
        orderId: pageData.orderId,
        operator: pageData.operator || null
      });
    }
  }, []);

  return (
    <IslandErrorBoundary islandName="approvalStatus">
      <div className="approval-status-panel">
        <span className={`badge badge-${status}`} data-testid="approval-badge">
          {label}
        </span>

        {canApprove && (
          <div className="approval-actions">
            <textarea
              className="approval-comment"
              value={comment}
              onChange={e => setComment((e.target as any).value)}
              placeholder="请输入审批意见"
            />
            <button onClick={() => approve('当前用户', comment)}>通过</button>
            <button onClick={() => reject('当前用户', comment)}>驳回</button>
          </div>
        )}
      </div>
    </IslandErrorBoundary>
  );
}

// IIFE 挂载
(window as any).__islands = (window as any).__islands || {};
(window as any).__islands.ApprovalStatus = {
  mount: (selector: string, props: Props) => {
    const { createRoot } = require('preact/compat');
    const root = createRoot(document.querySelector(selector)!);
    root.render(<ApprovalStatusPanel {...props} />);
  },
};
```

### 步骤 3：AI 辅助行为等价验证

将老 JSP 中审批区域的 HTML + jQuery 逻辑喂给 AI，AI 生成 React 版本。人工确认：
- 视觉一致（组件样式与 JSP 版本对齐）
- 行为等价（点击通过 → Store 更新 → Badge 变化）
- 边界条件（无操作时、重复点击时、网络慢时）

### 步骤 4：本地构建验证

```bash
npm run build
# 产出 dist/islands/approvalStatus.[hash].js
```

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：ErrorBoundary 开发 | 单独测试通过（模拟组件抛异常，ErrorBoundary 捕获） |
| M2：审批状态面板 Island | 功能测试通过（审批、驳回、状态展示） |
| M3：构建产物检查 | Island gzipped < 5KB，vendor gzipped < 6KB |

## 量化指标

| 指标 | 目标 |
|---|---|
| 单个 Island gzipped 体积 | < 5KB |
| 组件无障碍（a11y） | 按钮有 aria-label，状态变化有 aria-live 通知 |
| ErrorBoundary 覆盖 | 组件内任意位置抛异常均被捕获 |

## 验收标准

- [ ] Island 在独立 div 中渲染，不操作 JSP 其他 DOM
- [ ] 审批通过/驳回操作 → Store 更新 → Island 重渲染
- [ ] ErrorBoundary：组件崩溃 → 该区域空白，其余页面不受影响
- [ ] 构建产出带 hash 文件名，manifest.json 包含此 Island
- [ ] 与 JSP 版本视觉对比一致（截图对比）
