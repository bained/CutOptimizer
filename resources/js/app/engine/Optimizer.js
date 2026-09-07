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
        copy.sheets = [];
        for (var i = 0; i < this.sheets.length; i++) {
            copy.sheets.push(this.sheets[i].copy());
        }
        return copy;
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
        var next = [];

        for (var i = 0; i < sheet.freeRects.length; i++) {
            var fr = sheet.freeRects[i];

            var overlapX = placed.x < fr.x + fr.w && placed.x + pw > fr.x;
            var overlapY = placed.y < fr.y + fr.h && placed.y + ph > fr.y;

            if (overlapX && overlapY) {
                if (placed.x > fr.x) {
                    next.push(new Rect(fr.x, fr.y, placed.x - fr.x, fr.h));
                }
                if (placed.x + pw < fr.x + fr.w) {
                    next.push(new Rect(placed.x + pw, fr.y, fr.x + fr.w - (placed.x + pw), fr.h));
                }
                if (placed.y > fr.y) {
                    next.push(new Rect(fr.x, fr.y, fr.w, placed.y - fr.y));
                }
                if (placed.y + ph < fr.y + fr.h) {
                    next.push(new Rect(fr.x, placed.y + ph, fr.w, fr.y + fr.h - (placed.y + ph)));
                }
            } else {
                next.push(fr.copy());
            }
        }

        sheet.freeRects = next;
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

        var result = [];
        for (var i = 0; i < sheet.freeRects.length; i++) {
            var a = sheet.freeRects[i];
            var inside = false;

            for (var j = 0; j < sheet.freeRects.length; j++) {
                if (i === j) continue;
                var b = sheet.freeRects[j];

                if (a.x >= b.x && a.y >= b.y &&
                    a.x + a.w <= b.x + b.w &&
                    a.y + a.h <= b.y + b.h) {
                    inside = true;
                    break;
                }
            }

            if (!inside) {
                result.push(a);
            }
        }

        sheet.freeRects = result;
        if (this.instrumentationEnabled) this.stats.cleanTimeMs += this.now() - start;
    }

    finalize(sheet) {
        sheet.efficiency = sheet.calculateEfficiency();
    }

    evaluate(sheets) {
        var sheetCount = sheets.length;
        var totalEff = 0;

        for (var i = 0; i < sheetCount; i++) {
            totalEff += Math.pow(sheets[i].efficiency, 2);
        }

        return (10000000.0 / sheetCount) + totalEff;
    }

    tryCandidate(outLayouts, base, part, sheetIndex, rectIndex, rotated) {
        var candidateStart = this.instrumentationEnabled ? this.now() : 0;
        if (this.instrumentationEnabled) this.stats.candidateAttempts++;
        var r = base.sheets[sheetIndex].freeRects[rectIndex];
        var pw = rotated ? part.h : part.w;
        var ph = rotated ? part.w : part.h;

        if (pw > r.w || ph > r.h) {
            if (this.instrumentationEnabled) this.stats.rejectedCandidates++;
            return;
        }

        var layout = this.copyLayout(base);
        var s = layout.sheets[sheetIndex];

        var placed = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated, part.edges);
        s.parts.push(placed);

        this.splitRects(s, placed);
        this.cleanRects(s);
        this.finalize(s);

        var gravityPenalty = 0;
        for (var i = 0; i < s.parts.length; i++) {
            var p = s.parts[i];
            gravityPenalty += (p.x + p.y) * 0.005;
        }

        layout.score = this.evaluate(layout.sheets) - gravityPenalty;
        outLayouts.push(layout);
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
        var beam = [];

        var initial = new Layout();
        initial.sheets.push(this.createSheet());
        beam.push(initial);

        for (var pi = 0; pi < parts.length; pi++) {
            var p = parts[pi];
            var nextCandidates = [];

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

                var newSheetLayout = this.copyLayout(layout);
                newSheetLayout.sheets.push(this.createSheet());
                var newSheetIndex = newSheetLayout.sheets.length - 1;
                this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, false);
                if (p.canRotate) {
                    this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, true);
                }
            }

            var sortStart = this.instrumentationEnabled ? this.now() : 0;
            nextCandidates.sort(function(a, b) { return b.score - a.score; });
            if (this.instrumentationEnabled) {
                this.stats.sortCalls++;
                this.stats.sortTimeMs += this.now() - sortStart;
            }
            beam = nextCandidates.slice(0, Math.min(beamWidth, nextCandidates.length));
        }

        // Обаждаме прогреса веднъж на итерация
        if (onProgress && typeof onProgress === 'function') {
            onProgress(currentIteration + 1, totalIterations);
        }

        if (this.instrumentationEnabled) this.stats.beamTimeMs += this.now() - beamStart;
        return beam[0];
    }

    /**
     * Стартира оптимизация с множество итерации.
     * Използва async за да позволи на UI да се опресни между итерациите.
     * @param {Part[]} parts
     * @param {number} iterations
     * @param {number} beamWidth
     * @param {boolean} randomize - Ако true, използва различен seed за всяка итерация.
     * @param {function} onProgress - Callback(currentIteration, totalIterations).
     * @returns {Promise<Layout>}
     */
    async optimize(parts, iterations, beamWidth, randomize, onProgress) {
        var optimizeStart = this.instrumentationEnabled ? this.now() : 0;
        // Проверка за валидност на входните данни
        if (!parts || !Array.isArray(parts) || parts.length === 0) {
            console.error('Optimizer: No parts provided! parts=' + JSON.stringify(parts));
            return new Layout();
        }

        console.log('Optimizer.optimize: parts=' + parts.length + ', iterations=' + iterations +
            ', beamWidth=' + beamWidth + ', randomize=' + randomize);

        var best = null;

        for (var it = 0; it < iterations; it++) {
            if (this.instrumentationEnabled) this.stats.iterations++;
            // Позволяваме на UI да се опресни между итерациите
            if (this.yieldBetweenIterations !== false) {
                await new Promise(function(resolve) { setTimeout(resolve, 0); });
            }
            if (randomize) {
                this.setSeed(Math.floor(Math.random() * 2147483646) + 1);
            } else {
                // Фиксиран seed — детерминистично
                this.setSeed(42 + it);
            }

            var workingParts = [];
            for (var i = 0; i < parts.length; i++) {
                workingParts.push(parts[i].copy());
            }

            if (it % 3 === 0) {
                workingParts.sort(function(a, b) {
                    return b.calculateArea() - a.calculateArea();
                });
            } else if (it % 3 === 1) {
                workingParts.sort(function(a, b) {
                    var maxA = Math.max(a.w, a.h);
                    var maxB = Math.max(b.w, b.h);
                    return maxB - maxA;
                });
            } else {
                // Random shuffle със seeded random
                for (var j = workingParts.length - 1; j > 0; j--) {
                    var k = Math.floor(this.rng.next() * (j + 1));
                    var temp = workingParts[j];
                    workingParts[j] = workingParts[k];
                    workingParts[k] = temp;
                }
            }

            var layout = this.beamSearch(workingParts, beamWidth, iterations, it, onProgress);

            if (best === null || layout.score > best.score) {
                best = layout;
            }
        }

        if (this.instrumentationEnabled) this.stats.optimizeTimeMs += this.now() - optimizeStart;
        return best;
    }
}
