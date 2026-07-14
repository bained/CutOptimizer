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

        refreshAllUI(meta);

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

// ===================== UI REFRESH =====================

function refreshAllUI(meta) {
    if (!meta && projectManager) {
        meta = {
            sheetW: projectManager.sheetW,
            sheetH: projectManager.sheetH,
            kerf: projectManager.kerf,
            partCount: projectManager.parts.length
        };
    }

    if (meta) {
        document.getElementById('display-sheet-size').textContent =
            meta.sheetW + ' x ' + meta.sheetH + ' mm';
        document.getElementById('display-kerf').textContent =
            meta.kerf + ' mm';
        document.getElementById('display-parts-count').textContent =
            meta.partCount + ' части';

        document.getElementById('input-sheet-w').value = meta.sheetW;
        document.getElementById('input-sheet-h').value = meta.sheetH;
        document.getElementById('input-sheet-kerf').value = meta.kerf;
    }

    refreshPartsTable();
}

function refreshPartsTable() {
    var tbody = document.getElementById('parts-table-body');
    var label = document.getElementById('parts-count-label');

    if (!tbody || !projectManager) return;

    tbody.innerHTML = '';
    var count = projectManager.parts.length;

    if (label) label.textContent = count;

    for (var i = 0; i < count; i++) {
        var p = projectManager.parts[i];
        var tr = document.createElement('tr');

        tr.innerHTML =
            '<td>' + (i + 1) + '</td>' +
            '<td><input type="text" class="edit-name" value="' + escapeHtml(p.name) + '"></td>' +
            '<td><input type="number" class="edit-w" value="' + p.w + '" min="1"></td>' +
            '<td><input type="number" class="edit-h" value="' + p.h + '" min="1"></td>' +
            '<td><input type="number" class="edit-qty" value="' + p.qty + '" min="1" max="999"></td>' +
            '<td><input type="number" class="edit-edges" value="' + p.getTotalEdges() + '" min="0" max="4"></td>' +
            '<td><input type="checkbox" class="edit-rot" ' + (p.canRotate ? 'checked' : '') + '></td>' +
            '<td><button class="btn-icon-small" data-index="' + i + '" title="Delete">✕</button></td>';

        tbody.appendChild(tr);

        var nameInput = tr.querySelector('.edit-name');
        var wInput = tr.querySelector('.edit-w');
        var hInput = tr.querySelector('.edit-h');
        var qtyInput = tr.querySelector('.edit-qty');
        var edgesInput = tr.querySelector('.edit-edges');
        var rotInput = tr.querySelector('.edit-rot');
        var delBtn = tr.querySelector('.btn-icon-small');

        function makeSaveHandler(idx, nameEl, wEl, hEl, qtyEl, edgesEl, rotEl) {
            return function() {
                try {
                    var edgesVal = parseInt(edgesEl.value, 10) || 0;
                    // Edges: записваме общия брой разпределен по подразбиране само отпред/отзад
                    var edgesArr = [0, 0, 0, 0];
                    if (edgesVal > 0) {
                        edgesArr[0] = Math.min(edgesVal, 1);
                        edgesArr[1] = Math.min(edgesVal, 1);
                        edgesArr[2] = Math.min(edgesVal, 1);
                        edgesArr[3] = Math.min(edgesVal, 1);
                    }
                    projectManager.updatePart(idx, nameEl.value,
                        parseInt(wEl.value, 10) || 0,
                        parseInt(hEl.value, 10) || 0,
                        rotEl.checked,
                        parseInt(qtyEl.value, 10) || 1,
                        edgesArr);
                    refreshPartsTable();
                } catch (err) {
                    document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
                }
            };
        }

        nameInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));
        wInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));
        hInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));
        qtyInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));
        edgesInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));
        rotInput.addEventListener('change', makeSaveHandler(i, nameInput, wInput, hInput, qtyInput, edgesInput, rotInput));

        delBtn.addEventListener('click', function() {
            var idx = parseInt(this.getAttribute('data-index'), 10);
            try {
                projectManager.removePart(idx);
                refreshPartsTable();
                refreshAllUI();
                document.getElementById('status-text').textContent = 'Частта е премахната';
            } catch (err) {
                document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
            }
        });
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// ===================== TABS =====================

function switchTab(tabName) {
    var tabs = document.querySelectorAll('.tab-content');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }

    var btns = document.querySelectorAll('.tab-btn');
    for (var j = 0; j < btns.length; j++) {
        btns[j].classList.remove('active');
    }

    var target = document.getElementById('tab-' + tabName);
    if (target) target.classList.add('active');

    var btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    if (btn) btn.classList.add('active');
}

// ===================== SETTINGS =====================

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

// ===================== DATA TAB HANDLERS =====================

function onSheetApply() {
    try {
        var w = parseInt(document.getElementById('input-sheet-w').value, 10) || 0;
        var h = parseInt(document.getElementById('input-sheet-h').value, 10) || 0;
        var kerf = parseInt(document.getElementById('input-sheet-kerf').value, 10) || 0;

        projectManager.updateSheet(w, h, kerf);
        refreshAllUI();
        document.getElementById('status-text').textContent = 'Sheet updated: ' + w + 'x' + h + ', kerf=' + kerf;
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

function onPartAdd() {
    try {
        var name = document.getElementById('input-part-name').value;
        var w = parseInt(document.getElementById('input-part-w').value, 10) || 0;
        var h = parseInt(document.getElementById('input-part-h').value, 10) || 0;
        var qty = parseInt(document.getElementById('input-part-qty').value, 10) || 1;
        var edgesVal = parseInt(document.getElementById('input-part-edges').value, 10) || 0;
        var rot = document.getElementById('input-part-rotate').checked;

        // Edges: разпределяме по подразбиране
        var edgesArr = [0, 0, 0, 0];
        if (edgesVal > 0) {
            edgesArr[0] = Math.min(edgesVal, 1);
            edgesArr[1] = Math.min(edgesVal, 1);
            edgesArr[2] = Math.min(edgesVal, 1);
            edgesArr[3] = Math.min(edgesVal, 1);
        }

        projectManager.addPart(name, w, h, rot, qty, edgesArr);

        document.getElementById('input-part-name').value = '';
        document.getElementById('input-part-w').value = '';
        document.getElementById('input-part-h').value = '';
        document.getElementById('input-part-qty').value = '1';
        document.getElementById('input-part-edges').value = '0';
        document.getElementById('input-part-rotate').checked = false;

        refreshPartsTable();
        refreshAllUI();
        document.getElementById('status-text').textContent = 'Част "' + name + '" е добавена';
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function onSheetImport() {
    try {
        var result = await Neutralino.os.showOpenDialog('Import Sheet JSON', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });
        if (!result || result.length === 0) return;

        var content = await Neutralino.filesystem.readFile(result[0]);
        projectManager.importSheetFromJSON(content);
        refreshAllUI();
        document.getElementById('status-text').textContent = 'Sheet imported';
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function onSheetExport() {
    try {
        var result = await Neutralino.os.showSaveDialog('Export Sheet JSON', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });
        if (!result) return;

        var json = projectManager.exportSheetToJSON();
        await Neutralino.filesystem.writeFile(result, json);
        document.getElementById('status-text').textContent = 'Sheet exported';
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function onPartsImport() {
    try {
        var result = await Neutralino.os.showOpenDialog('Import Parts JSON', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });
        if (!result || result.length === 0) return;

        var content = await Neutralino.filesystem.readFile(result[0]);
        projectManager.importPartsFromJSON(content);
        refreshPartsTable();
        refreshAllUI();
        document.getElementById('status-text').textContent = 'Parts imported: ' + projectManager.parts.length;
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function onPartsExport() {
    try {
        var result = await Neutralino.os.showSaveDialog('Export Parts JSON', {
            filters: [{ name: 'JSON files', extensions: ['json'] }]
        });
        if (!result) return;

        var json = projectManager.exportPartsToJSON();
        await Neutralino.filesystem.writeFile(result, json);
        document.getElementById('status-text').textContent = 'Parts exported: ' + projectManager.parts.length;
    } catch (err) {
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

// ===================== ОПТИМИЗАЦИЯ =====================

async function runOptimization() {
    if (!projectManager) return;

    var btn = document.getElementById('btn-run');
    var statusText = document.getElementById('status-text');
    var progressContainer = document.getElementById('progress-container');
    var progressFill = document.getElementById('progress-fill');
    var progressText = document.getElementById('progress-text');

    var settings = getSettings();

    btn.disabled = true;
    statusText.textContent = 'Оптимизация...';

    progressContainer.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
        var startTime = performance.now();

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

        switchTab('results');

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

// ===================== EXPORT =====================

/**
 * Добавя file extension ако липсва.
 */
function ensureExtension(filePath, ext) {
    if (!filePath.toLowerCase().endsWith(ext.toLowerCase())) {
        return filePath + ext;
    }
    return filePath;
}

async function exportCSV() {
    try {
        if (!projectManager || projectManager.parts.length === 0) {
            document.getElementById('status-text').textContent = 'Няма данни за експорт';
            return;
        }

        var rows = [];
        rows.push('Name,Width,Height,Qty,Edges,Rotated');

        for (var i = 0; i < projectManager.parts.length; i++) {
            var p = projectManager.parts[i];
            var name = '"' + p.name.replace(/"/g, '""') + '"';
            rows.push(name + ',' + p.w + ',' + p.h + ',' + p.qty + ',' + p.getTotalEdges() + ',' + (p.canRotate ? '1' : '0'));
        }

        var csvContent = rows.join('\r\n');

        var result = await Neutralino.os.showSaveDialog('Export Parts CSV', {
            filters: [{ name: 'CSV files', extensions: ['csv'] }]
        });
        if (!result) return;

        // Добавяме .csv ако липсва
        result = ensureExtension(result, '.csv');

        await Neutralino.filesystem.writeFile(result, csvContent);
        document.getElementById('status-text').textContent = 'CSV exported: ' + projectManager.parts.length + ' parts';
    } catch (err) {
        console.error('CSV export error:', err);
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

async function exportPNG() {
    try {
        var svgContainer = document.getElementById('svg-container');
        var svgEl = svgContainer.querySelector('svg');
        if (!svgEl) {
            document.getElementById('status-text').textContent = 'Няма визуализация за експорт';
            return;
        }

        var svgData = new XMLSerializer().serializeToString(svgEl);
        var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(svgBlob);

        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');

        var rect = svgEl.getBoundingClientRect();
        var scale = 2;
        canvas.width = rect.width * scale;
        canvas.height = rect.height * scale;

        var img = new Image();
        img.onload = async function() {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);

            canvas.toBlob(async function(blob) {
                if (!blob) {
                    document.getElementById('status-text').textContent = 'Грешка: Cannot create PNG';
                    return;
                }

                var reader = new FileReader();
                reader.onload = async function() {
                    var base64Data = reader.result.split(',')[1];
                    var bytes = new Uint8Array(atob(base64Data).split('').map(function(c) { return c.charCodeAt(0); }));

                    var result = await Neutralino.os.showSaveDialog('Export PNG', {
                        filters: [{ name: 'PNG files', extensions: ['png'] }]
                    });
                    if (!result) return;

                    // Добавяме .png ако липсва
                    result = ensureExtension(result, '.png');

                    await Neutralino.filesystem.writeBinaryFile(result, bytes.buffer);
                    document.getElementById('status-text').textContent = 'PNG exported';
                };
                reader.readAsDataURL(blob);
            }, 'image/png');
        };

        img.src = url;
    } catch (err) {
        console.error('PNG export error:', err);
        document.getElementById('status-text').textContent = 'Грешка: ' + err.message;
    }
}

// ===================== DOM СЪБИТИЯ =====================

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('btn-run');
    if (btn) btn.addEventListener('click', runOptimization);

    var tabBtns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function() {
            switchTab(this.getAttribute('data-tab'));
        });
    }

    var qualityRadios = document.querySelectorAll('input[name="quality"]');
    for (var j = 0; j < qualityRadios.length; j++) {
        qualityRadios[j].addEventListener('change', onQualityChange);
    }

    var sheetApply = document.getElementById('btn-sheet-apply');
    if (sheetApply) sheetApply.addEventListener('click', onSheetApply);

    var sheetImport = document.getElementById('btn-sheet-import');
    if (sheetImport) sheetImport.addEventListener('click', onSheetImport);

    var sheetExport = document.getElementById('btn-sheet-export');
    if (sheetExport) sheetExport.addEventListener('click', onSheetExport);

    var partAdd = document.getElementById('btn-part-add');
    if (partAdd) partAdd.addEventListener('click', onPartAdd);

    var partsImport = document.getElementById('btn-parts-import');
    if (partsImport) partsImport.addEventListener('click', onPartsImport);

    var partsExport = document.getElementById('btn-parts-export');
    if (partsExport) partsExport.addEventListener('click', onPartsExport);

    var exportCSVBtn = document.getElementById('btn-export-csv');
    if (exportCSVBtn) exportCSVBtn.addEventListener('click', exportCSV);

    var exportPNGBtn = document.getElementById('btn-export-png');
    if (exportPNGBtn) exportPNGBtn.addEventListener('click', exportPNG);
});

window.addEventListener('error', function(e) {
    console.error('Global error:', e.message);
    var statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = 'JS Грешка: ' + e.message;
    }
});

Neutralino.events.on('ready', onReady);

try {
    Neutralino.init();
} catch (initErr) {
    console.error('Neutralino.init() failed:', initErr);
}