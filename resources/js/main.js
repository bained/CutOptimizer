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

// ===================== НАСТРОЙКИ (Settings) =====================

function toggleSettings() {
    var panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
}

function onQualityChange() {
    var quality = document.querySelector('input[name="quality"]:checked');
    if (!quality) return;

    var iterationsInput = document.getElementById('input-iterations');
    var beamWidthInput = document.getElementById('input-beam-width');

    switch (quality.value) {
        case 'fast':
            iterationsInput.value = 10;
            beamWidthInput.value = 6;
            break;
        case 'balanced':
            iterationsInput.value = 50;
            beamWidthInput.value = 12;
            break;
        case 'precise':
            iterationsInput.value = 200;
            beamWidthInput.value = 20;
            break;
    }
}

function getSettings() {
    var iterations = parseInt(document.getElementById('input-iterations').value, 10) || 50;
    var beamWidth = parseInt(document.getElementById('input-beam-width').value, 10) || 12;
    var seed = parseInt(document.getElementById('input-seed').value, 10) || 42;
    var randomize = document.getElementById('input-randomize').checked;

    return {
        iterations: iterations,
        beamWidth: beamWidth,
        seed: seed,
        randomize: randomize
    };
}

// ===================== ОПТИМИЗАЦИЯ =====================

async function runOptimization() {
    if (!projectManager) return;

    var btn = document.getElementById('btn-run');
    var statusText = document.getElementById('status-text');
    var progressContainer = document.getElementById('progress-container');
    var progressFill = document.getElementById('progress-fill');
    var progressText = document.getElementById('progress-text');

    // Взимаме настройките
    var settings = getSettings();

    btn.disabled = true;
    statusText.textContent = 'Оптимизация...';

    // Показваме прогреса
    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
        var startTime = performance.now();

        // Progress callback — обновява UI през setTimeout, за да не замръзва
        var summary = await projectManager.runOptimization(
            settings.iterations,
            settings.beamWidth,
            settings.randomize,
            function(current, total) {
                var pct = Math.round((current / total) * 100);
                progressFill.style.width = pct + '%';
                progressText.textContent = pct + '%';
            }
        );

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
        progressContainer.classList.add('hidden');
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

// ===================== LOAD / HELP =====================

async function onLoadParts() {
    try {
        var result = await Neutralino.os.showOpenDialog('Избери JSON с части', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });

        if (!result || result.length === 0) return;

        var filePath = result[0];
        console.log('Loading parts from:', filePath);

        var content = await Neutralino.filesystem.readFile(filePath);
        var data = JSON.parse(content);

        // Актуализираме само частите, запазваме sheet-а
        projectManager.parts = [];
        for (var i = 0; i < data.parts.length; i++) {
            var p = data.parts[i];
            projectManager.parts.push(new Part(
                p.n,
                projectManager.parseNumericValue(p.w),
                projectManager.parseNumericValue(p.h),
                projectManager.parseNumericValue(p.r) === 1
            ));
        }

        // Актуализираме дисплея
        document.getElementById('display-parts-count').textContent =
            projectManager.parts.length + ' части';
        document.getElementById('status-text').textContent =
            'Заредени ' + projectManager.parts.length + ' части';

    } catch (err) {
        console.error('Load parts error:', err);
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function onLoadSheet() {
    try {
        var result = await Neutralino.os.showOpenDialog('Избери JSON с лист', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });

        if (!result || result.length === 0) return;

        var filePath = result[0];
        console.log('Loading sheet from:', filePath);

        var content = await Neutralino.filesystem.readFile(filePath);
        var data = JSON.parse(content);

        // Актуализираме sheet параметрите, запазваме частите
        var sheetW = projectManager.parseNumericValue(data.sheetW);
        var sheetH = projectManager.parseNumericValue(data.sheetH);
        var kerf = projectManager.parseNumericValue(data.kerf);

        projectManager.sheetW = sheetW;
        projectManager.sheetH = sheetH;
        projectManager.kerf = kerf;
        projectManager.optimizer = new Optimizer(sheetW, sheetH, kerf);

        document.getElementById('display-sheet-size').textContent =
            sheetW + ' x ' + sheetH + ' mm';
        document.getElementById('display-kerf').textContent =
            kerf + ' mm';
        document.getElementById('status-text').textContent =
            'Листът е зареден: ' + sheetW + 'x' + sheetH;

    } catch (err) {
        console.error('Load sheet error:', err);
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

function onHelp() {
    var helpText = document.getElementById('help-text');
    helpText.classList.toggle('hidden');
}

// ===================== DOM СЪБИТИЯ =====================

document.addEventListener('DOMContentLoaded', function() {
    // Run button
    var btn = document.getElementById('btn-run');
    if (btn) {
        btn.addEventListener('click', runOptimization);
    }

    // Settings toggle
    var settingsBtn = document.getElementById('btn-settings-toggle');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', toggleSettings);
    }

    // Quality profile radio buttons
    var qualityRadios = document.querySelectorAll('input[name="quality"]');
    for (var i = 0; i < qualityRadios.length; i++) {
        qualityRadios[i].addEventListener('change', onQualityChange);
    }

    // Load parts button
    var loadPartsBtn = document.getElementById('btn-load-parts');
    if (loadPartsBtn) {
        loadPartsBtn.addEventListener('click', onLoadParts);
    }

    // Load sheet button
    var loadSheetBtn = document.getElementById('btn-load-sheet');
    if (loadSheetBtn) {
        loadSheetBtn.addEventListener('click', onLoadSheet);
    }

    // Help button
    var helpBtn = document.getElementById('btn-help');
    if (helpBtn) {
        helpBtn.addEventListener('click', onHelp);
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