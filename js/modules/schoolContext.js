import { auth, db } from '../services/init.js';
import { invalidateSchoolCollectionCache } from '../services/db.js';
import { getActiveSchoolId, GLOBAL_SUPER_ADMIN_UID } from '../config/school.js';
import {
    registerForNotifications,
    onMessageListener,
    setupTokenRefresh,
    isNotificationSupported
} from '../services/notifications.js';
import { store } from '../store.js';

export function extendSchoolContext(app) {
    app.resolveUserProfileForSchool = async function(user, schoolId) {
        const schoolUserRef = db.collection('schools').doc(schoolId).collection('users').doc(user.uid);
        const schoolUserDoc = await schoolUserRef.get();

        if (schoolUserDoc.exists) {
            return { id: user.uid, schoolId, ...schoolUserDoc.data() };
        }

        if (user.uid === GLOBAL_SUPER_ADMIN_UID) {
            const legacyDoc = await db.collection('users').doc(user.uid).get();
            if (legacyDoc.exists) {
                return { id: user.uid, schoolId, ...legacyDoc.data(), roleScope: 'global' };
            }
        }

        return null;
    };

    app.loadAvailableSchools = async function(user) {
        if (!user) {
            app.availableSchools = [];
            return [];
        }

        if (user.uid === GLOBAL_SUPER_ADMIN_UID) {
            const allSchoolsSnap = await db.collection('schools').get();
            const schools = allSchoolsSnap.docs.map((doc) => ({
                id: doc.id,
                nome: (doc.data() && (doc.data().nome || doc.data().name)) || doc.id,
                features: app.normalizeSchoolFeatureFlags(doc.data()?.features, doc.id)
            }));
            app.availableSchools = schools;
            return schools;
        }

        // Para usuarios comuns, evita collectionGroup para nao disparar erro de regra em alguns clientes mobile.
        const preferredSchoolId = app.getPreferredSchoolId(user.uid);
        const schoolDoc = await db.collection('schools').doc(preferredSchoolId).get();
        const schools = [{
            id: preferredSchoolId,
            nome: schoolDoc.exists ? ((schoolDoc.data().nome || schoolDoc.data().name || preferredSchoolId)) : preferredSchoolId,
            features: app.normalizeSchoolFeatureFlags(schoolDoc.exists ? schoolDoc.data()?.features : null, preferredSchoolId)
        }];

        app.availableSchools = schools;
        return schools;
    };

    app.syncSchoolSelectorUI = function() {
        const selectors = [
            document.getElementById('school-selector-desktop'),
            document.getElementById('school-selector-mobile')
        ].filter(Boolean);

        if (selectors.length === 0) return;

        const activeSchoolId = app.activeSchoolId || getActiveSchoolId();
        const schools = app.availableSchools;

        selectors.forEach((selectEl) => {
            selectEl.innerHTML = '';

            if (!schools || schools.length === 0) {
                const opt = document.createElement('option');
                opt.value = activeSchoolId || '';
                opt.textContent = activeSchoolId || 'Sem escola';
                selectEl.appendChild(opt);
                selectEl.disabled = true;
                return;
            }

            schools.forEach((school) => {
                const opt = document.createElement('option');
                opt.value = school.id;
                opt.textContent = school.nome || school.id;
                if (school.id === activeSchoolId) opt.selected = true;
                selectEl.appendChild(opt);
            });

            selectEl.disabled = schools.length <= 1;
        });
    };

    app.switchSchool = async function(nextSchoolId) {
        if (!app.canUseSchoolSelector()) return;
        if (!nextSchoolId || nextSchoolId === app.activeSchoolId) return;
        if (!app.currentUser) return;

        const previousSchoolId = app.activeSchoolId;
        app.activeSchoolId = nextSchoolId;
        invalidateSchoolCollectionCache(previousSchoolId);
        invalidateSchoolCollectionCache(nextSchoolId);

        try {
            const profile = await app.resolveUserProfileForSchool(app.currentUser, nextSchoolId);
            if (!profile) {
                app.activeSchoolId = previousSchoolId;
                app.syncSchoolSelectorUI();
                app.showToast('Sem perfil nesta escola. Selecione outra.', 'warning');
                return;
            }

            store.currentUserData = { id: app.currentUser.uid, schoolId: nextSchoolId, ...profile };
            app.persistSchoolForUser(app.currentUser.uid, nextSchoolId);
            if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
            app.renderMainLayout();
            app.showToast(`Escola ativa: ${nextSchoolId}`, 'success');
        } catch (err) {
            console.error('Erro ao trocar escola:', err);
            app.activeSchoolId = previousSchoolId;
            app.syncSchoolSelectorUI();
            app.showToast('Falha ao trocar de escola.', 'error');
        }
    };

    app.handleSchoolSelectorChange = function(nextSchoolId) {
        if (!app.canUseSchoolSelector()) return;
        app.switchSchool(nextSchoolId);
    };

    app.findBestSchoolForUser = async function(userId, preferredSchoolId) {
        const availableIds = (app.availableSchools || []).map((s) => s.id).filter(Boolean);
        const uniqueIds = [...new Set([preferredSchoolId, ...availableIds].filter(Boolean))];

        if (uniqueIds.length === 0) {
            return null;
        }

        const orderedSchoolIds = uniqueIds;

        for (const schoolId of orderedSchoolIds) {
            const schoolUserDoc = await db.collection('schools').doc(schoolId).collection('users').doc(userId).get();
            if (schoolUserDoc.exists) {
                return { schoolId, profile: { id: userId, schoolId, ...schoolUserDoc.data() } };
            }
        }

        return null;
    };

    app.monitorAuth = async function() {
        auth.onAuthStateChanged(async (user) => {
            if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
            if (user) {
                try {
                    await app.loadAvailableSchools(user);
                    const schoolId = app.getPreferredSchoolId(user.uid);
                    app.activeSchoolId = schoolId;
                    let data = await app.resolveUserProfileForSchool(user, schoolId);
                    let activeSchoolId = schoolId;

                    if (!data) {
                        const best = await app.findBestSchoolForUser(user.uid, schoolId);
                        if (best) {
                            activeSchoolId = best.schoolId;
                            app.activeSchoolId = best.schoolId;
                            data = best.profile;
                        }
                    }

                    if (data) {
                        store.authErrorMessage = null;
                        if (data.blockedUntil) {
                            let until = data.blockedUntil;
                            if (typeof until.toDate === 'function') until = until.toDate();
                            else until = new Date(until);
                            if (new Date() < new Date(until)) {
                                alert('Acesso bloqueado ate ' + new Date(until).toLocaleString());
                                await auth.signOut();
                                return;
                            }
                        }
                        store.currentUser = user;
                        store.currentUserData = { id: user.uid, schoolId: activeSchoolId, ...data };
                        app.persistSchoolForUser(user.uid, activeSchoolId);
                        if (app.logAcesso) app.logAcesso('login', 'auth');

                        store.currentView = 'dashboard';
                        app.renderMainLayout();

                        if (data.tipo === 'aluno' && isNotificationSupported()) {
                            setTimeout(async () => {
                                try {
                                    const registered = await registerForNotifications(user.uid);
                                    if (registered) {
                                        if (app.showToast) {
                                            app.showToast('Notificacoes ativadas! Voce recebera avisos no celular.', 'success');
                                        }
                                        onMessageListener((payload) => {
                                            if (app.showToast) {
                                                app.showToast(payload.notification?.title || 'Nova notificacao', 'info');
                                            }
                                        });

                                        if ('serviceWorker' in navigator) {
                                            navigator.serviceWorker.addEventListener('message', (event) => {
                                                if (event.data && event.data.type === 'NOTIFICATION_CLICK') {
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

                                        setupTokenRefresh(user.uid);
                                    } else if (app.showToast) {
                                        app.showToast('Permita notificacoes para receber avisos no celular.', 'warning');
                                    }
                                } catch (error) {
                                    console.error('Erro ao registrar notificacoes:', error);
                                }
                            }, 3000);
                        }
                    } else {
                        store.authErrorMessage = `Autenticacao realizada, mas sem perfil valido em nenhuma escola acessivel. Escola ativa: ${schoolId}.`;
                        await auth.signOut();
                    }
                } catch (e) {
                    console.error('Erro ao validar perfil da escola ativa:', e);
                    store.authErrorMessage = 'Falha ao validar seu acesso na escola ativa. Tente novamente.';
                    app.renderLogin();
                }
            } else {
                app.renderLogin();
            }
        });
    };
}
