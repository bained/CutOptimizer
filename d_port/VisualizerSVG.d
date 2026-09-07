import std.stdio;
import std.string;
import std.conv;
import std.array;
import std.algorithm;
import std.file;
import std.format;
import std.json;

struct Part {
    string name;
    int x, y, w, h;
    int rotated;
}

struct Sheet {
    double efficiency;
    Part[] parts;
}

// Помощна функция за четене на конфигурацията
string[string] readIni(string path) {
    string[string] res;
    if (!exists(path)) return res;
    foreach (line; File(path).byLine) {
        auto p = line.split("=");
        if (p.length == 2) res[p[0].strip.idup] = p[1].strip.idup;
    }
    return res;
}

void main() {
    // 1. Четем настройките, за да разберем кой JSON файл се ползва
    auto cfg = readIni("config.ini");
    string jsonPath = cfg.get("current_json", "kitchen_project.json");

    if (!exists(jsonPath)) {
        writeln("Error: JSON file not found at ", jsonPath);
        return;
    }

    // 2. Четем JSON-а, за да вземем реалните размери на шийта
    auto j = parseJSON(readText(jsonPath));
    auto getVal = (JSONValue v) => v.type == JSONType.string ? v.str.to!int : cast(int)v.integer;
    
    int sheetW = getVal(j["sheetW"]);
    int sheetH = getVal(j["sheetH"]);

    Sheet[] sheets;

    // 3. Четем данните от Optimizer-а през стандартния вход
    foreach (rawLine; stdin.byLine()) {
        string line = rawLine.idup.strip;
        if (line.empty) continue;

        auto segments = line.split("|");
        if (segments.length == 0) continue;

        if (segments[0] == "SHEET" && segments.length >= 2) {
            sheets ~= Sheet(segments[1].to!double);
        }
        else if (segments[0] == "PART" && segments.length >= 7 && sheets.length > 0) {
            sheets[$-1].parts ~= Part(
                segments[1],
                segments[2].to!int,
                segments[3].to!int,
                segments[4].to!int,
                segments[5].to!int,
                segments[6].to!int
            );
        }
    }

    if (sheets.empty) {
        writeln("No data for visualisation.");
        return;
    }

    // 4. Генерираме SVG с правилните размери
    string svgContent = generateSVG(sheets, sheetW, sheetH);
    std.file.write("output.svg", svgContent);
    writefln("Success! Visualized %d sheets (%dx%d). Output: output.svg", sheets.length, sheetW, sheetH);
}

string generateSVG(Sheet[] sheets, int sheetW, int sheetH) {
    auto app = appender!string();

    immutable int gap = 80;
    immutable int labelHeight = 30;
    int totalHeight = cast(int)(sheets.length) * (sheetH + gap + labelHeight);

    app.put(format(
        "<svg xmlns='http://www.w3.org/2000/svg' width='%d' height='%d' style='background:#eee;'>\n",
        sheetW, totalHeight
    ));

    app.put("<style>\n");
    app.put("  .part { fill: #add8e6; stroke: #333; stroke-width: 2; }\n");
    app.put("  .part-rotated { fill: #90ee90; stroke: #333; stroke-width: 2; }\n");
    app.put("  .label { font-family: sans-serif; font-size: 14px; fill: #000; }\n");
    app.put("  .sheet-label { font-family: sans-serif; font-size: 18px; font-weight: bold; fill: #333; }\n");
    app.put("</style>\n");

    foreach (i, sheet; sheets) {
        int offsetY = cast(int)(i) * (sheetH + gap + labelHeight) + labelHeight;

        app.put(format(
            "<text x='10' y='%d' class='sheet-label'>Sheet %d — Efficiency: %.1f%%</text>\n",
            offsetY - 10, i + 1, sheet.efficiency
        ));

        app.put(format(
            "<rect x='0' y='%d' width='%d' height='%d' fill='white' stroke='#c00' stroke-width='3'/>\n",
            offsetY, sheetW, sheetH
        ));

        foreach (p; sheet.parts) {
            string cssClass = p.rotated ? "part-rotated" : "part";
            app.put(format(
                "<rect x='%d' y='%d' width='%d' height='%d' class='%s'/>\n",
                p.x, offsetY + p.y, p.w, p.h, cssClass
            ));

            if (p.w > 40 && p.h > 20) {
                app.put(format(
                    "<text x='%d' y='%d' class='label'>%s%s</text>\n",
                    p.x + 5, offsetY + p.y + 16, p.name, p.rotated ? " [R]" : ""
                ));
            }
        }
    }

    app.put("</svg>\n");
    return app.data;
}