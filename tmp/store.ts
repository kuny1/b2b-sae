import { createStore } from 'zustand/vanilla'

// 1. 定义状态类型（包含数据和操作方法）
type ApprovalState = {
  order: { orderId: number; status: string }
  extra: Record<string, unknown>
  updateOrder: (partial: Partial<{ orderId: number; status: string }>) => void
  setExtra: (newExtra: Record<string, unknown>) => void
}

// 2. 默认初始值（与题目要求一致）
const DEFAULT_STATE = {
  order: { orderId: 1, status: 'init' },
  extra: {},
} as const

// 3. 工厂函数：接收外部数据，返回 Store 实例
const createApprovalStore = (initialProps?: {
  order?: Partial<{ orderId: number; status: string }>
  extra?: Record<string, unknown>
}) => {
  // 合并默认值与外部传入的数据（简单覆盖，无需深度合并）
  const initialState = {
    order: { ...DEFAULT_STATE.order, ...initialProps?.order },
    extra: { ...DEFAULT_STATE.extra, ...initialProps?.extra },
  }

  return createStore<ApprovalState>((set) => ({
    ...initialState,
    updateOrder: (partial) =>
      set((state) => ({ order: { ...state.order, ...partial } })),
    setExtra: (newExtra) => set({ extra: newExtra }),
  }))
}

// 4. 使用示例：从全局对象读取数据初始化
const store = createApprovalStore(window.$page?.approval)