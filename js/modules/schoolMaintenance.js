export function extendSchoolMaintenance(app) {
    app.loadSchoolAudit = async function(schoolId) {
        if (!schoolId) {
            app.showToast('Informe a escola.', 'warning');
            return;
        }

        try {
            const result = await firebase.functions().httpsCallable('getSchoolAuditLogs')({ schoolId, limit: 30 });
            const logs = (result && result.data && Array.isArray(result.data.logs)) ? result.data.logs : [];
            const listEl = document.getElementById('escola-audit-list');
            if (!listEl) return;
            if (logs.length === 0) {
                listEl.innerHTML = 'Sem logs de auditoria para esta escola.';
                return;
            }

            listEl.innerHTML = logs.map((log) => {
                const when = log.createdAt && typeof log.createdAt.seconds === 'number'
                    ? new Date(log.createdAt.seconds * 1000).toLocaleString('pt-BR')
                    : '-';
                return `<div class="border-b border-slate-200 dark:border-slate-700 py-1"><div><b>${app.escapeHtml(log.action || 'acao')}</b> • ${app.escapeHtml(when)}</div><div class="text-[11px] text-slate-500">UID: ${app.escapeHtml(log.actorUid || '-')}</div></div>`;
            }).join('');
        } catch (error) {
            console.error('Erro ao carregar auditoria:', error);
            app.showToast(error?.message || 'Falha ao carregar auditoria.', 'error');
        }
    };

    app.loadSchoolAuditFromSelected = async function() {
        const schoolId = (document.getElementById('escola-audit-id')?.value || '').trim();
        await app.loadSchoolAudit(schoolId);
    };

    app.downloadJsonFile = function(fileName, dataObj) {
        const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    app.exportSchoolBackup = async function(schoolId) {
        if (!schoolId) {
            app.showToast('Informe a escola.', 'warning');
            return;
        }

        try {
            app.showToast('Gerando backup da escola...', 'info');
            const result = await firebase.functions().httpsCallable('exportSchoolBackup')({ schoolId, maxDocsPerCollection: 3000 });
            const payload = result && result.data ? result.data : {};
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            app.downloadJsonFile(`backup_${schoolId}_${stamp}.json`, payload);
            app.showToast('Backup exportado com sucesso.', 'success');
        } catch (error) {
            console.error('Erro ao exportar backup:', error);
            app.showToast(error?.message || 'Falha ao exportar backup.', 'error');
        }
    };

    app.exportSchoolBackupFromSelected = async function() {
        const schoolId = (document.getElementById('escola-backup-id')?.value || '').trim();
        await app.exportSchoolBackup(schoolId);
    };

    app.rebuildSchoolStatsFromSelected = async function() {
        const schoolId = (document.getElementById('escola-rebuild-id')?.value || '').trim();
        if (!schoolId) {
            app.showToast('Selecione uma escola para recalcular.', 'warning');
            return;
        }

        try {
            app.showToast('Recalculando métricas...', 'info');
            await firebase.functions().httpsCallable('rebuildSchoolStats')({ schoolId });
            app.showToast('Métricas recalculadas com sucesso.', 'success');
            app.renderEscolas(document.getElementById('content-area'));
        } catch (error) {
            console.error('Erro ao recalcular métricas:', error);
            app.showToast(error?.message || 'Falha ao recalcular métricas.', 'error');
        }
    };
}