'use strict';

/**
 * ConfigManager — зареждане и парсване на config.ini.
 * Използва Neutralino.os.readFile за достъп до файловата система.
 */
class ConfigManager {
    /**
     * @param {string} configPath - Път до config.ini файла.
     */
    constructor(configPath) {
        this.configPath = configPath;
        this.settings = {
            iterations: 50,
            kerf: 4,
            beamWidth: 12,
            currentJson: 'kitchen_project.json'
        };
    }

    /**
     * Парсва INI съдържание (ключ=стойност редове).
     * @param {string} text - INI текст.
     * @returns {Object} - Парсвани настройки.
     */
    parseIni(text) {
        const result = {};
        const lines = text.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Празни редове и коментари
            if (line === '' || line.startsWith(';') || line.startsWith('#')) {
                continue;
            }

            const eqIndex = line.indexOf('=');
            if (eqIndex > 0) {
                const key = line.substring(0, eqIndex).trim();
                const value = line.substring(eqIndex + 1).trim();
                if (key !== '' && value !== '') {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Зарежда config.ini от файл (Neutralino API).
     * @returns {Promise<Object>} - Обект с настройки.
     */
    async load() {
        try {
            // Neutralino.os.readFile връща string със съдържанието
            const content = await Neutralino.os.readFile(this.configPath);
            const parsed = this.parseIni(content);

            // Прилагаме parsed стойности върху defaults
            if (parsed['iterations'] !== undefined) {
                this.settings.iterations = parseInt(parsed['iterations'], 10);
            }
            if (parsed['kerf'] !== undefined) {
                this.settings.kerf = parseInt(parsed['kerf'], 10);
            }
            if (parsed['beamWidth'] !== undefined) {
                this.settings.beamWidth = parseInt(parsed['beamWidth'], 10);
            }
            if (parsed['current_json'] !== undefined) {
                this.settings.currentJson = parsed['current_json'];
            }

            return this.settings;
        } catch (err) {
            // Ако файлът не съществува, връщаме defaults
            console.warn('ConfigManager: Could not load config, using defaults.', err.message);
            return this.settings;
        }
    }

    /**
     * Запазва config.ini (Neutralino API).
     * @returns {Promise<void>}
     */
    async save() {
        const lines = [];
        lines.push('iterations=' + this.settings.iterations);
        lines.push('kerf=' + this.settings.kerf);
        lines.push('beamWidth=' + this.settings.beamWidth);
        lines.push('current_json=' + this.settings.currentJson);

        try {
            await Neutralino.os.writeFile(this.configPath, lines.join('\n'));
        } catch (err) {
            console.error('ConfigManager: Failed to save config.', err.message);
        }
    }

    /**
     * Връща текущата конфигурация.
     * @returns {Object}
     */
    get() {
        return { ...this.settings };
    }

    /**
     * Задава конкретна настройка.
     * @param {string} key - Име на настройка.
     * @param {*} value - Стойност.
     */
    set(key, value) {
        if (this.settings.hasOwnProperty(key)) {
            this.settings[key] = value;
        }
    }
}

export { ConfigManager };