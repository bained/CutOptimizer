'use strict';

/**
 * Layout — множество от листове с обща оценка.
 */
class Layout {
    constructor() {
        this.sheets = [];
        this.score = 0.0;
    }

    copy() {
        const copy = new Layout();
        copy.score = this.score;
        copy.sheets = [];
        for (let i = 0; i < this.sheets.length; i++) {
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
    }

    createSheet() {
        return new Sheet(this.sheetW, this.sheetH);
    }

    splitRects(sheet, placed) {
        const pw = placed.w + this.kerf;
        const ph = placed.h + this.kerf;
        const next = [];

        for (let i = 0; i < sheet.freeRects.length; i++) {
            const fr = sheet.freeRects[i];

            const overlapX = placed.x < fr.x + fr.w && placed.x + pw > fr.x;
            const overlapY = placed.y < fr.y + fr.h && placed.y + ph > fr.y;

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
    }

    cleanRects(sheet) {
        if (sheet.freeRects.length < 2) return;

        const result = [];
        for (let i = 0; i < sheet.freeRects.length; i++) {
            const a = sheet.freeRects[i];
            let inside = false;

            for (let j = 0; j < sheet.freeRects.length; j++) {
                if (i === j) continue;
                const b = sheet.freeRects[j];

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
    }

    finalize(sheet) {
        sheet.efficiency = sheet.calculateEfficiency();
    }

    evaluate(sheets) {
        const sheetCount = sheets.length;
        let totalEff = 0;

        for (let i = 0; i < sheetCount; i++) {
            totalEff += Math.pow(sheets[i].efficiency, 2);
        }

        return (10000000.0 / sheetCount) + totalEff;
    }

    tryCandidate(outLayouts, base, part, sheetIndex, rectIndex, rotated) {
        const r = base.sheets[sheetIndex].freeRects[rectIndex];
        const pw = rotated ? part.h : part.w;
        const ph = rotated ? part.w : part.h;

        if (pw > r.w || ph > r.h) return;

        const layout = base.copy();
        const s = layout.sheets[sheetIndex];

        const placed = new PlacedPart(part.name, r.x, r.y, pw, ph, rotated);
        s.parts.push(placed);

        this.splitRects(s, placed);
        this.cleanRects(s);
        this.finalize(s);

        let gravityPenalty = 0;
        for (let i = 0; i < s.parts.length; i++) {
            const p = s.parts[i];
            gravityPenalty += (p.x + p.y) * 0.005;
        }

        layout.score = this.evaluate(layout.sheets) - gravityPenalty;
        outLayouts.push(layout);
    }

    beamSearch(parts, beamWidth) {
        let beam = [];

        const initial = new Layout();
        initial.sheets.push(this.createSheet());
        beam.push(initial);

        for (let pi = 0; pi < parts.length; pi++) {
            const p = parts[pi];
            const nextCandidates = [];

            for (let bi = 0; bi < beam.length; bi++) {
                const layout = beam[bi];

                for (let si = 0; si < layout.sheets.length; si++) {
                    for (let ri = 0; ri < layout.sheets[si].freeRects.length; ri++) {
                        this.tryCandidate(nextCandidates, layout, p, si, ri, false);
                        if (p.canRotate) {
                            this.tryCandidate(nextCandidates, layout, p, si, ri, true);
                        }
                    }
                }

                const newSheetLayout = layout.copy();
                newSheetLayout.sheets.push(this.createSheet());
                const newSheetIndex = newSheetLayout.sheets.length - 1;
                this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, false);
                if (p.canRotate) {
                    this.tryCandidate(nextCandidates, newSheetLayout, p, newSheetIndex, 0, true);
                }
            }

            nextCandidates.sort(function(a, b) { return b.score - a.score; });
            beam = nextCandidates.slice(0, Math.min(beamWidth, nextCandidates.length));
        }

        return beam[0];
    }

    optimize(parts, iterations, beamWidth) {
        let best = null;

        for (let it = 0; it < iterations; it++) {
            const workingParts = [];
            for (let i = 0; i < parts.length; i++) {
                workingParts.push(parts[i].copy());
            }

            if (it % 3 === 0) {
                workingParts.sort(function(a, b) {
                    return b.calculateArea() - a.calculateArea();
                });
            } else if (it % 3 === 1) {
                workingParts.sort(function(a, b) {
                    const maxA = Math.max(a.w, a.h);
                    const maxB = Math.max(b.w, b.h);
                    return maxB - maxA;
                });
            } else {
                for (let i = workingParts.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = workingParts[i];
                    workingParts[i] = workingParts[j];
                    workingParts[j] = temp;
                }
            }

            const layout = this.beamSearch(workingParts, beamWidth);

            if (best === null || layout.score > best.score) {
                best = layout;
            }
        }

        return best;
    }
}