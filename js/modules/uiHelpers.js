import { store } from '../store.js';

export function extendUiHelpers(app) {
    app.toggleTheme = function() {
        store.isDarkMode = !store.isDarkMode;
        localStorage.setItem('theme', store.isDarkMode ? 'dark' : 'light');
        app.applyTheme();
        app.updateThemeButtons();
    };

    app.applyTheme = function() {
        if (store.isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    };

    app.updateThemeButtons = function() {
        const sidebarBtn = document.querySelector('#sidebar button[onclick="app.toggleTheme()"]');
        if (sidebarBtn) {
            const icon = sidebarBtn.querySelector('i');
            const text = sidebarBtn.querySelector('.sidebar-text');

            if (icon) {
                icon.className = `fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} w-6 text-center sidebar-icon`;
            }
            if (text) {
                text.textContent = store.isDarkMode ? 'Modo Claro' : 'Modo Escuro';
            }
        }

        const mobileBtn = document.querySelector('.md\\:hidden button[onclick="app.toggleTheme()"]');
        if (mobileBtn) {
            const icon = mobileBtn.querySelector('i');
            if (icon) icon.className = `fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} text-xl`;
        }
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