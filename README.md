# CutOptimizer

**CutOptimizer** is a desktop application for **sheet cutting optimization** — it calculates the optimal layout for cutting rectangular parts from sheets of material (plywood, MDF, acrylic, etc.), minimizing waste and maximizing material usage.

Built with [Neutralino.js](https://neutralino.js.org/) and a custom SVG rendering engine.

## Features

- **Beam Search V6** optimization algorithm (ported from D language)
- **Tab-based UI**: Settings | Data | Results
- **Data Management**: CRUD for parts/sheets, import/export JSON, auto-save
- **Edge (canting) system**: 4-sided canting with L1/L2/S1/S2 visual indicators
- **Visualization**: SVG sheet layout with zoom (In/Out/Reset), grid, edge highlights
- **Export**: CSV, PNG, PDF report with print layout
- **Internationalization**: English and Bulgarian (extensible via JSON files)
- **Project management**: Save/Load/New project, example browser

## Quick Start

```bash
# Build the application
neu build

# Run in development mode (hot-reload)
neu run

# Run standalone
dist\CutOptimizer\CutOptimizer-win_x64.exe --path=.
```

## Architecture

```
resources/
├── js/
│   ├── app/
│   │   ├── model/       # Data models (Rect, Part, PlacedPart, Sheet, Layout)
│   │   ├── engine/      # Optimizer (Beam Search V6)
│   │   ├── i18n.js      # Internationalization module
│   │   ├── svgLibrary.js # SVG generation (edges, dimensions, labels)
│   │   ├── ConfigManager.js
│   │   └── ProjectManager.js
│   └── main.js          # Application entry point
├── lang/
│   ├── en.json          # English translations
│   └── bg.json          # Bulgarian translations
├── index.html
└── styles.css
```

## Internationalization

The project supports **i18n** via JSON files in `resources/lang/`.

### Adding a new language:

1. Create `resources/lang/xx.json` (e.g., `de.json` for German)
2. Copy the structure from `en.json` and translate the values
3. In `resources/js/main.js`, change `i18n.load('en')` to `i18n.load('de')`

The `I18n` class (`resources/js/app/i18n.js`) provides:
- `load(lang)` — loads translations from file
- `t(key)` — returns translated string by key
- `applyTranslations()` — applies `data-i18n` / `data-i18n-placeholder` attributes to DOM

## Build & Run

```bash
# Install dependencies
npm install

# Build
neu build

# Run
neu run
```

## License

MIT