import { store } from '../store.js';

export function extendUiHelpers(app) {
    const THEME_MODES = ['light', 'dark'];
    const COLOR_SCHEMES = [{ id: 'ocean-blue', label: 'Azul Oceano' }];
    const DEFAULT_COLOR_SCHEME = 'ocean-blue';
    const DEFAULT_THEME_MODE = 'light';

    const normalizeThemeMode = (value) => {
        const raw = String(value || '').trim();
        return THEME_MODES.includes(raw) ? raw : DEFAULT_THEME_MODE;
    };

    const normalizeColorScheme = (value) => {
        return DEFAULT_COLOR_SCHEME;
    };

    app.getColorSchemes = function() {
        return COLOR_SCHEMES.slice();
    };

    app.applyColorScheme = function() {
        const scheme = normalizeColorScheme(store.colorScheme);
        store.colorScheme = scheme;
        document.documentElement.setAttribute('data-color-scheme', scheme);
    };

    app.updateColorSchemeSelectors = function() {
        const scheme = normalizeColorScheme(store.colorScheme);
        document.querySelectorAll('[data-color-scheme-btn]').forEach((button) => {
            const isActive = button.getAttribute('data-color-scheme-btn') === scheme;
            button.classList.toggle('is-active', isActive);
        });
    };

    app.setColorScheme = function(value) {
        const scheme = normalizeColorScheme(value);
        store.colorScheme = scheme;
        localStorage.setItem('colorScheme', scheme);
        app.applyColorScheme();
        app.updateColorSchemeSelectors();
    };

    app.handleColorSchemeChange = function(value) {
        app.setColorScheme(value);
    };

    app.setThemeMode = function(value) {
        const mode = normalizeThemeMode(value);
        store.themeMode = mode;
        store.isDarkMode = mode === 'dark';
        localStorage.setItem('themeMode', mode);
        localStorage.setItem('theme', store.isDarkMode ? 'dark' : 'light');
        app.applyTheme();
        app.updateThemeButtons();
    };

    app.handleThemeModeChange = function(value) {
        app.setThemeMode(value);
    };

    app.toggleTheme = function() {
        const current = normalizeThemeMode(store.themeMode || (store.isDarkMode ? 'dark' : 'light'));
        const next = current === 'light' ? 'dark' : 'light';
        app.setThemeMode(next);
    };

    app.applyTheme = function() {
        const mode = normalizeThemeMode(store.themeMode || (store.isDarkMode ? 'dark' : 'light'));
        store.themeMode = mode;
        store.isDarkMode = mode === 'dark';
        if (mode === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        document.documentElement.classList.remove('gray-mode');
        app.applyColorScheme();
    };

    app.updateThemeButtons = function() {
        const mode = normalizeThemeMode(store.themeMode || (store.isDarkMode ? 'dark' : 'light'));
        document.querySelectorAll('[data-theme-mode-toggle]').forEach((button) => {
            const isDark = mode === 'dark';
            button.title = isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro';
            button.setAttribute('aria-label', button.title);
            const label = button.querySelector('[data-theme-mode-label]');
            if (label) label.textContent = isDark ? 'Claro' : 'Escuro';
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-sun', !isDark);
                icon.classList.toggle('fa-moon', isDark);
            }
        });

        app.updateColorSchemeSelectors();
    };

    app.getUsersCache = async function() {
        if (Array.isArray(app._usersCache)) return app._usersCache;
        const fetchUsers = typeof app.getCollection === 'function'
            ? app.getCollection.bind(app)
            : null;
        if (!fetchUsers) {
            throw new Error('getCollection nao disponivel para carregar usuarios.');
        }
        const users = await fetchUsers('users');
        app._usersCache = users;
        app._usersMap = new Map(users.map((u) => [u.id, u.nome || '']));
        return users;
    };

    app.getUsersMap = function() {
        return app._usersMap instanceof Map ? app._usersMap : new Map();
    };

    app.invalidateUsersCache = function() {
        app._usersCache = null;
        app._usersMap = null;
    };

    app.showInfoModal = function(title, content) {
        const modalId = 'm-info-' + Date.now();
        const div = document.createElement('div');
        div.id = modalId;
        div.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 fade-in';
        div.innerHTML = `
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border dark:border-slate-700">
                <div class="p-6 border-b dark:border-slate-700 flex justify-between items-center">
                    <h3 class="font-bold text-lg dark:text-white">${title}</h3>
                    <button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 dark:text-gray-400"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-6">${content}</div>
                <div class="p-6 border-t dark:border-slate-700 flex justify-end">
                    <button onclick="document.getElementById('${modalId}').remove()" class="px-4 py-2 bg-blue-700 text-white rounded-lg">Fechar</button>
                </div>
            </div>`;
        document.body.appendChild(div);
    };

    app.openCalendarEventModal = async function(source) {
        let payload = source;
        if (source && source.getAttribute) {
            const raw = source.getAttribute('data-event');
            if (!raw) return;
            try { payload = JSON.parse(decodeURIComponent(raw)); }
            catch { return; }
        }
        if (!payload) return;
        const titulo = app.escapeHtml(payload.titulo || 'Evento');
        const tipo = app.escapeHtml(app.capitalize(payload.tipo || 'evento'));
        const turma = app.escapeHtml(payload.turmaNome || 'Geral');
        let professorHtml = '';
        let dataTexto = 'Sem data';
        if (payload.dataAgendada) {
            const dataObj = payload.tipo === 'componente'
                ? app.parseDateOnly(payload.dataAgendada)
                : new Date(payload.dataAgendada);
            if (!dataObj || isNaN(dataObj)) dataTexto = String(payload.dataAgendada);
            else {
                const semHora = payload.tipo === 'componente' || payload.tipo === 'feriado' || payload.tipo === 'recesso';
                dataTexto = semHora ? dataObj.toLocaleDateString('pt-BR') : dataObj.toLocaleString('pt-BR');
            }
        }
        if (payload.tipo === 'componente') {
            const ids = Array.isArray(payload.professorIds) ? payload.professorIds.filter(Boolean) : [];
            let profText = 'Componente sem professor Vinculado';
            if (ids.length > 0) {
                await app.getUsersCache();
                const map = app.getUsersMap();
                const names = ids.map((id) => map.get(id)).filter(Boolean);
                if (names.length > 0) profText = names.join(', ');
            }
            professorHtml = `<div><span class="font-semibold">Professor:</span> ${app.escapeHtml(profText)}</div>`;
        }
        const content = `
            <div class="space-y-2 text-sm">
                <div><span class="font-semibold">Titulo:</span> ${titulo}</div>
                <div><span class="font-semibold">Tipo:</span> ${tipo}</div>
                <div><span class="font-semibold">Turma:</span> ${turma}</div>
                <div><span class="font-semibold">Data:</span> ${app.escapeHtml(dataTexto)}</div>
                ${professorHtml}
            </div>`;
        app.showInfoModal('Detalhes do Evento', content);
    };
}