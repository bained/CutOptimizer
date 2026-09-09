'use strict';

/**
 * SeededRandom — LCG (Linear Congruential Generator) за детерминистична random стойност.
 */
class SeededRandom {
    /**
     * @param {number} seed - Цяло число > 0.
     */
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }

    /**
     * Връща следващата random стойност [0, 1).
     * @returns {number}
     */
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
}

/**
 * Layout — множество от листове с обща оценка.
 */
class Layout {
    constructor() {
        this.sheets = [];
        this.score = 0.0;
    }

    copy() {
        var copy = new Layout();
        copy.score = this.score;
        // Запазваме независимостта на layout-а, но избягваме resize на масива.
        copy.sheets = new Array(this.sheets.length);
        for (var i = 0; i < this.sheets.length; i++) {
            copy.sheets[i] = this.sheets[i].copy();
        }
        return copy;
    }
}

class DeltaCandidate {
    constructor(parent, sheetIndex, sheet, score) {
        this.parent = parent;
        this.sheetIndex = sheetIndex;
        this.sheet = sheet;
        this.score = score;
    }
}

/**
 * Optimizer — основен алгоритъм за оптимизация на разкроя (Beam Search V6).
 */
class Optimizer {
    /**
     * @param {number} sheetW
     * @param {number} sheetH
     * @param {number} kerf
     */
    constructor(sheetW, sheetH, kerf) {
        this.sheetW = sheetW;
        this.sheetH = sheetH;
        this.kerf = kerf;
        this.rng = new SeededRandom(42);
        this.instrumentationEnabled = false;
        this.stats = null;
        this.diagnosticLogging = false;
        // Optimized path is the default; false keeps the reference fallback.
        this.parentDeltaCandidates = true;
        // Experimental for large free-rectangle lists; full cleanup is the
        // reference default until a larger workload proves a benefit.
        this.incrementalCleanup = false;
        // Experimental until a larger workload proves a runtime benefit.
        this.topKSelection = false;
        this.candidateGenerationIndex = 0;
        // UI yield every five iterations; set to 1 for the legacy behavior.
        this.batchSize = 5;
    }

    enableInstrumentation(enabled) {
        this.instrumentationEnabled = !!enabled;
        this.stats = this.instrumentationEnabled ? {
            iterations: 0,
            beamSearches: 0,
            candidateAttempts: 0,
            rejectedCandidates: 0,
            generatedCandidates: 0,
            layoutCopies: 0,
            copyTimeMs: 0,
            candidateTimeMs: 0,
            beamTimeMs: 0,
            optimizeTimeMs: 0,
            splitCalls: 0,
            cleanCalls: 0,
            sortCalls: 0,
            splitTimeMs: 0,
            cleanTimeMs: 0,
            sortTimeMs: 0,
            freeRectsProcessed: 0,
            freeRectsAfterSplit: 0,
            invalidFreeRectsRejected: 0,
            cleanPairChecks: 0,
            cleanSkippedOldPairs: 0,
            maxCandidatesObserved: 0,
            candidatesSeen: 0,
            topKComparisons: 0,
            topKRejections: 0,
            prefilteredRectAttempts: 0,
            maxFreeRects: 0
        } : null;
    }

    getInstrumentation() {
        return this.stats ? Object.assign({}, this.stats) : null;
    }

    now() {
        return (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
    }

    copyLayout(layout) {
        var start = this.instrumentationEnabled ? this.now() : 0;
        var copy = layout.copy();
        if (this.instrumentationEnabled) {
            this.stats.layoutCopies++;
            this.stats.copyTimeMs += this.now() - start;
        }
        return copy;
    }

    candidateCompare(a, b) {
        if (a.score !== b.score) return b.score - a.score;
        return a.generationIndex - b.generationIndex;
    }

    appendCandidate(outCandidates, candidate) {
        candidate.generationIndex = this.candidateGenerationIndex++;
        this.candidatesSeenThisStep++;
        if (this.instrumentationEnabled) {
            this.stats.candidatesSeen++;
            if (this.candidatesSeenThisStep > this.stats.maxCandidatesObserved) {
                this.stats.maxCandidatesObserved = this.candidatesSeenThisStep;
            }
        }
        if (!this.topKSelection || this.topKLimit <= 0) {
            outCandidates.push(candidate);
            return;
        }
        var limit = this.topKLimit;
        var length = outCandidates.length;
        var insertAt = length;
        while (insertAt > 0) {
            if (this.instrumentationEnabled) this.stats.topKComparisons++;
            if (this.candidateCompare(outCandidates[insertAt - 1], candidate) <= 0) break;
            insertAt--;
        }
        if (insertAt >= limit) {
            if (this.instrumentationEnabled) this.stats.topKRejections++;
            return;
        }
        outCandidates.length = length < limit ? length + 1 : limit;
        for (var i = outCandidates.length - 1; i > insertAt; i--) {
            outCandidates[i] = outCandidates[i - 1];
        }
        outCandidates[insertAt] = candidate;
    }

    materializeCandidate(candidate) {
        var layout = new Layout();
        layout.score = candidate.score;
        layout.sheets = new Array(candidate.parent.sheets.length +
            (candidate.sheetIndex === candidate.parent.sheets.length ? 1 : 0));
        for (var i = 0; i < candidate.parent.sheets.length; i++) {
            layout.sheets[i] = i === candidate.sheetIndex
                ? candidate.sheet
                : candidate.parent.sheets[i].copy();
        }
        if (candidate.sheetIndex === candidate.parent.sheets.length) {
            layout.sheets[candidate.sheetIndex] = candidate.sheet;
        }
        return layout;
    }

    /**
     * Задава seed за рандомизатора.
     * @param {number} seed
     */
    setSeed(seed) {
        this.rng = new SeededRandom(seed);
    }

    createSheet() {
        return new Sheet(this.sheetW, this.sheetH);
    }

    splitRects(sheet, placed) {
        var start = this.instrumentationEnabled ? this.now() : 0;
        if (this.instrumentationEnabled) {
            this.stats.splitCalls++;
            this.stats.freeRectsProcessed += sheet.freeRects.length;
        }
        var pw = placed.w + this.kerf;
        var ph = placed.h + this.kerf;
        var source = sheet.freeRects;
        var nextBufferIndex = source === sheet.splitRectBuffers[0] ? 1 : 0;
        var next = sheet.splitRectBuffers[nextBufferIndex];
        var nextFlags = sheet.splitRectNewFlags[nextBufferIndex];
        var nextCount = 0;

        var appendRect = function(x, y, w, h, isNew) {
            if (w <= 0 || h <= 0) {
                if (this.instrumentationEnabled) this.stats.invalidFreeRectsRejected++;
                return;
            }
            var index = nextCount++;
            var rect = next[index];
            if (rect === undefined) {
                rect = new Rect(x, y, w, h);
                next[index] = rect;
            } else {
                rect.x = x;
                rect.y = y;
                rect.w = w;
                rect.h = h;
            }
            nextFlags[index] = isNew;
        }.bind(this);

        for (var i = 0; i < source.length; i++) {
            var fr = source[i];

            var overlapX = placed.x < fr.x + fr.w && placed.x + pw > fr.x;
            var overlapY = placed.y < fr.y + fr.h && placed.y + ph > fr.y;

            if (overlapX && overlapY) {
                if (placed.x > fr.x) {
                    appendRect(fr.x, fr.y, placed.x - fr.x, fr.h, true);
                }
                if (placed.x + pw < fr.x + fr.w) {
                    appendRect(placed.x + pw, fr.y, fr.x + fr.w - (placed.x + pw), fr.h, true);
                }
                if (placed.y > fr.y) {
                    appendRect(fr.x, fr.y, fr.w, placed.y - fr.y, true);
                }
                if (placed.y + ph < fr.y + fr.h) {
                    appendRect(fr.x, placed.y + ph, fr.w, fr.y + fr.h - (placed.y + ph), true);
                }
            } else {
                appendRect(fr.x, fr.y, fr.w, fr.h, false);
            }
        }

        next.length = nextCount;
        nextFlags.length = nextCount;
        sheet.freeRects = next;
        sheet.freeRectNewFlags = nextFlags;
        sheet.splitRectBufferIndex = nextBufferIndex;
        if (this.instrumentationEnabled) {
            this.stats.splitTimeMs += this.now() - start;
            this.stats.freeRectsAfterSplit += next.length;
            if (next.length > this.stats.maxFreeRects) this.stats.maxFreeRects = next.length;
        }
    }

    cleanRects(sheet) {
        if (sheet.freeRects.length < 2) return;

        var start = this.instrumentationEnabled ? this.now() : 0;
        if (this.instrumentationEnabled) this.stats.cleanCalls++;

        var sourceFlags = sheet.freeRectNewFlags || [];
        var result = sheet.cleanRectBuffer;
        var resultFlags = sheet.cleanRectFlags;
        result.length = 0;
        resultFlags.length = 0;
        for (var i = 0; i < sheet.freeRects.length; i++) {
            var a = sheet.freeRects[i];
            var inside = false;

            for (var j = 0; j < sheet.freeRects.length; j++) {
                if (i === j) continue;
                if (this.incrementalCleanup && !sourceFlags[i] && !sourceFlags[j]) {
                    if (this.instrumentationEnabled) this.stats.cleanSkippedOldPairs++;
                    continue;
                }
                if (this.instrumentationEnabled) this.stats.cleanPairChecks++;
                var b = sheet.freeRects[j];

                if (a.x >= b.x && a.y >= b.y &&
                    a.x + a.w <= b.x + b.w &&
                    a.y + a.h <= b.y + b.h) {
                    inside = true;
                    break;
                }
            }

            if (!inside) {
                result[result.length] = a;
                resultFlags[resultFlags.length] = false;
            }
        }

        sheet.freeRects = result;
        sheet.freeRectNewFlags = resultFlags;
        if (this.instrumentationEnabled) this.stats.cleanTimeMs += this.now() - start;
    }

    finalize(sheet) {
        sheet.efficiency = sheet.calculateEfficiency();
    }

    evaluate(sheets) {
        var sheetCount = sheets.length;
        var totalEff = 0;

        for (var i = 0; i < sheetCount; i++) {
            totalEff += sheets[i].efficiency * sheets[i].efficiency;
        }

        return (10000000.0 / sheetCount) + totalEff;
    }

    tryCandidate(outLayouts, base, part, sheetIndex, rectIndex, rotated) {
        var candidateStart = this.instrumentationEnabled ? this.now() : 0;
        if (this.instrumentationEnabled) this.stats.candidateAttempts++;
        var baseSheet = sheetIndex === base.sheets.length
            ? this.createSheet()
            : base.sheets[sheetIndex];
        var r = baseSheet.freeRects[rectIndex];
        var pw = rotated ? part.h : part.w;
        var ph = rotated ? part.w : part.h;

        if (pw > r.w || ph > r.h) {
            if (this.instrumentationEnabled) this.stats.rejectedCandidates++;
            return;
        }

        if (this.parentDeltaCandidates) {
            var deltaSheet = baseSheet.copy();
            var deltaPlaced = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated, part.edges);
            deltaSheet.parts.push(deltaPlaced);
            deltaSheet.usedArea += pw * ph;
            deltaSheet.gravityPenalty += (r.x + r.y) * 0.005;
            this.splitRects(deltaSheet, deltaPlaced);
            this.cleanRects(deltaSheet);
            this.finalize(deltaSheet);
            var deltaScore = 0;
            for (var dsi = 0; dsi < base.sheets.length; dsi++) {
                deltaScore += (dsi === sheetIndex ? deltaSheet.efficiency : base.sheets[dsi].efficiency) ** 2;
            }
            var deltaSheetCount = sheetIndex === base.sheets.length ? base.sheets.length + 1 : base.sheets.length;
            if (sheetIndex === base.sheets.length) deltaScore += deltaSheet.efficiency * deltaSheet.efficiency;
            deltaScore += 10000000.0 / deltaSheetCount - deltaSheet.gravityPenalty;
            this.appendCandidate(outLayouts, new DeltaCandidate(base, sheetIndex, deltaSheet, deltaScore));
            if (this.instrumentationEnabled) this.stats.generatedCandidates++;
            if (this.instrumentationEnabled) this.stats.candidateTimeMs += this.now() - candidateStart;
            return;
        }

        var layout = this.copyLayout(base);
        var s = layout.sheets[sheetIndex];

        var placed = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated, part.edges);
        s.parts.push(placed);
        s.usedArea += pw * ph;
        s.gravityPenalty += (r.x + r.y) * 0.005;

        this.splitRects(s, placed);
        this.cleanRects(s);
        this.finalize(s);

        layout.score = this.evaluate(layout.sheets) - s.gravityPenalty;
        this.appendCandidate(outLayouts, layout);
        if (this.instrumentationEnabled) this.stats.generatedCandidates++;
        if (this.instrumentationEnabled) this.stats.candidateTimeMs += this.now() - candidateStart;
    }

    /**
     * Beam Search алгоритъм.
     * @param {Part[]} parts
     * @param {number} beamWidth
     * @param {number} totalIterations - Общ брой итерации (за progress).
     * @param {number} currentIteration - Текуща итерация (за progress).
     * @param {function} onProgress - Callback(currentIteration, totalIterations).
     * @returns {Layout}
     */
    beamSearch(parts, beamWidth, totalIterations, currentIteration, onProgress) {
        var beamStart = this.instrumentationEnabled ? this.now() : 0;
        if (this.instrumentationEnabled) this.stats.beamSearches++;
        var beam = new Array(Math.max(beamWidth, 1));
        beam.length = 0;
        // Този контейнер се използва повторно за всяка част. length = 0
        // запазва вътрешния capacity на масива във V8, без да споделя layouts.
        var nextCandidates = new Array(Math.max(beamWidth * 8, 16));
        nextCandidates.length = 0;
        this.candidateGenerationIndex = 0;
        this.topKLimit = beamWidth;

        var initial = new Layout();
        initial.sheets.push(this.createSheet());
        beam.push(initial);

        for (var pi = 0; pi < parts.length; pi++) {
            var p = parts[pi];
            nextCandidates.length = 0;
            this.candidatesSeenThisStep = 0;

            for (var bi = 0; bi < beam.length; bi++) {
                var layout = beam[bi];

                for (var si = 0; si < layout.sheets.length; si++) {
                    for (var ri = 0; ri < layout.sheets[si].freeRects.length; ri++) {
                        this.tryCandidate(nextCandidates, layout, p, si, ri, false);
                        if (p.canRotate) {
                            this.tryCandidate(nextCandidates, layout, p, si, ri, true);
                        }
                    }
                }

                if (this.parentDeltaCandidates) {
                    this.tryCandidate(nextCandidates, layout, p, layout.sheets.length, 0, false);
                    if (p.canRotate) this.tryCandidate(nextCandidates, layout, p, layout.sheets.length, 0, true);
                    continue;
                }
                var newSheetLayout = this.copyLayout(layout);
                newSheetLayout.sheets.push(this.createSheet());
                var newSheetIndex = newSheetLayout.sheets.length - 1;
                this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, false);
                if (p.canRotate) {
                    this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, true);
                }
            }

            var sortStart = this.instrumentationEnabled ? this.now() : 0;
            if (!this.topKSelection) {
                nextCandidates.sort(this.candidateCompare.bind(this));
            }
            if (this.instrumentationEnabled) {
                this.stats.sortCalls++;
                this.stats.sortTimeMs += this.now() - sortStart;
            }
            var survivorCount = Math.min(beamWidth, nextCandidates.length);
            if (this.parentDeltaCandidates) {
                var survivors = new Array(survivorCount);
                for (var candidateIndex = 0; candidateIndex < survivorCount; candidateIndex++) {
                    survivors[candidateIndex] = this.materializeCandidate(nextCandidates[candidateIndex]);
                }
                beam = survivors;
            } else {
                beam = nextCandidates.slice(0, survivorCount);
            }
        }

        // Обаждаме прогреса веднъж на итерация
        if (onProgress && typeof onProgress === 'function') {
            onProgress(currentIteration + 1, totalIterations);
        }

        if (this.instrumentationEnabled) this.stats.beamTimeMs += this.now() - beamStart;
        return beam[0];
    }

    prepareWorkingParts(parts, iteration) {
        var workingParts = parts.slice();
        if (iteration % 3 === 0) {
            workingParts.sort(function(a, b) { return b.area - a.area; });
        } else if (iteration % 3 === 1) {
            workingParts.sort(function(a, b) {
                return Math.max(b.w, b.h) - Math.max(a.w, a.h);
            });
        } else {
            for (var j = workingParts.length - 1; j > 0; j--) {
                var k = Math.floor(this.rng.next() * (j + 1));
                var temp = workingParts[j];
                workingParts[j] = workingParts[k];
                workingParts[k] = temp;
            }
        }
        return workingParts;
    }

    optimizeIteration(parts, iteration, iterations, beamWidth, randomize, onProgress) {
        if (randomize) {
            this.setSeed(Math.floor(Math.random() * 2147483646) + 1);
        } else {
            this.setSeed(42 + iteration);
        }
        return this.beamSearch(this.prepareWorkingParts(parts, iteration), beamWidth,
            iterations, iteration, onProgress);
    }

    /** Синхронно engine ядро без UI yields. */
    optimizeSync(parts, iterations, beamWidth, randomize, onProgress) {
        var optimizeStart = this.instrumentationEnabled ? this.now() : 0;
        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            console.error('Optimizer: No parts provided! parts=' + JSON.stringify(parts));
            return new Layout();
        }

        if (this.diagnosticLogging) {
            console.log('Optimizer.optimize: parts=' + parts.length + ', iterations=' + iterations +
                ', beamWidth=' + beamWidth + ', randomize=' + randomize);
        }

        var best = null;
        for (var it = 0; it < iterations; it++) {
            if (this.instrumentationEnabled) this.stats.iterations++;
            var layout = this.optimizeIteration(parts, it, iterations, beamWidth, randomize, onProgress);

            if (best === null || layout.score > best.score) {
                best = layout;
            }
        }

        if (this.instrumentationEnabled) this.stats.optimizeTimeMs += this.now() - optimizeStart;
        return best;
    }

    /** Async UI wrapper; yields between configurable batches of iterations. */
    async optimize(parts, iterations, beamWidth, randomize, onProgress) {
        if (this.yieldBetweenIterations === false) {
            return this.optimizeSync(parts, iterations, beamWidth, randomize, onProgress);
        }
        var optimizeStart = this.instrumentationEnabled ? this.now() : 0;
        if (!parts || !Array.isArray(parts) || parts.length === 0) return new Layout();
        var best = null;
        var batch = Math.max(1, this.batchSize | 0);
        for (var start = 0; start < iterations; start += batch) {
            await new Promise(function(resolve) { setTimeout(resolve, 0); });
            var end = Math.min(iterations, start + batch);
            for (var it = start; it < end; it++) {
                if (this.instrumentationEnabled) this.stats.iterations++;
                var layout = this.optimizeIteration(parts, it, iterations, beamWidth, randomize, onProgress);
                if (best === null || layout.score > best.score) best = layout;
            }
        }
        if (this.instrumentationEnabled) this.stats.optimizeTimeMs += this.now() - optimizeStart;
        return best;
    }
}
