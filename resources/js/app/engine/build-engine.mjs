// Builds a classic-script bundle from the ES-module engine sources.
//
// The host application loads plain <script> tags, so the module graph has to be
// flattened into one file. The transformation is mechanical:
//   - `import { a, b } from './x.js';`   -> dropped (everything ends up in one scope)
//   - `export function foo`             -> `function foo`
//   - `export const foo`                -> `const foo`
//   - `export { ... } from './x.js';`   -> dropped (already defined)
//
// The result is wrapped in an IIFE that publishes one object on `window`, so the
// 48 top-level names never leak into the global scope.
//
// Run: node build-engine.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'cut-engine');
const OUT = join(HERE, 'cut-engine.bundle.js');

// Dependency order: a module may only use names defined above it.
const ORDER = [
  'geometry.js',
  'formats.js',
  'offcuts.js',
  'verify.js',
  'waste.js',
  'pack-blocks.js',
  'pack-mixed.js',
  'pack-offcuts.js',
  'pack-strips.js',
  'solve.js',
  'index.js',
];

/** Verifies that every source file is listed in ORDER, so nothing is silently dropped. */
function checkCoverage() {
  const onDisk = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
  const listed = ORDER.slice().sort();
  const missing = onDisk.filter((f) => !listed.includes(f));
  const extra = listed.filter((f) => !onDisk.includes(f));
  if (missing.length > 0) throw new Error('not in ORDER: ' + missing.join(', '));
  if (extra.length > 0) throw new Error('ORDER lists a missing file: ' + extra.join(', '));
}

/**
 * Strips the module syntax from one source file.
 *
 * @param {string} text
 * @param {string} file  used in error messages
 */
function flatten(text, file) {
  let out = text;

  // `export { a, b } from './x.js';` and `export { a, b };` carry no definition.
  out = out.replace(/^export\s*\{[^}]*\}\s*(?:from\s*'[^']*';?)?\s*$/gm, '');

  // Named imports: everything lives in one scope, so the binding already exists.
  out = out.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']*';?\s*$/gm, '');

  // Default imports and any other import form must not appear; the engine has none.
  const leftoverImport = out.match(/^import\s.*$/m);
  if (leftoverImport) {
    throw new Error(file + ': unsupported import form -> ' + leftoverImport[0].trim());
  }

  // Definitions become plain declarations.
  out = out.replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '');

  const leftoverExport = out.match(/^export\s.*$/m);
  if (leftoverExport) {
    throw new Error(file + ': unsupported export form -> ' + leftoverExport[0].trim());
  }

  return out.trimEnd();
}

/** Collects the public surface: every top-level name marked `export` in index.js. */
function publicSurface() {
  const index = readFileSync(join(SRC, 'index.js'), 'utf8');
  const names = [];
  for (const m of index.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.push(m[1]);
  for (const m of index.matchAll(/^export\s+const\s+(\w+)/gm)) names.push(m[1]);
  for (const m of index.matchAll(/^export\s*\{([^}]*)\}\s*from/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.push(name);
    }
  }
  if (names.length === 0) throw new Error('index.js exports nothing - the bundle would be empty');
  return [...new Set(names)];
}

checkCoverage();

const exportsList = publicSurface();
const chunks = [];

chunks.push('// GENERATED FILE - do not edit. Run `node build-engine.mjs` in this folder.');
chunks.push('// Source: cut-engine/*.js (ES modules) flattened for classic <script> loading.');
chunks.push('(function (global) {');
chunks.push("  'use strict';");

for (const file of ORDER) {
  chunks.push('');
  chunks.push('  // ' + '-'.repeat(72));
  chunks.push('  // ' + file);
  chunks.push('  // ' + '-'.repeat(72));
  const body = flatten(readFileSync(join(SRC, file), 'utf8'), file);
  for (const line of body.split(/\r?\n/)) {
    chunks.push(line.length > 0 ? '  ' + line : '');
  }
}

chunks.push('');
chunks.push('  // ' + '-'.repeat(72));
chunks.push('  // public surface');
chunks.push('  // ' + '-'.repeat(72));
chunks.push('  global.CutEngine = {');
for (const name of exportsList) chunks.push('    ' + name + ',');
chunks.push('  };');
chunks.push("})(typeof window !== 'undefined' ? window : globalThis);");

const bundle = chunks.join('\n') + '\n';
writeFileSync(OUT, bundle, 'utf8');

console.log('bundle written : ' + OUT.split(/[\\/]/).pop());
console.log('modules        : ' + ORDER.length);
console.log('public names   : ' + exportsList.join(', '));
console.log('size           : ' + (bundle.length / 1024).toFixed(1) + ' kB');
