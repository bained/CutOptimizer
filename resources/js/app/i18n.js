'use strict';

/**
 * i18n — преводач с вградени езикови данни (без файлова зависимост).
 */
class I18n {
    constructor() {
        this.translations = {};
        this.currentLang = 'en';

        // Вградени преводи — не изискват filesystem.readFile
        this.data = {
            'en': {
                "app.title": "CutOptimizer",
                "app.subtitle": "Sheet Cutting Optimization",
                "app.loading": "Loading...",
                "app.ready": "Ready",
                "app.ready.run": "Project loaded. Click \"Run\"",
                "btn.run": "▶ Run",
                "btn.add": "+ Add",
                "btn.apply": "Apply",
                "btn.save": "💾 Save",
                "btn.load": "📂 Load",
                "btn.new": "✕ New",
                "btn.import": "📂 Import",
                "btn.export": "💾 Export",
                "btn.csv": "📊 CSV",
                "btn.png": "🖼 PNG",
                "btn.pdf": "📄 PDF",
                "btn.zoom.in": "+",
                "btn.zoom.out": "−",
                "btn.zoom.reset": "↺",
                "project.name": "Project",
                "project.status": "Project loaded",
                "tab.settings": "⚙ Settings",
                "tab.data": "📋 Data",
                "tab.results": "📊 Results",
                "settings.iterations": "Iterations",
                "settings.beamWidth": "Beam Width",
                "settings.seed": "Seed",
                "settings.quality": "Quality Profile",
                "settings.quality.fast": "Fast",
                "settings.quality.balanced": "Balanced",
                "settings.quality.precise": "Precise",
                "settings.randomize": "Randomize",
                "data.sheet": "Sheet",
                "data.sheet.width": "Width (mm)",
                "data.sheet.height": "Height (mm)",
                "data.sheet.kerf": "Kerf (mm)",
                "data.parts": "Parts",
                "data.parts.add.name": "Name",
                "data.parts.add.w": "W",
                "data.parts.add.h": "H",
                "data.parts.rotate": "Rot",
                "data.parts.qty": "Qty",
                "data.parts.edges": "Edges:",
                "data.parts.edge.l1": "L1",
                "data.parts.edge.l2": "L2",
                "data.parts.edge.s1": "S1",
                "data.parts.edge.s2": "S2",
                "data.parts.th.num": "#",
                "data.parts.th.name": "Name",
                "data.parts.th.w": "W (mm)",
                "data.parts.th.h": "H (mm)",
                "data.parts.th.qty": "Qty",
                "data.parts.th.edges": "Edges",
                "data.parts.th.rot": "Rot",
                "results.params": "Parameters",
                "results.sheet.size": "Sheet (W x H):",
                "results.kerf": "Kerf:",
                "results.parts": "Parts",
                "results.result": "Result",
                "results.sheets.used": "Sheets used:",
                "results.efficiency": "Avg Efficiency",
                "results.score": "Score:",
                "results.placed": "Placed parts:",
                "results.visualization": "Visualization",
                "results.noResults": "No results",
                "results.sheet.label": "Sheet",
                "results.legend": "Black line = Edge",
                "optimization.running": "Optimizing...",
                "optimization.done": "Done in",
                "optimization.seconds": "s",
                "export.csv.header": "Name,Width,Height,Qty,Edges(L1,L2,S1,S2),Rotated",
                "export.pdf.title": "CutOptimizer — Report",
                "export.pdf.sheet": "Sheet",
                "export.pdf.kerf": "Kerf",
                "export.pdf.edges": "Edges (L1,L2,S1,S2)",
                "export.pdf.yes": "Yes",
                "export.pdf.no": "No",
                "example.select": "Choose example...",
                "example.none": "No examples",
                "error.generic": "Error:",
                "error.invalidProject": "Invalid project file: missing sheet dimensions",
                "error.popupBlocked": "PDF export requires popup permission. Please allow popups for this application.",
                "error.png": "PNG export error",
                "error.csv": "CSV export error",
                "messages.noData": "No data to export",
                "messages.noVisualization": "No visualization to export",
                "messages.partAdded": "Part added",
                "messages.sheetUpdated": "Sheet updated",
                "messages.sheetImported": "Sheet imported",
                "messages.sheetExported": "Sheet exported",
                "messages.partsImported": "Parts imported",
                "messages.partsExported": "Parts exported",
                "messages.projectSaved": "Project saved",
                "messages.projectLoaded": "Loaded:",
                "messages.projectCreated": "New project created",
                "messages.csvExported": "CSV exported",
                "messages.pngExported": "PNG exported",
                "messages.loaded": "Loaded:"
            },
            'bg': {
                "app.title": "CutOptimizer",
                "app.subtitle": "Оптимизация на разкроя на плоскости",
                "app.loading": "Зареждане...",
                "app.ready": "Готово",
                "app.ready.run": "Проектът е зареден. Натисни \"Стартирай\"",
                "btn.run": "▶ Стартирай",
                "btn.add": "+ Add",
                "btn.apply": "Apply",
                "btn.save": "💾 Save",
                "btn.load": "📂 Load",
                "btn.new": "✕ New",
                "btn.import": "📂 Import",
                "btn.export": "💾 Export",
                "btn.csv": "📊 CSV",
                "btn.png": "🖼 PNG",
                "btn.pdf": "📄 PDF",
                "btn.zoom.in": "+",
                "btn.zoom.out": "−",
                "btn.zoom.reset": "↺",
                "project.name": "Проект",
                "project.status": "Проектът е зареден",
                "tab.settings": "⚙ Settings",
                "tab.data": "📋 Data",
                "tab.results": "📊 Results",
                "settings.iterations": "Iterations",
                "settings.beamWidth": "Beam Width",
                "settings.seed": "Seed",
                "settings.quality": "Quality Profile",
                "settings.quality.fast": "Fast",
                "settings.quality.balanced": "Balanced",
                "settings.quality.precise": "Precise",
                "settings.randomize": "Randomize",
                "data.sheet": "Sheet",
                "data.sheet.width": "Width (mm)",
                "data.sheet.height": "Height (mm)",
                "data.sheet.kerf": "Kerf (mm)",
                "data.parts": "Части",
                "data.parts.add.name": "Name",
                "data.parts.add.w": "W",
                "data.parts.add.h": "H",
                "data.parts.rotate": "Rot",
                "data.parts.qty": "Qty",
                "data.parts.edges": "Кантове:",
                "data.parts.edge.l1": "L1",
                "data.parts.edge.l2": "L2",
                "data.parts.edge.s1": "S1",
                "data.parts.edge.s2": "S2",
                "data.parts.th.num": "#",
                "data.parts.th.name": "Name",
                "data.parts.th.w": "W (mm)",
                "data.parts.th.h": "H (mm)",
                "data.parts.th.qty": "Qty",
                "data.parts.th.edges": "Кантове",
                "data.parts.th.rot": "Rot",
                "results.params": "Параметри",
                "results.sheet.size": "Лист (Ш x В):",
                "results.kerf": "Kerf:",
                "results.parts": "Части:",
                "results.result": "Резултат",
                "results.sheets.used": "Листове:",
                "results.efficiency": "Ср. ефективност:",
                "results.score": "Score:",
                "results.placed": "Поставени части:",
                "results.visualization": "Визуализация",
                "results.noResults": "Няма резултати",
                "results.sheet.label": "Лист",
                "results.legend": "Черна линия = Кант",
                "optimization.running": "Оптимизация...",
                "optimization.done": "Готово за",
                "optimization.seconds": "s",
                "export.csv.header": "Name,Width,Height,Qty,Edges(L1,L2,S1,S2),Rotated",
                "export.pdf.title": "CutOptimizer — Отчет",
                "export.pdf.sheet": "Sheet",
                "export.pdf.kerf": "Kerf",
                "export.pdf.edges": "Кантове (L1,L2,S1,S2)",
                "export.pdf.yes": "Да",
                "export.pdf.no": "Не",
                "example.select": "Избери пример...",
                "example.none": "Няма примери",
                "error.generic": "Грешка:",
                "error.invalidProject": "Invalid project file: missing sheet dimensions",
                "error.popupBlocked": "PDF експортът изисква позволени изскачащи прозорци.",
                "error.png": "PNG export error",
                "error.csv": "CSV export error",
                "messages.noData": "Няма данни за експорт",
                "messages.noVisualization": "Няма визуализация за експорт",
                "messages.partAdded": "Частта е добавена",
                "messages.sheetUpdated": "Sheet updated",
                "messages.sheetImported": "Sheet imported",
                "messages.sheetExported": "Sheet exported",
                "messages.partsImported": "Parts imported",
                "messages.partsExported": "Parts exported",
                "messages.projectSaved": "Project saved",
                "messages.projectLoaded": "Loaded:",
                "messages.projectCreated": "New project created",
                "messages.csvExported": "CSV exported",
                "messages.pngExported": "PNG exported",
                "messages.loaded": "Зареден:"
            }
        };
    }

    async load(lang) {
        this.currentLang = lang || 'en';
        this.translations = this.data[this.currentLang] || this.data['en'] || {};
        console.log('i18n: Loaded ' + this.currentLang + ' (' + Object.keys(this.translations).length + ' keys)');
    }

    t(key) {
        return this.translations[key] || key;
    }

    applyTranslations() {
        var els = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < els.length; i++) {
            var key = els[i].getAttribute('data-i18n');
            els[i].textContent = this.t(key);
        }
        var phs = document.querySelectorAll('[data-i18n-placeholder]');
        for (var j = 0; j < phs.length; j++) {
            var key2 = phs[j].getAttribute('data-i18n-placeholder');
            phs[j].setAttribute('placeholder', this.t(key2));
        }
        var vals = document.querySelectorAll('[data-i18n-value]');
        for (var k = 0; k < vals.length; k++) {
            var key3 = vals[k].getAttribute('data-i18n-value');
            vals[k].value = this.t(key3);
        }
    }
}

var i18n = new I18n();