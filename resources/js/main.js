'use strict';

let projectManager = null;
let currentFilePath = '';
let zoomLevel = 1.0;
const LAST_PROJECT_FILE = 'last_project.json';
const EXAMPLES_DIR = 'examples/';

function getBasePath() { return (typeof NL_PATH !== 'undefined') ? NL_PATH : ''; }

function updateProjectName(filePath) {
    var el = document.getElementById('current-project');
    if (!el) return;
    if (filePath) {
        var parts = filePath.replace(/\\/g, '/').split('/');
        el.textContent = 'Проект: ' + (parts[parts.length - 1] || '—');
    } else { el.textContent = 'Проект: —'; }
}

// ===== PERSISTENCE =====
async function saveLastProject() {
    try {
        if (!projectManager) return;
        var f = getBasePath() + '/' + LAST_PROJECT_FILE;
        await Neutralino.filesystem.writeFile(f, JSON.stringify({ sheet: projectManager.getSheetData(), parts: projectManager.getPartsData(), currentFile: currentFilePath }, null, 2));
    } catch (err) { console.warn('saveLastProject:', err.message); }
}

async function tryLoadLastProject() {
    try {
        var f = getBasePath() + '/' + LAST_PROJECT_FILE;
        var d = JSON.parse(await Neutralino.filesystem.readFile(f));
        if (d.sheet) projectManager.updateSheet(+d.sheet.sheetW || 2440, +d.sheet.sheetH || 2070, +d.sheet.kerf || 4);
        if (d.parts && Array.isArray(d.parts)) projectManager.importPartsFromJSON(JSON.stringify({ parts: d.parts }));
        currentFilePath = d.currentFile || '';
        return true;
    } catch (err) { return false; }
}

// ===== NEUTRALINO =====
function onReady() {
    Neutralino.events.on('windowClose', async function() { await saveLastProject(); Neutralino.app.exit(); });
    initApp();
}

// ===== INIT =====
async function initApp() {
    try {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');
        projectManager = new ProjectManager(getBasePath() + '/config.ini');
        var loaded = await tryLoadLastProject();
        if (!loaded) {
            try {
                var entries = await Neutralino.filesystem.readDirectory(getBasePath() + '/' + EXAMPLES_DIR);
                var first = null;
                for (var i = 0; i < entries.length; i++) {
                    if (entries[i].type === 'FILE' && entries[i].name.endsWith('.json')) { first = EXAMPLES_DIR + entries[i].name; break; }
                }
                if (first) { await projectManager.loadProject(getBasePath() + '/' + first); currentFilePath = first; }
            } catch (e) {}
        }
        refreshAllUI();
        updateProjectName(currentFilePath);
        await populateExamples();
        await saveLastProject();
        document.getElementById('btn-run').disabled = false;
        document.getElementById('status-text').textContent = 'Готово';
    } catch (err) { console.error(err); }
}

// ===== EXAMPLES =====
async function populateExamples() {
    var sel = document.getElementById('example-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Избери пример...</option>';
    try {
        var entries = await Neutralino.filesystem.readDirectory(getBasePath() + '/' + EXAMPLES_DIR);
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].type === 'FILE' && entries[i].name.endsWith('.json')) {
                var o = document.createElement('option');
                o.value = EXAMPLES_DIR + entries[i].name;
                o.textContent = entries[i].name.replace('.json', '');
                sel.appendChild(o);
                found = true;
            }
        }
        if (!found) sel.innerHTML = '<option value="">Няма примери</option>';
    } catch (e) { sel.innerHTML = '<option value="">Няма примери</option>'; }
}

async function onExampleSelect() {
    var sel = document.getElementById('example-select');
    if (!sel || !sel.value) return;
    var fp = sel.value;
    sel.value = '';
    try {
        var meta = await projectManager.loadProject(getBasePath() + '/' + fp);
        currentFilePath = fp;
        refreshAllUI(meta);
        updateProjectName(currentFilePath);
        await saveLastProject();
        document.getElementById('status-text').textContent = 'Зареден: ' + fp;
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

// ===== PROJECT MANAGEMENT =====
async function onSaveProject() {
    try {
        if (!projectManager) return;
        var state = JSON.stringify({ sheet: projectManager.getSheetData(), parts: projectManager.getPartsData(), settings: { iterations: +(document.getElementById('input-iterations').value) || 50, beamWidth: +(document.getElementById('input-beam-width').value) || 12, seed: +(document.getElementById('input-seed').value) || 42, randomize: document.getElementById('input-randomize').checked } }, null, 2);
        var r = await Neutralino.os.showSaveDialog('Save Project', { filters: [{ name: 'Project files', extensions: ['json'] }] });
        if (!r) return;
        r = r.endsWith('.json') ? r : r + '.json';
        await Neutralino.filesystem.writeFile(r, state);
        currentFilePath = r;
        updateProjectName(currentFilePath);
        document.getElementById('status-text').textContent = 'Project saved';
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

async function onLoadProject() {
    try {
        var r = await Neutralino.os.showOpenDialog('Load Project', { filters: [{ name: 'JSON files', extensions: ['json'] }] });
        if (!r || !r.length) return;
        var c = await Neutralino.filesystem.readFile(r[0]);
        var d = JSON.parse(c);
        if (!d.sheet) throw new Error('Invalid project file');
        projectManager.updateSheet(+d.sheet.sheetW || 2440, +d.sheet.sheetH || 2070, +d.sheet.kerf || 4);
        projectManager.importPartsFromJSON(JSON.stringify({ parts: d.parts || [] }));
        if (d.settings) {
            var it = document.getElementById('input-iterations');
            if (it) it.value = d.settings.iterations || 50;
            var bw = document.getElementById('input-beam-width');
            if (bw) bw.value = d.settings.beamWidth || 12;
            var sd = document.getElementById('input-seed');
            if (sd) sd.value = d.settings.seed || 42;
            var rn = document.getElementById('input-randomize');
            if (rn) rn.checked = !!d.settings.randomize;
        }
        currentFilePath = r[0];
        refreshAllUI();
        updateProjectName(currentFilePath);
        await saveLastProject();
        document.getElementById('status-text').textContent = 'Loaded: ' + r[0];
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

function onNewProject() {
    if (!projectManager) return;
    projectManager.parts = [];
    projectManager.sheetW = 2440;
    projectManager.sheetH = 2070;
    projectManager.kerf = 4;
    projectManager.optimizer = new Optimizer(2440, 2070, 4);
    projectManager.result = null;
    currentFilePath = '';
    document.getElementById('input-sheet-w').value = 2440;
    document.getElementById('input-sheet-h').value = 2070;
    document.getElementById('input-sheet-kerf').value = 4;
    document.getElementById('input-iterations').value = 50;
    document.getElementById('input-beam-width').value = 12;
    document.getElementById('input-seed').value = 42;
    document.getElementById('input-randomize').checked = false;
    refreshAllUI();
    updateProjectName('');
    document.getElementById('status-text').textContent = 'New project created';
}

// ===== ZOOM =====
function applyZoom() {
    var svg = document.querySelector('#svg-container svg');
    if (!svg) return;
    svg.style.transform = 'scale(' + zoomLevel + ')';
    svg.style.width = (100 / zoomLevel) + '%';
}
function zoomIn() { zoomLevel = Math.min(5, zoomLevel + 0.25);
    applyZoom(); }
function zoomOut() { zoomLevel = Math.max(0.25, zoomLevel - 0.25);
    applyZoom(); }
function zoomReset() { zoomLevel = 1.0;
    applyZoom(); }

// ===== UI REFRESH =====
function refreshAllUI(meta) {
    if (!meta && projectManager) meta = { sheetW: projectManager.sheetW, sheetH: projectManager.sheetH, kerf: projectManager.kerf, partCount: projectManager.parts.length };
    if (meta) {
        document.getElementById('display-sheet-size').textContent = meta.sheetW + ' x ' + meta.sheetH + ' mm';
        document.getElementById('display-kerf').textContent = meta.kerf + ' mm';
        document.getElementById('display-parts-count').textContent = meta.partCount + ' части';
        document.getElementById('input-sheet-w').value = meta.sheetW;
        document.getElementById('input-sheet-h').value = meta.sheetH;
        document.getElementById('input-sheet-kerf').value = meta.kerf;
    }
    refreshPartsTable();
}

function escapeHtml(s) { return s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"'); }

function renderSVG(layout) {
    var c = document.getElementById('svg-container');
    c.innerHTML = '';
    if (!layout || !layout.sheets.length) { c.innerHTML = '<p style="color:#5D6D7E;text-align:center;padding:40px;">Няма резултати</p>'; return; }
    zoomLevel = 1.0;
    var sw = layout.sheets[0].w,
        sh = layout.sheets[0].h;
    var gap = 80,
        lh = 30,
        th = layout.sheets.length * (sh + gap + lh);
    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (sw + 40) + ' ' + th + '" preserveAspectRatio="xMidYMid meet" style="background:#E8EBED;">';
    s += '<style>.p{fill:#2471A3;}.pr{fill:#1E8449;}.l{font-family:sans-serif;font-size:12px;fill:#fff;}.d{font-family:sans-serif;font-size:10px;fill:#fff;opacity:.85;}.sl{font-family:sans-serif;font-size:15px;font-weight:bold;fill:#2C3E50;}</style>';
    for (var si = 0; si < layout.sheets.length; si++) {
        var sheet = layout.sheets[si],
            oy = si * (sh + gap + lh) + lh;
        s += '<text x="10" y="' + (oy - 10) + '" class="sl">Лист ' + (si + 1) + ' — Ефективност: ' + sheet.efficiency.toFixed(1) + '%</text>';
        s += '<rect x="0" y="' + oy + '" width="' + sw + '" height="' + sh + '" fill="#F8F9FA" stroke="#1A252F" stroke-width="3"/>';
        for (var gx = 100; gx < sw; gx += 100) s += '<line x1="' + gx + '" y1="' + oy + '" x2="' + gx + '" y2="' + (oy + sh) + '" stroke="#D5D8DC" stroke-width="0.5"/>';
        for (var gy = 100; gy < sh; gy += 100) s += '<line x1="0" y1="' + (oy + gy) + '" x2="' + sw + '" y2="' + (oy + gy) + '" stroke="#D5D8DC" stroke-width="0.5"/>';
        for (var pi = 0; pi < sheet.parts.length; pi++) {
            var p = sheet.parts[pi],
                cls = p.rotated ? 'pr' : 'p';
            s += '<rect x="' + p.x + '" y="' + (oy + p.y) + '" width="' + p.w + '" height="' + p.h + '" class="' + cls + '" rx="2"/>';
            s += '<rect x="' + p.x + '" y="' + (oy + p.y) + '" width="' + p.w + '" height="' + p.h + '" fill="none" stroke="#1A252F" stroke-width="1.5" rx="2"/>';
            if (p.w > 50 && p.h > 20) {
                s += '<text x="' + (p.x + 4) + '" y="' + (oy + p.y + 15) + '" class="l">' + escapeHtml(p.name) + (p.rotated ? ' [R]' : '') + '</text>';
                s += '<text x="' + (p.x + 4) + '" y="' + (oy + p.y + 28) + '" class="d">' + p.w + 'x' + p.h + '</text>';
            }
        }
    }
    s += '</svg>';
    c.innerHTML = s;
    applyZoom();
}

// ===== SETTINGS =====
function onQualityChange() {
    var q = document.querySelector('input[name="quality"]:checked');
    if (!q) return;
    var ii = document.getElementById('input-iterations'),
        bi = document.getElementById('input-beam-width');
    switch (q.value) { case 'fast':
            ii.value = 10;
            bi.value = 6; break; case 'balanced':
            ii.value = 50;
            bi.value = 12; break; case 'precise':
            ii.value = 200;
            bi.value = 20; break; }
}

function getSettings() { return { iterations: +(document.getElementById('input-iterations').value) || 50, beamWidth: +(document.getElementById('input-beam-width').value) || 12, seed: +(document.getElementById('input-seed').value) || 42, randomize: document.getElementById('input-randomize').checked }; }

// ===== EDGE HELPERS =====
function getEdgeArrayFromGroup(groupId) {
    var cbs = document.querySelectorAll('#' + groupId + ' .edge-cb');
    var arr = [0, 0, 0, 0];
    for (var i = 0; i < cbs.length; i++) {
        var side = parseInt(cbs[i].getAttribute('data-side'), 10);
        if (side >= 0 && side < 4) arr[side] = cbs[i].checked ? 1 : 0;
    }
    return arr;
}

function syncEdgeButtons(groupId) {
    var btns = document.querySelectorAll('#' + groupId + ' .edge-btn');
    for (var i = 0; i < btns.length; i++) {
        var cb = btns[i].querySelector('.edge-cb');
        if (cb) {
            if (cb.checked) btns[i].classList.add('active');
            else btns[i].classList.remove('active');
        }
    }
}

function formatEdges(arr) { return 'T=' + arr[0] + ',R=' + arr[1] + ',B=' + arr[2] + ',L=' + arr[3]; }

// ===== DATA =====
function onSheetApply() {
    try {
        var w = +(document.getElementById('input-sheet-w').value) || 0,
            h = +(document.getElementById('input-sheet-h').value) || 0,
            k = +(document.getElementById('input-sheet-kerf').value) || 0;
        projectManager.updateSheet(w, h, k);
        refreshAllUI();
        saveLastProject();
        document.getElementById('status-text').textContent = 'Sheet: ' + w + 'x' + h + ', kerf=' + k;
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

function onPartAdd() {
    try {
        var name = document.getElementById('input-part-name').value,
            w = +(document.getElementById('input-part-w').value) || 0,
            h = +(document.getElementById('input-part-h').value) || 0;
        var qty = +(document.getElementById('input-part-qty').value) || 1,
            rot = document.getElementById('input-part-rotate').checked;
        var ea = getEdgeArrayFromGroup('add-edges-group');
        projectManager.addPart(name, w, h, rot, qty, ea);
        document.getElementById('input-part-name').value = '';
        document.getElementById('input-part-w').value = '';
        document.getElementById('input-part-h').value = '';
        document.getElementById('input-part-qty').value = '1';
        document.getElementById('input-part-rotate').checked = false;
        var addCbs = document.querySelectorAll('#add-edges-group .edge-cb');
        for (var ci = 0; ci < addCbs.length; ci++) addCbs[ci].checked = false;
        syncEdgeButtons('add-edges-group');
        refreshPartsTable();
        refreshAllUI();
        saveLastProject();
        document.getElementById('status-text').textContent = 'Добавена: ' + name;
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

async function onSheetImport() {
    try {
        var r = await Neutralino.os.showOpenDialog('Import Sheet', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r || !r.length) return;
        projectManager.importSheetFromJSON(await Neutralino.filesystem.readFile(r[0]));
        refreshAllUI();
        saveLastProject();
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}
async function onSheetExport() {
    try {
        var r = await Neutralino.os.showSaveDialog('Export Sheet', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r) return;
        await Neutralino.filesystem.writeFile(r, projectManager.exportSheetToJSON());
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}
async function onPartsImport() {
    try {
        var r = await Neutralino.os.showOpenDialog('Import Parts', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r || !r.length) return;
        projectManager.importPartsFromJSON(await Neutralino.filesystem.readFile(r[0]));
        refreshPartsTable();
        refreshAllUI();
        saveLastProject();
        document.getElementById('status-text').textContent = 'Parts: ' + projectManager.parts.length;
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}
async function onPartsExport() {
    try {
        var r = await Neutralino.os.showSaveDialog('Export Parts', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r) return;
        await Neutralino.filesystem.writeFile(r, projectManager.exportPartsToJSON());
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

function refreshPartsTable() {
    var tb = document.getElementById('parts-table-body'),
        lb = document.getElementById('parts-count-label');
    if (!tb || !projectManager) return;
    tb.innerHTML = '';
    var c = projectManager.parts.length;
    if (lb) lb.textContent = c;
    for (var i = 0; i < c; i++) {
        var p = projectManager.parts[i];
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + (i + 1) + '</td>' +
            '<td><input type="text" class="edit-name" value="' + escapeHtml(p.name) + '"></td>' +
            '<td><input type="number" class="edit-w" value="' + p.w + '" min="1"></td>' +
            '<td><input type="number" class="edit-h" value="' + p.h + '" min="1"></td>' +
            '<td><input type="number" class="edit-qty" value="' + p.qty + '" min="1" max="999"></td>' +
            '<td><div class="edges-group" data-row-idx="' + i + '">' +
            '<label class="edge-btn ' + (p.edges[0] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="0" ' + (p.edges[0] ? 'checked' : '') + '> T</label>' +
            '<label class="edge-btn ' + (p.edges[1] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="1" ' + (p.edges[1] ? 'checked' : '') + '> R</label>' +
            '<label class="edge-btn ' + (p.edges[2] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="2" ' + (p.edges[2] ? 'checked' : '') + '> B</label>' +
            '<label class="edge-btn ' + (p.edges[3] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="3" ' + (p.edges[3] ? 'checked' : '') + '> L</label>' +
            '</div></td>' +
            '<td><input type="checkbox" class="edit-rot" ' + (p.canRotate ? 'checked' : '') + '></td>' +
            '<td><button class="btn-icon-small" data-index="' + i + '" title="Delete">✕</button></td>';
        tb.appendChild(tr);
        var ni = tr.querySelector('.edit-name'),
            wi = tr.querySelector('.edit-w'),
            hi = tr.querySelector('.edit-h');
        var qi = tr.querySelector('.edit-qty'),
            ri = tr.querySelector('.edit-rot'),
            db = tr.querySelector('.btn-icon-small');
        var eg = tr.querySelector('.edges-group');

        function getRowEdges(group) {
            var cbs = group.querySelectorAll('.edge-cb');
            var arr = [0, 0, 0, 0];
            for (var k = 0; k < cbs.length; k++) {
                var side = parseInt(cbs[k].getAttribute('data-side'), 10);
                if (side >= 0 && side < 4) arr[side] = cbs[k].checked ? 1 : 0;
            }
            return arr;
        }

        function mkHandler(idx, ne, we, he, qe, eg, re) {
            return function() {
                try {
                    projectManager.updatePart(idx, ne.value, +(we.value) || 0, +(he.value) || 0, re.checked, +(qe.value) || 1, getRowEdges(eg));
                    refreshPartsTable();
                    saveLastProject();
                } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
            };
        }
        var h = mkHandler(i, ni, wi, hi, qi, eg, ri);
        ni.addEventListener('change', h);
        wi.addEventListener('change', h);
        hi.addEventListener('change', h);
        qi.addEventListener('change', h);
        ri.addEventListener('change', h);
        var ecbs = eg.querySelectorAll('.edge-cb');
        for (var ek = 0; ek < ecbs.length; ek++) ecbs[ek].addEventListener('change', h);
        db.addEventListener('click', function() {
            var idx = +(this.getAttribute('data-index'));
            try {
                projectManager.removePart(idx);
                refreshPartsTable();
                refreshAllUI();
                saveLastProject();
            } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
        });
    }
}

// ===== OPTIMIZATION =====
async function runOptimization() {
    if (!projectManager) return;
    var btn = document.getElementById('btn-run'),
        st = document.getElementById('status-text');
    var pc = document.getElementById('progress-container'),
        pf = document.getElementById('progress-fill'),
        pt = document.getElementById('progress-text');
    var s = getSettings();
    btn.disabled = true;
    st.textContent = 'Оптимизация...';
    pc.classList.remove('hidden');
    pf.style.width = '0%';
    pt.textContent = '0%';
    try {
        var t0 = performance.now();
        var sum = await projectManager.runOptimization(s.iterations, s.beamWidth, s.randomize, function(cur, tot) {
            var pct = Math.round(cur / tot * 100);
            pf.style.width = pct + '%';
            pt.textContent = pct + '%';
        });
        var t = ((performance.now() - t0) / 1000).toFixed(2);
        document.getElementById('result-sheets').textContent = sum.sheetCount;
        document.getElementById('result-efficiency').textContent = sum.avgEfficiency.toFixed(2) + '%';
        document.getElementById('result-score').textContent = sum.score.toFixed(2);
        document.getElementById('result-placed').textContent = sum.totalPlacedParts + ' / ' + projectManager.parts.length;
        st.textContent = 'Готово за ' + t + 's';
        switchTab('results');
        if (projectManager.getLayout()) renderSVG(projectManager.getLayout());
        await saveLastProject();
    } catch (err) { console.error(err);
        st.textContent = 'Грешка: ' + err.message; } finally { btn.disabled = false;
        pc.classList.add('hidden'); }
}

// ===== EXPORTS =====
function ensureExt(fp, ext) { return fp.toLowerCase().endsWith(ext.toLowerCase()) ? fp : fp + ext; }

async function exportCSV() {
    if (!projectManager || !projectManager.parts.length) { document.getElementById('status-text').textContent = 'Няма данни'; return; }
    try {
        var rows = ['Name,Width,Height,Qty,Edges(Rot),Edges(T,R,B,L),Rotated'];
        for (var i = 0; i < projectManager.parts.length; i++) {
            var p = projectManager.parts[i];
            rows.push('"' + p.name.replace(/"/g, '""') + '",' + p.w + ',' + p.h + ',' + p.qty + ',' + p.getTotalEdges() + ',"' + formatEdges(p.edges) + '",' + (p.canRotate ? 1 : 0));
        }
        var r = await Neutralino.os.showSaveDialog('Export CSV', { filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (!r) return;
        await Neutralino.filesystem.writeFile(ensureExt(r, '.csv'), rows.join('\r\n'));
        document.getElementById('status-text').textContent = 'CSV exported';
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

async function exportPNG() {
    try {
        var svgEl = document.querySelector('#svg-container svg');
        if (!svgEl) { document.getElementById('status-text').textContent = 'Няма визуализация'; return; }
        var svgData = new XMLSerializer().serializeToString(svgEl);
        var url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));
        var c = document.createElement('canvas'),
            ctx = c.getContext('2d');
        var rect = svgEl.getBoundingClientRect(),
            scale = 2;
        c.width = rect.width * scale;
        c.height = rect.height * scale;
        var img = new Image();
        img.onload = async function() {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            c.toBlob(async function(blob) {
                if (!blob) { document.getElementById('status-text').textContent = 'Грешка'; return; }
                var reader = new FileReader();
                reader.onload = async function() {
                    var bytes = new Uint8Array(atob(reader.result.split(',')[1]).split('').map(function(c) { return c.charCodeAt(0); }));
                    var r = await Neutralino.os.showSaveDialog('Export PNG', { filters: [{ name: 'PNG', extensions: ['png'] }] });
                    if (!r) return;
                    await Neutralino.filesystem.writeBinaryFile(ensureExt(r, '.png'), bytes.buffer);
                    document.getElementById('status-text').textContent = 'PNG exported';
                };
                reader.readAsDataURL(blob);
            }, 'image/png');
        };
        img.src = url;
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

async function exportPDF() {
    if (!projectManager || !projectManager.parts.length) { document.getElementById('status-text').textContent = 'Няма данни'; return; }
    try {
        var svgHtml = '';
        var svgEl = document.querySelector('#svg-container svg');
        if (svgEl) svgHtml = svgEl.outerHTML;
        var rows = '';
        for (var i = 0; i < projectManager.parts.length; i++) {
            var p = projectManager.parts[i];
            rows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(p.name) + '</td><td>' + p.w + '</td><td>' + p.h + '</td><td>' + p.qty + '</td><td>' + formatEdges(p.edges) + '</td><td>' + (p.canRotate ? 'Да' : 'Не') + '</td></tr>';
        }
        var pw = window.open('', '_blank', 'width=800,height=600');
        pw.document.write('<!DOCTYPE html><html><head><title>CutOptimizer</title><style>' +
            'body{font-family:sans-serif;padding:20px;color:#333;}h1{color:#2C3E50;font-size:22px;}' +
            'table{width:100%;border-collapse:collapse;margin:20px 0;}th{background:#2C3E50;color:#fff;padding:8px;text-align:left;}' +
            'td{padding:6px 8px;border-bottom:1px solid #ddd;}' +
            '.sc{margin:20px 0;text-align:center;}.sc svg{max-width:100%;height:auto;}' +
            '@media print{body{-webkit-print-color-adjust:exact;}}' +
            '</style></head><body><h1>CutOptimizer — Отчет</h1>' +
            '<p>Sheet: ' + projectManager.sheetW + 'x' + projectManager.sheetH + ' mm, Kerf: ' + projectManager.kerf + ' mm</p>' +
            '<table><thead><tr><th>#</th><th>Name</th><th>W</th><th>H</th><th>Qty</th><th>Edges</th><th>Rot</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (svgHtml ? '<div class="sc">' + svgHtml + '</div>' : '') + '</body></html>');
        pw.document.close();
        pw.focus();
        setTimeout(function() { pw.print(); }, 500);
    } catch (err) { document.getElementById('status-text').textContent = 'Грешка: ' + err.message; }
}

// ===== TABS =====
function switchTab(tab) {
    var tc = document.querySelectorAll('.tab-content'),
        tb = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tc.length; i++) tc[i].classList.remove('active');
    for (var j = 0; j < tb.length; j++) tb[j].classList.remove('active');
    var t = document.getElementById('tab-' + tab);
    if (t) t.classList.add('active');
    var b = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
    if (b) b.classList.add('active');
}

// ===== DOM EVENTS =====
document.addEventListener('DOMContentLoaded', function() {
    // Edge btn click toggles hidden checkbox
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.edge-btn');
        if (!btn) return;
        var cb = btn.querySelector('.edge-cb');
        if (cb) {
            cb.checked = !cb.checked;
            if (cb.checked) btn.classList.add('active');
            else btn.classList.remove('active');
            // Trigger change event for the inline save handler
            var evt = new Event('change', { bubbles: true });
            cb.dispatchEvent(evt);
        }
    });

    var btn = document.getElementById('btn-run');
    if (btn) btn.addEventListener('click', runOptimization);
    var tabBtns = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tabBtns.length; i++) tabBtns[i].addEventListener('click', function() { switchTab(this.getAttribute('data-tab')); });
    var qr = document.querySelectorAll('input[name="quality"]');
    for (var j = 0; j < qr.length; j++) qr[j].addEventListener('change', onQualityChange);

    document.getElementById('btn-sheet-apply')?.addEventListener('click', onSheetApply);
    document.getElementById('btn-sheet-import')?.addEventListener('click', onSheetImport);
    document.getElementById('btn-sheet-export')?.addEventListener('click', onSheetExport);
    document.getElementById('btn-part-add')?.addEventListener('click', onPartAdd);
    document.getElementById('btn-parts-import')?.addEventListener('click', onPartsImport);
    document.getElementById('btn-parts-export')?.addEventListener('click', onPartsExport);
    document.getElementById('btn-save-project')?.addEventListener('click', onSaveProject);
    document.getElementById('btn-load-project')?.addEventListener('click', onLoadProject);
    document.getElementById('btn-new-project')?.addEventListener('click', onNewProject);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
    document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);
    document.getElementById('btn-zoom-reset')?.addEventListener('click', zoomReset);
    document.getElementById('example-select')?.addEventListener('change', onExampleSelect);

    // Sync add form edge buttons on load
    syncEdgeButtons('add-edges-group');
});

window.addEventListener('error', function(e) {
    var st = document.getElementById('status-text');
    if (st) st.textContent = 'Грешка: ' + e.message;
});

Neutralino.events.on('ready', onReady);
try { Neutralino.init(); } catch (err) { console.error('Init failed:', err); }