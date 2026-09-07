/* Phase 1 source/runtime drift check. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pairs = [
    ['engine/Optimizer.js', 'engine/Optimizer.js'],
    ['model/Part.js', 'model/Part.js'],
    ['model/Rect.js', 'model/Rect.js'],
    ['model/Sheet.js', 'model/Sheet.js']
];

function hash(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const report = pairs.map(([sourceRelative, runtimeRelative]) => {
    const source = path.join(root, 'app', 'src', sourceRelative);
    const runtime = path.join(root, 'resources', 'js', 'app', runtimeRelative);
    const sourceHash = hash(source);
    const runtimeHash = hash(runtime);
    return {
        source: `app/src/${sourceRelative}`,
        runtime: `resources/js/app/${runtimeRelative}`,
        sourceSha256: sourceHash,
        runtimeSha256: runtimeHash,
        identical: sourceHash === runtimeHash
    };
});

const drift = report.filter(item => !item.identical);
console.log(JSON.stringify({
    phase: '1-runtime-source-check',
    sourceRoot: 'javascript/app/src',
    runtimeRoot: 'javascript/resources/js/app',
    pairs: report,
    driftCount: drift.length,
    status: drift.length === 0 ? 'synchronized' : 'drift-detected'
}, null, 2));
