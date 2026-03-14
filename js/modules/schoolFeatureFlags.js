const FORCED_HIDDEN_FEATURES_BY_SCHOOL = {};

export function extendSchoolFeatureFlags(app) {
    app.prefillSchoolFeatureToggles = function(schoolId) {
        const select = document.getElementById('escola-feature-id');
        const toggles = Array.from(document.querySelectorAll('[data-feature-toggle="1"]'));
        if (!select || toggles.length === 0) return;

        const option = schoolId ? select.querySelector(`option[value="${schoolId}"]`) : null;
        let rawFlags = null;
        try {
            rawFlags = option?.dataset?.features ? JSON.parse(decodeURIComponent(option.dataset.features)) : null;
        } catch (error) {
            rawFlags = null;
        }

        const normalized = app.normalizeSchoolFeatureFlags(rawFlags, schoolId || '');
        const forcedHidden = FORCED_HIDDEN_FEATURES_BY_SCHOOL[schoolId] || [];

        toggles.forEach((toggle) => {
            const sectionId = toggle.dataset.sectionId;
            if (!sectionId) return;
            toggle.checked = !!normalized[sectionId];
            toggle.disabled = forcedHidden.includes(sectionId);
        });
    };

    app.saveSchoolFeatureFlagsFromUI = async function() {
        const schoolId = (document.getElementById('escola-feature-id')?.value || '').trim();
        if (!schoolId) {
            app.showToast('Selecione uma escola para salvar as seções.', 'warning');
            return;
        }

        const toggles = Array.from(document.querySelectorAll('[data-feature-toggle="1"]'));
        const selectedFlags = toggles.reduce((acc, toggle) => {
            const sectionId = toggle.dataset.sectionId;
            if (!sectionId) return acc;
            acc[sectionId] = !!toggle.checked;
            return acc;
        }, {});
        const normalizedFlags = app.normalizeSchoolFeatureFlags(selectedFlags, schoolId);

        try {
            await firebase.firestore().collection('schools').doc(schoolId).set({
                features: normalizedFlags,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: app.currentUser ? app.currentUser.uid : null
            }, { merge: true });

            if (app.currentUser) {
                await app.loadAvailableSchools(app.currentUser);
                app.syncSchoolSelectorUI();
            }

            if (app.activeSchoolId === schoolId) {
                app.renderSidebar();
                app.renderMobileBottomNav();
                if (!app.isSectionEnabledForCurrentSchool(app.currentView)) {
                    app.navigate('dashboard');
                }
            }

            app.showToast('Seções da escola atualizadas.', 'success');
            app.renderEscolas(document.getElementById('content-area'));
        } catch (error) {
            console.error('Erro ao salvar seções por escola:', error);
            app.showToast(error?.message || 'Falha ao salvar seções da escola.', 'error');
        }
    };
}