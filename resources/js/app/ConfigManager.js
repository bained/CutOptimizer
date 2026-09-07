'use strict';

/**
 * ConfigManager — зареждане и парсване на config.ini.
 */
class ConfigManager {
    /**
     * @param {string} configPath
     */
    constructor(configPath) {
        this.configPath = configPath;
        this.settings = {
            iterations: 50,
            kerf: 4,
            beamWidth: 12,
            seed: 42,
            randomize: false,
            currentJson: 'kitchen_project.json'
        };
    }

    parseIni(text) {
        var result = {};
        var lines = text.split('\n');

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line === '' || line.startsWith(';') || line.startsWith('#')) {
                continue;
            }

            var eqIndex = line.indexOf('=');
            if (eqIndex > 0) {
                var key = line.substring(0, eqIndex).trim();
                var value = line.substring(eqIndex + 1).trim();
                if (key !== '' && value !== '') {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    async load() {
        try {
            var basePath = (typeof NL_PATH !== 'undefined') ? NL_PATH : '';
            var fullPath = basePath + '/' + this.configPath;
            console.log('ConfigManager: Loading config from:', fullPath);
            var content = await Neutralino.filesystem.readFile(fullPath);
            var parsed = this.parseIni(content);

            if (parsed['iterations'] !== undefined) {
                this.settings.iterations = parseInt(parsed['iterations'], 10);
            }
            if (parsed['kerf'] !== undefined) {
                this.settings.kerf = parseInt(parsed['kerf'], 10);
            }
            if (parsed['beamWidth'] !== undefined) {
                this.settings.beamWidth = parseInt(parsed['beamWidth'], 10);
            }
            if (parsed['seed'] !== undefined) {
                this.settings.seed = parseInt(parsed['seed'], 10);
            }
            if (parsed['randomize'] !== undefined) {
                this.settings.randomize = parsed['randomize'] === 'true';
            }
            if (parsed['current_json'] !== undefined) {
                this.settings.currentJson = parsed['current_json'];
            }

            return this.settings;
        } catch (err) {
            console.warn('ConfigManager: Cannot load config, using defaults.', err.message);
            return this.settings;
        }
    }

    async save() {
        var lines = [];
        lines.push('iterations=' + this.settings.iterations);
        lines.push('kerf=' + this.settings.kerf);
        lines.push('beamWidth=' + this.settings.beamWidth);
        lines.push('seed=' + this.settings.seed);
        lines.push('randomize=' + (this.settings.randomize ? 'true' : 'false'));
        lines.push('current_json=' + this.settings.currentJson);

        try {
            await Neutralino.filesystem.writeFile(this.configPath, lines.join('\n'));
        } catch (err) {
            console.error('ConfigManager: Failed to save config.', err.message);
        }
    }

    get() {
        return {
            iterations: this.settings.iterations,
            kerf: this.settings.kerf,
            beamWidth: this.settings.beamWidth,
            seed: this.settings.seed,
            randomize: this.settings.randomize,
            currentJson: this.settings.currentJson
        };
    }

    set(key, value) {
        if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = value;
        }
    }
}