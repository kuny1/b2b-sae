package com.example.resolver;

import java.util.Map;
import java.util.HashMap;
import java.util.logging.Logger;

/**
 * IslandResolver — reads island.manifest from TCC config center
 * and resolves Island asset URLs for JSP script tag generation.
 *
 * One-time implementation (~30 lines). All subsequent Island pages
 * reuse this class with zero additional Java code.
 *
 * Usage in JSP:
 *   <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
 *   <script src="<%= IslandResolver.getUrl("approvalStatus") %>"></script>
 */
public class IslandResolver {

    private static final Logger log = Logger.getLogger(IslandResolver.class.getName());

    // Local cache — prevents TCC round-trip on every request
    private static volatile Map<String, String> cache;
    private static volatile long lastRefresh = 0;
    private static final long TTL_MS = 60_000; // 1 minute

    /**
     * Resolve an Island asset to its current CDN path.
     *
     * @param islandName key in island.manifest (e.g., "approvalStatus", "vendor")
     * @return CDN path like "/dist/islands/approvalStatus.d4e5f6a.js",
     *         or fallback path if manifest is unavailable
     */
    public static String getUrl(String islandName) {
        Map<String, String> manifest = getManifest();

        String hash = manifest.get(islandName);
        if (hash != null) {
            return "/dist/" + hash;
        }

        // Degradation: use last-known cached value
        if (cache != null) {
            String cached = cache.getOrDefault(islandName, defaultPath(islandName));
            return "/dist/" + cached;
        }

        return "/dist/" + defaultPath(islandName);
    }

    /**
     * Read island.manifest from TCC, with local caching.
     * On failure, returns last cached value — never throws, never returns null.
     */
    private static Map<String, String> getManifest() {
        long now = System.currentTimeMillis();

        // Return cached value within TTL
        if (cache != null && (now - lastRefresh) < TTL_MS) {
            return cache;
        }

        try {
            String json = TCCClient.get("island.manifest");
            Map<String, String> parsed = JsonParser.parseStringMap(json);
            cache = parsed;
            lastRefresh = now;
            return parsed;
        } catch (Exception e) {
            log.warning("Failed to read island.manifest from TCC, using last cache: " + e.getMessage());
            // Return last cache — don't set cache=null, don't throw
            return cache != null ? cache : new HashMap<>();
        }
    }

    /**
     * Fallback path when manifest is unavailable.
     * Uses un-hashed filename with short cache TTL.
     */
    private static String defaultPath(String islandName) {
        return "islands/" + islandName + ".js";
    }
}
