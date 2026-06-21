// Approval Status Island — React/Preact Island component.
// Renders into an empty div provided by island-router.jsp (React branch).
// Reads initial state from window.$page (JSP data injection layer).
// Reads/writes business state via Zustand store (shared with jQuery branch).

import { render } from 'preact/compat';
import { useState, useEffect } from 'preact/hooks';
import { useApprovalStore } from '../../store/approvalStore';
import { IslandErrorBoundary } from '../../components/IslandErrorBoundary';

// Props kept minimal — only the order identifier.
// Remaining data (status, operator) read from window.$page on mount.
interface Props {
  orderId: string;
}

function ApprovalStatusPanel({ orderId }: Props) {
  const status = useApprovalStore(s => s.status);
  const label = useApprovalStore(s => s.statusLabel());
  const isEditable = useApprovalStore(s => s.isEditable());
  const canApprove = useApprovalStore(s => s.canApprove());

  const submit = useApprovalStore(s => s.submit);
  const approve = useApprovalStore(s => s.approve);
  const reject = useApprovalStore(s => s.reject);
  const resubmit = useApprovalStore(s => s.resubmit);
  const withdraw = useApprovalStore(s => s.withdraw);
  const execute = useApprovalStore(s => s.execute);

  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize store from server-injected data (window.$page)
  useEffect(() => {
    const pageData = (window as unknown as { $page?: { approval?: Partial<{
      orderId: string;
      status: string;
      operator: string;
    }> } }).$page?.approval;

    if (pageData) {
      useApprovalStore.setState({
        status: (pageData.status as 'pending') ?? 'pending',
        orderId: pageData.orderId ?? orderId,
        operator: pageData.operator ?? null,
      });
    }
  }, [orderId]);

  // Wrap actions with loading guard
  const withLoading = (action: (...args: string[]) => void) => {
    return (...args: string[]) => {
      if (loading) return;
      setLoading(true);
      action(...args);
      setLoading(false);
    };
  };

  return (
    <IslandErrorBoundary islandName="approvalStatus">
      <div className="approval-status-panel" data-testid="approval-panel">
        {/* Status badge */}
        <span className={`badge badge-${status}`} data-testid="approval-badge">
          {label}
        </span>

        {/* Editable actions: submit (pending), resubmit (rejected) */}
        {isEditable && (
          <div className="approval-actions">
            {status === 'pending' && (
              <button
                data-testid="btn-submit"
                disabled={loading}
                onClick={withLoading(() => submit())}
              >
                提交审批
              </button>
            )}
            {status === 'rejected' && (
              <button
                data-testid="btn-resubmit"
                disabled={loading}
                onClick={withLoading(() => resubmit())}
              >
                重新提交
              </button>
            )}
            {status === 'pending' && (
              <button
                data-testid="btn-withdraw"
                disabled={loading}
                onClick={withLoading(() => withdraw('当前用户'))}
              >
                撤回
              </button>
            )}
          </div>
        )}

        {/* Approve/reject actions (inReview) */}
        {canApprove && (
          <div className="approval-actions">
            <textarea
              className="approval-comment"
              data-testid="approval-comment"
              value={comment}
              onInput={e => setComment((e.target as HTMLTextAreaElement).value)}
              placeholder="请输入审批意见"
            />
            <button
              data-testid="btn-approve"
              disabled={loading}
              onClick={withLoading(() => approve('当前用户', comment))}
            >
              通过
            </button>
            <button
              data-testid="btn-reject"
              disabled={loading}
              onClick={withLoading(() => reject('当前用户', comment))}
            >
              驳回
            </button>
          </div>
        )}

        {/* Terminal states: approved, executed, withdrawn — no actions */}
        {(status === 'approved' || status === 'executed' || status === 'withdrawn') && (
          status === 'approved' && (
            <div className="approval-actions">
              <button
                data-testid="btn-execute"
                disabled={loading}
                onClick={withLoading(() => execute('当前用户'))}
              >
                执行
              </button>
            </div>
          )
        )}
      </div>
    </IslandErrorBoundary>
  );
}

// ── Mount entry for island-router.jsp ──
// React branch outputs (IIFE via <script> tags):
//   <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
//   <script src="<%= IslandResolver.getUrl("approvalStatus") %>"></script>
//   <script>
//     window.__islands.approvalStatus.mount('#island-root-approval-status');
//   </script>
//
// Vendor creates window.__vendor (Preact + Zustand). Island registers its
// mount function on window.__islands. Loading order is critical:
// vendor.js → island.js → inline mount call.

export interface MountProps {
  orderId: string;
}

export function mount(selector: string, props?: MountProps) {
  const container = document.querySelector(selector);
  if (!container) {
    console.error(`[Island:approvalStatus] mount target not found: ${selector}`);
    return;
  }
  render(<ApprovalStatusPanel orderId={props?.orderId ?? ''} />, container);
}

// Register on window for island-router.jsp inline script to call.
// IIFE format has no module exports — the mount call uses this global.
const w = window as any;
w.__islands = w.__islands || {};
w.__islands.approvalStatus = { mount };

export default ApprovalStatusPanel;
