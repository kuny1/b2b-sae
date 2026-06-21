<%-- order/detail.jsp — example integration showing before/after --%>
<%@ page import="com.example.resolver.IslandResolver" %>

<%-- ═══════════════════════════════════════════════════════════
     DATA LAYER (unchanged between old and new approach)
     JSP outputs pure JSON — no framework knowledge.
     ═══════════════════════════════════════════════════════════ --%>
<script>
  window.$page = window.$page || {};
  window.$page.currentUser = '<%= request.getAttribute("currentUser") %>';
  window.$page.approval = {
    orderId: '<%= order.getId() %>',
    status: '<%= order.getApprovalStatus() %>',
    operator: '<%= order.getApprovalOperator() %>'
  };
</script>

<%-- ═══════════════════════════════════════════════════════════
     BEFORE (45 lines of if/else — what we replace):
     <%
       boolean useReact = "react".equals(ConfigService.getString("order.approval.renderer", "jquery"));
       if (useReact) {
     %>
       <div id="approval-status-root"></div>
       <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
       <script src="<%= IslandResolver.getUrl("approvalStatus") %>"></script>
       <script>
         __islands.approvalStatus.mount('#approval-status-root');
       </script>
     <% } else { %>
       <%@ include file="approval-status-jquery.inc.jsp" %>
     <% } %>

     AFTER (1 line — island-router.jsp handles everything centrally):
     ═══════════════════════════════════════════════════════════ --%>

<!-- Procurement info block (jQuery, unchanged) -->
<%@ include file="procurement.inc.jsp" %>

<!-- Approval status block: 1 line router replace 45 lines -->
<jsp:include page="/WEB-INF/includes/island-router.jsp">
  <jsp:param name="route" value="approval-status"/>
</jsp:include>

<!-- Logistics info block (jQuery, unchanged) -->
<%@ include file="logistics.inc.jsp" %>
