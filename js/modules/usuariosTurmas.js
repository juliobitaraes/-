export function extendUsuariosTurmas(app) {
    app.renderTurmas = async function(container) {
        const turmas = await app.getCollection('turmas');
        const alunosList = (await app.getCollection('users')).filter(u => u.tipo === 'aluno');
        const validStudents = alunosList.map(u => u.id);
        const alunosMap = new Map(alunosList.map((aluno) => [aluno.id, aluno]));
        const canManage = app.currentUserData && app.perms && app.perms.canManageTurmas();
        const canConcluir = app.currentUserData && app.perms && app.perms.canConcluirTurma && app.perms.canConcluirTurma();
        const turmasAtivas = turmas.filter(t => !t.concluida);
        const turmasConcluidas = turmas.filter(t => t.concluida);
        const escapeAttr = (value) => String(value || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, "\\n");

        if (!app.toggleConcluidaDiario) {
            app.toggleConcluidaDiario = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Mostrar diário' : 'Ocultar diário';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }

        if (!app.toggleConcluidaAlunos) {
            app.toggleConcluidaAlunos = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Mostrar alunos' : 'Ocultar alunos';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }

        const renderActions = (turma, isConcluida) => {
            const canShowConcluir = !isConcluida && canConcluir;
            const canShowReabrir = isConcluida && canManage;
            if (!canManage && !canShowConcluir && !canShowReabrir) return '';
            const label = app.formatTurmaLabelText(turma, 'Turma', true);
            const safeLabelAttr = escapeAttr(label);
            return `
                <div class="flex shrink-0 gap-2">
                    ${!isConcluida ? `<button onclick="app.modalQrCodeCadastroTurma('${turma.id}', '${safeLabelAttr}')" class="turma-card-action" title="QR Code de cadastro de aluno" aria-label="QR Code de cadastro de aluno"><i class="fas fa-qrcode"></i></button>` : ''}
                    ${canManage ? `<button onclick="app.modalComponentes('${turma.id}')" class="turma-card-action" title="Componentes Curriculares" aria-label="Componentes Curriculares"><i class="fas fa-book"></i></button>` : ''}
                    ${canManage ? `<button onclick="app.modalTurma('${turma.id}')" class="turma-card-action" title="Editar turma" aria-label="Editar turma"><i class="fas fa-edit"></i></button>` : ''}
                    ${!isConcluida
                        ? (canShowConcluir ? `<button onclick="app.confirmConcluirTurma('${turma.id}', '${safeLabelAttr}')" class="turma-card-action" title="Concluir turma" aria-label="Concluir turma"><i class="fas fa-check-circle"></i></button>` : '')
                        : (canShowReabrir ? `<button onclick="app.confirmReabrirTurma('${turma.id}', '${safeLabelAttr}')" class="turma-card-action" title="Reabrir turma" aria-label="Reabrir turma"><i class="fas fa-undo"></i></button>` : '')}
                    ${canManage ? `<button onclick="app.deleteItem('turmas', '${turma.id}')" class="turma-card-action" title="Excluir turma" aria-label="Excluir turma"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
        };

        const renderTurmaCard = (turma, isConcluida, content = '') => {
            const count = (turma.alunos || []).filter(id => validStudents.includes(id)).length;
            const badge = isConcluida
                ? '<span class="turma-card-status">Concluída</span>'
                : '<span class="turma-card-status">Ativa</span>';
            const actions = renderActions(turma, isConcluida);
            return `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm relative group border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="turma-card-header">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="turma-card-icon"><i class="fas fa-chalkboard"></i></div>
                            <div class="min-w-0">
                                <h4 class="text-lg font-bold text-white">${app.formatTurmaLabelHtml(turma)}</h4>
                                <p class="text-sm text-blue-100">${count} aluno(s) matriculado(s)</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${badge}
                            ${actions}
                        </div>
                    </div>
                    ${content ? `<div class="turma-card-body">${content}</div>` : ''}
                </div>
            `;
        };

        const activeGrid = turmasAtivas.length === 0
            ? '<div class="text-center text-gray-500 dark:text-gray-400">Nenhuma turma ativa encontrada.</div>'
            : `<div class="grid grid-cols-1 gap-4">${turmasAtivas.map(t => renderTurmaCard(t, false)).join('')}</div>`;

        const concludedList = turmasConcluidas.length === 0
            ? '<div class="text-center text-gray-500 dark:text-gray-400">Nenhuma turma concluída encontrada.</div>'
            : `<div class="space-y-6">${turmasConcluidas.map(t => {
                const labelText = app.formatTurmaLabelText(t, 'Turma', true);
                const toggleId = `turma-concluida-toggle-${t.id}`;
                const contentId = `turma-concluida-diario-${t.id}`;
                const alunosToggleId = `turma-concluida-alunos-toggle-${t.id}`;
                const alunosContentId = `turma-concluida-alunos-${t.id}`;
                const alunosTurmaConcluida = (t.alunos || [])
                    .filter((alunoId) => validStudents.includes(alunoId))
                    .map((alunoId) => alunosMap.get(alunoId))
                    .filter(Boolean)
                    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
                const details = `
                            <div class="flex items-center justify-between gap-3">
                                <div class="flex items-center gap-3">
                                    <h4 class="text-lg font-bold text-gray-800 dark:text-white">Alunos da turma concluída</h4>
                                    <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-200">${alunosTurmaConcluida.length}</span>
                                </div>
                                <button id="${alunosToggleId}" onclick="app.toggleConcluidaAlunos('${alunosContentId}', '${alunosToggleId}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-expanded="false" aria-controls="${alunosContentId}">
                                    <i class="fas fa-chevron-down mr-1"></i><span data-label>Mostrar alunos</span>
                                </button>
                            </div>
                            <div id="${alunosContentId}" class="hidden mt-3">
                            ${alunosTurmaConcluida.length === 0
                                ? '<p class="text-sm text-gray-500 dark:text-gray-400">Nenhum aluno matriculado.</p>'
                                : `<div class="space-y-2">${alunosTurmaConcluida.map((aluno) => `
                                    <div class="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700">
                                        <div>
                                            <p class="text-sm font-medium text-gray-800 dark:text-white">${app.escapeHtml(aluno.nome || 'Aluno')}</p>
                                            <p class="text-xs text-gray-500 dark:text-gray-400">${app.escapeHtml(aluno.email || '')}</p>
                                        </div>
                                        <button onclick="app.modalAluno('${aluno.id}')" class="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50">Editar</button>
                                    </div>
                                `).join('')}</div>`}
                            </div>
                        <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
                            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <h4 class="text-lg font-bold text-gray-800 dark:text-white">Diário da turma</h4>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">${app.escapeHtml(labelText)}</p>
                                </div>
                                <button id="${toggleId}" onclick="app.toggleConcluidaDiario('${contentId}', '${toggleId}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-expanded="false" aria-controls="${contentId}">
                                    <i class="fas fa-chevron-down mr-1"></i><span data-label>Mostrar diário</span>
                                </button>
                            </div>
                            <div id="${contentId}" class="hidden space-y-6 mt-4">
                                <div id="turma-concluida-notas-${t.id}" class="bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                                    <div class="loading"></div>
                                </div>
                                <div id="turma-concluida-ead-${t.id}" class="bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                                    <div class="loading"></div>
                                </div>
                            </div>
                        </div>
                `;
                return renderTurmaCard(t, true, details);
            }).join('')}</div>`;

        container.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white">Turmas</h2>
                ${canManage ? `<button onclick="app.modalTurma()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800">Nova Turma</button>` : ''}
            </div>
            <div class="space-y-10">
                <div>
                    <div class="flex items-center gap-2 mb-4">
                        <h3 class="text-xl font-bold text-gray-800 dark:text-white">Turmas Ativas</h3>
                    </div>
                    ${activeGrid}
                </div>
                <div>
                    <div class="flex items-center gap-2 mb-4">
                        <h3 class="text-xl font-bold text-gray-800 dark:text-white">Turmas Concluídas</h3>
                    </div>
                    ${concludedList}
                </div>
            </div>
        `;

        for (const turma of turmasConcluidas) {
            const label = app.formatTurmaLabelText(turma, 'Turma', true);
            await app.renderTurmaResultados(turma.id, label, { mode: 'notasTrabalhos', targetPrefix: 'turma-concluida-notas' });
            await app.renderTurmaResultados(turma.id, label, { mode: 'atividadesEad', targetPrefix: 'turma-concluida-ead' });
        }
    };

    app.modalQrCodeCadastroTurma = function(turmaId, turmaLabel) {
        const schoolId = app.activeSchoolId;
        if (!schoolId || !turmaId) return;
        const baseUrl = window.location.origin + (window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname.replace(/\/[^/]*$/, '/'));
        const url = `${baseUrl}cadastro-aluno.html?escola=${encodeURIComponent(schoolId)}&turma=${encodeURIComponent(turmaId)}`;
        const safeUrl = app.escapeHtml(url);
        const safeUrlAttr = url.replace(/'/g, "\\'");
        const safeLabel = app.escapeHtml(turmaLabel || 'Turma');
        const qrId = `qr-cadastro-turma-${Date.now()}`;
        const downloadId = `btn-download-qr-cadastro-${Date.now()}`;
        const content = `
            <div class="space-y-4 text-center">
                <p class="text-sm text-gray-600 dark:text-gray-300">Compartilhe o QR Code abaixo para que os alunos se cadastrem no sistema e sejam matriculados automaticamente nesta turma.</p>
                <div id="${qrId}" class="flex justify-center my-4"></div>
                <div class="flex items-center gap-2 bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                    <input type="text" readonly value="${safeUrl}" class="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none truncate">
                    <button onclick="navigator.clipboard.writeText('${safeUrlAttr}').then(()=>app.showToast('Link copiado!','success'))" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"><i class="fas fa-copy mr-1"></i>Copiar</button>
                </div>
                <button id="${downloadId}" class="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 text-sm"><i class="fas fa-download mr-2"></i>Baixar QR Code</button>
            </div>
        `;
        app.showModal(`QR Code de Cadastro — ${safeLabel}`, content, () => {});
        setTimeout(() => {
            const container = document.getElementById(qrId);
            const downloadButton = document.getElementById(downloadId);
            if (!container || !downloadButton) return;
            if (typeof QRCode !== 'undefined') {
                new QRCode(container, { text: url, width: 220, height: 220, colorDark: '#1e293b', colorLight: '#ffffff' });
                downloadButton.onclick = () => {
                    const canvas = container.querySelector('canvas');
                    if (!canvas) return;
                    const link = document.createElement('a');
                    link.download = `qrcode-cadastro-${String(turmaId).replace(/\s+/g, '-').toLowerCase()}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                };
                return;
            }
            const qrServer = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
            container.innerHTML = `<img src="${qrServer}" alt="QR Code" class="rounded-lg shadow mx-auto">`;
            downloadButton.onclick = () => window.open(qrServer, '_blank', 'noopener');
        }, 100);
    };
}
