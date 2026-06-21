<%-- /WEB-INF/includes/fallback/approval-status.jsp --%>
<%-- jQuery fallback for the approval status UI block.
     Only rendered when island-router.jsp decides "jquery" branch.
     Data is injected via window.$page (JSP data layer), same as React branch.
     State is managed by Zustand useApprovalStore, initialized from $page. --%>

<div class="approval-panel" data-testid="approval-panel">
  <span id="approval-badge" class="badge badge-pending" data-testid="approval-badge">待审</span>

  <%-- Editable actions: submit (pending), resubmit (rejected), withdraw (pending) --%>
  <div id="approval-editable-actions" class="approval-actions hidden">
    <button id="btn-submit" data-testid="btn-submit">提交审批</button>
    <button id="btn-resubmit" class="hidden" data-testid="btn-resubmit">重新提交</button>
    <button id="btn-withdraw" class="hidden" data-testid="btn-withdraw">撤回</button>
  </div>

  <%-- Approve/reject actions (inReview) --%>
  <div id="approval-review-actions" class="approval-actions hidden">
    <textarea id="approval-comment" class="approval-comment" data-testid="approval-comment" placeholder="请输入审批意见"></textarea>
    <button id="btn-approve" data-testid="btn-approve">通过</button>
    <button id="btn-reject" data-testid="btn-reject">驳回</button>
  </div>

  <%-- Execute action (approved) --%>
  <div id="approval-execute-actions" class="approval-actions hidden">
    <button id="btn-execute" data-testid="btn-execute">执行</button>
  </div>
</div>

<script>
  (function() {
    // ── Store init from JSP data layer ──
    var pageData = window.$page && window.$page.approval;
    if (pageData) {
      useApprovalStore.setState({
        status: pageData.status || 'pending',
        orderId: pageData.orderId || null,
        operator: pageData.operator || null
      });
    }

    // ── DOM sync: Store change → update all DOM display positions ──
    useApprovalStore.subscribe(function(state) {
      var label = state.statusLabel ? state.statusLabel() : state.status;

      // Update badge
      var $badge = $('#approval-badge');
      $badge.text(label).attr('class', 'badge badge-' + state.status);

      // Toggle action panels based on status
      var isEditable = state.isEditable ? state.isEditable() : false;
      var canApprove = state.canApprove ? state.canApprove() : false;

      $('#approval-editable-actions').toggle(isEditable);
      $('#approval-review-actions').toggle(canApprove);
      $('#approval-execute-actions').toggle(state.status === 'approved');

      // Show/hide specific buttons within panels
      $('#btn-submit').toggle(state.status === 'pending');
      $('#btn-resubmit').toggle(state.status === 'rejected');
      $('#btn-withdraw').toggle(state.status === 'pending');
    });

    // ── Button event handlers ──
    $('#btn-submit').on('click', function() {
      useApprovalStore.getState().submit();
    });

    $('#btn-resubmit').on('click', function() {
      useApprovalStore.getState().resubmit();
    });

    $('#btn-withdraw').on('click', function() {
      useApprovalStore.getState().withdraw(getCurrentUser());
    });

    $('#btn-approve').on('click', function() {
      var comment = $('#approval-comment').val();
      useApprovalStore.getState().approve(getCurrentUser(), comment);
    });

    $('#btn-reject').on('click', function() {
      var comment = $('#approval-comment').val();
      useApprovalStore.getState().reject(getCurrentUser(), comment);
    });

    $('#btn-execute').on('click', function() {
      useApprovalStore.getState().execute(getCurrentUser());
    });

    function getCurrentUser() {
      return (window.$page && window.$page.currentUser) || '当前用户';
    }
  })();
</script>
