#!/usr/bin/env node
/**
 * Baseline scan script — Task 00.
 *
 * Scans HTML/JSP/JS files for state copy patterns.
 * Outputs a JSON report quantifying state source count and UI implementation
 * duplication for a given business concept (e.g., "approval status").
 *
 * Usage:
 *   node scripts/scan-baseline.js <target-dir> [--concept <name>]
 *
 * Detection patterns (5 types):
 *   1. DOM-text:    $().text() / $().html() setting status-like text
 *   2. DOM-hidden:  <input type="hidden"> with status-like name/value
 *   3. jQuery.data: $().data(key, val) with status-like key
 *   4. global-var:  window.Xxx._status or similar global state variables
 *   5. JSP-inline:  <script> block variable assignments from server data
 *
 * Output: JSON to stdout with structure:
 * {
 *   concept: string,
 *   totalCopies: number,
 *   filesInvolved: number,
 *   copies: [{ file, line, type, snippet }],
 *   byType: { "DOM-text": number, ... },
 *   byFile: { "file.jsp": number, ... }
 * }
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname, basename, relative } from 'path';

// ── Config ──

const TARGET_EXTENSIONS = ['.html', '.jsp', '.js', '.inc.jsp'];

const STATUS_KEYWORDS = [
  'status', 'approval', '审批', 'state', 'orderStatus',
  'orderState', '流程状态', '审批状态', 'order-status',
];

// Pattern regexes — line-based detection
const PATTERNS = {
  'DOM-text': [
    // $('...').text('已通过') or .text(status) or .text(label)
    /\$\(['"][^'"]+['"]\)\s*\.\s*text\s*\(/g,
    // $('...').html('...')
    /\$\(['"][^'"]+['"]\)\s*\.\s*html\s*\(/g,
    // element.textContent = ... or element.innerText = ...
    /\.\s*textContent\s*=\s*['"`].*?(?:已通过|已驳回|待审|审核中|已撤回|已执行|pending|approved|rejected)/gi,
    /\.\s*innerText\s*=\s*['"`].*?(?:已通过|已驳回|待审|审核中|已撤回|已执行|pending|approved|rejected)/gi,
  ],

  'DOM-hidden': [
    // <input type="hidden" name="status" value="...">
    /<input\b[^>]*\btype\s*=\s*['"]hidden['"][^>]*>/gi,
    // <input type="hidden" with status-like name
    /<input\b[^>]*\bname\s*=\s*['"][^'"]*(?:status|approval|审批)[^'"]*['"][^>]*>/gi,
    // $('#hidden...').val(...)
    /\$\(['"][^'"]*hidden[^'"]*['"]\)\s*\.\s*val\s*\(/g,
  ],

  'jQuery.data': [
    // $('...').data('status', ...)
    /\$\(['"][^'"]+['"]\)\s*\.\s*data\s*\(\s*['"](?:status|approval|state)[^'"]*['"]/gi,
  ],

  'global-var': [
    // window.XxxModule._status = ... (or var _status = ...)
    /(?:window\.\w+\.|var\s+|let\s+|const\s+)_?\w*[Ss]tatus\w*\s*[=:]/g,
    // window.ApprovalModule._status or similar
    /window\.\w+\._?\w*[Ss]tatus\w*/g,
    // var approvalStatus = ... (JSP data injection pattern)
    /(?:var|let|const)\s+\w*[Aa]pproval\w*\s*=\s*['"<]/g,
  ],

  'JSP-inline': [
    // <script>var xxx = '<%= serverVar %>'</script>
    /(?:var|let|const)\s+\w+\s*=\s*['"]\s*<%[=@]/g,
    // JSP expression inside script block
    /<%[=@]\s*[\w.]+(?:\([^)]*\))?\s*%>/g,
    // window.$page.xxx = ... data injection
    /window\.\$page\s*=\s*\{/g,
    /window\.\$page\s*\.\s*\w+\s*=\s*\{/g,
  ],
};

// ── Helpers ──

function isTargetFile(filePath) {
  const ext = extname(filePath);
  // .inc.jsp files
  if (filePath.endsWith('.inc.jsp')) return true;
  return TARGET_EXTENSIONS.includes(ext);
}

function* walkDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      yield* walkDir(fullPath);
    } else if (entry.isFile() && isTargetFile(fullPath)) {
      yield fullPath;
    }
  }
}

function scanFile(filePath, patterns) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const findings = [];

  for (const [type, regexList] of Object.entries(patterns)) {
    for (const regex of regexList) {
      // Reset regex state (global flag)
      regex.lastIndex = 0;

      // Scan line by line for accurate line numbers
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(line)) !== null) {
          // Check if the match involves status keywords
          const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 2)).join('\n');
          const hasStatusKeyword = STATUS_KEYWORDS.some(
            kw => context.toLowerCase().includes(kw.toLowerCase()),
          );

          if (hasStatusKeyword || type === 'JSP-inline') {
            findings.push({
              file: basename(filePath),
              line: i + 1,
              type,
              snippet: line.trim().substring(0, 120),
            });
          }

          // Prevent infinite loop on zero-length matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      }
    }
  }

  return findings;
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/scan-baseline.js <target-dir> [--concept <name>]');
    process.exit(1);
  }

  const targetDir = resolve(args[0]);
  const conceptIdx = args.indexOf('--concept');
  const concept = conceptIdx !== -1 ? args[conceptIdx + 1] : 'approvalStatus';

  if (!statSync(targetDir).isDirectory()) {
    console.error(`Error: ${targetDir} is not a directory`);
    process.exit(1);
  }

  console.error(`Scanning: ${targetDir}`);
  console.error(`Concept: ${concept}`);

  // Collect all target files
  const files = [...walkDir(targetDir)];
  console.error(`Found ${files.length} target files`);

  // Scan each file
  const allFindings = [];
  for (const file of files) {
    const findings = scanFile(file, PATTERNS);
    allFindings.push(...findings.map(f => ({ ...f, file: relative(targetDir, file) })));
  }

  // Deduplicate by file + line + type
  const seen = new Set();
  const deduped = allFindings.filter(f => {
    const key = `${f.file}:${f.line}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Aggregate
  const byType = {};
  const byFile = {};
  for (const f of deduped) {
    byType[f.type] = (byType[f.type] || 0) + 1;
    byFile[f.file] = (byFile[f.file] || 0) + 1;
  }

  const report = {
    concept,
    scanTime: new Date().toISOString(),
    targetDir: relative(process.cwd(), targetDir),
    totalCopies: deduped.length,
    filesScanned: files.length,
    filesInvolved: Object.keys(byFile).length,
    byType,
    byFile,
    copies: deduped,
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
