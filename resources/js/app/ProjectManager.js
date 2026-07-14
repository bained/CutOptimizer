'use strict';

/**
 * ProjectManager — управлява жизнения цикъл на един проект.
 */
class ProjectManager {
    /**
     * @param {string} configPath
     */
    constructor(configPath) {
        this.config = new ConfigManager(configPath);
        this.optimizer = null;
        this.parts = [];
        this.sheetW = 0;
        this.sheetH = 0;
        this.kerf = 0;
        this.result = null;
        this.projectFilePath = '';
    }

    parseNumericValue(val) {
        if (typeof val === 'string') {
            return parseInt(val, 10);
        }
        return val;
    }

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
            for (let i = 0; i < data.parts.length; i++) {
                const p = data.parts[i];
                const part = new Part(
                    p.n,
                    this.parseNumericValue(p.w),
                    this.parseNumericValue(p.h),
                    this.parseNumericValue(p.r) === 1
                );
                this.parts.push(part);
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

    async runOptimization(iterations, beamWidth, randomize, onProgress) {
        if (!this.optimizer) {
            throw new Error('ProjectManager: No project loaded.');
        }

        if (this.parts.length === 0) {
            throw new Error('ProjectManager: No parts to optimize.');
        }

        var layout = this.optimizer.optimize(this.parts, iterations, beamWidth, randomize, onProgress);
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