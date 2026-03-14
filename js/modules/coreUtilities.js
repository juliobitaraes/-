import { db } from '../services/init.js';
import { getCollection, getSchoolCollection } from '../services/db.js';
import { getActiveSchoolId } from '../config/school.js';
import { store } from '../store.js';
import {
    registerForNotifications,
    onMessageListener,
    setupTokenRefresh,
    isNotificationSupported,
    diagnosticarNotificacoes
} from '../services/notifications.js';

export function extendCoreUtilities(app) {
    app.formatBytes = function(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, exp);
        return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
    };

    app.getSchoolCollectionRef = function(name) {
        const schoolId = app.activeSchoolId || getActiveSchoolId();
        return db.collection('schools').doc(schoolId).collection(name);
    };

    app.moneyInputToNumber = function(rawValue) {
        const normalized = String(rawValue || '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    };

    app.numberToMoneyInput = function(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2).replace('.', ',');
    };

    app.formatCurrencyBRL = function(value) {
        const n = Number(value);
        const safeValue = Number.isFinite(n) ? n : 0;
        return safeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    app.normalizeDateInput = function(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.slice(0, 10);
        if (value && typeof value.toDate === 'function') {
            return value.toDate().toISOString().slice(0, 10);
        }
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    };

    app.getCollection = async function(name) {
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        if (name === 'avisos') {
            return getCollection(name);
        }
        return getSchoolCollection(schoolId, name);
    };

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
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        try {
            const doc = await db.collection('schools').doc(schoolId).collection(col).doc(id).get();
            if (doc.exists) data = doc.data();
        } catch (err) {
            console.warn('Nao foi possivel ler item para log:', err);
        }
        await db.collection('schools').doc(schoolId).collection(col).doc(id).delete();
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
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        try {
            const doc = await db.collection('schools').doc(schoolId).collection('users').doc(id).get();
            if (doc.exists) data = doc.data();
        } catch (err) {
            console.warn('Nao foi possivel ler usuario para log:', err);
        }
        try {
            const deleteUserFn = firebase.functions().httpsCallable('deleteUserByUid');
            await deleteUserFn({ uid: id, schoolId });
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
        const icon = toggleButton ? toggleButton.querySelector('i') : null;
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
}
