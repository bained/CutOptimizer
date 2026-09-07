/*
 * Phase 0 baseline benchmark for the runtime JavaScript engine.
 * Uses javascript/last_project.json and the same non-module files loaded by
 * resources/index.html. No UI, Neutralino, or SVG rendering is involved.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const root = path.dirname(__filename);
const projectPath = path.join(root, 'last_project.json');
const runtimeRoot = path.join(root, 'resources', 'js', 'app');

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadRuntimeEngine() {
    const files = [
        path.join(runtimeRoot, 'model', 'Rect.js'),
        path.join(runtimeRoot, 'model', 'Part.js'),
        path.join(runtimeRoot, 'model', 'Sheet.js'),
        path.join(runtimeRoot, 'engine', 'Optimizer.js')
    ];

    let source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
    source += '\nthis.__engine = { Rect, Part, Sheet, PlacedPart, Optimizer };\n';

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
            parts.push(new Part(
                item.n,
                number(item.w),
                number(item.h),
                number(item.r) === 1,
                quantity,
                item.e
            ));
        }
    }
    return parts;
}

function validateLayout(layout, expectedParts, sheetW, sheetH, kerf) {
    const placed = [];
    for (const sheet of layout.sheets) {
        if (sheet.w !== sheetW || sheet.h !== sheetH) {
            throw new Error('Sheet dimensions do not match input');
        }

        for (const part of sheet.parts) {
            if (part.x < 0 || part.y < 0 || part.x + part.w > sheetW || part.y + part.h > sheetH) {
                throw new Error(`Part is outside sheet: ${part.name}`);
            }
            for (const other of placed) {
                if (other.sheet !== sheet ||
                    part.x >= other.part.x + other.part.w + kerf ||
                    other.part.x >= part.x + part.w + kerf ||
                    part.y >= other.part.y + other.part.h + kerf ||
                    other.part.y >= part.y + part.h + kerf) {
                    continue;
                }
                throw new Error(`Parts overlap: ${part.name} and ${other.part.name}`);
            }
            placed.push({ sheet, part });
        }
    }

    if (placed.length !== expectedParts) {
        throw new Error(`Placed ${placed.length} of ${expectedParts} parts`);
    }
}

function summarize(layout, elapsedMs, expectedParts) {
    let placedParts = 0;
    let efficiency = 0;
    for (const sheet of layout.sheets) {
        placedParts += sheet.parts.length;
        efficiency += sheet.efficiency;
    }
    return {
        elapsedMs,
        sheets: layout.sheets.length,
        placedParts,
        expectedParts,
        averageEfficiency: layout.sheets.length ? efficiency / layout.sheets.length : 0,
        score: layout.score
    };
}

async function run() {
    const data = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const { Part, Optimizer } = loadRuntimeEngine();
    const sheetW = number(data.sheet.sheetW);
    const sheetH = number(data.sheet.sheetH);
    const kerf = number(data.sheet.kerf);
    const parts = loadParts(Part, data);
    const iterations = Number.parseInt(process.env.CUTOPT_ITERATIONS || '50', 10);
    const beamWidth = Number.parseInt(process.env.CUTOPT_BEAM_WIDTH || '12', 10);
    const warmups = Number.parseInt(process.env.CUTOPT_WARMUPS || '2', 10);
    const repeats = Number.parseInt(process.env.CUTOPT_REPEATS || '5', 10);
    const instrument = process.env.CUTOPT_INSTRUMENT === '1';
    const noYield = process.env.CUTOPT_NO_YIELD === '1';

    const makeOptimizer = () => {
        const optimizer = new Optimizer(sheetW, sheetH, kerf);
        optimizer.yieldBetweenIterations = !noYield;
        if (instrument) optimizer.enableInstrumentation(true);
        return optimizer;
    };
    for (let i = 0; i < warmups; i++) {
        await makeOptimizer().optimize(parts, iterations, beamWidth, false);
    }

    const runs = [];
    for (let i = 0; i < repeats; i++) {
        const optimizer = makeOptimizer();
        const start = performance.now();
        const layout = await optimizer.optimize(parts, iterations, beamWidth, false);
        const elapsedMs = performance.now() - start;
        validateLayout(layout, parts.length, sheetW, sheetH, kerf);
        const summary = summarize(layout, elapsedMs, parts.length);
        summary.memory = process.memoryUsage();
        if (instrument) summary.instrumentation = optimizer.getInstrumentation();
        runs.push(summary);
    }

    const sortedTimes = runs.map(run => run.elapsedMs).sort((a, b) => a - b);
    const medianMs = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const result = {
        phase: '0-baseline',
        input: path.relative(root, projectPath).replaceAll(path.sep, '/'),
        sheet: { sheetW, sheetH, kerf },
        compactPartTypes: data.parts.length,
        expandedParts: parts.length,
        iterations,
        beamWidth,
        randomize: false,
        instrumentation: instrument,
        yieldBetweenIterations: !noYield,
        warmups,
        repeats,
        runtimeEngine: 'javascript/resources/js/app/engine/Optimizer.js',
        runtimeEngineSha256: sha256(path.join(runtimeRoot, 'engine', 'Optimizer.js')),
        runs,
        medianMs,
        p95Ms: sortedTimes[Math.min(sortedTimes.length - 1, Math.ceil(sortedTimes.length * 0.95) - 1)]
    };

    console.log(JSON.stringify(result, null, 2));
}

run().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
