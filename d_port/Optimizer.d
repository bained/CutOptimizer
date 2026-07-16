import std.stdio;
import std.file;
import std.json;
import std.conv;
import std.algorithm;
import std.array;
import std.math;
import std.random;
import std.string;
import std.range;
import std.parallelism;

// ===================== DATA STRUCTURES =====================

struct Part {
    string name;
    int w, h;
    bool rot;
}

struct Placed {
    string name;
    int x, y, w, h;
    bool rotated;
}

struct Rect {
    int x, y, w, h;
}

struct Sheet {
    int w, h;
    Rect[] freeRects;
    Placed[] parts;
    double efficiency;

    Sheet clone() const {
        Sheet copy;
        copy.w = this.w;
        copy.h = this.h;
        copy.efficiency = this.efficiency;
        copy.parts = this.parts.dup;
        copy.freeRects = this.freeRects.dup;
        return copy;
    }
}

struct Layout {
    Sheet[] sheets;
    double score;

    Layout clone() const {
        Layout copy;
        copy.score = this.score;
        copy.sheets = new Sheet[this.sheets.length];
        foreach(i, s; this.sheets) copy.sheets[i] = s.clone();
        return copy;
    }
}

// ===================== MAIN & CONFIG =====================

void main() {
    auto cfg = readIni("config.ini");
    int iterations = cfg.get("iterations", "50").to!int;
    string jsonPath = cfg.get("current_json", "kitchen_project.json");

    if (!exists(jsonPath)) return;
    auto j = parseJSON(readText(jsonPath));
    
    auto getVal = (JSONValue v) => v.type == JSONType.string ? v.str.to!int : cast(int)v.integer;
    int sw = getVal(j["sheetW"]), sh = getVal(j["sheetH"]), kerf = getVal(j["kerf"]);

    Part[] master;
    foreach (p; j["parts"].array) {
        master ~= Part(p["n"].str, getVal(p["w"]), getVal(p["h"]), getVal(p["r"]) == 1);
    }

    Layout best;
    bool hasBest = false;
    Object lockObj = new Object();

    foreach (it; parallel(iota(iterations))) {
        auto rnd = Random(unpredictableSeed + it);
        auto parts = master.dup;

        if (it % 3 == 0) parts.sort!((a,b) => (cast(long)a.w*a.h) > (cast(long)b.w*b.h));
        else if (it % 3 == 1) parts.sort!((a,b) => max(a.w,a.h) > max(b.w,b.h));
        else parts.randomShuffle(rnd);

        auto layout = beamSearch(parts, sw, sh, kerf, 12);

        synchronized(lockObj) {
            if (!hasBest || layout.score > best.score) {
                best = layout;
                hasBest = true;
            }
        }
    }

    foreach (s; best.sheets) {
        writefln("SHEET|%.2f", s.efficiency);
        foreach (p; s.parts) {
            writefln("PART|%s|%d|%d|%d|%d|%d", p.name, p.x, p.y, p.w, p.h, p.rotated ? 1 : 0);
        }
    }
}

// ===================== BEAM SEARCH (V6) =====================

Layout beamSearch(Part[] parts, int sw, int sh, int kerf, int beamWidth) {
    Layout[] beam;
    Layout initial;
    initial.sheets ~= createSheet(sw, sh);
    beam ~= initial;

    foreach (p; parts) {
        Layout[] nextCandidates;
        foreach (layout; beam) {
            foreach (si; 0 .. cast(int)layout.sheets.length) {
                foreach (ri; 0 .. cast(int)layout.sheets[si].freeRects.length) {
                    tryCandidate(nextCandidates, layout, p, si, ri, false, sw, sh, kerf);
                    if (p.rot) tryCandidate(nextCandidates, layout, p, si, ri, true, sw, sh, kerf);
                }
            }
            // Нов лист като опция
            Layout newSheetLayout = layout.clone();
            newSheetLayout.sheets ~= createSheet(sw, sh);
            tryCandidate(nextCandidates, newSheetLayout, p, cast(int)newSheetLayout.sheets.length - 1, 0, false, sw, sh, kerf);
        }

        nextCandidates.sort!((a, b) => a.score > b.score);
        beam = nextCandidates[0 .. min(beamWidth, cast(int)nextCandidates.length)].dup;
    }
    return beam[0];
}

void tryCandidate(ref Layout[] outLayouts, Layout base, Part p, int si, int ri, bool rot, int sw, int sh, int kerf) {
    Rect r = base.sheets[si].freeRects[ri];
    int pw = rot ? p.h : p.w, ph = rot ? p.w : p.h;

    if (pw > r.w || ph > r.h) return;

    Layout layout = base.clone();
    Sheet* s = &layout.sheets[si];

    Placed pl = { p.name, r.x, r.y, pw, ph, rot };
    s.parts ~= pl;

    splitRects(*s, pl, kerf);
    cleanRects(*s);
    finalize(*s);

    // V6 SCORE LOGIC: "Гравитация" към долния ляв ъгъл
    double gravityPenalty = 0;
    foreach (placed; s.parts) {
        // Наказваме отдалечаването от (0,0). Използваме малък коефициент,
        // за да не пречи на броя листове, но да подреди частите плътно.
        gravityPenalty += (placed.x + placed.y) * 0.005;
    }

    layout.score = evaluate(layout.sheets) - gravityPenalty;
    outLayouts ~= layout;
}

// ===================== UTILS & GEOMETRY =====================

string[string] readIni(string path) {
    string[string] res;
    if (!exists(path)) return res;
    foreach (line; File(path).byLine) {
        auto parts = line.split("=");
        if (parts.length == 2) res[parts[0].strip.idup] = parts[1].strip.idup;
    }
    return res;
}

Sheet createSheet(int w, int h) {
    Sheet s; s.w = w; s.h = h;
    s.freeRects = [Rect(0, 0, w, h)];
    return s;
}

void splitRects(ref Sheet s, Placed p, int kerf) {
    int pw = p.w + kerf, ph = p.h + kerf;
    Rect[] next;
    foreach (fr; s.freeRects) {
        if (p.x < fr.x + fr.w && p.x + pw > fr.x && p.y < fr.y + fr.h && p.y + ph > fr.y) {
            if (p.x > fr.x) next ~= Rect(fr.x, fr.y, p.x - fr.x, fr.h);
            if (p.x + pw < fr.x + fr.w) next ~= Rect(p.x + pw, fr.y, fr.x + fr.w - (p.x + pw), fr.h);
            if (p.y > fr.y) next ~= Rect(fr.x, fr.y, fr.w, p.y - fr.y);
            if (p.y + ph < fr.y + fr.h) next ~= Rect(fr.x, p.y + ph, fr.w, fr.y + fr.h - (p.y + ph));
        } else next ~= fr;
    }
    s.freeRects = next;
}

void cleanRects(ref Sheet s) {
    if (s.freeRects.length < 2) return;
    Rect[] result;
    foreach (i, a; s.freeRects) {
        bool inside = false;
        foreach (j, b; s.freeRects) {
            if (i == j) continue;
            if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
                inside = true; break;
            }
        }
        if (!inside) result ~= a;
    }
    s.freeRects = result;
}

void finalize(ref Sheet s) {
    double used = 0;
    foreach (p; s.parts) used += cast(double)p.w * p.h;
    s.efficiency = (used / (cast(double)s.w * s.h)) * 100.0;
}

double evaluate(Sheet[] sheets) {
    double totalEff = 0;
    foreach (s; sheets) totalEff += pow(s.efficiency, 2);
    // 10 милиона бонус за по-малко листове
    return (10_000_000.0 / sheets.length) + totalEff;
}