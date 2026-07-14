/*
 * test_engine.mjs — Тестов скрипт за Optimizer.js
 * 
 * Зарежда примерния kitchen_project.json от d_port/,
 * стартира Optimizer-а и извежда резултата в конзолата.
 *
 * Използване:
 *   node test_engine.mjs
 *
 * Бележка: Този тест НЕ използва Neutralino API, за да може да се
 * стартира директно с Node.js без компилация.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Part } from './app/src/model/Part.js';
import { Optimizer } from './app/src/engine/Optimizer.js';

// Помощна функция за парсване на числови стойности
function parseNumericValue(val) {
    if (typeof val === 'string') {
        return parseInt(val, 10);
    }
    return val;
}

// Определяне на текущата директория
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function main() {
    // 1. Зареждане на JSON
    const jsonPath = path.join(__dirname, 'd_port', 'kitchen_project.json');

    if (!fs.existsSync(jsonPath)) {
        console.error('Error: JSON file not found at', jsonPath);
        process.exit(1);
    }

    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(rawData);

    const sheetW = parseNumericValue(data.sheetW);
    const sheetH = parseNumericValue(data.sheetH);
    const kerf = parseNumericValue(data.kerf);

    console.log('=== CutOptimizer Engine Test ===');
    console.log('Sheet size: ' + sheetW + ' x ' + sheetH + ' mm');
    console.log('Kerf: ' + kerf + ' mm');
    console.log('');

    // 2. Парсване на частите
    const parts = [];
    for (let i = 0; i < data.parts.length; i++) {
        const p = data.parts[i];
        const part = new Part(
            p.n,
            parseNumericValue(p.w),
            parseNumericValue(p.h),
            parseNumericValue(p.r) === 1
        );
        parts.push(part);
    }

    console.log('Parts loaded: ' + parts.length);
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const rotStr = p.canRotate ? '[R]' : '   ';
        console.log('  ' + (i + 1) + '. ' + p.name.padEnd(20) + ' ' +
            p.w.toString().padStart(5) + ' x ' + p.h.toString().padStart(4) + '  ' + rotStr);
    }
    console.log('');

    // 3. Създаване на Optimizer
    const optimizer = new Optimizer(sheetW, sheetH, kerf);

    // 4. Стартиране на оптимизация
    const iterations = 50;    // Достатъчно за тест
    const beamWidth = 12;     // Същото като D кода

    console.log('Running optimization (' + iterations + ' iterations, beamWidth=' + beamWidth + ')...');
    console.time('optimization');

    const layout = optimizer.optimize(parts, iterations, beamWidth);

    console.timeEnd('optimization');
    console.log('');

    // 5. Извеждане на резултата
    console.log('=== Results ===');
    console.log('Sheets used: ' + layout.sheets.length);
    console.log('Score: ' + layout.score.toFixed(2));
    console.log('');

    let totalPartsCount = 0;
    let totalEfficiency = 0;

    for (let si = 0; si < layout.sheets.length; si++) {
        const sheet = layout.sheets[si];
        totalPartsCount += sheet.parts.length;
        totalEfficiency += sheet.efficiency;

        console.log('Sheet ' + (si + 1) + ': efficiency=' + sheet.efficiency.toFixed(2) + '%  ' +
            'parts=' + sheet.parts.length + '  ' +
            'freeRects=' + sheet.freeRects.length);

        for (let pi = 0; pi < sheet.parts.length; pi++) {
            const p = sheet.parts[pi];
            const rotStr = p.rotated ? ' [R]' : '    ';
            console.log('  ' + (pi + 1) + '. ' + p.name.padEnd(20) + ' ' +
                'x=' + p.x.toString().padStart(5) + ' y=' + p.y.toString().padStart(5) + ' ' +
                p.w.toString().padStart(5) + ' x ' + p.h.toString().padStart(4) + rotStr);
        }
        console.log('');
    }

    const avgEfficiency = layout.sheets.length > 0
        ? (totalEfficiency / layout.sheets.length)
        : 0;

    console.log('--- Summary ---');
    console.log('Sheets: ' + layout.sheets.length);
    console.log('Parts placed: ' + totalPartsCount);
    console.log('Average efficiency: ' + avgEfficiency.toFixed(2) + '%');
    console.log('Score: ' + layout.score.toFixed(2));
    console.log('=== End ===');
}

main();