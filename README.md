# CutOptimizer

**Version 0.5.1**

**CutOptimizer** is a desktop application for **sheet cutting optimization** — it calculates the optimal layout for cutting rectangular parts from sheets of material (plywood, MDF, acrylic, etc.), minimizing waste and maximizing material usage.

Built with [Neutralino.js](https://neutralino.js.org/) and a custom SVG rendering engine.

## Features

- **Beam Search V6** optimization algorithm (ported from D language)
- **Tab-based UI**: Settings | Data | Results
- **Data Management**: CRUD for parts/sheets, import/export JSON, auto-save
- **Edge (canting) system**: 4-sided canting with L1/L2/S1/S2 visual indicators
- **Visualization**: SVG sheet layout with zoom (In/Out/Reset), grid, edge highlights
- **Export**: CSV, PNG, PDF report with print layout
- **Internationalization**: English and Bulgarian (extensible via embedded data)
- **Project management**: Save/Load/New project, example browser
- **No external dependencies**: All translations are embedded in `i18n.js` — no runtime files required.

## Quick Start

```bash
# Build the application
neu build

# Copy runtime files (examples)
.\dist_build.bat

# Run standalone
dist\CutOptimizer\CutOptimizer.exe --path=.
```

## Architecture

```
resources/
├── js/
│   ├── app/
│   │   ├── model/           # Data models (Rect, Part, PlacedPart, Sheet, Layout)
│   │   ├── engine/          # Optimizer (Beam Search V6)
│   │   ├── i18n.js          # Internationalization module (embedded translations)
│   │   ├── svgLibrary.js    # SVG generation (edges, dimensions, labels)
│   │   └── ProjectManager.js
│   └── main.js              # Application entry point
├── lang/
│   ├── en.json              # English translations (for reference only)
│   └── bg.json              # Bulgarian translations (for reference only)
├── index.html
└── styles.css
```

### Build output (`dist/CutOptimizer/`):

Neutralino.js generates cross-platform binaries for all major platforms:

```
CutOptimizer.exe              # Windows (x64)
CutOptimizer-linux_x64        # Linux (x64)
CutOptimizer-mac_x64          # macOS (Intel)
CutOptimizer-mac_arm64        # macOS (Apple Silicon)
resources.neu                 # Application resources bundle
```

> **Note:** On Windows the binary is renamed to `CutOptimizer.exe` (the `-win_x64` suffix is removed). On Linux and macOS the original names are kept.

## Internationalization

The project supports **i18n** via embedded translations in `resources/js/app/i18n.js`. The JSON files in `resources/lang/` are for reference only — translations are compiled directly into the JavaScript bundle.

### Adding a new language:

1. Add a new language object to `this.data` in `resources/js/app/i18n.js` (copy the `'en'` structure)
2. In `resources/js/main.js`, change `i18n.load('en')` to `i18n.load('xx')`
3. Rebuild: `neu build`

The `I18n` class (`resources/js/app/i18n.js`) provides:
- `load(lang)` — loads embedded translations by language code
- `t(key)` — returns translated string by key
- `applyTranslations()` — applies `data-i18n` / `data-i18n-placeholder` attributes to DOM

## Build & Run

```bash
# Install dependencies
npm install

# Build
neu build

# Copy runtime files and rename exe
.\dist_build.bat

# Run
dist\CutOptimizer\CutOptimizer.exe --path=.
```

## Platform Notes

### Linux / WSL
Emoji icons may not display correctly if `fonts-noto-color-emoji` is not installed:

```bash
sudo apt update
sudo apt install fonts-noto-color-emoji
```

## License

MIT