export function extendSchoolAdminActions(app) {
    app.createSchoolFromUI = async function() {
        const schoolId = (document.getElementById('escola-new-id')?.value || '').trim();
        const nome = (document.getElementById('escola-new-nome')?.value || '').trim();
        const adminEmail = (document.getElementById('escola-new-admin-email')?.value || '').trim();
        const adminWhatsapp = (document.getElementById('escola-new-admin-whatsapp')?.value || '').replace(/\D/g, '').slice(0, 11);
        if (!schoolId) {
            app.showToast('Informe o ID da escola.', 'warning');
            return;
        }
        if (!adminEmail) {
            app.showToast('Informe o e-mail do administrador.', 'warning');
            return;
        }

        try {
            const result = await firebase.functions().httpsCallable('createSchool')({ schoolId, nome, adminEmail, adminWhatsapp });
            const invitationSent = !!(result && result.data && result.data.invitationEmailSent);
            app.showToast(invitationSent ? 'Escola criada e convite enviado por e-mail.' : 'Escola criada. Verifique o envio do convite.', invitationSent ? 'success' : 'warning');
            app.renderEscolas(document.getElementById('content-area'));

            const schoolName = nome || schoolId;
            setTimeout(() => {
                app.renderSchoolAdminInvite(schoolId, schoolName, adminEmail, adminWhatsapp);
            }, 80);
        } catch (error) {
            console.error('Erro ao criar escola:', error);
            app.showToast(error?.message || 'Falha ao criar escola.', 'error');
        }
    };

    app.removeSchoolFromUI = async function(schoolId) {
        const normalizedSchoolId = (schoolId || '').trim();
        if (!normalizedSchoolId) {
            app.showToast('Informe a escola para remover.', 'warning');
            return;
        }

        const typed = window.prompt(`Para confirmar, digite o ID da escola: ${normalizedSchoolId}`) || '';
        if (typed.trim() !== normalizedSchoolId) {
            app.showToast('Confirmacao invalida. Exclusao cancelada.', 'warning');
            return;
        }

        try {
            app.showToast('Removendo escola...', 'info');
            await firebase.functions().httpsCallable('deleteSchool')({ schoolId: normalizedSchoolId, confirmation: typed.trim() });

            if (app.currentUser) {
                await app.loadAvailableSchools(app.currentUser);
                const stillExists = (app.availableSchools || []).some((s) => s.id === app.activeSchoolId);
                if (!stillExists && app.availableSchools.length > 0) {
                    const nextSchoolId = app.availableSchools[0].id;
                    app.activeSchoolId = nextSchoolId;
                    app.persistSchoolForUser(app.currentUser.uid, nextSchoolId);
                }
                app.syncSchoolSelectorUI();
            }

            app.showToast('Escola removida com sucesso.', 'success');
            app.renderEscolas(document.getElementById('content-area'));
        } catch (error) {
            console.error('Erro ao remover escola:', error);
            app.showToast(error?.message || 'Falha ao remover escola.', 'error');
        }
    };

    app.setSchoolAdminFromUI = async function() {
        const schoolId = (document.getElementById('escola-admin-school-id')?.value || '').trim();
        const uid = (document.getElementById('escola-admin-uid')?.value || '').trim();
        const nome = (document.getElementById('escola-admin-nome')?.value || '').trim();
        const email = (document.getElementById('escola-admin-email')?.value || '').trim();

        if (!schoolId || !uid) {
            app.showToast('Informe escola e UID.', 'warning');
            return;
        }

        try {
            await firebase.functions().httpsCallable('setSchoolAdmin')({ schoolId, uid, nome, email });
            app.showToast('Administrador definido com sucesso.', 'success');
            app.renderEscolas(document.getElementById('content-area'));
        } catch (error) {
            console.error('Erro ao definir admin:', error);
            app.showToast(error?.message || 'Falha ao definir administrador.', 'error');
        }
    };
}