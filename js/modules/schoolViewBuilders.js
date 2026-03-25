const ADMIN_WHATSAPP_MASK_ONINPUT = "var d=this.value.replace(/\\D/g,'').slice(0,11);this.value=d.length<=2?d:d.length<=6?'('+d.slice(0,2)+') '+d.slice(2):d.length<=10?'('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6):'('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);";

export function buildFeatureCheckboxes(app, sections) {
    return sections.map((section) => `
                    <label class="flex items-center gap-2 text-sm dark:text-slate-200"><input id="feature-${app.escapeHtml(section.id)}" data-feature-toggle="1" data-section-id="${app.escapeHtml(section.id)}" type="checkbox" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500"> ${app.escapeHtml(section.label)}</label>
    `).join('');
}

export function buildSchoolOptions(app, schools) {
    return schools.map((s) => `<option value="${app.escapeHtml(s.id)}">${app.escapeHtml(s.nome || s.id)} (${app.escapeHtml(s.id)})</option>`).join('');
}

export function buildSchoolFeatureOptions(app, schools) {
    return schools.map((s) => {
        const flags = app.normalizeSchoolFeatureFlags(s.features, s.id);
        const featuresEncoded = app.escapeHtml(encodeURIComponent(JSON.stringify(flags)));
        return `<option value="${app.escapeHtml(s.id)}" data-features="${featuresEncoded}">${app.escapeHtml(s.nome || s.id)} (${app.escapeHtml(s.id)})</option>`;
    }).join('');
}

export function buildSchoolRows(app, schools) {
    return schools.map((s) => `
        <tr class="border-b border-slate-200 dark:border-slate-700">
            <td class="px-3 py-2 font-semibold">${app.escapeHtml(s.nome || s.id)}</td>
            <td class="px-3 py-2 text-xs text-slate-500">${app.escapeHtml(s.id)}</td>
            <td class="px-3 py-2">${s.totalUsers || 0}</td>
            <td class="px-3 py-2">${s.alunos || 0}</td>
            <td class="px-3 py-2">${s.professores || 0}</td>
            <td class="px-3 py-2">${s.admins || 0}</td>
            <td class="px-3 py-2">${s.secretarias || 0}</td>
            <td class="px-3 py-2">${s.outrosUsuarios || 0}</td>
            <td class="px-3 py-2">${s.totalDocumentos || 0}</td>
            <td class="px-3 py-2">${app.formatBytes(s.tamanhoEstimadoBytes || 0)}</td>
            <td class="px-3 py-2">
                <div class="flex gap-2">
                    <button onclick="app.loadSchoolAudit('${app.escapeHtml(s.id)}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Auditoria</button>
                    <button onclick="app.exportSchoolBackup('${app.escapeHtml(s.id)}')" class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-200">Backup JSON</button>
                    <button onclick="app.removeSchoolFromUI('${app.escapeHtml(s.id)}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Remover Escola</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function buildEscolasIntroSection() {
    return `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <h2 class="text-xl font-bold mb-3 dark:text-white">Escolas</h2>
                <p class="text-sm text-slate-500 dark:text-slate-400">Gestão global de escolas e administradores.</p>
            </div>
    `;
}

function buildEscolasAdminFormsSection() {
    return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <h3 class="font-semibold dark:text-white">Criar Escola</h3>
                    <input id="escola-new-id" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="ID da escola (ex: SENATB073)">
                    <input id="escola-new-nome" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Nome da escola">
                    <input id="escola-new-admin-email" type="email" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="E-mail do administrador (obrigatorio)">
                    <div class="flex items-center rounded-lg border dark:border-slate-600 overflow-hidden">
                        <span class="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-sm text-slate-600 dark:text-slate-300 border-r dark:border-slate-600">+55</span>
                        <input id="escola-new-admin-whatsapp" class="w-full px-3 py-2 dark:bg-slate-700 dark:text-white" placeholder="(31) 99999-9999" maxlength="15" oninput="${ADMIN_WHATSAPP_MASK_ONINPUT}">
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="app.createSchoolFromUI()" class="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg">Criar Escola</button>
                        <button onclick="app.previewSchoolAdminInviteFromUI()" class="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg">Gerar Link de Convite</button>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400">O e-mail do administrador e obrigatorio e o convite e enviado automaticamente ao criar a escola.</p>
                    <div id="escola-new-admin-invite" class="hidden rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-2"></div>
                </div>
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <h3 class="font-semibold dark:text-white">Definir Administrador</h3>
                    <input id="escola-admin-school-id" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="ID da escola">
                    <input id="escola-admin-uid" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="UID do usuário">
                    <input id="escola-admin-nome" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Nome (opcional)">
                    <input id="escola-admin-email" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Email (opcional)">
                    <button onclick="app.setSchoolAdminFromUI()" class="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg">Definir Admin</button>
                </div>
            </div>
    `;
}

function buildEscolasFeatureFlagsSection(view) {
    return `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h3 class="font-semibold dark:text-white">Seções da Barra por Escola</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">Controle a visibilidade de todas as seções existentes na barra esquerda por escola.</p>
                <select id="escola-feature-id" onchange="app.prefillSchoolFeatureToggles(this.value)" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Selecione uma escola</option>
                    ${view.schoolFeatureOptions}
                </select>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    ${view.featureCheckboxes}
                </div>
                <button onclick="app.saveSchoolFeatureFlagsFromUI()" data-loading-label="Salvando secoes..." class="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg">Salvar Seções</button>
            </div>
    `;
}

function buildEscolasRebuildSection(view) {
    return `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-wrap gap-3 items-center">
                <select id="escola-rebuild-id" class="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white min-w-[260px]">
                    <option value="">Selecionar escola para recalcular métricas</option>
                    ${view.schoolOptions}
                </select>
                <button onclick="app.rebuildSchoolStatsFromSelected()" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">Recalcular Métricas</button>
                <span class="text-xs text-slate-500 dark:text-slate-400">Use quando fizer alterações em massa e quiser atualizar o painel imediatamente.</span>
            </div>
    `;
}

function buildEscolasTableSection(view) {
    return `
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 overflow-x-auto">
                <table class="min-w-full text-sm dark:text-slate-200">
                    <thead>
                        <tr class="text-left border-b border-slate-200 dark:border-slate-700">
                            <th class="px-3 py-2">Nome</th>
                            <th class="px-3 py-2">ID</th>
                            <th class="px-3 py-2">Usuários</th>
                            <th class="px-3 py-2">Alunos</th>
                            <th class="px-3 py-2">Professores</th>
                            <th class="px-3 py-2">Admins</th>
                            <th class="px-3 py-2">Secretarias</th>
                            <th class="px-3 py-2">Outros</th>
                            <th class="px-3 py-2">Docs</th>
                            <th class="px-3 py-2">Tamanho</th>
                            <th class="px-3 py-2">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${view.rows || '<tr><td class="px-3 py-3" colspan="11">Nenhuma escola encontrada.</td></tr>'}
                    </tbody>
                </table>
            </div>
    `;
}

function buildEscolasAuditBackupSection(view) {
    return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <h3 class="font-semibold dark:text-white">Auditoria da Escola</h3>
                    <select id="escola-audit-id" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Selecione uma escola</option>
                        ${view.schoolOptions}
                    </select>
                    <button onclick="app.loadSchoolAuditFromSelected()" class="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg">Carregar Auditoria</button>
                    <div id="escola-audit-list" class="text-xs max-h-64 overflow-auto border rounded-lg p-2 dark:border-slate-600 dark:text-slate-200">Nenhum log carregado.</div>
                </div>
                <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                    <h3 class="font-semibold dark:text-white">Exportar Backup</h3>
                    <select id="escola-backup-id" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Selecione uma escola</option>
                        ${view.schoolOptions}
                    </select>
                    <button onclick="app.exportSchoolBackupFromSelected()" class="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg">Exportar JSON</button>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Inclui usuários, turmas, componentes, provas, notas, presenças, avisos, notificações e auditoria.</p>
                </div>
            </div>
    `;
}

export function buildEscolasPageHtml(app, view) {
    return `
        <div class="space-y-6">
            ${buildEscolasIntroSection()}
            ${buildEscolasAdminFormsSection()}
            ${buildEscolasFeatureFlagsSection(view)}
            ${buildEscolasRebuildSection(view)}
            ${buildEscolasTableSection(view)}
            ${buildEscolasAuditBackupSection(view)}
        </div>
    `;
}