'use strict';

/**
 * ProjectManager — управлява жизнения цикъл на един проект.
 * Действа като централен Store за всички данни.
 */
class ProjectManager {
    /**
     * @param {string} configPath
     */
    constructor(configPath) {
        this.config = new ConfigManager(configPath);
        this.optimizer = null;
        this.parts = [];
        this.sheetW = 2440;
        this.sheetH = 2070;
        this.kerf = 4;
        this.result = null;
        this.projectFilePath = '';
    }

    parseNumericValue(val) {
        if (typeof val === 'string') {
            return parseInt(val, 10);
        }
        return val;
    }

    // ==================== SHEET ====================

    /**
     * Актуализира параметрите на листа и пресъздава Optimizer-а.
     */
    updateSheet(w, h, kerf) {
        if (w <= 0 || h <= 0 || kerf < 0) {
            throw new Error('Sheet dimensions must be positive numbers.');
        }
        this.sheetW = w;
        this.sheetH = h;
        this.kerf = kerf;
        this.optimizer = new Optimizer(w, h, kerf);
        this.result = null;
    }

    /**
     * Връща sheet параметри като обект.
     */
    getSheetData() {
        return {
            sheetW: this.sheetW,
            sheetH: this.sheetH,
            kerf: this.kerf
        };
    }

    /**
     * Връща sheet данни като JSON string.
     */
    exportSheetToJSON() {
        return JSON.stringify(this.getSheetData(), null, 2);
    }

    /**
     * Зарежда sheet от JSON string.
     */
    importSheetFromJSON(jsonString) {
        var data = JSON.parse(jsonString);
        var w = this.parseNumericValue(data.sheetW);
        var h = this.parseNumericValue(data.sheetH);
        var kerf = this.parseNumericValue(data.kerf);
        this.updateSheet(w, h, kerf);
    }

    // ==================== PARTS ====================

    /**
     * Добавя нова част.
     */
    addPart(name, w, h, canRotate, qty, edges) {
        if (!name || name.trim() === '') {
            throw new Error('Part name cannot be empty.');
        }
        if (w <= 0 || h <= 0) {
            throw new Error('Part dimensions must be positive numbers.');
        }
        this.parts.push(new Part(name.trim(), w, h, !!canRotate, qty, edges));
        this.result = null;
    }

    /**
     * Премахва част по индекс.
     */
    removePart(index) {
        if (index < 0 || index >= this.parts.length) {
            throw new Error('Invalid part index.');
        }
        this.parts.splice(index, 1);
        this.result = null;
    }

    /**
     * Редактира част по индекс.
     */
    updatePart(index, name, w, h, canRotate, qty, edges) {
        if (index < 0 || index >= this.parts.length) {
            throw new Error('Invalid part index.');
        }
        if (!name || name.trim() === '') {
            throw new Error('Part name cannot be empty.');
        }
        if (w <= 0 || h <= 0) {
            throw new Error('Part dimensions must be positive numbers.');
        }
        this.parts[index] = new Part(name.trim(), w, h, !!canRotate, qty, edges);
        this.result = null;
    }

    /**
     * Връща всички части като масив.
     */
    getPartsData() {
        var result = [];
        for (var i = 0; i < this.parts.length; i++) {
            var p = this.parts[i];
            result.push({
                n: p.name,
                w: p.w,
                h: p.h,
                r: p.canRotate ? 1 : 0,
                q: p.qty,
                e: p.edges
            });
        }
        return result;
    }

    /**
     * Връща частите като JSON string.
     */
    exportPartsToJSON() {
        return JSON.stringify({ parts: this.getPartsData() }, null, 2);
    }

    /**
     * Зарежда части от JSON string.
     * Поддържа legacy формат без qty/edges — задава defaults.
     */
    importPartsFromJSON(jsonString) {
        var data = JSON.parse(jsonString);
        if (!data.parts || !Array.isArray(data.parts)) {
            throw new Error('Invalid parts JSON: missing "parts" array.');
        }
        this.parts = [];
        for (var i = 0; i < data.parts.length; i++) {
            var p = data.parts[i];
            var qty = (p.q !== undefined) ? this.parseNumericValue(p.q) : 1;
            var edges = (p.e && Array.isArray(p.e) && p.e.length === 4)
                ? p.e.map(function(v) { return parseInt(v, 10) || 0; })
                : [0, 0, 0, 0];
            this.addPart(
                p.n,
                this.parseNumericValue(p.w),
                this.parseNumericValue(p.h),
                this.parseNumericValue(p.r) === 1,
                qty,
                edges
            );
        }
    }

    // ==================== FILE LOAD ====================

    async loadProject(filePath) {
        try {
            var basePath = (typeof NL_PATH !== 'undefined') ? NL_PATH : '';
            var fullPath = basePath + '/' + filePath;
            console.log('ProjectManager: Loading project from:', fullPath);

            var content = await Neutralino.filesystem.readFile(fullPath);
            var data = JSON.parse(content);

            this.sheetW = this.parseNumericValue(data.sheetW);
            this.sheetH = this.parseNumericValue(data.sheetH);
            this.kerf = this.parseNumericValue(data.kerf);

            this.parts = [];
            for (var i = 0; i < data.parts.length; i++) {
                var p = data.parts[i];
                var qty = (p.q !== undefined) ? this.parseNumericValue(p.q) : 1;
                var edges = (p.e && Array.isArray(p.e) && p.e.length === 4)
                    ? p.e.map(function(v) { return parseInt(v, 10) || 0; })
                    : [0, 0, 0, 0];
                this.parts.push(new Part(
                    p.n,
                    this.parseNumericValue(p.w),
                    this.parseNumericValue(p.h),
                    this.parseNumericValue(p.r) === 1,
                    qty,
                    edges
                ));
            }

            this.projectFilePath = filePath;
            this.result = null;

            this.optimizer = new Optimizer(this.sheetW, this.sheetH, this.kerf);

            await this.config.load();

            return {
                sheetW: this.sheetW,
                sheetH: this.sheetH,
                kerf: this.kerf,
                partCount: this.parts.length
            };
        } catch (err) {
            console.error('ProjectManager: Failed to load project.', err.message);
            throw err;
        }
    }

    /**
     * Разгръща списъка с части според qty.
     * Напр. Side_Left с qty=2 → два отделни Part обекта.
     * Не променя оригиналния this.parts масив.
     */
    expandParts() {
        var expanded = [];
        for (var i = 0; i < this.parts.length; i++) {
            var p = this.parts[i];
            for (var j = 0; j < p.qty; j++) {
                expanded.push(p.copy());
            }
        }
        return expanded;
    }

    async runOptimization(iterations, beamWidth, randomize, onProgress) {
        if (!this.optimizer) {
            throw new Error('ProjectManager: No project loaded.');
        }

        if (!this.parts || !Array.isArray(this.parts) || this.parts.length === 0) {
            throw new Error('ProjectManager: No parts to optimize.');
        }

        // Разгръщаме според qty — динамично, без да променяме оригиналния списък
        var expandedParts = this.expandParts();
        this.lastExpandedPartsCount = expandedParts.length;

        console.log('ProjectManager.runOptimization: compactParts=' + this.parts.length +
            ', expandedParts=' + expandedParts.length +
            ', sheet=' + this.sheetW + 'x' + this.sheetH + ', kerf=' + this.kerf +
            ', iterations=' + iterations + ', beamWidth=' + beamWidth + ', randomize=' + randomize);

        var layout = await this.optimizer.optimize(expandedParts, iterations, beamWidth, randomize, onProgress);
        this.result = layout;

        return this.getResultSummary();
    }

    getResultSummary() {
        if (!this.result) {
            return null;
        }

        var totalParts = this.countTotalPlacedParts();
        var totalEff = 0;
        for (var i = 0; i < this.result.sheets.length; i++) {
            totalEff += this.result.sheets[i].efficiency;
        }
        var avgEfficiency = this.result.sheets.length > 0
            ? (totalEff / this.result.sheets.length)
            : 0;

        return {
            sheetCount: this.result.sheets.length,
            totalPlacedParts: totalParts,
            avgEfficiency: avgEfficiency,
            score: this.result.score
        };
    }

    countTotalPlacedParts() {
        var count = 0;
        for (var i = 0; i < this.result.sheets.length; i++) {
            count += this.result.sheets[i].parts.length;
        }
        return count;
    }

    async saveResult(outputPath) {
        if (!this.result) {
            throw new Error('ProjectManager: No result to save.');
        }

        var output = {
            input: {
                sheetW: this.sheetW,
                sheetH: this.sheetH,
                kerf: this.kerf,
                partCount: this.parts.length
            },
            result: this.getResultSummary(),
            sheets: []
        };

        for (var si = 0; si < this.result.sheets.length; si++) {
            var s = this.result.sheets[si];
            var sheetData = {
                efficiency: s.efficiency,
                parts: []
            };

            for (var pi = 0; pi < s.parts.length; pi++) {
                var p = s.parts[pi];
                sheetData.parts.push({
                    name: p.name,
                    x: p.x,
                    y: p.y,
                    w: p.w,
                    h: p.h,
                    rotated: p.rotated ? 1 : 0
                });
            }

            output.sheets.push(sheetData);
        }

        try {
            await Neutralino.filesystem.writeFile(outputPath, JSON.stringify(output, null, 2));
        } catch (err) {
            console.error('ProjectManager: Failed to save result.', err.message);
            throw err;
        }
    }

    getLayout() {
        return this.result;
    }
}