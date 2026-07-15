'use strict';

/**
 * i18n — прост преводач за CutOptimizer.
 */
class I18n {
    constructor() {
        this.translations = {};
        this.currentLang = 'bg';
    }

    async load(lang) {
        this.currentLang = lang || 'bg';
        try {
            var basePath = (typeof NL_PATH !== 'undefined') ? NL_PATH : '';
            var f = basePath + '/resources/lang/' + this.currentLang + '.json';
            var content = await Neutralino.filesystem.readFile(f);
            this.translations = JSON.parse(content);
            console.log('i18n: Loaded ' + this.currentLang);
        } catch (err) {
            console.warn('i18n: Could not load ' + this.currentLang + ':', err.message);
            this.translations = {};
        }
    }

    /**
     * Връща превод по ключ. Ако ключът липсва, връща самия ключ.
     */
    t(key) {
        return this.translations[key] || key;
    }

    /**
     * Обхожда DOM и прилага data-i18n, data-i18n-placeholder, data-i18n-value.
     */
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