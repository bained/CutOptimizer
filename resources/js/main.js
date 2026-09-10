'use strict';

let projectManager = null;
let currentFilePath = '';
let zoomLevel = 1.0;
let activeSheetIndex = 0;
const LAST_PROJECT_FILE = 'last_project.json';
const EXAMPLES_DIR = 'examples/';

function getBasePath() { return (typeof NL_PATH !== 'undefined') ? NL_PATH : ''; }

function openSettingsHelp() {
    var modal = document.getElementById('settings-help-modal');
    var close = document.getElementById('btn-settings-help-close');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (close) close.focus();
}

function closeSettingsHelp() {
    var modal = document.getElementById('settings-help-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    var open = document.getElementById('btn-settings-help');
    if (open) open.focus();
}

function updateProjectName(filePath) {
    var el = document.getElementById('current-project');
    if (!el) return;
    if (filePath) {
        var parts = filePath.replace(/\\/g, '/').split('/');
        el.textContent = i18n.t('project.name') + ': ' + (parts[parts.length - 1] || '-');
    } else { el.textContent = i18n.t('project.name') + ': -'; }
}

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

function onReady() {
    Neutralino.events.on('windowClose', async function() { await saveLastProject(); Neutralino.app.exit(); });
    initApp();
}

async function initApp() {
    try {
        await i18n.load('en');
        i18n.applyTranslations();

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('results-panel').classList.remove('hidden');
        projectManager = new ProjectManager();
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
        document.getElementById('status-text').textContent = i18n.t('app.ready');
    } catch (err) { console.error(err); }
}

async function populateExamples() {
    var sel = document.getElementById('example-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">' + i18n.t('example.select') + '</option>';
    try {
        var entries = await Neutralino.filesystem.readDirectory(getBasePath() + '/' + EXAMPLES_DIR);
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].type === 'FILE' && entries[i].name.endsWith('.json')) {
                var o = document.createElement('option');
                o.value = EXAMPLES_DIR + entries[i].name;
                o.textContent = entries[i].name.replace('.json', '');
                sel.appendChild(o); found = true;
            }
        }
        if (!found) sel.innerHTML = '<option value="">' + i18n.t('example.none') + '</option>';
    } catch (e) { sel.innerHTML = '<option value="">' + i18n.t('example.none') + '</option>'; }
}

async function onExampleSelect() {
    var sel = document.getElementById('example-select');
    if (!sel || !sel.value) return;
    var fp = sel.value; sel.value = '';
    try {
        var meta = await projectManager.loadProject(getBasePath() + '/' + fp);
        currentFilePath = fp; refreshAllUI(meta); updateProjectName(currentFilePath); await saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.loaded') + ' ' + fp;
    } catch (err) { setStatusError(err.message); }
}

async function onSaveProject() {
    try {
        if (!projectManager) return;
        var state = JSON.stringify({ sheet: projectManager.getSheetData(), parts: projectManager.getPartsData(), settings: { iterations: +(document.getElementById('input-iterations').value) || 50, beamWidth: +(document.getElementById('input-beam-width').value) || 12, randomize: document.getElementById('input-randomize').checked } }, null, 2);
        var r = await Neutralino.os.showSaveDialog('Save Project', { filters: [{ name: 'Project files', extensions: ['json'] }] });
        if (!r) return; r = r.endsWith('.json') ? r : r + '.json';
        await Neutralino.filesystem.writeFile(r, state); currentFilePath = r; updateProjectName(currentFilePath);
        document.getElementById('status-text').textContent = i18n.t('messages.projectSaved');
    } catch (err) { setStatusError(err.message); }
}

async function onLoadProject() {
    try {
        var r = await Neutralino.os.showOpenDialog('Load Project', { filters: [{ name: 'JSON files', extensions: ['json'] }] });
        if (!r || !r.length) return;
        var c = await Neutralino.filesystem.readFile(r[0]); var d = JSON.parse(c);
        var sheetData = d.sheet || d;
        if (!sheetData.sheetW && !sheetData.sheetH) throw new Error(i18n.t('error.invalidProject'));
        projectManager.updateSheet(+sheetData.sheetW || 2440, +sheetData.sheetH || 2070, +sheetData.kerf || 4);
        projectManager.importPartsFromJSON(JSON.stringify({ parts: d.parts || [] }));
        if (d.settings) {
            var it = document.getElementById('input-iterations'); if (it) it.value = d.settings.iterations || 50;
            var bw = document.getElementById('input-beam-width'); if (bw) bw.value = d.settings.beamWidth || 12;
            var rn = document.getElementById('input-randomize'); if (rn) rn.checked = !!d.settings.randomize;
        }
        currentFilePath = r[0]; refreshAllUI(); updateProjectName(currentFilePath); await saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.projectLoaded') + ' ' + r[0];
    } catch (err) { setStatusError(err.message); }
}

function onNewProject() {
    if (!projectManager) return;
    projectManager.parts = []; projectManager.sheetW = 2440; projectManager.sheetH = 2070; projectManager.kerf = 4;
    projectManager.optimizer = new Optimizer(2440, 2070, 4); projectManager.result = null; currentFilePath = '';
    activeSheetIndex = 0;
    updateSheetNavigation(null);
    document.getElementById('input-sheet-w').value = 2440; document.getElementById('input-sheet-h').value = 2070;
    document.getElementById('input-sheet-kerf').value = 4; document.getElementById('input-iterations').value = 50;
    document.getElementById('input-beam-width').value = 12;
    document.getElementById('input-randomize').checked = false;
    refreshAllUI(); updateProjectName('');
    document.getElementById('status-text').textContent = i18n.t('messages.projectCreated');
}

function applyZoom() {
    var svg = document.querySelector('#svg-container svg');
    if (!svg) return;
    svg.style.transform = 'scale(' + zoomLevel + ')';
    svg.style.width = (100 / zoomLevel) + '%';
}
function zoomIn() { 
    if (zoomLevel >= 5) return;
    zoomLevel = Math.min(5, zoomLevel + 0.25); 
    applyZoom(); 
}
function zoomOut() { 
    if (zoomLevel <= 0.25) return;
    zoomLevel = Math.max(0.25, zoomLevel - 0.25); 
    applyZoom(); 
}
function zoomReset() { zoomLevel = 1.0; applyZoom(); }

function updateSheetNavigation(layout) {
    var total = layout && layout.sheets ? layout.sheets.length : 0;
    if (total === 0) activeSheetIndex = 0;
    else activeSheetIndex = Math.max(0, Math.min(activeSheetIndex, total - 1));
    var indicator = document.getElementById('sheet-indicator');
    if (indicator) {
        var text = i18n.t('results.sheet.indicator')
            .replace('{current}', total ? String(activeSheetIndex + 1) : '0')
            .replace('{total}', String(total));
        indicator.textContent = text;
    }
    var prev = document.getElementById('btn-sheet-prev');
    var next = document.getElementById('btn-sheet-next');
    if (prev) prev.disabled = total < 2 || activeSheetIndex === 0;
    if (next) next.disabled = total < 2 || activeSheetIndex >= total - 1;
}

function selectSheet(index) {
    var layout = projectManager && projectManager.getLayout ? projectManager.getLayout() : null;
    if (!layout || !layout.sheets || index < 0 || index >= layout.sheets.length) return;
    activeSheetIndex = index;
    renderSVG(layout);
}

function showPreviousSheet() { selectSheet(activeSheetIndex - 1); }
function showNextSheet() { selectSheet(activeSheetIndex + 1); }

function refreshAllUI(meta) {
    if (!meta && projectManager) meta = { sheetW: projectManager.sheetW, sheetH: projectManager.sheetH, kerf: projectManager.kerf, partCount: projectManager.parts.length };
    if (meta) {
        document.getElementById('display-sheet-size').textContent = meta.sheetW + ' x ' + meta.sheetH + ' mm';
        document.getElementById('display-kerf').textContent = meta.kerf + ' mm';
        document.getElementById('display-parts-count').textContent = meta.partCount + ' ' + i18n.t('results.parts').toLowerCase();
        document.getElementById('input-sheet-w').value = meta.sheetW; document.getElementById('input-sheet-h').value = meta.sheetH;
        document.getElementById('input-sheet-kerf').value = meta.kerf;
    }
    refreshPartsTable();
}

function setStatusError(msg) {
    document.getElementById('status-text').textContent = i18n.t('error.generic') + ' ' + msg;
}

function formatEdges(arr) {
    var labels = [
        i18n.t('data.parts.edge.l1'),
        i18n.t('data.parts.edge.l2'),
        i18n.t('data.parts.edge.s1'),
        i18n.t('data.parts.edge.s2')
    ];
    var parts = [];
    for (var i = 0; i < 4; i++) parts.push(labels[i] + '=' + arr[i]);
    return parts.join(', ');
}

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

function createResultSvg(layout, sheetIndices) {
    if (!layout || !layout.sheets.length || !sheetIndices.length) return null;
    var firstSheet = layout.sheets[sheetIndices[0]];
    var sw = firstSheet.w, sh = firstSheet.h;
    var gap = 80, lh = 30, th = sheetIndices.length * (sh + gap + lh);
    var ns = 'http://www.w3.org/2000/svg';
    var rootSVG = document.createElementNS(ns, 'svg');
    rootSVG.setAttribute('xmlns', ns);
    rootSVG.setAttribute('viewBox', '0 0 ' + (sw + 40) + ' ' + th);
    rootSVG.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    rootSVG.setAttribute('width', '100%'); rootSVG.setAttribute('height', '100%');
    rootSVG.style.background = '#E8EBED';

    for (var si = 0; si < sheetIndices.length; si++) {
        var sheetIndex = sheetIndices[si];
        var sheet = layout.sheets[sheetIndex], oy = si * (sh + gap + lh) + lh;

        var lbl = document.createElementNS(ns, 'text');
        lbl.setAttribute('x', 10); lbl.setAttribute('y', oy - 10);
        lbl.setAttribute('font-family', 'sans-serif'); lbl.setAttribute('font-size', '15');
        lbl.setAttribute('font-weight', 'bold'); lbl.setAttribute('fill', '#2C3E50');
        lbl.textContent = i18n.t('results.sheet.label') + ' ' + (sheetIndex + 1) + ' - ' + i18n.t('results.efficiency') + ': ' + sheet.efficiency.toFixed(1) + '%';
        rootSVG.appendChild(lbl);

        var sr = document.createElementNS(ns, 'rect');
        sr.setAttribute('x', 0); sr.setAttribute('y', oy);
        sr.setAttribute('width', sw); sr.setAttribute('height', sh);
        sr.setAttribute('fill', '#F8F9FA'); sr.setAttribute('stroke', '#1A252F'); sr.setAttribute('stroke-width', 3);
        rootSVG.appendChild(sr);

        for (var gx = 100; gx < sw; gx += 100) {
            var gl = document.createElementNS(ns, 'line');
            gl.setAttribute('x1', gx); gl.setAttribute('y1', oy); gl.setAttribute('x2', gx); gl.setAttribute('y2', oy + sh);
            gl.setAttribute('stroke', '#D5D8DC'); gl.setAttribute('stroke-width', 0.5);
            rootSVG.appendChild(gl);
        }
        for (var gy = 100; gy < sh; gy += 100) {
            var gl2 = document.createElementNS(ns, 'line');
            gl2.setAttribute('x1', 0); gl2.setAttribute('y1', oy + gy); gl2.setAttribute('x2', sw); gl2.setAttribute('y2', oy + gy);
            gl2.setAttribute('stroke', '#D5D8DC'); gl2.setAttribute('stroke-width', 0.5);
            rootSVG.appendChild(gl2);
        }

        for (var pi = 0; pi < sheet.parts.length; pi++) {
            var p = sheet.parts[pi], edges = p.edges || [0,0,0,0];
            var L1 = edges[0] ? 6 : 0, L2 = edges[1] ? 6 : 0, S1 = edges[2] ? 6 : 0, S2 = edges[3] ? 6 : 0;

            var g = document.createElementNS(ns, 'g');
            g.setAttribute('transform', 'translate(' + p.x + ', ' + (oy + p.y) + ')');

            var rf = document.createElementNS(ns, 'rect');
            rf.setAttribute('x', 0); rf.setAttribute('y', 0);
            rf.setAttribute('width', p.w); rf.setAttribute('height', p.h);
            rf.setAttribute('fill', '#FFFFFF');
            g.appendChild(rf);

            var sw2 = resolveStrokeWidths(p.w, p.h, L1, L2, S1, S2);
            var t = sw2.top, r = sw2.right, b = sw2.bottom, l = sw2.left;
            var lt = l / 2, lb2 = p.h - b / 2, ll = l / 2, lr = p.w - r / 2;

            var lnT = document.createElementNS(ns, 'line');
            lnT.setAttribute('x1', ll); lnT.setAttribute('y1', t / 2);
            lnT.setAttribute('x2', lr); lnT.setAttribute('y2', t / 2);
            lnT.setAttribute('stroke', '#000000'); lnT.setAttribute('stroke-width', t);
            lnT.setAttribute('stroke-linecap', 'butt'); g.appendChild(lnT);

            var lnR = document.createElementNS(ns, 'line');
            lnR.setAttribute('x1', lr); lnR.setAttribute('y1', t / 2);
            lnR.setAttribute('x2', lr); lnR.setAttribute('y2', lb2);
            lnR.setAttribute('stroke', '#000000'); lnR.setAttribute('stroke-width', r);
            lnR.setAttribute('stroke-linecap', 'butt'); g.appendChild(lnR);

            var lnB = document.createElementNS(ns, 'line');
            lnB.setAttribute('x1', lr); lnB.setAttribute('y1', lb2);
            lnB.setAttribute('x2', ll); lnB.setAttribute('y2', lb2);
            lnB.setAttribute('stroke', '#000000'); lnB.setAttribute('stroke-width', b);
            lnB.setAttribute('stroke-linecap', 'butt'); g.appendChild(lnB);

            var lnL = document.createElementNS(ns, 'line');
            lnL.setAttribute('x1', ll); lnL.setAttribute('y1', lb2);
            lnL.setAttribute('x2', ll); lnL.setAttribute('y2', t / 2);
            lnL.setAttribute('stroke', '#000000'); lnL.setAttribute('stroke-width', l);
            lnL.setAttribute('stroke-linecap', 'butt'); g.appendChild(lnL);

            var ro = document.createElementNS(ns, 'rect');
            ro.setAttribute('x', 0); ro.setAttribute('y', 0);
            ro.setAttribute('width', p.w); ro.setAttribute('height', p.h);
            ro.setAttribute('fill', 'none'); ro.setAttribute('stroke', '#333333');
            ro.setAttribute('stroke-width', 1.5); g.appendChild(ro);

            addDimensions(g, Number(p.w), Number(p.h), Number(L1), Number(L2), Number(S1), Number(S2), '#333333');
            addLabel(g, p.name, Number(p.w), Number(p.h));
            rootSVG.appendChild(g);
        }
    }

    rootSVG.setAttribute('data-sheet-count', String(sheetIndices.length));
    rootSVG.setAttribute('data-sheet-indexes', sheetIndices.join(','));
    return rootSVG;
}

function renderSheetSvg(layout, sheetIndex) {
    if (!layout || !layout.sheets || sheetIndex < 0 || sheetIndex >= layout.sheets.length) return null;
    return createResultSvg(layout, [sheetIndex]);
}

function renderAllSheetsSvg(layout) {
    if (!layout || !layout.sheets) return null;
    var indexes = [];
    for (var i = 0; i < layout.sheets.length; i++) indexes.push(i);
    return createResultSvg(layout, indexes);
}

function renderSVG(layout) {
    var container = document.getElementById('svg-container');
    container.innerHTML = '';
    if (!layout || !layout.sheets.length) {
        container.innerHTML = '<p style="color:#5D6D7E;text-align:center;padding:40px;">' + i18n.t('results.noResults') + '</p>';
        return;
    }
    zoomLevel = 1.0;
    updateSheetNavigation(layout);
    var rootSVG = renderSheetSvg(layout, activeSheetIndex);
    container.appendChild(rootSVG);
    console.log('SVG rendered: sheet ' + (activeSheetIndex + 1) + '/' + layout.sheets.length);
    applyZoom();
}

function onQualityChange() {
    var q = document.querySelector('input[name="quality"]:checked');
    if (!q) return;
    var ii = document.getElementById('input-iterations'), bi = document.getElementById('input-beam-width');
    switch (q.value) { case 'fast': ii.value = 10; bi.value = 6; break; case 'balanced': ii.value = 50; bi.value = 12; break; case 'precise': ii.value = 200; bi.value = 20; break; }
}

function getSettings() { return { iterations: +(document.getElementById('input-iterations').value) || 50, beamWidth: +(document.getElementById('input-beam-width').value) || 12, randomize: document.getElementById('input-randomize').checked }; }

function onSheetApply() {
    try {
        var w = +(document.getElementById('input-sheet-w').value) || 0, h = +(document.getElementById('input-sheet-h').value) || 0, k = +(document.getElementById('input-sheet-kerf').value) || 0;
        projectManager.updateSheet(w, h, k); refreshAllUI(); saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.sheetUpdated') + ': ' + w + 'x' + h + ', kerf=' + k;
    } catch (err) { setStatusError(err.message); }
}

function onPartAdd() {
    try {
        var name = document.getElementById('input-part-name').value, w = +(document.getElementById('input-part-w').value) || 0, h = +(document.getElementById('input-part-h').value) || 0;
        var qty = +(document.getElementById('input-part-qty').value) || 1, rot = document.getElementById('input-part-rotate').checked;
        var ea = getEdgeArrayFromGroup('add-edges-group');
        projectManager.addPart(name, w, h, rot, qty, ea);
        document.getElementById('input-part-name').value = ''; document.getElementById('input-part-w').value = '';
        document.getElementById('input-part-h').value = ''; document.getElementById('input-part-qty').value = '1';
        document.getElementById('input-part-rotate').checked = false;
        var addCbs = document.querySelectorAll('#add-edges-group .edge-cb');
        for (var ci = 0; ci < addCbs.length; ci++) addCbs[ci].checked = false;
        syncEdgeButtons('add-edges-group'); refreshPartsTable(); refreshAllUI(); saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.partAdded') + ': ' + name;
    } catch (err) { setStatusError(err.message); }
}

async function onSheetImport() {
    try {
        var r = await Neutralino.os.showOpenDialog('Import Sheet', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r || !r.length) return;
        projectManager.importSheetFromJSON(await Neutralino.filesystem.readFile(r[0])); refreshAllUI(); saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.sheetImported');
    } catch (err) { setStatusError(err.message); }
}
async function onSheetExport() {
    try {
        var r = await Neutralino.os.showSaveDialog('Export Sheet', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r) return;
        r = ensureExt(r, '.json');
        await Neutralino.filesystem.writeFile(r, projectManager.exportSheetToJSON());
        document.getElementById('status-text').textContent = i18n.t('messages.sheetExported');
    } catch (err) { setStatusError(err.message); }
}
async function onPartsImport() {
    try {
        var r = await Neutralino.os.showOpenDialog('Import Parts', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r || !r.length) return;
        projectManager.importPartsFromJSON(await Neutralino.filesystem.readFile(r[0])); refreshPartsTable(); refreshAllUI(); saveLastProject();
        document.getElementById('status-text').textContent = i18n.t('messages.partsImported') + ': ' + projectManager.parts.length;
    } catch (err) { setStatusError(err.message); }
}
async function onPartsExport() {
    try {
        var r = await Neutralino.os.showSaveDialog('Export Parts', { filters: [{ name: 'JSON', extensions: ['json'] }] });
        if (!r) return;
        r = ensureExt(r, '.json');
        await Neutralino.filesystem.writeFile(r, projectManager.exportPartsToJSON());
        document.getElementById('status-text').textContent = i18n.t('messages.partsExported');
    } catch (err) { setStatusError(err.message); }
}

function refreshPartsTable() {
    var tb = document.getElementById('parts-table-body'), lb = document.getElementById('parts-count-label');
    if (!tb || !projectManager) return;
    tb.innerHTML = '';
    var c = projectManager.parts.length;
    if (lb) lb.textContent = '' + c;
    for (var i = 0; i < c; i++) {
        var p = projectManager.parts[i];
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + (i + 1) + '</td>' +
            '<td><input type="text" class="edit-name" value="' + escapeHtml(p.name) + '"></td>' +
            '<td><input type="number" class="edit-w" value="' + p.w + '" min="1"></td>' +
            '<td><input type="number" class="edit-h" value="' + p.h + '" min="1"></td>' +
            '<td><input type="number" class="edit-qty" value="' + p.qty + '" min="1" max="999"></td>' +
            '<td><div class="edges-group" data-row-idx="' + i + '">' +
            '<label class="edge-btn ' + (p.edges[0] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="0" ' + (p.edges[0] ? 'checked' : '') + '>' + i18n.t('data.parts.edge.l1') + '</label>' +
            '<label class="edge-btn ' + (p.edges[1] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="1" ' + (p.edges[1] ? 'checked' : '') + '>' + i18n.t('data.parts.edge.l2') + '</label>' +
            '<label class="edge-btn ' + (p.edges[2] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="2" ' + (p.edges[2] ? 'checked' : '') + '>' + i18n.t('data.parts.edge.s1') + '</label>' +
            '<label class="edge-btn ' + (p.edges[3] ? 'active' : '') + '"><input type="checkbox" class="edge-cb" data-side="3" ' + (p.edges[3] ? 'checked' : '') + '>' + i18n.t('data.parts.edge.s2') + '</label>' +
            '</div></td>' +
            '<td><input type="checkbox" class="edit-rot" ' + (p.canRotate ? 'checked' : '') + '></td>' +
            '<td><button class="btn-icon-small" data-index="' + i + '" title="Delete">X</button></td>';
        tb.appendChild(tr);
        var ni = tr.querySelector('.edit-name'), wi = tr.querySelector('.edit-w'), hi = tr.querySelector('.edit-h');
        var qi = tr.querySelector('.edit-qty'), ri = tr.querySelector('.edit-rot'), db = tr.querySelector('.btn-icon-small');
        var eg = tr.querySelector('.edges-group');
        function getRowEdges(group) {
            var cbs = group.querySelectorAll('.edge-cb'); var arr = [0, 0, 0, 0];
            for (var k = 0; k < cbs.length; k++) { var side = parseInt(cbs[k].getAttribute('data-side'), 10); if (side >= 0 && side < 4) arr[side] = cbs[k].checked ? 1 : 0; }
            return arr;
        }
        function mkHandler(idx, ne, we, he, qe, eg, re) { return function() {
            try { projectManager.updatePart(idx, ne.value, +(we.value) || 0, +(he.value) || 0, re.checked, +(qe.value) || 1, getRowEdges(eg)); refreshPartsTable(); saveLastProject(); }
            catch (err) { setStatusError(err.message); }
        };}
        var h = mkHandler(i, ni, wi, hi, qi, eg, ri);
        ni.addEventListener('change', h); wi.addEventListener('change', h); hi.addEventListener('change', h);
        qi.addEventListener('change', h); ri.addEventListener('change', h);
        var ecbs = eg.querySelectorAll('.edge-cb');
        for (var ek = 0; ek < ecbs.length; ek++) ecbs[ek].addEventListener('change', h);
        db.addEventListener('click', function() { var idx = +(this.getAttribute('data-index')); try { projectManager.removePart(idx); refreshPartsTable(); refreshAllUI(); saveLastProject(); } catch (err) { setStatusError(err.message); } });
    }
}

async function runOptimization() {
    if (!projectManager) return;
    var btn = document.getElementById('btn-run'), st = document.getElementById('status-text');
    var pc = document.getElementById('progress-container'), pf = document.getElementById('progress-fill'), pt = document.getElementById('progress-text');
    var s = getSettings();
    btn.disabled = true; st.textContent = i18n.t('optimization.running'); pc.classList.remove('hidden'); pf.style.width = '0%'; pt.textContent = '0%';
    try {
        var t0 = performance.now();
        var sum = await projectManager.runOptimization(s.iterations, s.beamWidth, s.randomize, function(cur, tot) {
            var pct = Math.round(cur / tot * 100); pf.style.width = pct + '%'; pt.textContent = pct + '%';
        });
        var t = ((performance.now() - t0) / 1000).toFixed(2);
        document.getElementById('result-sheets').textContent = sum.sheetCount;
        document.getElementById('result-efficiency').textContent = sum.avgEfficiency.toFixed(2) + '%';
        document.getElementById('result-score').textContent = sum.score.toFixed(2);
        document.getElementById('result-placed').textContent = sum.totalPlacedParts + ' / ' + (projectManager.lastExpandedPartsCount || 0);
        st.textContent = i18n.t('optimization.done') + ' ' + t + i18n.t('optimization.seconds');
        switchTab('results');
        if (projectManager.getLayout()) {
            activeSheetIndex = 0;
            renderSVG(projectManager.getLayout());
        }
        await saveLastProject();
    } catch (err) { console.error(err); setStatusError(err.message); } finally { btn.disabled = false; pc.classList.add('hidden'); }
}

function ensureExt(fp, ext) { return fp.toLowerCase().endsWith(ext.toLowerCase()) ? fp : fp + ext; }

async function exportCSV() {
    if (!projectManager || !projectManager.parts.length) { document.getElementById('status-text').textContent = i18n.t('messages.noData'); return; }
    try {
        var rows = [i18n.t('export.csv.header')];
        for (var i = 0; i < projectManager.parts.length; i++) {
            var p = projectManager.parts[i];
            rows.push('"' + (p.name || '').replace(/"/g, '""') + '",' + p.w + ',' + p.h + ',' + p.qty + ',"' + formatEdges(p.edges) + '",' + (p.canRotate ? 1 : 0));
        }
        var r = await Neutralino.os.showSaveDialog('Export CSV', { filters: [{ name: 'CSV', extensions: ['csv'] }] });
        if (!r) return; await Neutralino.filesystem.writeFile(ensureExt(r, '.csv'), rows.join('\r\n'));
        document.getElementById('status-text').textContent = i18n.t('messages.csvExported');
    } catch (err) { setStatusError(err.message); }
}

async function exportPNG() {
    var layout = projectManager && projectManager.getLayout ? projectManager.getLayout() : null;
    if (!layout || !layout.sheets || !layout.sheets.length) {
        document.getElementById('status-text').textContent = i18n.t('messages.noVisualization');
        return;
    }
    try {
        var savePath = await Neutralino.os.showSaveDialog('Export PNG', { filters: [{ name: 'PNG', extensions: ['png'] }] });
        if (!savePath) return;
        var scale = 2;
        var total = layout.sheets.length;
        for (var i = 0; i < total; i++) {
            var svg = renderSheetSvg(layout, i);
            if (!svg) throw new Error('Unable to render sheet ' + (i + 1));
            var bytes = await svgToPngBytes(svg, scale);
            var filePath = buildSheetExportPath(savePath, i, total, '.png');
            await Neutralino.filesystem.writeBinaryFile(filePath, bytes.buffer);
        }
        document.getElementById('status-text').textContent = i18n.t('messages.pngExportedCount')
            .replace('{count}', String(total));
    } catch (err) { setStatusError(err.message); }
}

function getSvgIntrinsicSize(svgElement) {
    var viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        var values = viewBox.trim().split(/[ ,]+/).map(Number);
        if (values.length === 4 && values[2] > 0 && values[3] > 0) {
            return { width: values[2], height: values[3] };
        }
    }
    return {
        width: Number(svgElement.getAttribute('width')) || 1,
        height: Number(svgElement.getAttribute('height')) || 1
    };
}

function svgToPngBytes(svgElement, scale) {
    return new Promise(function(resolve, reject) {
        var svgData = serializeSvgForExport(svgElement);
        var url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' }));
        var size = getSvgIntrinsicSize(svgElement);
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(size.width * scale);
        canvas.height = Math.ceil(size.height * scale);
        var context = canvas.getContext('2d');
        var image = new Image();
        image.onload = function() {
            try {
                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(function(blob) {
                    URL.revokeObjectURL(url);
                    if (!blob) { reject(new Error('PNG conversion returned no data')); return; }
                    var reader = new FileReader();
                    reader.onload = function() {
                        var base64 = reader.result.split(',')[1];
                        var binary = atob(base64), bytes = new Uint8Array(binary.length);
                        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                        resolve(bytes);
                    };
                    reader.onerror = function() { reject(new Error('Unable to read PNG data')); };
                    reader.readAsDataURL(blob);
                }, 'image/png');
            } catch (err) {
                URL.revokeObjectURL(url);
                reject(err);
            }
        };
        image.onerror = function() {
            URL.revokeObjectURL(url);
            reject(new Error('Unable to rasterize sheet SVG'));
        };
        image.src = url;
    });
}

function buildSheetExportPath(basePath, sheetIndex, sheetCount, extension) {
    var normalized = basePath.replace(/[.][^./\\]+$/, '');
    var digits = String(Math.max(1, sheetCount)).length;
    var number = String(sheetIndex + 1);
    while (number.length < digits) number = '0' + number;
    return normalized + '-sheet-' + number + extension;
}

function serializeSvgForExport(svgElement) {
    var clone = svgElement.cloneNode(true);
    clone.removeAttribute('style');
    clone.setAttribute('width', clone.getAttribute('data-export-width') || clone.viewBox.baseVal.width);
    clone.setAttribute('height', clone.getAttribute('data-export-height') || clone.viewBox.baseVal.height);
    return new XMLSerializer().serializeToString(clone);
}

function buildPdfPartsTable() {
    var rows = '';
    for (var i = 0; i < projectManager.parts.length; i++) {
        var p = projectManager.parts[i];
        rows += '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(p.name) + '</td><td>' + p.w + '</td><td>' + p.h + '</td><td>' + p.qty + '</td><td>' + formatEdges(p.edges) + '</td><td>' + (p.canRotate ? i18n.t('export.pdf.yes') : i18n.t('export.pdf.no')) + '</td></tr>';
    }
    return '<table><thead><tr><th>#</th><th>' + i18n.t('data.parts.th.name') + '</th><th>W</th><th>H</th><th>' + i18n.t('data.parts.th.qty') + '</th><th>' + i18n.t('export.pdf.edges') + '</th><th>Rot</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function buildPdfSheetPages(layout) {
    var pages = '';
    for (var i = 0; i < layout.sheets.length; i++) {
        var sheet = layout.sheets[i];
        var svg = renderSheetSvg(layout, i);
        var svgHtml = svg ? serializeSvgForExport(svg) : '';
        pages += '<section class="sheet-page" data-sheet-index="' + i + '">' +
            '<h2>' + i18n.t('export.pdf.sheet') + ' ' + (i + 1) + '</h2>' +
            '<p>' + i18n.t('export.pdf.sheet') + ': ' + sheet.w + 'x' + sheet.h + ' mm, ' +
                i18n.t('export.pdf.kerf') + ': ' + projectManager.kerf + ' mm, ' +
                i18n.t('export.pdf.efficiency') + ': ' + sheet.efficiency.toFixed(2) + '%, ' +
                i18n.t('export.pdf.parts') + ': ' + sheet.parts.length + '</p>' +
            '<div class="sheet-visual">' + svgHtml + '</div>' +
            '</section>';
    }
    return pages;
}

function buildPdfHtml(layout) {
    return '<!DOCTYPE html><html><head><title>' + i18n.t('export.pdf.title') + '</title><style>' +
        'html,body{margin:0;padding:0;}body{font-family:sans-serif;color:#333;padding:20px;}' +
        'h1{color:#2C3E50;font-size:22px;}h2{color:#2C3E50;font-size:20px;}' +
        'table{width:100%;border-collapse:collapse;margin:20px 0;}th{background:#2C3E50;color:#fff;padding:8px;text-align:left;}' +
        'td{padding:6px 8px;border-bottom:1px solid #ddd;}' +
        '.summary-page{min-height:240mm;}.sheet-page{break-before:page;page-break-before:always;break-inside:avoid;page-break-inside:avoid;min-height:240mm;}' +
        '.sheet-visual{margin:16px 0;text-align:center;}.sheet-visual svg{display:block;width:100%;height:auto;max-height:220mm;}' +
        '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} .sheet-page{break-before:page;page-break-before:always;}}' +
        '</style></head><body>' +
        '<section class="summary-page"><h1>' + i18n.t('export.pdf.title') + '</h1>' +
        '<p>' + i18n.t('export.pdf.sheet') + ': ' + projectManager.sheetW + 'x' + projectManager.sheetH + ' mm, ' +
            i18n.t('export.pdf.kerf') + ': ' + projectManager.kerf + ' mm</p>' +
        buildPdfPartsTable() + '</section>' + buildPdfSheetPages(layout) +
        '</body></html>';
}

async function exportPDF() {
    if (!projectManager || !projectManager.parts.length) { document.getElementById('status-text').textContent = i18n.t('messages.noData'); return; }
    try {
        var layout = projectManager.getLayout();
        if (!layout || !layout.sheets || !layout.sheets.length) { document.getElementById('status-text').textContent = i18n.t('messages.noVisualization'); return; }
        var pw = window.open('', '_blank', 'width=800,height=600');
        if (!pw) {
            alert(i18n.t('error.popupBlocked'));
            return;
        }
        pw.document.write(buildPdfHtml(layout));
        pw.document.close(); pw.focus();
        setTimeout(function() { pw.print(); }, 700);
        document.getElementById('status-text').textContent = i18n.t('messages.pdfExported');
    } catch (err) { setStatusError(err.message); }
}

function switchTab(tab) {
    var tc = document.querySelectorAll('.tab-content'), tb = document.querySelectorAll('.tab-btn');
    for (var i = 0; i < tc.length; i++) tc[i].classList.remove('active');
    for (var j = 0; j < tb.length; j++) tb[j].classList.remove('active');
    var t = document.getElementById('tab-' + tab); if (t) t.classList.add('active');
    var b = document.querySelector('.tab-btn[data-tab="' + tab + '"]'); if (b) b.classList.add('active');
}

document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.edge-btn');
        if (!btn) return;
        var cb = btn.querySelector('.edge-cb');
        if (cb) {
            cb.checked = !cb.checked;
            if (cb.checked) btn.classList.add('active'); else btn.classList.remove('active');
            var evt = new Event('change', { bubbles: true }); cb.dispatchEvent(evt);
        }
    });

    document.getElementById('btn-run')?.addEventListener('click', runOptimization);
    document.getElementById('btn-settings-help')?.addEventListener('click', openSettingsHelp);
    document.getElementById('btn-settings-help-close')?.addEventListener('click', closeSettingsHelp);
    document.querySelector('#settings-help-modal [data-help-close="true"]')?.addEventListener('click', closeSettingsHelp);
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && !document.getElementById('settings-help-modal')?.classList.contains('hidden')) closeSettingsHelp();
    });
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
    document.getElementById('btn-sheet-prev')?.addEventListener('click', showPreviousSheet);
    document.getElementById('btn-sheet-next')?.addEventListener('click', showNextSheet);
    document.getElementById('example-select')?.addEventListener('change', onExampleSelect);
    syncEdgeButtons('add-edges-group');
});

window.addEventListener('error', function(e) {
    var msg = (typeof e === 'string') ? e : (e.message || 'Unknown error');
    setStatusError(msg);
});

Neutralino.events.on('ready', onReady);
try { Neutralino.init(); } catch (err) { console.error('Init failed:', err); }