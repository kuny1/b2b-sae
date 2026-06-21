# 任务 04：Java IslandResolver + island-router.jsp

## 目标

在 Java 服务中实现：
1. `IslandResolver`：从 TCC 读取 `island.manifest`，为 JSP 提供 Island 资源的当前 hash 文件名
2. `island-router.jsp`：集中路由——根据 TCC `island.routes` 配置，决定走 React Island 还是 jQuery fallback
3. TCC 配置注册

一次实现，后续所有 Island/全页 React 的切换、灰度、回滚全部纯配置，零 Java 上线。

## 依赖

- 任务 03（构建链 + TCC manifest 推送通路打通）

## 与哪些任务可并行

- 任务 02（jQuery 改造）— 完全独立
- 任务 05（React Island 组件）— 独立（可并行开发，集成时对接）

## 输入

- TCC API 文档 / SDK
- Java 项目目录结构（确定 IslandResolver 和 island-router.jsp 放置位置）
- 项目使用的 JSON 解析库

## 产出

1. `IslandResolver.java`（约 30 行）
2. `/WEB-INF/includes/island-router.jsp`（约 50 行）
3. `/WEB-INF/includes/fallback/` 目录
4. TCC 配置项 `island.manifest` 和 `island.routes` 注册

## 步骤

### 步骤 1：实现 IslandResolver

```java
public class IslandResolver {
    private static volatile Map<String, String> cache;
    private static volatile long lastRefresh = 0;
    private static final long TTL = 60_000;

    public static String getUrl(String islandName) {
        String hash = getManifest().get(islandName);
        if (hash != null) return "/dist/" + hash;
        return cache != null
            ? "/dist/" + cache.getOrDefault(islandName, "islands/" + islandName + ".js")
            : "";
    }

    private static Map<String, String> getManifest() {
        if (cache != null && System.currentTimeMillis() - lastRefresh < TTL) return cache;
        try {
            String json = TCCClient.get("island.manifest");
            cache = JsonParser.parseMap(json);
            lastRefresh = System.currentTimeMillis();
        } catch (Exception e) {
            log.warn("读取 island.manifest 失败，使用上次缓存", e);
        }
        return cache != null ? cache : Map.of();
    }
}
```

### 步骤 2：实现 island-router.jsp

```jsp
<%-- /WEB-INF/includes/island-router.jsp --%>
<%-- 集中路由：一次实现，全站复用。不区分 Island 还是全页 --%>
<%@ page import="java.util.Map" %>
<%
  String route = request.getParameter("route");
  if (route == null || route.isEmpty()) {
%>
    <jsp:include page="/WEB-INF/includes/fallback/default.jsp" />
<%
    return;
  }

  Map<String, Map<String, Object>> routes = ConfigService.getJsonMap("island.routes");
  Map<String, Object> cfg = routes != null ? routes.get(route) : null;

  String renderer = cfg != null ? (String) cfg.getOrDefault("renderer", "jquery") : "jquery";
  double traffic  = cfg != null ? ((Number) cfg.getOrDefault("traffic", 1.0)).doubleValue() : 1.0;

  // 灰度决策：确定性哈希（分布式一致）
  String userId = getUserId(request);
  boolean useReact;

  // 1. Query Param（开发调试，最高优先级）
  String qpOverride = request.getParameter("__r_" + route);
  if (qpOverride != null) {
    useReact = "react".equals(qpOverride);

  // 2. DEV 环境 cookie
  } else if (isDevEnv()) {
    String cookieVal = getCookie(request, "__island_" + route);
    if (cookieVal != null) {
      useReact = "react".equals(cookieVal);
    } else {
      int bucket = Math.abs((userId + ":" + route).hashCode()) % 100;
      useReact = "react".equals(renderer) && bucket < (int)(traffic * 100);
    }

  // 3. 生产环境：确定性哈希
  } else {
    int bucket = Math.abs((userId + ":" + route).hashCode()) % 100;
    useReact = "react".equals(renderer) && bucket < (int)(traffic * 100);
  }

  if (useReact) {
%>
    <div id="island-root-<%= route %>"></div>
    <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
    <script src="<%= IslandResolver.getUrl((String)cfg.get("island")) %>"></script>
    <script>
      (function() {
        var mountFn = window.__islands && window.__islands['<%= cfg.get("island") %>'] && window.__islands['<%= cfg.get("island") %>'].mount;
        if (mountFn) mountFn('#island-root-<%= route %>');
      })();
    </script>
<%
  } else {
%>
    <jsp:include page="/WEB-INF/includes/fallback/<%= route %>.jsp" />
<%
  }
%>
```

### 步骤 3：注册 TCC 配置

```
TCC Key：island.manifest
  初始值：{}
  更新方式：前端 CI 构建完成后自动推送

TCC Key：island.routes
  初始值：{}
  更新方式：运维/开发手动维护
  格式：
    {
      "approval-status": {
        "renderer": "jquery",
        "island": "approvalStatus",
        "traffic": 0
      }
    }
```

### 步骤 4：编写集成测试

| 场景 | 预期 |
|---|---|
| TCC 正常，renderer="react"，traffic=1.0 | 所有用户走 React 分支，输出空 div + island script |
| TCC 正常，renderer="jquery" | 所有用户走 jQuery 分支，include fallback JSP |
| TCC 不可用 | ConfigService 返回 null → 默认 jquery，include fallback JSP |
| Query Param `?__r_approval-status=react` | 强制走 React 分支（覆盖哈希结果） |

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：IslandResolver 实现 | 代码 Review 通过 |
| M2：island-router.jsp 实现 | 代码 Review 通过 |
| M3：TCC 配置项注册 | island.manifest 和 island.routes 可读写 |
| M4：集成测试通过 | 全部场景通过 |

## 量化指标

| 指标 | 目标 |
|---|---|
| IslandResolver 代码行数 | < 50 行 |
| island-router.jsp 代码行数 | < 60 行 |
| 后续页面接入 router 的 JSP 改动 | 1 行 `<jsp:include>` |

## 验收标准

- [ ] `IslandResolver.getUrl("vendor")` 返回正确 CDN 路径
- [ ] TCC 不可用时，返回缓存值（不抛异常）
- [ ] `island-router.jsp?route=approval-status` 根据 renderer 正确分支
- [ ] 确定性哈希：同一 user+route 在不同服务器上结果一致
- [ ] Query Param `?__r_xxx=react|jquery` 覆盖哈希结果
