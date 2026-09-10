/*
 * Reference check for the split-result-picture task.
 * Captures the canonical layout contract before PNG/PDF changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const projectPath = path.join(root, 'last_project.json');
const runtimeRoot = path.join(root, 'resources', 'js', 'app');

function loadRuntimeEngine() {
    const files = [
        path.join(runtimeRoot, 'model', 'Rect.js'),
        path.join(runtimeRoot, 'model', 'Part.js'),
        path.join(runtimeRoot, 'model', 'Sheet.js'),
        path.join(runtimeRoot, 'engine', 'Optimizer.js')
    ];
    const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n') +
        '\nthis.__engine = { Part, Optimizer };\n';
    const context = vm.createContext({ console, setTimeout });
    vm.runInContext(source, context, { filename: 'runtime-engine.js' });
    return context.__engine;
}

function number(value) {
    return typeof value === 'string' ? Number.parseInt(value, 10) : value;
}

function loadParts(Part, data) {
    const parts = [];
    for (const item of data.parts) {
        const quantity = item.q === undefined ? 1 : number(item.q);
        for (let i = 0; i < quantity; i++) {
            parts.push(new Part(item.n, number(item.w), number(item.h),
                number(item.r) === 1, quantity, item.e));
        }
    }
    return parts;
}

function stableLayoutData(layout) {
    return layout.sheets.map((sheet, sheetIndex) => ({
        sheetIndex,
        width: sheet.w,
        height: sheet.h,
        efficiency: sheet.efficiency,
        parts: sheet.parts.map(part => ({
            name: part.name,
            x: part.x,
            y: part.y,
            w: part.w,
            h: part.h,
            rotated: !!part.rotated
        }))
    }));
}

const data = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const { Part, Optimizer } = loadRuntimeEngine();
const parts = loadParts(Part, data);
const optimizer = new Optimizer(number(data.sheet.sheetW), number(data.sheet.sheetH), number(data.sheet.kerf));
optimizer.yieldBetweenIterations = false;
const layout = await optimizer.optimize(parts, 50, 12, false);
const sheetData = stableLayoutData(layout);
const geometryHash = crypto.createHash('sha256')
    .update(JSON.stringify(sheetData))
    .digest('hex');

console.log(JSON.stringify({
    task: 'split-result-picture-reference',
    input: 'javascript/last_project.json',
    sheets: sheetData.map(sheet => ({
        sheetIndex: sheet.sheetIndex,
        width: sheet.width,
        height: sheet.height,
        svgViewBox: `0 0 ${sheet.width + 40} ${sheet.height + 110}`,
        svgWidth: sheet.width + 40,
        svgHeight: sheet.height + 110,
        parts: sheet.parts.length,
        efficiency: sheet.efficiency
    })),
    totalParts: sheetData.reduce((sum, sheet) => sum + sheet.parts.length, 0),
    score: layout.score,
    geometryHash,
    status: 'reference-captured'
}, null, 2));