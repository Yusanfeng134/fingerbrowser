#!/usr/bin/env node
/**
 * tokenize-css.mjs — Rewrite hex / rgba literals in styles.css to var(--token).
 *
 * Usage:
 *   node scripts/codemod/tokenize-css.mjs                 # dry run + summary
 *   node scripts/codemod/tokenize-css.mjs --report        # also write tokenize-report.md
 *   node scripts/codemod/tokenize-css.mjs --out=styles.tokenized.css
 *   node scripts/codemod/tokenize-css.mjs --write         # overwrite styles.css IN PLACE
 *
 * Scope of v0 (deliberately narrow):
 *   - Replaces only hex colors and rgba(...) values that have an exact mapping.
 *   - Does NOT touch font-size, font-weight, spacing, radius, shadow, motion.
 *     Those carry far higher visual-regression risk and should be done in
 *     focused component-cleanup PRs with diff review.
 *   - Does NOT collapse near-duplicate colors (e.g. #176757 vs #1f7a6b are
 *     mapped to different tokens, not merged). Visual merging is a separate
 *     design decision; this script preserves intent.
 *   - Does NOT parse CSS structurally. String ops only. Adequate for the
 *     project's flat, comment-light CSS. If you need property-scoped replacement
 *     or comment-skipping, swap in postcss (~100 LOC change).
 *
 * Workflow:
 *   1. node scripts/codemod/tokenize-css.mjs --report
 *      → review tokenize-report.md for unmapped colors. Decide whether to:
 *        (a) extend the mapping tables below, or
 *        (b) leave as literal (one-off colors, gradient stops, etc.)
 *   2. node scripts/codemod/tokenize-css.mjs --out=styles.tokenized.css
 *      → diff against styles.css, sanity-check the renderer visually
 *   3. node scripts/codemod/tokenize-css.mjs --write
 *      → apply in place. Commit. Run dev build.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const CSS_PATH = resolve(ROOT, 'src/renderer/src/styles.css');

/* ============================================================================
 * HEX MAPPING
 * Keys are lowercase, full 6-digit. The script normalizes inputs before lookup.
 * Order is informational only; first match wins.
 * ========================================================================== */
const colorMap = new Map([
  // Brand greens
  ['#1f7a6b', 'var(--color-primary)'],
  ['#176757', 'var(--color-primary-hover)'],
  ['#143f39', 'var(--green-700)'],
  ['#183c36', 'var(--green-800)'],
  ['#173f37', 'var(--green-700)'],   // visually identical to #143f39
  ['#39534f', 'var(--green-700)'],

  // Text neutrals
  ['#202522', 'var(--color-text-primary)'],
  ['#29312c', 'var(--neutral-800)'],
  ['#2d3330', 'var(--neutral-800)'],
  ['#3a403b', 'var(--color-text-secondary)'],
  ['#59615b', 'var(--color-text-muted)'],
  ['#59645d', 'var(--color-text-muted)'],
  ['#626962', 'var(--color-text-muted)'],
  ['#6a7068', 'var(--neutral-500)'],
  ['#6d726b', 'var(--neutral-500)'],
  ['#6d746e', 'var(--neutral-500)'],
  ['#737b75', 'var(--neutral-500)'],
  ['#73776f', 'var(--neutral-500)'],
  ['#85887f', 'var(--neutral-500)'],   // NOTE: low contrast as text; flag for review

  // Surface neutrals
  ['#ffffff', 'var(--color-bg-elevated)'],
  ['#fff',    'var(--color-bg-elevated)'],
  ['#fbfcfa', 'var(--color-bg-subtle)'],
  ['#fcfdfc', 'var(--color-bg-subtle)'],
  ['#f8faf7', 'var(--color-bg-base)'],
  ['#f8fffd', 'var(--color-bg-subtle)'],
  ['#f7f9f7', 'var(--color-bg-base)'],
  ['#f6f8f5', 'var(--color-bg-base)'],
  ['#f4f7f2', 'var(--green-50)'],
  ['#f0eee8', 'var(--color-bg-sunken)'],
  ['#edf1ec', 'var(--green-100)'],
  ['#ece8df', 'var(--color-bg-sunken)'],
  ['#e4e8e2', 'var(--color-border-subtle)'],
  ['#e3e8e1', 'var(--color-border-subtle)'],
  ['#e1e6df', 'var(--color-border-subtle)'],
  ['#dfe6de', 'var(--color-border-subtle)'],
  ['#d9e0d8', 'var(--green-200)'],
  ['#d5ddd5', 'var(--color-border-default)'],

  // Amber (warning)
  ['#c88425', 'var(--color-warning-fg)'],
  ['#875514', 'var(--amber-800)'],
  ['#7b4d12', 'var(--amber-800)'],
  ['#fff8eb', 'var(--color-warning-bg)'],
  ['#fff0d3', 'var(--amber-100)'],
  ['#fff1d8', 'var(--amber-100)'],
  ['#fff9ed', 'var(--amber-50)'],
  ['#f4c84f', 'var(--amber-300)'],
  ['#ffe174', 'var(--amber-300)'],

  // Brick (danger)
  ['#9b3f24', 'var(--color-danger-fg)'],
  ['#8e2f25', 'var(--brick-800)'],
  ['#f5dfd2', 'var(--color-danger-border)'],
  ['#fff5f2', 'var(--color-danger-bg)'],
  ['#fff0ed', 'var(--color-danger-bg)'],
  ['#fff3ed', 'var(--color-danger-bg)'],
  ['#ff7b8f', 'var(--brick-600)'],
]);

/* ============================================================================
 * RGBA MAPPING
 * Keys are normalized (no whitespace, lowercase, leading-zero opacity).
 * Use normalizeRgba() to derive a lookup key from a raw match.
 * ========================================================================== */
const rgbaMap = new Map([
  // Primary green tints — these dominate the file (57 occurrences)
  ['rgba(31,122,107,0.08)',   'var(--color-bg-hover)'],
  ['rgba(31,122,107,0.10)',   'var(--color-primary-subtle)'],
  ['rgba(31,122,107,0.11)',   'var(--color-primary-subtle)'],
  ['rgba(31,122,107,0.12)',   'var(--color-bg-selected)'],
  ['rgba(31,122,107,0.14)',   'var(--color-bg-selected)'],
  ['rgba(31,122,107,0.16)',   'var(--color-bg-selected)'],
  ['rgba(31,122,107,0.20)',   'var(--color-success-border)'],
  ['rgba(31,122,107,0.22)',   'var(--color-success-border)'],
  ['rgba(31,122,107,0.24)',   'var(--color-success-border)'],
  ['rgba(31,122,107,0.28)',   'var(--color-success-border)'],
  ['rgba(31,122,107,0.42)',   'var(--green-400)'],
  ['rgba(31,122,107,0.62)',   'var(--green-500)'],

  // White overlays — five opacities → one token (visually identical in use)
  ['rgba(255,255,255,0.00)',  'transparent'],
  ['rgba(255,255,255,0.62)',  'var(--color-bg-overlay)'],
  ['rgba(255,255,255,0.64)',  'var(--color-bg-overlay)'],
  ['rgba(255,255,255,0.66)',  'var(--color-bg-overlay)'],
  ['rgba(255,255,255,0.70)',  'var(--color-bg-overlay)'],
  ['rgba(255,255,255,0.72)',  'var(--color-bg-overlay)'],
  ['rgba(255,255,255,0.76)',  'var(--color-bg-overlay)'],

  // Amber tint (used for warning ring backgrounds)
  ['rgba(200,132,37,0.34)',   'var(--color-warning-border)'],
  ['rgba(200,132,37,0.14)',   'var(--color-warning-border)'],

  // Shadow-tint rgba values are deliberately NOT mapped — they only appear
  // inside box-shadow declarations, which the shadow-token migration handles
  // as a whole. Leaving them as literals avoids partial replacements that
  // would visually drift from the new --shadow-* tokens.
]);

/* ============================================================================
 * NORMALIZATION HELPERS
 * ========================================================================== */
function normalizeHex(value) {
  let v = value.toLowerCase();
  if (v.length === 4) {
    // #rgb → #rrggbb
    v = '#' + v[1].repeat(2) + v[2].repeat(2) + v[3].repeat(2);
  }
  return v;
}

function normalizeRgba(str) {
  // 1. lowercase, 2. strip whitespace, 3. add leading zero to opacity,
  // 4. pad opacity to 2 decimals so 0.1 == 0.10
  let v = str.toLowerCase().replace(/\s+/g, '');
  v = v.replace(/,(\.)/g, ',0$1');
  // pad opacity (last numeric before closing paren) to two decimals
  v = v.replace(/(0\.\d)(?=\))/, '$10');
  return v;
}

/* ============================================================================
 * CORE
 * ========================================================================== */
function rewriteLine(line, stats, lineNum) {
  // Replace hex
  line = line.replace(/#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|#[0-9a-fA-F]{6}\b/g, (m) => {
    const normalized = normalizeHex(m);
    const token = colorMap.get(normalized);
    if (token) {
      stats.hexReplaced++;
      return token;
    }
    const list = stats.hexUnmapped.get(normalized) ?? [];
    list.push(lineNum);
    stats.hexUnmapped.set(normalized, list);
    return m;
  });

  // Replace rgba
  line = line.replace(/rgba\([^)]+\)/gi, (m) => {
    const normalized = normalizeRgba(m);
    const token = rgbaMap.get(normalized);
    if (token) {
      stats.rgbaReplaced++;
      return token;
    }
    const list = stats.rgbaUnmapped.get(normalized) ?? [];
    list.push(lineNum);
    stats.rgbaUnmapped.set(normalized, list);
    return m;
  });

  return line;
}

function writeReport(stats) {
  const lines = [];
  lines.push('# Tokenization report');
  lines.push('');
  lines.push(`Replaced: ${stats.hexReplaced} hex + ${stats.rgbaReplaced} rgba`);
  lines.push(`Unmapped: ${stats.hexUnmapped.size} unique hex + ${stats.rgbaUnmapped.size} unique rgba`);
  lines.push('');
  lines.push('## Unmapped hex (sorted by frequency)');
  lines.push('');
  const hex = [...stats.hexUnmapped].sort((a, b) => b[1].length - a[1].length);
  for (const [value, occ] of hex) {
    const sample = occ.slice(0, 6).join(', ') + (occ.length > 6 ? `, …+${occ.length - 6}` : '');
    lines.push(`- \`${value}\` × ${occ.length}  (lines ${sample})`);
  }
  lines.push('');
  lines.push('## Unmapped rgba (sorted by frequency)');
  lines.push('');
  const rgba = [...stats.rgbaUnmapped].sort((a, b) => b[1].length - a[1].length);
  for (const [value, occ] of rgba) {
    const sample = occ.slice(0, 6).join(', ') + (occ.length > 6 ? `, …+${occ.length - 6}` : '');
    lines.push(`- \`${value}\` × ${occ.length}  (lines ${sample})`);
  }
  lines.push('');
  lines.push('## Next steps');
  lines.push('');
  lines.push('For each unmapped value, decide:');
  lines.push('- **Extend mapping** if it represents a semantic role (add to colorMap/rgbaMap in this script).');
  lines.push('- **Leave literal** if it is a one-off (gradient stop, decorative tint).');
  lines.push('- **Merge upstream** if it is a near-duplicate of an existing token — edit styles.css to use the canonical value, then re-run.');
  return lines.join('\n');
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
  const reportArg = process.argv.slice(2).find((a) => a.startsWith('--report='));

  const src = await readFile(CSS_PATH, 'utf8');
  const lines = src.split('\n');

  const stats = {
    hexReplaced: 0,
    rgbaReplaced: 0,
    hexUnmapped: new Map(),
    rgbaUnmapped: new Map(),
  };

  const out = lines.map((line, i) => rewriteLine(line, stats, i + 1));
  const newCss = out.join('\n');

  let writePath = null;
  if (outArg) writePath = resolve(ROOT, outArg.slice('--out='.length));
  else if (args.has('--write')) writePath = CSS_PATH;

  if (writePath) {
    await writeFile(writePath, newCss, 'utf8');
    console.log(`✓ wrote ${writePath}`);
  } else {
    console.log('(dry run — pass --write or --out=<path> to persist)');
  }

  console.log('');
  console.log('Summary:');
  console.log(`  hex   replaced: ${String(stats.hexReplaced).padStart(4)}`);
  console.log(`  rgba  replaced: ${String(stats.rgbaReplaced).padStart(4)}`);
  console.log(`  hex   unmapped: ${String(stats.hexUnmapped.size).padStart(4)} unique`);
  console.log(`  rgba  unmapped: ${String(stats.rgbaUnmapped.size).padStart(4)} unique`);

  if (args.has('--report') || reportArg) {
    const reportPath = reportArg
      ? resolve(ROOT, reportArg.slice('--report='.length))
      : resolve(ROOT, 'tokenize-report.md');
    await writeFile(reportPath, writeReport(stats), 'utf8');
    console.log(`  report: ${reportPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
