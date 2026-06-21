import { create } from 'zustand';

// Approval state machine — 6 status nodes with defined transitions.
//
//   pending ──submit()──▶ inReview ──approve()──▶ approved ──execute()──▶ executed
//                           │
//                           ├── reject() ──▶ rejected ──resubmit()──▶ inReview
//                           │
//                           └── withdraw() ──▶ withdrawn

export type ApprovalStatus =
  | 'pending'
  | 'inReview'
  | 'approved'
  | 'rejected'
  | 'withdrawn'
  | 'executed';

export interface ApprovalState {
  // Core state
  status: ApprovalStatus;
  orderId: string | null;
  operator: string | null;
  comment: string;

  // Actions — each transitions the state machine
  submit: () => void;
  assign: (reviewer: string) => void;
  approve: (operator: string, comment: string) => void;
  reject: (operator: string, comment: string) => void;
  resubmit: () => void;
  withdraw: (operator: string) => void;
  execute: (operator: string) => void;

  // Derived queries — consumed by both jQuery (getState()) and React (useStore())
  isEditable: () => boolean;
  canApprove: () => boolean;
  statusLabel: () => string;
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '待审',
  inReview: '审核中',
  approved: '已通过',
  rejected: '已驳回',
  withdrawn: '已撤回',
  executed: '已执行',
};

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  // ── Initial state ──
  status: 'pending',
  orderId: null,
  operator: null,
  comment: '',

  // ── Actions ──
  submit: () => set({ status: 'inReview' }),

  assign: (reviewer: string) => set({ status: 'inReview', operator: reviewer }),

  approve: (operator: string, comment: string) =>
    set({ status: 'approved', operator, comment }),

  reject: (operator: string, comment: string) =>
    set({ status: 'rejected', operator, comment }),

  resubmit: () => set({ status: 'inReview', comment: '' }),

  withdraw: (operator: string) => set({ status: 'withdrawn', operator }),

  execute: (operator: string) => set({ status: 'executed', operator }),

  // ── Derived queries ──
  isEditable: () => {
    const s = get().status;
    return s === 'pending' || s === 'rejected';
  },

  canApprove: () => get().status === 'inReview',

  statusLabel: () => STATUS_LABELS[get().status],
}));
