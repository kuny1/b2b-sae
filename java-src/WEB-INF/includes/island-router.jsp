<%-- /WEB-INF/includes/island-router.jsp --%>
<%-- Centralized routing for all Island and full-page React migrations.
     One implementation, reused by every page. Eliminates per-page if/else blocks.

     Usage in any JSP page (1 line):
       <jsp:include page="/WEB-INF/includes/island-router.jsp">
         <jsp:param name="route" value="approval-status"/>
       </jsp:include>

     Decision flow:
       1. Read TCC island.routes config: { renderer, island, traffic }
       2. Deterministic hash(userId + ":" + route) % 100 for distributed consistency
       3. Dev overrides: Query Param > DEV Cookie > deterministic hash
       4. React branch: empty <div> + <script> tags (no JSP HTML, no client-side replacement)
       5. jQuery branch: include fallback/xxx.jsp (original code, never deleted)

     Degradation:
       - TCC unavailable → default to jQuery branch (no exception)
       - island.manifest missing → IslandResolver returns last cache (no white screen)
--%>
<%@ page import="java.util.Map" %>
<%@ page import="com.example.resolver.IslandResolver" %>
<%
  // ── 1. Parse route ──
  String route = request.getParameter("route");
  if (route == null || route.isEmpty()) {
%>
    <jsp:include page="/WEB-INF/includes/fallback/default.jsp" />
<%
    return;
  }

  // ── 2. Read TCC island.routes config ──
  Map<String, Map<String, Object>> routes = ConfigService.getJsonMap("island.routes");
  Map<String, Object> cfg = (routes != null) ? routes.get(route) : null;

  String renderer = (cfg != null) ? (String) cfg.getOrDefault("renderer", "jquery") : "jquery";
  double traffic  = (cfg != null) ? ((Number) cfg.getOrDefault("traffic", 0.0)).doubleValue() : 0.0;
  String island   = (cfg != null) ? (String) cfg.get("island") : null;

  // ── 3. Deterministic hash for traffic splitting ──
  String userId = getUserId(request);
  String seed   = userId + ":" + route;
  int bucket    = Math.abs(seed.hashCode()) % 100;

  boolean useReact;

  // Priority: Query Param > DEV Cookie > deterministic hash
  String qpOverride = request.getParameter("__r_" + route);
  if (qpOverride != null) {
    // 1. Query param — explicit, shareable, highest priority
    useReact = "react".equals(qpOverride);
  } else if (isDevEnv()) {
    // 2. DEV environment — persistent cookie for convenience
    String cookieVal = getCookie(request, "__island_" + route);
    if (cookieVal != null) {
      useReact = "react".equals(cookieVal);
    } else {
      useReact = "react".equals(renderer) && bucket < (int)(traffic * 100);
    }
  } else {
    // 3. Production — deterministic hash, distributed-consistent
    useReact = "react".equals(renderer) && bucket < (int)(traffic * 100);
  }

  // ── 4. Output ──
  if (useReact && island != null) {
%>
    <%-- Branch A: React Island — empty container, no JSP HTML --%>
    <div id="island-root-<%= route %>"></div>
    <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
    <script src="<%= IslandResolver.getUrl(island) %>"></script>
    <script>
      (function() {
        var ns = window.__islands && window.__islands['<%= island %>'];
        if (ns && ns.mount) {
          ns.mount('#island-root-<%= route %>');
        }
      })();
    </script>
<%
  } else {
%>
    <%-- Branch B: jQuery fallback — original code, always available --%>
    <jsp:include page="/WEB-INF/includes/fallback/<%= route %>.jsp" />
<%
  }
%>
