/**
 * SENATEDU - Sistema de Gestão Escolar
 * App principal - orquestra módulos e gerencia estado
 */
import { store } from './store.js';
import { auth, db, storage, messaging } from './services/init.js';
import { getCollection } from './services/db.js';
import { sendWelcomeEmail, sendPasswordReset } from './services/email.js';
import { createModalComponent } from './components/modal.js';
import { generateCalendarHTML } from './components/calendar.js';
import { capitalize, escapeHtml, formatDateOnly, parseDateOnly, toInputDate } from './utils/helpers.js';
import { createAuthMethods } from './auth.js';
import { createPermissions } from './services/permissions.js';
import { extendApp } from './app-impl.js?v=20260224-ia-count-fix-2';
import { 
    registerForNotifications, 
    onMessageListener, 
    setupTokenRefresh,
    isNotificationSupported,
    diagnosticarNotificacoes
} from './services/notifications.js';

const modal = createModalComponent(() => {});
const showToast = (m, t) => modal.showToast(m, t);
const showModal = (title, content, onConfirm, options = {}) => modal.showModal(title, content, onConfirm, options);

const app = {
    get currentUser() { return store.currentUser; },
    get currentUserData() { return store.currentUserData; },
    get currentView() { return store.currentView; },
    set currentView(v) { store.currentView = v; },
    get currentMaterialType() { return store.currentMaterialType; },
    set currentMaterialType(v) { store.currentMaterialType = v; },
    get tempQuestoes() { return store.tempQuestoes; },
    set tempQuestoes(v) { store.tempQuestoes = v; },
    get currentTurmaFilter() { return store.currentTurmaFilter; },
    set currentTurmaFilter(v) { store.currentTurmaFilter = v; },
    get currentComponenteFilter() { return store.currentComponenteFilter; },
    set currentComponenteFilter(v) { store.currentComponenteFilter = v; },
    get activeExamData() { return store.activeExamData; },
    set activeExamData(v) { store.activeExamData = v; },
    get activeExamAnswers() { return store.activeExamAnswers; },
    set activeExamAnswers(v) { store.activeExamAnswers = v; },
    get currentQuestionIndex() { return store.currentQuestionIndex; },
    set currentQuestionIndex(v) { store.currentQuestionIndex = v; },
    get questionTimer() { return store.questionTimer; },
    set questionTimer(v) { store.questionTimer = v; },
    get timeLeft() { return store.timeLeft; },
    set timeLeft(v) { store.timeLeft = v; },
    get activeListener() { return store.activeListener; },
    set activeListener(v) { store.activeListener = v; },
    get isDarkMode() { return store.isDarkMode; },
    set isDarkMode(v) { store.isDarkMode = v; },
    get isSidebarCollapsed() { return store.isSidebarCollapsed; },
    set isSidebarCollapsed(v) { store.isSidebarCollapsed = v; },
    get calendarView() { return store.calendarView; },
    set calendarView(v) { store.calendarView = v; },

    init() {
        this.applyTheme();
        this.applySidebarState();
        if (!this._mobileResizeInit) {
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 768) this.setMobileMenuState(false);
            });
            this._mobileResizeInit = true;
        }
        if (!this._mobileA11yInit) {
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && window.innerWidth < 768) this.closeSidebarMobile();
            });
            this._mobileA11yInit = true;
        }
        if (!this._calendarClickInit) {
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.calendar-event-btn');
                if (btn) this.openCalendarEventModal(btn);
            });
            this._calendarClickInit = true;
        }
        this.monitorAuth();
    },

    toggleTheme() {
        store.isDarkMode = !store.isDarkMode;
        localStorage.setItem('theme', store.isDarkMode ? 'dark' : 'light');
        this.applyTheme();
        
        console.log('🎨 Tema alterado para:', store.isDarkMode ? 'escuro' : 'claro');
        
        // Atualiza os botões de tema no sidebar e mobile header
        this.updateThemeButtons();
    },
    applyTheme() {
        if (store.isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    },
    updateThemeButtons() {
        console.log('🔄 Atualizando botões de tema. isDarkMode:', store.isDarkMode);
        
        // Atualiza botão do sidebar desktop
        const sidebarBtn = document.querySelector('#sidebar button[onclick="app.toggleTheme()"]');
        console.log('Sidebar button encontrado:', !!sidebarBtn);
        
        if (sidebarBtn) {
            const icon = sidebarBtn.querySelector('i');
            const text = sidebarBtn.querySelector('.sidebar-text');
            
            console.log('Icon:', !!icon, 'Text:', !!text);
            
            if (icon) {
                const newIconClass = `fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} w-6 text-center sidebar-icon`;
                icon.className = newIconClass;
                console.log('Ícone atualizado para:', newIconClass);
            }
            if (text) {
                const newText = store.isDarkMode ? 'Modo Claro' : 'Modo Escuro';
                text.textContent = newText;
                console.log('Texto atualizado para:', newText);
            }
        }
        
        // Atualiza botão mobile
        const mobileBtn = document.querySelector('.md\\:hidden button[onclick="app.toggleTheme()"]');
        if (mobileBtn) {
            const icon = mobileBtn.querySelector('i');
            if (icon) icon.className = `fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} text-xl`;
        }
    },
    async getUsersCache() {
        if (Array.isArray(this._usersCache)) return this._usersCache;
        const fetchUsers = typeof this.getCollection === 'function'
            ? this.getCollection.bind(this)
            : getCollection;
        const users = await fetchUsers('users');
        this._usersCache = users;
        this._usersMap = new Map(users.map(u => [u.id, u.nome || '']));
        return users;
    },
    getUsersMap() {
        return this._usersMap instanceof Map ? this._usersMap : new Map();
    },
    invalidateUsersCache() {
        this._usersCache = null;
        this._usersMap = null;
    },
    showInfoModal(title, content) {
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
    },
    async openCalendarEventModal(source) {
        let payload = source;
        if (source && source.getAttribute) {
            const raw = source.getAttribute('data-event');
            if (!raw) return;
            try { payload = JSON.parse(decodeURIComponent(raw)); }
            catch { return; }
        }
        if (!payload) return;
        const titulo = this.escapeHtml(payload.titulo || 'Evento');
        const tipo = this.escapeHtml(this.capitalize(payload.tipo || 'evento'));
        const turma = this.escapeHtml(payload.turmaNome || 'Geral');
        let professorHtml = '';
        let dataTexto = 'Sem data';
        if (payload.dataAgendada) {
            const dataObj = payload.tipo === 'componente'
                ? this.parseDateOnly(payload.dataAgendada)
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
                await this.getUsersCache();
                const map = this.getUsersMap();
                const names = ids.map(id => map.get(id)).filter(Boolean);
                if (names.length > 0) profText = names.join(', ');
            }
            professorHtml = `<div><span class="font-semibold">Professor:</span> ${this.escapeHtml(profText)}</div>`;
        }
        const content = `
            <div class="space-y-2 text-sm">
                <div><span class="font-semibold">Titulo:</span> ${titulo}</div>
                <div><span class="font-semibold">Tipo:</span> ${tipo}</div>
                <div><span class="font-semibold">Turma:</span> ${turma}</div>
                <div><span class="font-semibold">Data:</span> ${this.escapeHtml(dataTexto)}</div>
                ${professorHtml}
            </div>`;
        this.showInfoModal('Detalhes do Evento', content);
    },

    toggleSidebar() {
        store.isSidebarCollapsed = !store.isSidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
        this.applySidebarState();
    },
    openSidebarMobile() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (!sidebar) return;
        sidebar.classList.remove('hidden');
        sidebar.classList.remove('sidebar-collapsed');
        this.updateMobileToggleIcon(true);
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }
    },
    toggleSidebarMobile() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        if (sidebar.classList.contains('hidden')) this.openSidebarMobile();
        else this.closeSidebarMobile();
    },
    updateMobileToggleIcon(isOpen) {
        const icon = document.querySelector('#mobile-sidebar-toggle i');
        if (!icon) return;
        icon.classList.toggle('fa-bars', !isOpen);
        icon.classList.toggle('fa-times', isOpen);
    },
    closeSidebarMobile() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (!sidebar) return;
        sidebar.classList.add('hidden');
        this.updateMobileToggleIcon(false);
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
    },
    applySidebarState() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        if (!sidebar) return;
        if (window.innerWidth < 768) {
            sidebar.classList.remove('sidebar-collapsed');
            return;
        }
        if (store.isSidebarCollapsed) {
            sidebar.classList.add('sidebar-collapsed');
            if (mainContent) mainContent.classList.replace('md:ml-64', 'md:ml-20');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            if (mainContent) mainContent.classList.replace('md:ml-20', 'md:ml-64');
        }
    },

    handleOutsideClick(e) {
        if (window.innerWidth < 768) return;
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.querySelector('.sidebar-toggle-btn');
        if (!sidebar) return;
        // ignore clicks inside sidebar or on the toggle button
        if (sidebar.contains(e.target) || (toggleBtn && toggleBtn.contains(e.target))) return;
        // only collapse if currently expanded
        if (!store.isSidebarCollapsed) {
            store.isSidebarCollapsed = true;
            localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
            this.applySidebarState();
        }
    },
    handleSidebarTap(e) {
        if (window.innerWidth < 768) return;
        if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
        store.isSidebarCollapsed = !store.isSidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
        this.applySidebarState();
    },

    ...createAuthMethods({ renderLogin: null, renderMainLayout: null, sendPasswordReset })
};

Object.assign(app, createAuthMethods(app));

app.monitorAuth = async function() {
    auth.onAuthStateChanged(async (user) => {
        if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
        if (user) {
            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    // check blockedUntil
                    if (data.blockedUntil) {
                        let until = data.blockedUntil;
                        if (typeof until.toDate === 'function') until = until.toDate(); else until = new Date(until);
                        if (new Date() < new Date(until)) {
                            alert('Acesso bloqueado até ' + new Date(until).toLocaleString());
                            await auth.signOut();
                            return;
                        }
                    }
                    store.currentUser = user;
                    store.currentUserData = { id: user.uid, ...data };
                    if (app.logAcesso) app.logAcesso('login', 'auth');
                    
                    store.currentView = 'dashboard';
                    app.renderMainLayout();
                    
                    // Registrar para notificações push se o usuário for aluno
                    if (data.tipo === 'aluno' && isNotificationSupported()) {
                        console.log('🔔 Iniciando registro de notificações para aluno...');
                        // Aguardar renderização antes de solicitar permissão
                        setTimeout(async () => {
                            try {
                                console.log('🔔 Solicitando permissão de notificações...');
                                const registered = await registerForNotifications(user.uid);
                                if (registered) {
                                    console.log('✅ Notificações registradas com sucesso!');
                                    if (app.showToast) {
                                        app.showToast('Notificações ativadas! Você receberá avisos no celular.', 'success');
                                    }
                                    // Configurar listener de mensagens
                                    onMessageListener((payload) => {
                                        console.log('📬 Notificação recebida:', payload);
                                        if (app.showToast) {
                                            app.showToast(
                                                payload.notification?.title || 'Nova notificação', 
                                                'info'
                                            );
                                        }
                                    });
                                    
                                    // Configurar listener para cliques em notificações
                                    if ('serviceWorker' in navigator) {
                                        navigator.serviceWorker.addEventListener('message', (event) => {
                                            if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
                                                console.log('🖱️ Notificação clicada:', event.data);
                                                
                                                // Redirecionar para a view apropriada
                                                if (event.data.data && event.data.data.type === 'prova') {
                                                    app.currentView = 'provas';
                                                    app.renderContent();
                                                } else if (event.data.data && event.data.data.type === 'atividade') {
                                                    app.currentView = 'atividades';
                                                    app.renderContent();
                                                }
                                            }
                                        });
                                    }
                                    
                                    // Configurar renovação automática de token
                                    setupTokenRefresh(user.uid);
                                } else {
                                    console.warn('⚠️ Notificações não foram registradas');
                                    if (app.showToast) {
                                        app.showToast('Permita notificações para receber avisos no celular.', 'warning');
                                    }
                                }
                            } catch (error) {
                                console.error('❌ Erro ao registrar notificações:', error);
                            }
                        }, 3000);
                    }
                } else auth.signOut();
            } catch (e) { app.renderLogin(); }
        } else app.renderLogin();
    });
};

app.renderMainLayout = function() {
    const ud = store.currentUserData;
    document.getElementById('app').innerHTML = `
        <div class="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
            <aside id="sidebar" onclick="app.handleSidebarTap(event)" class="mobile-sidebar bg-slate-900 text-white w-64 flex-shrink-0 fixed h-screen overflow-y-auto z-30 hidden md:block border-r border-slate-800 transition-all duration-300" aria-label="Menu principal" tabindex="-1">
                <div class="p-6 border-b border-slate-800 flex items-center justify-between">
                    <div class="flex items-center space-x-3 overflow-hidden">
                        <div class="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-graduation-cap text-lg text-white"></i>
                        </div>
                        <div class="sidebar-header-text">
                            <h1 class="text-xl font-bold text-white whitespace-nowrap">SENATEDU</h1>
                            <p class="text-xs text-slate-400 font-mono uppercase whitespace-nowrap">${capitalize(ud.tipo)}</p>
                        </div>
                    </div>
                </div>
                <nav class="p-4 pb-28 space-y-2" id="sidebar-nav"></nav>
                <div class="absolute bottom-0 w-full bg-slate-900 border-t border-slate-800">
                    <button onclick="app.toggleTheme()" class="w-full flex items-center px-6 py-3 text-slate-400 hover:text-white hover:bg-slate-800 transition sidebar-nav-item">
                        <i class="fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} w-6 text-center sidebar-icon"></i>
                        <span class="sidebar-text text-sm ml-3">${store.isDarkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
                    </button>
                    <div class="p-4">
                        <div class="flex items-center space-x-3 mb-3 px-2 sidebar-nav-item">
                            <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">${ud.nome.charAt(0).toUpperCase()}</div>
                            <div class="flex-1 min-w-0 sidebar-text">
                                <p class="text-xs font-medium truncate text-white">${ud.nome}</p>
                            </div>
                        </div>
                        <button onclick="app.logout()" class="w-full flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition text-sm sidebar-nav-item">
                            <i class="fas fa-sign-out-alt"></i>
                            <span class="sidebar-text">Sair</span>
                        </button>
                    </div>
                </div>
            </aside>
            <div id="sidebar-overlay" onclick="app.closeSidebarMobile()" class="fixed inset-0 bg-black/55 z-20 hidden md:hidden transition-opacity" aria-hidden="true"></div>
            <div id="mobile-header" class="md:hidden bg-white/95 dark:bg-slate-800/95 backdrop-blur sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700 w-full">
                <div class="h-16 px-3 flex items-center justify-between">
                    <button id="mobile-sidebar-toggle" onclick="app.toggleSidebarMobile()" class="w-11 h-11 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 active:scale-95 transition" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">
                        <i class="fas fa-bars text-xl"></i>
                    </button>
                    <div class="flex items-center space-x-2 min-w-0">
                        <i class="fas fa-graduation-cap text-blue-600 text-xl"></i>
                        <span class="font-bold text-gray-800 dark:text-white truncate">SENATEDU</span>
                    </div>
                    <button onclick="app.toggleTheme()" class="w-11 h-11 rounded-xl flex items-center justify-center text-slate-700 dark:text-yellow-400 bg-slate-100 dark:bg-slate-700 active:scale-95 transition" aria-label="Alternar tema">
                        <i class="fas ${store.isDarkMode ? 'fa-sun' : 'fa-moon'} text-xl"></i>
                    </button>
                </div>
            </div>
            <main id="main-content" class="flex-1 md:ml-64 min-h-screen relative transition-all duration-300">
                <div id="content-area" class="p-3 md:p-8 fade-in pb-24 md:pb-20"></div>
            </main>
        </div>`;
    app.renderSidebar();
    app.renderContent();
    app.initHistory();
    setTimeout(() => app.applySidebarState(), 0);
    // Atualiza botões de tema após renderizar
    setTimeout(() => app.updateThemeButtons(), 50);
    // Attach outside click handler once
    if (!app._outsideClickInit) {
        document.addEventListener('click', (e) => app.handleOutsideClick(e));
        app._outsideClickInit = true;
    }
};

app.renderSidebar = function() {
    const nav = document.getElementById('sidebar-nav');
    const type = store.currentUserData.tipo;
    const menus = {
        admin: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diário' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequência' }, { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatórios' }, { id: 'notificacoes', icon: 'fa-bell', label: 'Notificações' }, { id: 'usuarios', icon: 'fa-users-cog', label: 'Usuários' }, { id: 'manual', icon: 'fa-book-open', label: 'Manual' }, { id: 'turmas', icon: 'fa-chalkboard', label: 'Turmas' }, { id: 'alunos', icon: 'fa-user-graduate', label: 'Alunos' }, { id: 'materiais', icon: 'fa-book', label: 'Materiais' }, { id: 'provas', icon: 'fa-file-signature', label: 'Provas' }, { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' }, { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' }, { id: 'forum', icon: 'fa-users', label: 'Fórum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }],
        professor: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diário' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequência' }, { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatórios' }, { id: 'notificacoes', icon: 'fa-bell', label: 'Notificações' }, { id: 'alunos', icon: 'fa-user-graduate', label: 'Meus Alunos' }, { id: 'materiais', icon: 'fa-book', label: 'Materiais' }, { id: 'provas', icon: 'fa-file-signature', label: 'Provas' }, { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' }, { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' }, { id: 'forum', icon: 'fa-users', label: 'Fórum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }],
        secretaria: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diário' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequência' }, { id: 'relatorios', icon: 'fa-chart-bar', label: 'Relatórios' }, { id: 'manual', icon: 'fa-book-open', label: 'Manual' }, { id: 'turmas', icon: 'fa-chalkboard', label: 'Turmas' }, { id: 'alunos', icon: 'fa-user-graduate', label: 'Alunos' }, { id: 'forum', icon: 'fa-users', label: 'Fórum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }],
        aluno: [{ id: 'dashboard', icon: 'fa-home', label: 'Dashboard' }, { id: 'diario', icon: 'fa-book', label: 'Diário' }, { id: 'presenca', icon: 'fa-user-check', label: 'Frequência' }, { id: 'materiais', icon: 'fa-book', label: 'Materiais' }, { id: 'provas', icon: 'fa-file-signature', label: 'Provas' }, { id: 'atividades', icon: 'fa-tasks', label: 'Atividades EAD' }, { id: 'trabalhos', icon: 'fa-briefcase', label: 'Trabalhos' }, { id: 'forum', icon: 'fa-users', label: 'Fórum' }, { id: 'cadastro', icon: 'fa-user-cog', label: 'Cadastro' }]
    };
    nav.innerHTML = (menus[type] || []).map(item => `
        <button onclick="app.navigate('${item.id}')" class="mobile-nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition font-medium sidebar-nav-item ${store.currentView === item.id ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}" aria-label="Ir para ${item.label}" ${store.currentView === item.id ? 'aria-current="page"' : ''}>
            <i class="fas ${item.icon} w-5 text-center sidebar-icon"></i>
            <span class="sidebar-text">${item.label}</span>
        </button>
    `).join('');
};

app.navigate = function(view) {
    const options = arguments.length > 1 && arguments[1] ? arguments[1] : {};
    if (store.activeListener) { store.activeListener(); store.activeListener = null; }
    if (store.questionTimer) clearInterval(store.questionTimer);
    store.currentView = view;
    app.renderSidebar();
    app.renderContent();
    if (!options.skipHistory) {
        const currentHash = (window.location.hash || '').replace('#', '');
        if (currentHash !== view) {
            window.history.pushState({ view }, '', `#${view}`);
        }
    }
    if (window.innerWidth < 768) app.closeSidebarMobile();
};

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

// Set panel position: top panel on desktop, sidebar on mobile


app.renderContent = async function() {
    // Limpa botões flutuantes do manual (se existirem)
    if (window._manualCleanups) {
        window._manualCleanups.forEach(cleanup => cleanup());
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
        if (store.currentView === 'dashboard') await app.renderDashboard(content);
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
        else if (store.currentView === 'manual') await app.renderManual(content);
        else if (store.currentView === 'cadastro') await app.renderCadastro(content);
        else content.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito ou não encontrado.</div>';
    } catch (error) {
        console.error("Erro na renderização:", error);
        content.innerHTML = `<div class="text-center text-red-500 bg-red-100 p-4 rounded-lg">Erro ao carregar tela: ${error.message}</div>`;
    } finally {
        if (content) {
            content.classList.remove('content-loading');
            content.setAttribute('aria-busy', 'false');
        }
    }
};

app.getCollection = getCollection;
app.showModal = showModal;
app.showToast = showToast;
app.capitalize = capitalize;
app.escapeHtml = escapeHtml;
app.parseDateOnly = parseDateOnly;
app.formatDateOnly = formatDateOnly;
app.toInputDate = toInputDate;
app.sendPasswordReset = sendPasswordReset;
app.sendWelcomeEmail = sendWelcomeEmail;
app.generateCalendarHTML = generateCalendarHTML;

// Expor funções básicas de notificação globalmente
window.registerForNotifications = registerForNotifications;
window.isNotificationSupported = isNotificationSupported;
window.onMessageListener = onMessageListener;
window.setupTokenRefresh = setupTokenRefresh;
window.diagnosticarNotificacoes = diagnosticarNotificacoes;

app.reclaimEmailIfDeleted = async function(email) {
    const reclaimFn = firebase.functions().httpsCallable('reclaimUserByEmail');
    return reclaimFn({ email });
};
app.createUserWithReclaim = async function(email, senha) {
    try {
        return await app.criarUsuarioSemDeslogar(email, senha);
    } catch (err) {
        if (err && err.code === 'auth/email-already-in-use') {
            try {
                const result = await app.reclaimEmailIfDeleted(email);
                if (result && result.data && result.data.reclaimed) {
                    return await app.criarUsuarioSemDeslogar(email, senha);
                }
            } catch (reclaimErr) {
                if (reclaimErr && reclaimErr.message) {
                    throw new Error(reclaimErr.message);
                }
            }
            throw new Error('Email ja esta em uso por outra conta ativa.');
        }
        throw err;
    }
};

app.deleteItem = async function(col, id) {
    if (!confirm('Excluir?')) return;
    let data = null;
    try {
        const doc = await db.collection(col).doc(id).get();
        if (doc.exists) data = doc.data();
    } catch (err) {
        console.warn('Nao foi possivel ler item para log:', err);
    }
    await db.collection(col).doc(id).delete();
    if (app.logAcesso) {
        if (col === 'provas') {
            const tipo = data?.tipo === 'atividade' ? 'atividade' : 'prova';
            const acao = tipo === 'atividade' ? 'atividade_excluida' : 'prova_excluida';
            const detalhe = data?.titulo ? `${tipo}:${data.titulo}` : tipo;
            app.logAcesso(acao, detalhe);
        } else if (col === 'turmas') {
            app.logAcesso('turma_excluida', data?.nome || 'turma');
        }
    }
    app.renderContent();
};
app.deleteUsuario = async function(id) {
    if (!confirm('Remover usuário?')) return;
    let data = null;
    try {
        const doc = await db.collection('users').doc(id).get();
        if (doc.exists) data = doc.data();
    } catch (err) {
        console.warn('Nao foi possivel ler usuario para log:', err);
    }
    try {
        const deleteUserFn = firebase.functions().httpsCallable('deleteUserByUid');
        await deleteUserFn({ uid: id });
    } catch (err) {
        alert(err?.message || 'Erro ao excluir usuario.');
        return;
    }
    if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
    if (app.logAcesso && data) {
        const tipo = data.tipo || 'usuario';
        const nome = data.nome || 'usuario';
        const acao = tipo === 'aluno' ? 'aluno_excluido' : (tipo === 'professor' ? 'professor_excluido' : (tipo === 'admin' ? 'administrador_excluido' : 'usuario_excluido'));
        app.logAcesso(acao, nome);
    }
    app.renderContent();
};

// Mobile sidebar helpers
app.setMobileMenuState = function(isOpen) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggleButton = document.getElementById('mobile-sidebar-toggle');
    if (!sidebar) return;
    sidebar.classList.toggle('hidden', !isOpen);
    if (overlay) {
        overlay.classList.toggle('hidden', !isOpen);
        overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
    if (toggleButton) {
        toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggleButton.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    }
    const icon = document.querySelector('#mobile-sidebar-toggle i');
    if (icon) {
        icon.classList.toggle('fa-bars', !isOpen);
        icon.classList.toggle('fa-times', isOpen);
    }
    document.body.classList.toggle('mobile-menu-open', !!isOpen);
    if (isOpen) sidebar.focus();
    else if (toggleButton) toggleButton.focus();
};

app.toggleSidebarMobile = function() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('hidden');
    app.setMobileMenuState(isOpen);
};

app.closeSidebarMobile = function() {
    app.setMobileMenuState(false);
};

// attach extended implementations from app-impl
extendApp(app);
app.perms = createPermissions(() => app.currentUserData, () => app.getUserRole());

export { app };
window.app = app;
app.init();
