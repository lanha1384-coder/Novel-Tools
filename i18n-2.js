let translations = {};

let langReady = false;

async function loadLang(lang) {
    const res = await fetch(`../i18n/${lang}.json`);
    translations = await res.json();

    currentLang = lang;
    document.documentElement.lang = lang;

    langReady = true;

    applyI18n();
    i18nListeners.forEach((fn) => fn(lang, translations));
}

function t(key, fallback = key) {
    if (translations[key] !== undefined) {
        return translations[key];
    }

    const value = key.split(".").reduce((obj, part) => {
        return obj && obj[part] !== undefined ? obj[part] : undefined;
    }, translations);

    return value ?? fallback;
}

function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        el.innerText = t(key);
    });
}

function setLang(lang) {
    localStorage.setItem("lang", lang);
    loadLang(lang);
}

const i18nListeners = [];
loadLang(localStorage.getItem("lang") || "vi-vn");

function onI18nChange(fn) {
    i18nListeners.push(fn);
}
