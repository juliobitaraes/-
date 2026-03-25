import { store } from '../store.js';
import { getActiveSchoolId } from '../config/school.js';

export function extendNavigationLayout(app) {
    app.renderMainLayout = function() {
        const ud = store.currentUserData;
        const activeSchoolName = app.escapeHtml(app.getSchoolDisplayName(app.activeSchoolId));
        const canUseSchoolSelector = app.canUseSchoolSelector();
        document.getElementById('app').innerHTML = `
            <div class="min-h-screen flex flex-col md:flex-row bg-slate-200 dark:bg-slate-900 transition-colors duration-300">
                <aside id="sidebar" onclick="app.handleSidebarTap(event)" class="mobile-sidebar bg-slate-900 text-white w-64 flex-shrink-0 fixed h-screen overflow-y-auto z-30 hidden md:block border-r border-slate-800 transition-all duration-300" aria-label="Menu principal" tabindex="-1">
                    <div id="sidebar-header" class="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div class="flex items-center space-x-3 overflow-hidden">
                            <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-graduation-cap text-lg text-white"></i>
                            </div>
                            <div class="sidebar-header-text">
                                <h1 class="text-xl font-bold text-white whitespace-nowrap">${activeSchoolName}</h1>
                                <p class="text-xs text-slate-400 font-mono uppercase whitespace-nowrap">${app.capitalize(ud.tipo)}</p>
                            </div>
                        </div>
                    </div>
                    ${canUseSchoolSelector ? `<div id="sidebar-school-switcher" class="px-4 pb-3">
                        <select id="school-selector-desktop" onchange="app.handleSchoolSelectorChange(this.value)" class="w-full bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="${app.activeSchoolId}">${app.activeSchoolId}</option>
                        </select>
                    </div>` : ''}
                    <div id="sidebar-scroll-area" class="flex-1 min-h-0 overflow-y-auto">
                        <nav class="p-4 space-y-2" id="sidebar-nav"></nav>
                    </div>
                    <div id="sidebar-footer" class="w-full bg-slate-900 border-t border-slate-800">
                        <button id="sidebar-theme-toggle" onclick="app.toggleTheme()" class="w-full flex items-center px-6 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition sidebar-nav-item">
                            <i class="fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} w-6 text-center sidebar-icon"></i>
                            <span class="sidebar-text text-sm ml-3">${store.isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
                        </button>
                        <div class="p-4">
                            <div id="sidebar-user-summary" class="flex items-center space-x-3 mb-3 px-2 sidebar-nav-item">
                                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">${ud.nome.charAt(0).toUpperCase()}</div>
                                <div class="flex-1 min-w-0 sidebar-text">
                                    <p class="text-xs font-medium truncate text-white">${ud.nome}</p>
                                </div>
                            </div>
                            <button id="sidebar-logout-btn" onclick="app.logout()" class="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition text-sm sidebar-nav-item">
                                <i class="fas fa-sign-out-alt"></i>
                                <span class="sidebar-text">Sair</span>
                            </button>
                        </div>
                    </div>
                </aside>
                <div id="sidebar-overlay" onclick="app.closeSidebarMobile()" class="fixed inset-0 bg-black/55 z-20 hidden md:hidden transition-opacity" aria-hidden="true"></div>
                <div id="mobile-header" class="md:hidden bg-white/95 dark:bg-slate-800/95 backdrop-blur fixed top-0 left-0 right-0 z-50 border-b border-slate-200 dark:border-slate-700 w-full">
                    <div class="h-16 px-3 flex items-center justify-between">
                        <div class="flex items-center space-x-2 min-w-0">
                            <i class="fas fa-graduation-cap text-blue-600 text-xl"></i>
                            <div class="min-w-0">
                                <div class="font-bold text-gray-800 dark:text-white truncate">${activeSchoolName}</div>
                                <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${app.escapeHtml(ud.nome)}</div>
                            </div>
                        </div>
                        ${canUseSchoolSelector ? `<div class="min-w-0 flex-1 px-2">
                            <select id="school-selector-mobile" onchange="app.handleSchoolSelectorChange(this.value)" class="w-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white text-xs rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-600 focus:outline-none">
                                <option value="${app.activeSchoolId}">${app.activeSchoolId}</option>
                            </select>
                        </div>` : '<div class="min-w-0 flex-1"></div>'}
                        <button onclick="app.toggleTheme()" class="w-11 h-11 rounded-xl flex items-center justify-center text-slate-700 dark:text-yellow-400 bg-slate-100 dark:bg-slate-700 active:scale-95 transition" aria-label="Alternar tema">
                            <i class="fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} text-xl"></i>
                        </button>
                    </div>
                </div>
                <main id="main-content" class="flex-1 md:ml-64 min-h-screen relative transition-all duration-300">
                    <div id="content-area" class="p-3 md:p-8 fade-in pb-24 md:pb-20"></div>
                </main>
                <div id="mobile-bottom-nav" class="md:hidden fixed left-0 right-0 bottom-0 z-40"></div>
            </div>`;
        app.renderSidebar();
        app.renderMobileBottomNav();
        app.renderContent();
        app.initHistory();
        setTimeout(() => app.applySidebarState(), 0);
        setTimeout(() => app.updateThemeButtons(), 50);
        if (canUseSchoolSelector) setTimeout(() => app.syncSchoolSelectorUI(), 80);
        if (!app._outsideClickInit) {
            document.addEventListener('click', (e) => app.handleOutsideClick(e));
            app._outsideClickInit = true;
        }
    };

    app.getMenuItemsByRole = function() {
        const type = store.currentUserData.tipo;
        const financialSections = [
            { id: 'contas_financeiras', icon: 'fa-wallet', label: 'Contas' },
            { id: 'receitas', icon: 'fa-coins', label: 'Receitas' },
            { id: 'despesas', icon: 'fa-file-invoice-dollar', label: 'Despesas' },
            { id: 'movimentacoes_financeiras', icon: 'fa-right-left', label: 'Movimentacao' },
            { id: 'categorias_financeiras', icon: 'fa-tags', label: 'Categorias' },
            { id: 'metas_financeiras', icon: 'fa-bullseye', label: 'Metas' },
            { id: 'orcamentos_financeiros', icon: 'fa-clipboard-list', label: 'Orcamentos' },
            { id: 'estoque', icon: 'fa-boxes-stacked', label: 'Estoque' },
            { id: 'fornecedores', icon: 'fa-truck', label: 'Fornecedores' },
            { id: 'produtos', icon: 'fa-box-open', label: 'Produtos' }
        ];
        const adminMenu = [
            { id: 'dashboard', icon: 'fa-home', label: 'Dashboard' },
            { id: 'diario', icon: 'fa-book', label: 'Diario' },
            { id: 'presenca', icon: 'fa-user-check', label: 'Frequencia' },
            { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatorios' },
            { id: 'notificacoes', icon: 'fa-bell', label: 'Notificacoes' },
            { id: 'usuarios', icon: 'fa-users-cog', label: 'Usuarios' },
            { id: 'manual', icon: 'fa-book-open', label: 'Manual' },
            { id: 'turmas', icon: 'fa-chalkboard', label: 'Turmas' },
            { id: 'alunos', icon: 'fa-user-graduate', label: 'Alunos' },
            { id: 'materiais', icon: 'fa-book', label: 'Materiais' },
            { id: 'provas', icon: 'fa-file-signature', label: 'Provas' },
            { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' },
            ...financialSections,
            { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' },
            { id: 'forum', icon: 'fa-users', label: 'Forum' },
            { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }
        ];

        if (app.isGlobalSuperAdmin()) {
            adminMenu.unshift({ id: 'escolas', icon: 'fa-school', label: 'Escolas' });
        }

        const menus = {
            admin: adminMenu,
            professor: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diario' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequencia' }, { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatorios' }, { id: 'notificacoes', icon: 'fa-bell', label: 'Notificacoes' }, { id: 'alunos', icon: 'fa-user-graduate', label: 'Meus Alunos' }, { id: 'materiais', icon: 'fa-book', label: 'Materiais' }, { id: 'provas', icon: 'fa-file-signature', label: 'Provas' }, { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' }, { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' }, { id: 'forum', icon: 'fa-users', label: 'Forum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }],
            secretaria: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diario' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequencia' }, { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatorios' }, { id: 'manual', icon: 'fa-book-open', label: 'Manual' }, { id: 'turmas', icon: 'fa-chalkboard', label: 'Turmas' }, { id: 'alunos', icon: 'fa-user-graduate', label: 'Alunos' }, ...financialSections, { id: 'forum', icon: 'fa-users', label: 'Forum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }],
            aluno: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diario' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequencia' }, { id: 'materiais', icon: 'fa-book', label: 'Materiais' }, { id: 'provas', icon: 'fa-file-signature', label: 'Provas' }, { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' }, { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' }, { id: 'forum', icon: 'fa-users', label: 'Forum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }]
        };

        return (menus[type] || []).filter((item) => app.isSectionEnabledForCurrentSchool(item.id));
    };

    app.getSidebarCategoryStorageKey = function(role) {
        const schoolId = app.activeSchoolId || getActiveSchoolId() || 'default';
        return `sidebarExpandedCategories:${role}:${schoolId}`;
    };

    app.getExpandedSidebarCategories = function(role, categoryIds, forceExpandAll = false) {
        if (forceExpandAll) return new Set(categoryIds);
        const key = app.getSidebarCategoryStorageKey(role);
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(parsed)) {
                const filtered = parsed.filter((id) => categoryIds.includes(id));
                if (filtered.length > 0) return new Set(filtered);
            }
        } catch (error) {
            console.warn('Falha ao ler categorias expandidas da sidebar:', error);
        }
        return new Set(categoryIds);
    };

    app.saveExpandedSidebarCategories = function(role, categorySet) {
        const key = app.getSidebarCategoryStorageKey(role);
        localStorage.setItem(key, JSON.stringify(Array.from(categorySet)));
    };

    app.getQuickAccessStorageKey = function(role) {
        const schoolId = app.activeSchoolId || getActiveSchoolId() || 'default';
        const userId = (store.currentUser && store.currentUser.uid) ? store.currentUser.uid : 'anon';
        return `sidebarQuickAccess:${userId}:${role}:${schoolId}`;
    };

    app.getStoredQuickAccessIds = function(role) {
        const key = app.getQuickAccessStorageKey(role);
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (error) {
            console.warn('Falha ao ler acesso rapido customizado:', error);
            return [];
        }
    };

    app.saveQuickAccessIds = function(role, ids) {
        const key = app.getQuickAccessStorageKey(role);
        localStorage.setItem(key, JSON.stringify(Array.isArray(ids) ? ids.slice(0, 4) : []));
    };

    app.openQuickAccessCustomizer = function() {
        const items = app.getMenuItemsByRole();
        const role = (store.currentUserData && store.currentUserData.tipo) ? store.currentUserData.tipo : '';
        const activeIds = new Set(app.getQuickAccessMenuItemsByRole(items).map((item) => item.id));
        const optionsHtml = items.map((item) => `
            <label class="flex items-center gap-2 text-sm dark:text-slate-200 py-1">
                <input type="checkbox" data-quick-id="${app.escapeHtml(item.id)}" ${activeIds.has(item.id) ? 'checked' : ''} class="rounded border-slate-300 text-blue-600 focus:ring-blue-500">
                <span>${app.escapeHtml(item.label)}</span>
            </label>
        `).join('');

        const content = `
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Selecione ate 4 atalhos para exibir em Acesso rapido.</p>
            <div class="max-h-72 overflow-y-auto border rounded-lg p-3 dark:border-slate-600 space-y-1">
                ${optionsHtml}
            </div>
        `;

        app.showModal('Personalizar Acesso Rapido', content, async () => {
            const checked = Array.from(document.querySelectorAll('[data-quick-id]:checked')).map((el) => el.getAttribute('data-quick-id'));
            if (checked.length === 0) throw new Error('Selecione ao menos uma secao.');
            if (checked.length > 4) throw new Error('Selecione no maximo 4 secoes.');
            app.saveQuickAccessIds(role, checked);
            app.renderSidebar();
            app.renderMobileBottomNav();
        }, {
            confirmLabel: 'Salvar atalhos',
            secondaryLabel: 'Restaurar padrao',
            secondaryClass: 'px-4 py-2 bg-slate-600 text-white rounded-lg',
            onSecondary: async () => {
                app.saveQuickAccessIds(role, []);
                app.renderSidebar();
                app.renderMobileBottomNav();
            }
        });
    };

    app.toggleSidebarCategory = function(categoryId) {
        if (!categoryId) return;
        const role = (store.currentUserData && store.currentUserData.tipo) ? store.currentUserData.tipo : '';
        const categoryIds = Array.from(document.querySelectorAll('[data-sidebar-category-id]'))
            .map((el) => el.getAttribute('data-sidebar-category-id'))
            .filter(Boolean);
        if (categoryIds.length === 0) return;
        const expanded = app.getExpandedSidebarCategories(role, categoryIds, false);
        if (expanded.has(categoryId)) expanded.delete(categoryId);
        else expanded.add(categoryId);
        app.saveExpandedSidebarCategories(role, expanded);
        app.renderSidebar();
    };

    app.handleSidebarSearch = function(rawValue) {
        app._sidebarSearchTerm = String(rawValue || '').trim();
        app.renderSidebar();
    };

    app.renderSidebarFlatList = function(nav, items) {
        nav.innerHTML = items.map(item => `
            <button onclick="app.navigate('${item.id}')" class="mobile-nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition font-medium sidebar-nav-item ${store.currentView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}" aria-label="Ir para ${item.label}" ${store.currentView === item.id ? 'aria-current="page"' : ''}>
                <i class="fas ${item.icon} w-5 text-center sidebar-icon"></i>
                <span class="sidebar-text">${item.label}</span>
            </button>
        `).join('');
    };

    app.getSidebarCategoriesForRole = function(role, items) {
        const presets = app.getSidebarCategoryPresets()[role] || [];
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const usedIds = new Set();
        const categories = [];

        presets.forEach((preset) => {
            const sectionItems = preset.sections
                .map((sectionId) => itemMap.get(sectionId))
                .filter(Boolean);
            if (sectionItems.length === 0) return;
            sectionItems.forEach((item) => usedIds.add(item.id));
            categories.push({
                id: preset.id,
                label: preset.label,
                items: sectionItems
            });
        });

        const remainingItems = items.filter((item) => !usedIds.has(item.id));
        if (remainingItems.length > 0) {
            categories.push({
                id: 'outras-secoes',
                label: 'Outras secoes',
                items: remainingItems
            });
        }

        return categories;
    };

    app.renderSidebar = function() {
        const nav = document.getElementById('sidebar-nav');
        if (!nav) return;

        const items = app.getMenuItemsByRole();
        const role = (store.currentUserData && store.currentUserData.tipo) ? store.currentUserData.tipo : '';
        const isMobile = window.innerWidth < 768;
        const searchInput = document.getElementById('sidebar-search-input');

        if (searchInput) {
            searchInput.value = app._sidebarSearchTerm || '';
            searchInput.disabled = false;
        }

        if (isMobile) {
            app.renderSidebarFlatList(nav, items);
            return;
        }

        const normalizedSearch = String(app._sidebarSearchTerm || '').trim().toLowerCase();
        const categories = app.getSidebarCategoriesForRole(role, items)
            .map((category) => ({
                ...category,
                items: category.items.filter((item) => !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch))
            }))
            .filter((category) => category.items.length > 0);

        const categoryIds = categories.map((category) => category.id);
        const forceExpandAll = normalizedSearch.length > 0;
        const expanded = app.getExpandedSidebarCategories(role, categoryIds, forceExpandAll);
        const quickItems = app.getQuickAccessMenuItemsByRole(items).slice(0, 4);
        const quickItemsHtml = quickItems.map((item) => `
            <button onclick="app.navigate('${item.id}')" class="mobile-nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition font-medium sidebar-nav-item sidebar-quick-item ${store.currentView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-200 hover:bg-slate-800 hover:text-white'}" aria-label="Ir para ${item.label}" ${store.currentView === item.id ? 'aria-current="page"' : ''}>
                <i class="fas ${item.icon} w-5 text-center sidebar-icon"></i>
                <span class="sidebar-text">${item.label}</span>
            </button>
        `).join('');
        const quickSectionHtml = (!normalizedSearch && quickItems.length > 0)
            ? `
                <section class="sidebar-quick-access">
                    <div class="px-2 pb-2 flex items-center justify-between gap-2">
                        <p class="text-[11px] uppercase tracking-wide font-semibold text-slate-400">Acesso rapido</p>
                        <button onclick="app.openQuickAccessCustomizer()" class="sidebar-quick-customize-btn text-[11px] text-blue-300 hover:text-blue-200">Personalizar</button>
                    </div>
                    <div class="space-y-1 pb-2">
                        ${quickItemsHtml}
                    </div>
                </section>
            `
            : '';

        const categoriesHtml = categories.map((category) => {
            const isOpen = expanded.has(category.id);
            const itemsHtml = category.items.map((item) => `
                <button onclick="app.navigate('${item.id}')" class="mobile-nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition font-medium sidebar-nav-item sidebar-subitem ${store.currentView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}" aria-label="Ir para ${item.label}" ${store.currentView === item.id ? 'aria-current="page"' : ''}>
                    <i class="fas ${item.icon} w-5 text-center sidebar-icon"></i>
                    <span class="sidebar-text">${item.label}</span>
                </button>
            `).join('');

            return `
                <section class="sidebar-category" data-sidebar-category-id="${category.id}">
                    <button ${forceExpandAll ? 'disabled' : ''} onclick="app.toggleSidebarCategory('${category.id}')" class="sidebar-category-toggle w-full flex items-center justify-between px-2 py-2 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition ${forceExpandAll ? 'opacity-80 cursor-default' : ''}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-label="Alternar categoria ${category.label}">
                        <span class="sidebar-category-title text-xs uppercase tracking-wide font-semibold">${category.label}</span>
                        <i class="fas fa-chevron-right sidebar-category-chevron text-[11px]"></i>
                    </button>
                    <div class="sidebar-category-body ${isOpen ? 'is-open' : ''}">
                        <div class="mt-1 space-y-1">
                            ${itemsHtml}
                        </div>
                    </div>
                </section>
            `;
        }).join('');

        nav.innerHTML = `${quickSectionHtml}${categoriesHtml}` || '<p class="text-xs text-slate-400 px-2 py-2">Nenhuma secao encontrada.</p>';
    };

    app.getQuickAccessMenuItemsByRole = function(items) {
        const role = store.currentUserData && store.currentUserData.tipo ? store.currentUserData.tipo : '';
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const storedIds = app.getStoredQuickAccessIds(role);

        if (storedIds.length > 0) {
            const custom = storedIds.map((id) => itemMap.get(id)).filter(Boolean).slice(0, 4);
            if (custom.length > 0) return custom;
        }

        const preferredByRole = {
            admin: ['dashboard', 'diario', 'presenca', 'notificacoes'],
            professor: ['dashboard', 'diario', 'presenca', 'notificacoes'],
            secretaria: ['dashboard', 'diario', 'presenca', 'turmas'],
            aluno: ['dashboard', 'diario', 'materiais', 'provas']
        };

        const preferredIds = preferredByRole[role] || ['dashboard', 'diario', 'presenca', 'cadastro'];
        const quick = preferredIds.map((id) => itemMap.get(id)).filter(Boolean).slice(0, 4);

        if (quick.length < 4) {
            for (const item of items) {
                if (quick.find((q) => q.id === item.id)) continue;
                quick.push(item);
                if (quick.length === 4) break;
            }
        }

        return quick;
    };

    app.getMobileQuickMenuItemsByRole = function(items) {
        return app.getQuickAccessMenuItemsByRole(items);
    };

    app.renderMobileBottomNav = function() {
        const container = document.getElementById('mobile-bottom-nav');
        if (!container) return;
        if (window.innerWidth >= 768) {
            container.innerHTML = '';
            return;
        }

        const items = app.getMenuItemsByRole();
        const quickItems = app.getMobileQuickMenuItemsByRole(items);
        const isMenuActive = !quickItems.some((item) => item.id === store.currentView);
        const quickButtons = quickItems.map((item) => `
            <button onclick="app.navigateMobileQuick('${item.id}')" class="mobile-bottom-nav-item ${store.currentView === item.id ? 'is-active' : ''}" aria-label="Ir para ${item.label}" ${store.currentView === item.id ? 'aria-current="page"' : ''}>
                <span class="mobile-bottom-nav-icon"><i class="fas ${item.icon}"></i></span>
                <span class="mobile-bottom-nav-label">${item.label}</span>
            </button>
        `).join('');

        const sheetButtons = items.map((item) => `
            <button onclick="app.navigateMobileQuick('${item.id}')" class="mobile-sheet-item ${store.currentView === item.id ? 'is-active' : ''}" aria-label="Ir para ${item.label}">
                <span class="mobile-sheet-icon"><i class="fas ${item.icon}"></i></span>
                <span class="mobile-sheet-label">${item.label}</span>
            </button>
        `).join('');

        container.innerHTML = `
            <nav class="mobile-bottom-bar-shell bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700" aria-label="Navegacao inferior">
                <div class="mobile-bottom-bar h-16 px-2">
                    <button id="mobile-sidebar-toggle" onclick="app.toggleSidebarMobile()" class="mobile-bottom-nav-item ${isMenuActive ? 'is-active' : ''}" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">
                        <span class="mobile-bottom-nav-icon"><i class="fas fa-bars"></i></span>
                        <span class="mobile-bottom-nav-label">Menu</span>
                    </button>
                    ${quickButtons}
                </div>
            </nav>
            <div id="mobile-sheet-title" class="sr-only">Menu completo</div>
        `;

        const sidebarNav = document.getElementById('sidebar-nav');
        if (sidebarNav) {
            sidebarNav.innerHTML = sheetButtons;
        }
    };

    app.navigateMobileQuick = function(view) {
        app.navigate(view);
    };

    app.navigate = function(view) {
        const options = arguments.length > 1 && arguments[1] ? arguments[1] : {};
        if (store.activeListener) { store.activeListener(); store.activeListener = null; }
        if (store.questionTimer) clearInterval(store.questionTimer);
        store.currentView = view;
        app.renderSidebar();
        app.renderMobileBottomNav();
        app.renderContent();
        if (!options.skipHistory) {
            const currentHash = (window.location.hash || '').replace('#', '');
            if (currentHash !== view) {
                window.history.pushState({ view }, '', `#${view}`);
            }
        }
        if (window.innerWidth < 768) app.closeSidebarMobile();
    };

    if (typeof app.hookNavigationLogging === 'function') {
        app.hookNavigationLogging();
    }

    app.initHistory = function() {
        if (app._historyInit) return;
        app._historyInit = true;
        const initialView = store.currentView || 'dashboard';
        window.history.replaceState({ view: initialView }, '', `#${initialView}`);
        window.addEventListener('popstate', (event) => {
            const stateView = event && event.state && event.state.view;
            const hashView = (window.location.hash || '').replace('#', '');
            if (!stateView && !hashView) return;
            const targetView = stateView || hashView || 'dashboard';
            if (targetView === store.currentView) return;
            app.navigate(targetView, { skipHistory: true });
        });
    };

    app.renderContent = async function() {
        if (typeof app.installSaveButtonLoadingDelegation === 'function') {
            app.installSaveButtonLoadingDelegation();
        }

        if (window._manualCleanups) {
            window._manualCleanups.forEach((cleanup) => cleanup());
            window._manualCleanups = [];
        }

        const content = document.getElementById('content-area');
        if (content) content.setAttribute('data-view', store.currentView || 'dashboard');
        if (content) {
            content.classList.add('content-loading');
            content.setAttribute('aria-busy', 'true');
        }
        content.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';
        try {
            if (store.currentView === 'escolas' && app.isGlobalSuperAdmin()) await app.renderEscolas(content);
            else if (store.currentView === 'dashboard') await app.renderDashboard(content);
            else if (store.currentView === 'diario') await app.renderDiarioPorComponentes(content);
            else if (store.currentView === 'presenca' && store.currentUserData.tipo === 'aluno') await app.renderFrequenciaAluno(content);
            else if (store.currentView === 'presenca' && ['admin', 'professor', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderPresencas(content);
            else if (store.currentView === 'materiais') await app.renderMateriaisOrganizado(content);
            else if (store.currentView === 'provas') await app.renderAvaliacoes(content, 'prova');
            else if (store.currentView === 'atividades') await app.renderAvaliacoes(content, 'atividade', { title: 'Atividades EAD' });
            else if (store.currentView === 'turmas' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderTurmas(content);
            else if (store.currentView === 'usuarios' && store.currentUserData.tipo === 'admin') await app.renderUsuarios(content);
            else if (store.currentView === 'alunos') await app.renderAlunosPorTurma(content);
            else if (store.currentView === 'trabalhos') await app.renderSelecaoTurma(content, 'trabalhos');
            else if (store.currentView === 'forum') await app.renderSelecaoTurma(content, 'forum');
            else if (store.currentView === 'administradores' && store.currentUserData.tipo === 'admin') await app.renderUsuarios(content);
            else if (store.currentView === 'professores' && store.currentUserData.tipo === 'admin') await app.renderUsuarios(content);
            else if (store.currentView === 'relatorios' && ['admin', 'professor', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderRelatorios(content);
            else if (store.currentView === 'notificacoes' && ['admin', 'professor'].includes(store.currentUserData.tipo)) await app.renderNotificacoes(content);
            else if (store.currentView === 'contas_financeiras' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderContasFinanceiras(content);
            else if (store.currentView === 'receitas' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderReceitasEscolares(content);
            else if (store.currentView === 'despesas' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderDespesasEscolares(content);
            else if (store.currentView === 'movimentacoes_financeiras' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderMovimentacoesFinanceiras(content);
            else if (store.currentView === 'categorias_financeiras' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderCategoriasFinanceiras(content);
            else if (store.currentView === 'metas_financeiras' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderMetasFinanceiras(content);
            else if (store.currentView === 'orcamentos_financeiros' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderOrcamentosFinanceiros(content);
            else if (store.currentView === 'estoque' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderEstoqueEscolar(content);
            else if (store.currentView === 'fornecedores' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderFornecedores(content);
            else if (store.currentView === 'produtos' && ['admin', 'secretaria'].includes(store.currentUserData.tipo)) await app.renderProdutos(content);
            else if (store.currentView === 'manual') await app.renderManual(content);
            else if (store.currentView === 'cadastro') await app.renderCadastro(content);
            else content.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito ou nao encontrado.</div>';
        } catch (error) {
            console.error('Erro na renderizacao:', error);
            content.innerHTML = `<div class="text-center text-red-500 bg-red-100 p-4 rounded-lg">Erro ao carregar tela: ${error.message}</div>`;
        } finally {
            if (content) {
                content.classList.remove('content-loading');
                content.setAttribute('aria-busy', 'false');
            }
        }
    };
}
