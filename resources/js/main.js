'use strict';

/**
 * Main — входна точка на приложението.
 */

let projectManager = null;

// ===================== NEUTRALINO СЪБИТИЯ =====================

function onReady() {
    console.log('CutOptimizer: Neutralino ready.');

    Neutralino.events.on('windowClose', function() {
        console.log('Window close requested.');
        Neutralino.app.exit();
    });

    initApp();
}

// ===================== ИНИЦИАЛИЗАЦИЯ =====================

async function initApp() {
    try {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');
        document.getElementById('status-text').textContent = 'Зареждане на проекта...';

        // Използваме NL_PATH — глобална променлива, инжектирана от Neutralino
        // Тя сочи към директорията, от която е стартиран .exe файлът
        var basePath = (typeof NL_PATH !== 'undefined') ? NL_PATH : '';
        console.log('Detected base path:', basePath);

        projectManager = new ProjectManager(basePath + '/config.ini');
        var meta = await projectManager.loadProject(basePath + '/kitchen_project.json');

        document.getElementById('display-sheet-size').textContent =
            meta.sheetW + ' x ' + meta.sheetH + ' mm';
        document.getElementById('display-kerf').textContent =
            meta.kerf + ' mm';
        document.getElementById('display-parts-count').textContent =
            meta.partCount + ' части';

        document.getElementById('btn-run').disabled = false;
        document.getElementById('status-text').textContent = 'Проектът е зареден. Натисни "Стартирай"';

    } catch (err) {
        console.error('initApp error:', err);
        var statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = 'Грешка: ' + err.message;
        }
    }
}

// ===================== ОПТИМИЗАЦИЯ =====================

async function runOptimization() {
    if (!projectManager) return;

    var btn = document.getElementById('btn-run');
    var statusText = document.getElementById('status-text');

    btn.disabled = true;
    statusText.textContent = 'Оптимизация...';

    try {
        var startTime = performance.now();
        var summary = await projectManager.runOptimization();
        var elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

        document.getElementById('result-sheets').textContent = summary.sheetCount;
        document.getElementById('result-efficiency').textContent =
            summary.avgEfficiency.toFixed(2) + '%';
        document.getElementById('result-score').textContent =
            summary.score.toFixed(2);
        document.getElementById('result-placed').textContent =
            summary.totalPlacedParts + ' / ' + projectManager.parts.length;

        statusText.textContent = 'Готово за ' + elapsed + 's';

        var layout = projectManager.getLayout();
        if (layout) {
            renderSVG(layout);
        }
    } catch (err) {
        console.error('runOptimization error:', err);
        statusText.textContent = 'Грешка: ' + err.message;
    } finally {
        btn.disabled = false;
    }
}

// ===================== SVG ВИЗУАЛИЗАЦИЯ =====================

function renderSVG(layout) {
    var container = document.getElementById('svg-container');
    container.innerHTML = '';

    if (!layout || layout.sheets.length === 0) {
        container.innerHTML = '<p style="color:#5D6D7E;text-align:center;padding:40px;">Няма резултати</p>';
        return;
    }

    var sheetW = layout.sheets[0].w;
    var sheetH = layout.sheets[0].h;
    var gap = 80;
    var labelHeight = 30;
    var totalHeight = layout.sheets.length * (sheetH + gap + labelHeight);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" ' +
        'width="' + (sheetW + 40) + '" ' +
        'height="' + totalHeight + '" ' +
        'style="background:#ECF0F1;">';

    svg += '<style>' +
        '.part { fill: #2471A3; stroke: #fff; stroke-width: 1.5; }' +
        '.part-rotated { fill: #1E8449; stroke: #fff; stroke-width: 1.5; }' +
        '.label { font-family: sans-serif; font-size: 12px; fill: #fff; }' +
        '.sheet-label { font-family: sans-serif; font-size: 15px; font-weight: bold; fill: #2C3E50; }' +
        '</style>';

    for (var si = 0; si < layout.sheets.length; si++) {
        var sheet = layout.sheets[si];
        var offsetY = si * (sheetH + gap + labelHeight) + labelHeight;

        svg += '<text x="10" y="' + (offsetY - 10) + '" class="sheet-label">' +
            'Лист ' + (si + 1) + ' — Ефективност: ' + sheet.efficiency.toFixed(1) + '%' +
            '</text>';

        svg += '<rect x="0" y="' + offsetY + '" ' +
            'width="' + sheetW + '" height="' + sheetH + '" ' +
            'fill="#FFFFFF" stroke="#2C3E50" stroke-width="2"/>';

        for (var pi = 0; pi < sheet.parts.length; pi++) {
            var p = sheet.parts[pi];
            var cssClass = p.rotated ? 'part-rotated' : 'part';

            svg += '<rect x="' + p.x + '" y="' + (offsetY + p.y) + '" ' +
                'width="' + p.w + '" height="' + p.h + '" ' +
                'class="' + cssClass + '" rx="2"/>';

            if (p.w > 50 && p.h > 20) {
                svg += '<text x="' + (p.x + 4) + '" y="' + (offsetY + p.y + 15) + '" ' +
                    'class="label">' + p.name + (p.rotated ? ' [R]' : '') + '</text>';
            }
        }
    }

    svg += '</svg>';
    container.innerHTML = svg;
}

// ===================== DOM СЪБИТИЯ =====================

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('btn-run');
    if (btn) {
        btn.addEventListener('click', runOptimization);
    }
});

window.addEventListener('error', function(e) {
    console.error('Global error:', e.message);
    var statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = 'JS Грешка: ' + e.message;
    }
});

// ===================== NEUTRALINO СТАРТ =====================

Neutralino.events.on('ready', onReady);

try {
    Neutralino.init();
} catch (initErr) {
    console.error('Neutralino.init() failed:', initErr);
}