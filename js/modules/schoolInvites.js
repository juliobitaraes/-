export function extendSchoolInvites(app) {
    app.buildSchoolAdminInviteData = function(schoolId, schoolName, adminEmail) {
        const normalizedSchoolId = (schoolId || '').trim();
        const normalizedEmail = (adminEmail || '').trim();
        const signupUrl = `${window.location.origin}/?invite=admin&schoolId=${encodeURIComponent(normalizedSchoolId)}${normalizedEmail ? `&email=${encodeURIComponent(normalizedEmail)}` : ''}`;
        const subject = `Convite de cadastro - ${schoolName || normalizedSchoolId}`;
        const body = [
            'Ola,',
            '',
            `Voce foi convidado para atuar como administrador da escola ${schoolName || normalizedSchoolId}.`,
            '',
            `Acesse: ${signupUrl}`,
            '',
            'Ao abrir a tela de login, a escola ja estara selecionada. Depois conclua seu cadastro com o suporte da plataforma.',
            '',
            'Mensagem automatica do SENATEDU.'
        ].join('\n');

        return {
            signupUrl,
            mailtoUrl: normalizedEmail ? `mailto:${encodeURIComponent(normalizedEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : ''
        };
    };

    app.renderSchoolAdminInvite = function(schoolId, schoolName, adminEmail, adminWhatsapp = '') {
        const container = document.getElementById('escola-new-admin-invite');
        if (!container) return;

        const normalizedSchoolId = (schoolId || '').trim();
        const normalizedEmail = (adminEmail || '').trim();
        if (!normalizedSchoolId) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        const normalizedWhatsapp = String(adminWhatsapp || '').replace(/\D/g, '').slice(0, 11);
        const inviteData = app.buildSchoolAdminInviteData(normalizedSchoolId, schoolName, normalizedEmail);
        const emailButton = inviteData.mailtoUrl
            ? `<a href="${app.escapeHtml(inviteData.mailtoUrl)}" class="px-3 py-2 text-xs rounded bg-blue-700 hover:bg-blue-800 text-white">Enviar por E-mail</a>`
            : '';

        container.classList.remove('hidden');
        container.innerHTML = `
            <p class="text-xs font-semibold text-blue-800 dark:text-blue-200">Link de cadastro do administrador criado.</p>
            <p class="text-[11px] text-blue-700 dark:text-blue-300">Escola: ${app.escapeHtml(schoolName || normalizedSchoolId)} (${app.escapeHtml(normalizedSchoolId)})${normalizedEmail ? ` • E-mail: ${app.escapeHtml(normalizedEmail)}` : ''}${normalizedWhatsapp ? ` • WhatsApp: +55 ${app.escapeHtml(normalizedWhatsapp)}` : ''}</p>
            <input id="escola-new-admin-signup-link" readonly class="w-full px-3 py-2 border rounded-lg text-xs dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100" value="${app.escapeHtml(inviteData.signupUrl)}">
            <div class="flex flex-wrap gap-2">
                ${emailButton}
                <button onclick="app.copySchoolAdminSignupLink()" class="px-3 py-2 text-xs rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100">Copiar Link</button>
            </div>
        `;
    };

    app.previewSchoolAdminInviteFromUI = function() {
        const schoolId = (document.getElementById('escola-new-id')?.value || '').trim();
        const schoolName = (document.getElementById('escola-new-nome')?.value || '').trim() || schoolId;
        const adminEmail = (document.getElementById('escola-new-admin-email')?.value || '').trim();
        const adminWhatsapp = (document.getElementById('escola-new-admin-whatsapp')?.value || '').replace(/\D/g, '').slice(0, 11);

        if (!schoolId) {
            app.showToast('Informe o ID da escola para gerar o link.', 'warning');
            return;
        }

        if (!adminEmail) {
            app.showToast('Informe o e-mail do administrador.', 'warning');
            return;
        }

        app.renderSchoolAdminInvite(schoolId, schoolName, adminEmail, adminWhatsapp);
        app.showToast('Link de convite pronto para copia.', 'success');
    };

    app.copySchoolAdminSignupLink = async function() {
        const input = document.getElementById('escola-new-admin-signup-link');
        if (!input || !input.value) return;

        try {
            await navigator.clipboard.writeText(input.value);
            app.showToast('Link de cadastro copiado.', 'success');
        } catch (error) {
            input.select();
            document.execCommand('copy');
            app.showToast('Link de cadastro copiado.', 'success');
        }
    };
}