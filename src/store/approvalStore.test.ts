import { describe, it, expect, beforeEach } from 'vitest';
import { useApprovalStore } from './approvalStore';

// Reset store to known state before each test
beforeEach(() => {
  useApprovalStore.setState({
    status: 'pending',
    orderId: null,
    operator: null,
    comment: '',
  });
});

// ── Legal transitions ──

describe('状态机 - 合法转换', () => {
  it('pending → inReview（提交审批）', () => {
    useApprovalStore.getState().submit();
    expect(useApprovalStore.getState().status).toBe('inReview');
  });

  it('pending → inReview（分配审批人）', () => {
    useApprovalStore.getState().assign('张三');
    expect(useApprovalStore.getState().status).toBe('inReview');
    expect(useApprovalStore.getState().operator).toBe('张三');
  });

  it('inReview → approved（审批通过）', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().approve('张三', '同意');
    expect(useApprovalStore.getState().status).toBe('approved');
    expect(useApprovalStore.getState().operator).toBe('张三');
    expect(useApprovalStore.getState().comment).toBe('同意');
  });

  it('inReview → rejected（审批驳回）', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().reject('张三', '材料不全');
    expect(useApprovalStore.getState().status).toBe('rejected');
    expect(useApprovalStore.getState().operator).toBe('张三');
    expect(useApprovalStore.getState().comment).toBe('材料不全');
  });

  it('inReview → withdrawn（撤回）', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().withdraw('李四');
    expect(useApprovalStore.getState().status).toBe('withdrawn');
    expect(useApprovalStore.getState().operator).toBe('李四');
  });

  it('rejected → inReview（驳回后重提交）', () => {
    useApprovalStore.setState({ status: 'rejected', comment: '材料不全' });
    useApprovalStore.getState().resubmit();
    expect(useApprovalStore.getState().status).toBe('inReview');
    expect(useApprovalStore.getState().comment).toBe(''); // resubmit clears comment
  });

  it('approved → executed（执行）', () => {
    useApprovalStore.setState({ status: 'approved' });
    useApprovalStore.getState().execute('王五');
    expect(useApprovalStore.getState().status).toBe('executed');
    expect(useApprovalStore.getState().operator).toBe('王五');
  });
});

describe('状态机 - 多步转换', () => {
  it('完整路径：pending → inReview → approved → executed', () => {
    useApprovalStore.getState().submit();
    expect(useApprovalStore.getState().status).toBe('inReview');

    useApprovalStore.getState().approve('张三', '同意');
    expect(useApprovalStore.getState().status).toBe('approved');

    useApprovalStore.getState().execute('王五');
    expect(useApprovalStore.getState().status).toBe('executed');
  });

  it('驳回重提交：pending → inReview → rejected → inReview → approved', () => {
    useApprovalStore.getState().submit();
    expect(useApprovalStore.getState().status).toBe('inReview');

    useApprovalStore.getState().reject('张三', '材料不全');
    expect(useApprovalStore.getState().status).toBe('rejected');

    useApprovalStore.getState().resubmit();
    expect(useApprovalStore.getState().status).toBe('inReview');

    useApprovalStore.getState().approve('李四', '材料已补充');
    expect(useApprovalStore.getState().status).toBe('approved');
  });

  it('撤回路径：pending → inReview → withdrawn', () => {
    useApprovalStore.getState().submit();
    expect(useApprovalStore.getState().status).toBe('inReview');

    useApprovalStore.getState().withdraw('李四');
    expect(useApprovalStore.getState().status).toBe('withdrawn');
  });
});

// ── Illegal transitions (via guard methods) ──

describe('状态机 - 非法转换（通过 guard 方法验证）', () => {
  it('pending：不可审批（canApprove=false）', () => {
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });

  it('pending：可编辑（isEditable=true）', () => {
    expect(useApprovalStore.getState().isEditable()).toBe(true);
  });

  it('inReview：可审批（canApprove=true）', () => {
    useApprovalStore.setState({ status: 'inReview' });
    expect(useApprovalStore.getState().canApprove()).toBe(true);
  });

  it('inReview：不可编辑（isEditable=false）', () => {
    useApprovalStore.setState({ status: 'inReview' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
  });

  it('approved：不可审批（canApprove=false）', () => {
    useApprovalStore.setState({ status: 'approved' });
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });

  it('approved：不可编辑（isEditable=false）', () => {
    useApprovalStore.setState({ status: 'approved' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
  });

  it('rejected：不可审批（canApprove=false）', () => {
    useApprovalStore.setState({ status: 'rejected' });
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });

  it('rejected：可编辑（isEditable=true）', () => {
    useApprovalStore.setState({ status: 'rejected' });
    expect(useApprovalStore.getState().isEditable()).toBe(true);
  });

  it('executed：不可审批（canApprove=false）', () => {
    useApprovalStore.setState({ status: 'executed' });
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });

  it('executed：不可编辑（isEditable=false）', () => {
    useApprovalStore.setState({ status: 'executed' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
  });

  it('withdrawn：不可审批（canApprove=false）', () => {
    useApprovalStore.setState({ status: 'withdrawn' });
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });

  it('withdrawn：不可编辑（isEditable=false）', () => {
    useApprovalStore.setState({ status: 'withdrawn' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
  });
});

// ── Derived properties ──

describe('派生属性 - statusLabel', () => {
  const expectations: Record<string, string> = {
    pending: '待审',
    inReview: '审核中',
    approved: '已通过',
    rejected: '已驳回',
    withdrawn: '已撤回',
    executed: '已执行',
  };

  for (const [status, label] of Object.entries(expectations)) {
    it(`${status} → "${label}"`, () => {
      useApprovalStore.setState({ status: status as any });
      expect(useApprovalStore.getState().statusLabel()).toBe(label);
    });
  }
});

// ── Subscribe (jQuery bridge) ──

describe('subscribe — jQuery 桥接', () => {
  it('状态变更时触发回调', () => {
    const states: string[] = [];

    const unsub = useApprovalStore.subscribe((state) => {
      states.push(state.status);
    });

    useApprovalStore.getState().submit();
    useApprovalStore.getState().approve('张三', '同意');

    expect(states).toEqual(['inReview', 'approved']);

    unsub(); // cleanup
  });

  it('取消订阅后不再触发', () => {
    let callCount = 0;

    const unsub = useApprovalStore.subscribe(() => {
      callCount++;
    });

    useApprovalStore.getState().submit();
    expect(callCount).toBe(1);

    unsub();
    useApprovalStore.getState().approve('张三', '同意');
    expect(callCount).toBe(1); // no additional calls
  });
});
