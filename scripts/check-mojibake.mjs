#!/usr/bin/env node
/**
 * Mojibake detector — blocks commits containing UTF-8 corruption bytes.
 *
 * Detects:
 *   - 0xC3 0xA2 = "â" (UTF-8 layer 1 mojibake prefix)
 *   - 0xC3 0x83 0xC2 0xA2 = "Ã¢" (double-encoded layer 2 mojibake)
 *   - &#8212; / &mdash; (HTML em-dash entities used in plain text)
 *   - &#8211; / &ndash; (HTML en-dash entities)
 *
 * Skipped:
 *   - Comment-only mojibake (// ... lines)
 *   - Placeholder UI strings '—' / "—" used for null/empty values
 *
 * Usage:
 *   node scripts/check-mojibake.mjs                  # scan all relevant files
 *   node scripts/check-mojibake.mjs file1 file2 ...  # scan only specific files
 *   npm run check-mojibake                           # ad-hoc audit
 *
 * Exit code 0 = clean. Exit code 1 = mojibake found.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const ALLOWED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".md", ".css"];

const MOJIBAKE_BYTE_PATTERNS = [
  { bytes: [0xC3, 0x83, 0xC2, 0xA2], description: 'Layer 2 mojibake "Ã¢" (double-encoded)' },
  { bytes: [0xC3, 0xA2], description: 'Layer 1 mojibake "â" (single-encoded)' },
];

const HTML_ENTITY_PATTERNS = [
  { entity: "&#8212;", description: "HTML em-dash entity (use - instead)" },
  { entity: "&mdash;", description: "HTML em-dash entity (use - instead)" },
  { entity: "&#8211;", description: "HTML en-dash entity (use - instead)" },
  { entity: "&ndash;", description: "HTML en-dash entity (use - instead)" },
];

function getFilesToCheck() {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;

  // Default: scan everything under src/, supabase/, public/, scripts/
  const dirs = ["src", "supabase", "public", "scripts"];
  const files = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const result = execSync(`git ls-files "${dir}"`, { encoding: "utf8" });
      result.split("\n").forEach((f) => {
        if (f && ALLOWED_EXTENSIONS.includes(path.extname(f))) files.push(f);
      });
    } catch {
      // ignore
    }
  }
  return files;
}

function checkBytePatterns(bytes) {
  const findings = [];
  for (const pattern of MOJIBAKE_BYTE_PATTERNS) {
    for (let i = 0; i <= bytes.length - pattern.bytes.length; i++) {
      let match = true;
      for (let j = 0; j < pattern.bytes.length; j++) {
        if (bytes[i + j] !== pattern.bytes[j]) { match = false; break; }
      }
      if (match) {
        findings.push({ offset: i, description: pattern.description, type: "byte" });
        i += pattern.bytes.length - 1;
      }
    }
  }
  return findings;
}

function checkHtmlEntities(text) {
  const findings = [];
  for (const pattern of HTML_ENTITY_PATTERNS) {
    let idx = text.indexOf(pattern.entity);
    while (idx !== -1) {
      findings.push({ offset: idx, description: pattern.description, type: "entity" });
      idx = text.indexOf(pattern.entity, idx + 1);
    }
  }
  return findings;
}

function getLineFromOffset(text, offset) {
  return text.substring(0, offset).split("\n").length;
}

function isInComment(text, offset) {
  // Check if offset is inside a // comment by walking back to find newline
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const beforeOffset = text.substring(lineStart, offset);
  // If "//" appears before the offset and no */ between, it's a comment
  const commentIdx = beforeOffset.indexOf("//");
  if (commentIdx !== -1) return true;
  // Block comments are harder to detect reliably; skip for now
  return false;
}

function isPlaceholderEmDash(text, offset) {
  // Pattern: '—' or "—" or `—` as standalone placeholder
  // The byte sequence we look for is multi-byte but offset points to first byte
  // Real placeholders appear in patterns like ?? '—' / || '—' / : '—'
  const surrounding = text.substring(Math.max(0, offset - 6), Math.min(text.length, offset + 10));
  if (/['"`]—['"`]/.test(surrounding)) return true;
  return false;
}

function checkFile(filepath) {
  if (!existsSync(filepath)) return [];
  if (!ALLOWED_EXTENSIONS.includes(path.extname(filepath))) return [];

  const buffer = readFileSync(filepath);
  const bytes = Array.from(buffer);
  const text = buffer.toString("utf8");

  const byteFindings = checkBytePatterns(bytes);
  const entityFindings = checkHtmlEntities(text);

  return [...byteFindings, ...entityFindings]
    .map((f) => ({ ...f, line: getLineFromOffset(text, f.offset), filepath }))
    .filter((f) => {
      if (f.type === "byte" && isInComment(text, f.offset)) return false;
      if (f.type === "byte" && isPlaceholderEmDash(text, f.offset)) return false;
      return true;
    });
}

function main() {
  const files = getFilesToCheck();
  const allFindings = [];

  for (const file of files) {
    const findings = checkFile(file);
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) {
    console.log("\u2705  No mojibake found in scanned files.");
    process.exit(0);
  }

  console.error("\n\u274c  MOJIBAKE DETECTED — commit blocked.\n");
  console.error("The following corrupted byte sequences or HTML entities were found:\n");

  const byFile = {};
  for (const f of allFindings) {
    if (!byFile[f.filepath]) byFile[f.filepath] = [];
    byFile[f.filepath].push(f);
  }

  for (const [file, findings] of Object.entries(byFile)) {
    console.error(`  ${file}`);
    for (const f of findings) {
      console.error(`    Line ${f.line}: ${f.description}`);
    }
    console.error("");
  }

  console.error("WHY THIS FAILED:");
  console.error("  Mojibake = bytes that LOOK like garbage when rendered.");
  console.error("  Common cause: copying text from Word/Google Docs/Slack into code");
  console.error("  introduces curly quotes or em-dashes that get corrupted in transit.");
  console.error("");
  console.error("HOW TO FIX:");
  console.error("  1. Open each file above and find the offending lines.");
  console.error("  2. Replace mojibake characters with plain ASCII hyphens (-) or straight quotes.");
  console.error("  3. Re-stage your changes: git add <files>");
  console.error("  4. Retry your commit.");
  console.error("");
  console.error("If you need to bypass this check (NOT RECOMMENDED), use:");
  console.error("  git commit --no-verify");
  console.error("");

  process.exit(1);
}

main();
