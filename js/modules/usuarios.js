import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendUsuarios(app) {
    app.renderNotificacoes = async function(container) {
        if (!app.currentUserData || !(app.perms && (app.perms.hasRole('admin', 'professor')))) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito.</div>';
            return;
        }

        const allTurmas = await app.getCollection('turmas');
        const turmasAtivas = allTurmas.filter(t => !t.concluida);
        const componentes = await app.getComponentesCache();
        
        // Filtrar turmas se for professor
        let minhasTurmas = turmasAtivas;
        if (app.perms && app.perms.hasRole('professor')) {
            minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        }

        container.innerHTML = `
            <div class="mb-6">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
                    <i class="fas fa-bell text-blue-600"></i> Notificações Push
                </h2>
                <p class="text-gray-600 dark:text-gray-400">Envie notificações para os celulares dos alunos.</p>
            </div>

            <!-- Abas de Notificação -->
            <div class="mb-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div class="flex border-b dark:border-slate-700">
                    <button onclick="app.showNotificationTab('individual')" id="tab-individual" class="flex-1 px-6 py-3 font-semibold text-center transition bg-blue-600 text-white">
                        <i class="fas fa-user mr-2"></i>Individual
                    </button>
                    <button onclick="app.showNotificationTab('turma')" id="tab-turma" class="flex-1 px-6 py-3 font-semibold text-center transition text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700">
                        <i class="fas fa-users mr-2"></i>Por Turma
                    </button>
                    ${app.perms.hasRole('admin') ? `
                    <button onclick="app.showNotificationTab('tipo')" id="tab-tipo" class="flex-1 px-6 py-3 font-semibold text-center transition text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700">
                        <i class="fas fa-layer-group mr-2"></i>Por Tipo
                    </button>` : ''}
                </div>

                <!-- Conteúdo das Abas -->
                <div class="p-6">
                    <!-- Notificação Individual -->
                    <div id="notification-individual" class="notification-tab-content">
                        <h3 class="text-lg font-bold mb-4 dark:text-white">Enviar para Aluno Específico</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Selecione o Aluno</label>
                                <select id="notif-individual-aluno" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option value="">Selecione um aluno...</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Título</label>
                                <input type="text" id="notif-individual-title" placeholder="Ex: Nova Atividade EAD Disponível" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="50">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Mensagem</label>
                                <textarea id="notif-individual-body" rows="4" placeholder="Ex: Uma nova atividade EAD de Matemática está disponível para você." class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="200"></textarea>
                            </div>
                            <button onclick="app.sendIndividualNotification()" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                                <i class="fas fa-paper-plane mr-2"></i>Enviar Notificação
                            </button>
                        </div>
                    </div>

                    <!-- Notificação por Turma -->
                    <div id="notification-turma" class="notification-tab-content hidden">
                        <h3 class="text-lg font-bold mb-4 dark:text-white">Enviar para Turma</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Selecione a Turma</label>
                                <select id="notif-turma-select" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option value="">Selecione uma turma...</option>
                                    ${minhasTurmas.map(t => `<option value="${t.id}">${app.escapeHtml(app.formatTurmaLabel(t))}</option>`).join('')}
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Título</label>
                                <input type="text" id="notif-turma-title" placeholder="Ex: Atenção Turma!" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="50">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Mensagem</label>
                                <textarea id="notif-turma-body" rows="4" placeholder="Ex: Reunião de pais amanhã às 14h." class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="200"></textarea>
                            </div>
                            <button onclick="app.sendTurmaNotification()" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                                <i class="fas fa-paper-plane mr-2"></i>Enviar para Turma
                            </button>
                        </div>
                    </div>

                    <!-- Notificação por Tipo (Admin only) -->
                    ${app.perms.hasRole('admin') ? `
                    <div id="notification-tipo" class="notification-tab-content hidden">
                        <h3 class="text-lg font-bold mb-4 dark:text-white">Enviar para Todos de um Tipo</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Selecione o Tipo</label>
                                <select id="notif-tipo-select" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                    <option value="aluno">Todos os Alunos</option>
                                    <option value="professor">Todos os Professores</option>
                                    <option value="responsavel">Todos os Responsáveis</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Título</label>
                                <input type="text" id="notif-tipo-title" placeholder="Ex: Comunicado Importante" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="50">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Mensagem</label>
                                <textarea id="notif-tipo-body" rows="4" placeholder="Ex: O sistema estará em manutenção amanhã das 8h às 10h." class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="200"></textarea>
                            </div>
                            <button onclick="app.sendTipoNotification()" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                                <i class="fas fa-paper-plane mr-2"></i>Enviar para Todos
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- Histórico de Notificações -->
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <h3 class="text-lg font-bold mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-history text-blue-600"></i> Histórico Recente
                </h3>
                <div id="notification-history" class="space-y-2 max-h-96 overflow-y-auto">
                    <p class="text-gray-500 dark:text-gray-400 text-center py-4">Carregando histórico...</p>
                </div>
            </div>
        `;

        // Carregar alunos para select individual
        setTimeout(async () => {
            const alunos = (await app.getCollection('users')).filter(u => u.tipo === 'aluno').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            const selectAluno = document.getElementById('notif-individual-aluno');
            if (selectAluno) {
                selectAluno.innerHTML = '<option value="">Selecione um aluno...</option>' + 
                    alunos.map(a => `<option value="${a.id}">${app.escapeHtml(a.nome || a.email)}</option>`).join('');
            }

            // Carregar histórico
            app.loadNotificationHistory();
        }, 100);
    };

    app.showNotificationTab = function(tabName) {
        // Atualizar botões
        ['individual', 'turma', 'tipo'].forEach(name => {
            const btn = document.getElementById(`tab-${name}`);
            if (btn) {
                if (name === tabName) {
                    btn.className = 'flex-1 px-6 py-3 font-semibold text-center transition bg-blue-600 text-white';
                } else {
                    btn.className = 'flex-1 px-6 py-3 font-semibold text-center transition text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700';
                }
            }
        });

        // Mostrar conteúdo correto
        ['individual', 'turma', 'tipo'].forEach(name => {
            const content = document.getElementById(`notification-${name}`);
            if (content) {
                content.classList.toggle('hidden', name !== tabName);
            }
        });
    };

    app.sendIndividualNotification = async function() {
        const userId = document.getElementById('notif-individual-aluno').value;
        const title = document.getElementById('notif-individual-title').value.trim();
        const body = document.getElementById('notif-individual-body').value.trim();

        if (!userId || !title || !body) {
            app.showToast('Preencha todos os campos', 'error');
            return;
        }

        try {
            app.showToast('Enviando notificação...', 'info');
            const sendNotification = firebase.functions().httpsCallable('sendNotificationToUser');
            const schoolId = app.activeSchoolId || localStorage.getItem('activeSchoolId') || 'SENATB072';
            const result = await sendNotification({ schoolId, userId, title, body });

            if (result.data.success) {
                app.showToast('Notificação enviada com sucesso!', 'success');
                document.getElementById('notif-individual-title').value = '';
                document.getElementById('notif-individual-body').value = '';
                app.loadNotificationHistory();
                // Also send email
                try {
                    const users = await app.getCollection('users');
                    const targetUser = users.find(u => u.id === userId);
                    if (targetUser && targetUser.email) {
                        await sendNotificationEmailV2(targetUser.email, targetUser.nome || 'Usuário', title, body, {});
                    }
                } catch (emailErr) { console.warn('Erro ao enviar e-mail da notificação individual:', emailErr); }
            } else {
                app.showToast(`Erro: ${result.data.message}`, 'error');
            }
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            app.showToast('Erro ao enviar notificação', 'error');
        }
    };

    app.sendTurmaNotification = async function() {
        const turmaId = document.getElementById('notif-turma-select').value;
        const title = document.getElementById('notif-turma-title').value.trim();
        const body = document.getElementById('notif-turma-body').value.trim();

        if (!turmaId || !title || !body) {
            app.showToast('Preencha todos os campos', 'error');
            return;
        }

        try {
            app.showToast('Enviando notificação para turma...', 'info');
            const sendNotification = firebase.functions().httpsCallable('sendNotificationToTurma');
            const schoolId = app.activeSchoolId || localStorage.getItem('activeSchoolId') || 'SENATB072';
            const result = await sendNotification({ schoolId, turmaId, title, body });

            if (result.data) {
                app.showToast(`Enviado: ${result.data.success} | Falhou: ${result.data.failed} | Sem token: ${result.data.noToken}`, 'success');
                document.getElementById('notif-turma-title').value = '';
                document.getElementById('notif-turma-body').value = '';
                app.loadNotificationHistory();
                // Also send emails to turma students
                try {
                    const turmas = await app.getCollection('turmas');
                    const turmaObj = turmas.find(t => t.id === turmaId);
                    if (turmaObj && Array.isArray(turmaObj.alunos)) {
                        const users = await app.getCollection('users');
                        const alunosComEmail = users.filter(u => u.tipo === 'aluno' && turmaObj.alunos.includes(u.id) && u.email);
                        await Promise.allSettled(alunosComEmail.map(a => sendNotificationEmailV2(a.email, a.nome || 'Aluno', title, body, {})));
                    }
                } catch (emailErr) { console.warn('Erro ao enviar e-mails da notificação de turma:', emailErr); }
            }
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            app.showToast('Erro ao enviar notificação', 'error');
        }
    };

    app.sendTipoNotification = async function() {
        const userType = document.getElementById('notif-tipo-select').value;
        const title = document.getElementById('notif-tipo-title').value.trim();
        const body = document.getElementById('notif-tipo-body').value.trim();

        if (!userType || !title || !body) {
            app.showToast('Preencha todos os campos', 'error');
            return;
        }

        if (!confirm(`Confirma envio para TODOS os ${userType}s?`)) {
            return;
        }

        try {
            app.showToast('Enviando notificações...', 'info');
            const sendNotification = firebase.functions().httpsCallable('sendNotificationByUserType');
            const schoolId = app.activeSchoolId || localStorage.getItem('activeSchoolId') || 'SENATB072';
            const result = await sendNotification({ schoolId, userType, title, body });

            if (result.data) {
                app.showToast(`Enviado: ${result.data.success} | Falhou: ${result.data.failed} | Sem token: ${result.data.noToken}`, 'success');
                document.getElementById('notif-tipo-title').value = '';
                document.getElementById('notif-tipo-body').value = '';
                app.loadNotificationHistory();
                // Also send emails to users of this type
                try {
                    const users = await app.getCollection('users');
                    const targetUsers = users.filter(u => u.tipo === userType && u.email);
                    await Promise.allSettled(targetUsers.map(u => sendNotificationEmailV2(u.email, u.nome || 'Usuário', title, body, {})));
                } catch (emailErr) { console.warn('Erro ao enviar e-mails da notificação por tipo:', emailErr); }
            }
        } catch (error) {
            console.error('Erro ao enviar notificação:', error);
            app.showToast('Erro ao enviar notificação', 'error');
        }
    };

    app.loadNotificationHistory = async function() {
        try {
            const historyContainer = document.getElementById('notification-history');
            if (!historyContainer) return;

            const notifications = await db.collection('notifications')
                .orderBy('sentAt', 'desc')
                .limit(20)
                .get();

            if (notifications.empty) {
                historyContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma notificação enviada ainda.</p>';
                return;
            }

            const users = await app.getCollection('users');
            const usersMap = {};
            users.forEach(u => usersMap[u.id] = u);

            historyContainer.innerHTML = notifications.docs.map(doc => {
                const notif = doc.data();
                const targetUser = usersMap[notif.userId];
                const senderUser = usersMap[notif.sentBy];
                const date = notif.sentAt?.toDate ? notif.sentAt.toDate() : new Date(notif.sentAt);
                
                return `
                    <div class="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg border dark:border-slate-600">
                        <div class="flex justify-between items-start mb-1">
                            <span class="font-semibold dark:text-white">${app.escapeHtml(notif.title)}</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">${date.toLocaleString('pt-BR')}</span>
                        </div>
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-2">${app.escapeHtml(notif.body)}</p>
                        <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span><i class="fas fa-user mr-1"></i>${targetUser ? app.escapeHtml(targetUser.nome) : 'Usuário desconhecido'}</span>
                            <span><i class="fas fa-paper-plane mr-1"></i>${senderUser ? app.escapeHtml(senderUser.nome) : 'Sistema'}</span>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        }
    };

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
                <div class="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-2">
                    ${canManage ? `<button onclick="app.modalComponentes('${turma.id}')" class="text-purple-600" title="Componentes Curriculares"><i class="fas fa-book"></i></button>` : ''}
                    ${canManage ? `<button onclick="app.modalTurma('${turma.id}')" class="text-blue-600 dark:text-blue-400" title="Editar turma"><i class="fas fa-edit"></i></button>` : ''}
                    ${!isConcluida
                        ? (canShowConcluir ? `<button onclick="app.confirmConcluirTurma('${turma.id}', '${safeLabelAttr}')" class="text-emerald-600" title="Concluir turma"><i class="fas fa-check-circle"></i></button>` : '')
                        : (canShowReabrir ? `<button onclick="app.confirmReabrirTurma('${turma.id}', '${safeLabelAttr}')" class="text-blue-600" title="Reabrir turma"><i class="fas fa-undo"></i></button>` : '')}
                    ${canManage ? `<button onclick="app.deleteItem('turmas', '${turma.id}')" class="text-red-500 dark:text-red-400" title="Excluir turma"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
        };

        const renderTurmaCard = (turma, isConcluida) => {
            const count = (turma.alunos || []).filter(id => validStudents.includes(id)).length;
            const badge = isConcluida
                ? '<span class="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300">Concluída</span>'
                : '<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Ativa</span>';
            const actions = renderActions(turma, isConcluida);
            return `
                <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm relative group border dark:border-slate-700">
                    ${actions}
                    <div class="flex items-start justify-between gap-3">
                        <div class="font-bold dark:text-white">${app.formatTurmaLabelHtml(turma)}</div>
                        ${badge}
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${count} Alunos</p>
                </div>
            `;
        };

        const activeGrid = turmasAtivas.length === 0
            ? '<div class="text-center text-gray-500 dark:text-gray-400">Nenhuma turma ativa encontrada.</div>'
            : `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">${turmasAtivas.map(t => renderTurmaCard(t, false)).join('')}</div>`;

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
                return `
                    <div class="space-y-4">
                        ${renderTurmaCard(t, true)}
                        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border dark:border-slate-700">
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
                        </div>
                        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border dark:border-slate-700">
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
                    </div>
                `;
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

    app.renderProfessores = async function(container) {
        const profs = (await app.getCollection('users')).filter(u => u.tipo === 'professor');
        container.innerHTML = `<div class="flex justify-between mb-6"><h2 class="text-2xl font-bold text-gray-800 dark:text-white">Gerenciar Professores</h2><button onclick="app.modalProfessor()" class="bg-blue-700 text-white px-4 py-2 rounded">Novo</button></div><div class="bg-white dark:bg-slate-800 rounded shadow overflow-hidden"><table class="w-full text-left p-4"><thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600"><tr><th class="p-4">Nome</th><th class="p-4">Email</th><th class="p-4 text-right">Ações</th></tr></thead><tbody class="dark:text-gray-300">${profs.map(p => `<tr><td class="p-4">${p.nome}</td><td class="p-4">${p.email}</td><td class="p-4 text-right">${app.currentUserData && app.perms && app.perms.canManageUsuarios() ? `<button onclick="app.promoverProfessor('${p.id}')" class="text-green-600 hover:text-green-800 mr-3" title="Promover a Administrador"><i class="fas fa-user-shield"></i></button>` : ''}<button onclick="app.sendPasswordReset('${p.email}')" class="text-yellow-500 hover:text-yellow-700 mr-3" title="Redefinir Senha"><i class="fas fa-key"></i></button><button onclick="app.modalProfessor('${p.id}')" class="text-blue-600 dark:text-blue-400 mr-2"><i class="fas fa-edit"></i></button><button onclick="app.deleteUsuario('${p.id}')" class="text-red-500 dark:text-red-400"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
    };

    // Administradores
    app.renderAdministradores = async function(container) {
        const admins = (await app.getCollection('users')).filter(u => u.tipo === 'admin');
        container.innerHTML = `<div class="flex justify-between mb-6"><h2 class="text-2xl font-bold text-gray-800 dark:text-white">Gerenciar Administradores</h2><button onclick="app.modalAdmin()" class="bg-blue-700 text-white px-4 py-2 rounded">Novo</button></div><div class="bg-white dark:bg-slate-800 rounded shadow overflow-hidden"><table class="w-full text-left p-4"><thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600"><tr><th class="p-4">Nome</th><th class="p-4">Email</th><th class="p-4 text-right">Ações</th></tr></thead><tbody class="dark:text-gray-300">${admins.map(a => `<tr><td class="p-4">${a.nome}</td><td class="p-4">${a.email}</td><td class="p-4 text-right"><button onclick="app.sendPasswordReset('${a.email}')" class="text-yellow-500 hover:text-yellow-700 mr-3" title="Redefinir Senha"><i class="fas fa-key"></i></button><button onclick="app.modalAdmin('${a.id}')" class="text-blue-600 dark:text-blue-400 mr-2"><i class="fas fa-edit"></i></button><button onclick="app.demoverAdmin('${a.id}')" class="text-orange-500 mr-3" title="Rebaixar para Professor"><i class="fas fa-user-minus"></i></button><button onclick="app.deleteUsuario('${a.id}')" class="text-red-500 dark:text-red-400"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;
    };

    // Manual de Instalação e Configuração - Sistema & Implantação (visível apenas para administradores)
    app.renderManualSistema = async function(container) {
        // Redireciona para o manual consolidado
        await app.renderManual(container);
    };

    // Manual de Uso e Funcionalidades - redireciona para o manual consolidado
    app.renderManualUsos = async function(container) {
        // Redireciona para o manual consolidado
        await app.renderManual(container);
    };

    app.renderManualTelas = async function(container) {
        container.innerHTML = `
            <div class="flex items-center justify-center min-h-screen">
                <div class="text-center">
                    <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p class="text-lg font-semibold">Carregando Manual de Telas...</p>
                    <p class="text-sm text-gray-500">Aguarde um instante</p>
                </div>
            </div>
        `;

        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`MANUAL_TELAS_SISTEMA.md?v=${timestamp}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const markdown = await response.text();

            const ensureMarked = () => new Promise((resolve) => {
                if (window.marked && typeof window.marked.parse === 'function') {
                    resolve(true);
                    return;
                }
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });

            const markedLoaded = await ensureMarked();
            const rendered = markedLoaded && window.marked && typeof window.marked.parse === 'function'
                ? window.marked.parse(markdown)
                : `<pre class="whitespace-pre-wrap text-sm font-mono">${app.escapeHtml(markdown)}</pre>`;

            container.innerHTML = `
                <div class="max-w-6xl mx-auto p-4 md:p-8 space-y-4">
                    <div class="flex flex-wrap gap-2">
                        <button onclick="app.renderManual(document.getElementById('content-area'))" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Manual Principal
                        </button>
                        <a href="MANUAL_TELAS_SISTEMA.md" target="_blank" rel="noopener noreferrer" class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 inline-flex items-center gap-2">
                            Abrir arquivo .md
                        </a>
                        <button onclick="app.navigate('dashboard')" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                            Voltar ao Dashboard
                        </button>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 md:p-8">
                        <style>
                            .manual-telas-view h1, .manual-telas-view h2, .manual-telas-view h3, .manual-telas-view h4 { font-weight: 700; margin-top: 1.25rem; margin-bottom: 0.75rem; }
                            .manual-telas-view h1 { font-size: 1.875rem; }
                            .manual-telas-view h2 { font-size: 1.375rem; }
                            .manual-telas-view h3 { font-size: 1.125rem; }
                            .manual-telas-view p { margin: 0.6rem 0; }
                            .manual-telas-view ul, .manual-telas-view ol { margin: 0.6rem 0 0.6rem 1.2rem; }
                            .manual-telas-view code { background: rgba(148, 163, 184, 0.2); padding: 0.1rem 0.3rem; border-radius: 0.25rem; }
                            .manual-telas-view pre code { display: block; padding: 0.75rem; overflow-x: auto; }
                            .manual-telas-view img { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 0.5rem; margin-top: 0.5rem; }
                            .dark .manual-telas-view img { border-color: #475569; }
                            .manual-telas-view a { color: #2563eb; text-decoration: underline; }
                        </style>
                        <article class="manual-telas-view text-gray-800 dark:text-gray-100">${rendered}</article>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Erro ao carregar manual de telas:', error);
            container.innerHTML = `
                <div class="max-w-4xl mx-auto space-y-4 p-6">
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 class="text-red-700 font-bold mb-2">Erro ao carregar Manual de Telas</h3>
                        <p class="text-sm text-red-600">${app.escapeHtml(error.message || 'Erro desconhecido')}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="app.renderManual(document.getElementById('content-area'))" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Abrir Manual Principal</button>
                        <button onclick="app.navigate('dashboard')" class="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-800">Voltar ao Dashboard</button>
                    </div>
                </div>
            `;
        }
    };

    // Manual - carrega diretamente o manual consolidado (SENATEDU v2.0)
    app.renderManual = async function(container) {
        // Mostra loading
        container.innerHTML = `
            <div class="flex items-center justify-center min-h-screen">
                <div class="text-center">
                    <div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p class="text-lg font-semibold">Carregando Manual SENATEDU v2.0...</p>
                    <p class="text-sm text-gray-500">Manual consolidado com design profissional</p>
                </div>
            </div>
        `;
        
        console.log('🔄 Iniciando carregamento do Manual SENATEDU v2.0...');
        
        try {
            // Carrega o arquivo HTML externo com aparência profissional (com cache-busting)
            const timestamp = new Date().getTime();
            const url = `manual-sistema.html?v=${timestamp}`;
            console.log('📥 Fazendo fetch de:', url);
            
            const response = await fetch(url);
            console.log('📡 Response status:', response.status);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            
            const html = await response.text();
            console.log('📄 HTML carregado, tamanho:', html.length, 'bytes');
            
            // Cria um parser para extrair conteúdo do HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            console.log('📦 Processando documento...');
            
            // Extrai os estilos do head
            const styles = doc.querySelectorAll('style');
            let cssContent = '';
            styles.forEach(style => {
                cssContent += style.textContent + '\n';
            });
            
            // Extrai links de fontes
            const fontLinks = doc.querySelectorAll('link[href*="fonts.googleapis"]');
            let fontsHTML = '';
            fontLinks.forEach(link => {
                fontsHTML += `<link rel="${link.rel}" href="${link.href}">`;
            });
            
            // Extrai o conteúdo do body
            const bodyContent = doc.body.innerHTML;
            
            // Injeta tudo no container
            container.innerHTML = `
                ${fontsHTML}
                <style>${cssContent}</style>
                <div id="manual-wrapper" style="position: relative; min-height: 100vh;">
                    ${bodyContent}
                </div>
            `;
            
            // Adiciona botão de voltar flutuante
            const backButton = document.createElement('div');
            backButton.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;';
            backButton.innerHTML = `
                <div class="flex flex-col gap-2">
                    <button onclick="app.renderManualTelas(document.getElementById('content-area'))" 
                            class="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-2xl transition-all font-semibold">
                        Manual de Telas
                    </button>
                    <button onclick="app.navigate('dashboard')" 
                            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xl transition-all font-semibold">
                        Voltar ao Dashboard
                    </button>
                </div>
            `;
            document.body.appendChild(backButton);
            
            // Remove o botão quando sair da view
            const cleanup = () => {
                if (backButton && backButton.parentNode) {
                    backButton.remove();
                }
            };
            
            // Guarda referência para limpeza
            if (!window._manualCleanups) window._manualCleanups = [];
            window._manualCleanups.push(cleanup);
            
            // Re-executa os scripts do manual
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(scriptTag => {
                const newScript = document.createElement('script');
                if (scriptTag.src) {
                    newScript.src = scriptTag.src;
                } else {
                    newScript.textContent = scriptTag.textContent;
                }
                document.body.appendChild(newScript);
            });
            
            console.log('✅ Manual SENATEDU v2.0 carregado com SUCESSO!');
            console.log('🎨 Manual consolidado com todas as funcionalidades integradas');
            
        } catch (error) {
            console.error('❌?❌ ERRO ao carregar manual:', error);
            container.innerHTML = `
                <div class="max-w-4xl mx-auto space-y-6 p-8">
                    <div class="bg-red-50 border-2 border-red-200 rounded-lg p-6">
                        <h3 class="text-red-800 font-bold text-xl mb-3">❌?❌ Erro ao Carregar Manual</h3>
                        <p class="text-red-600 mb-2">Não foi possível carregar o arquivo manual-sistema.html.</p>
                        <p class="text-red-500 text-sm font-mono bg-red-100 p-2 rounded">Erro: ${error.message}</p>
                        <p class="text-sm text-gray-600 mt-4">Verifique:</p>
                        <ul class="list-disc ml-6 text-sm text-gray-600">
                            <li>Se o arquivo manual-sistema.html existe na raiz do projeto</li>
                            <li>Se o servidor está rodando corretamente</li>
                            <li>O console do navegador (F12) para mais detalhes</li>
                        </ul>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="app.navigate('dashboard')" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Voltar ao Dashboard</button>
                        <button onclick="location.reload()" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Recarregar Página</button>
                    </div>
                </div>
            `;
        }
    };

    app.modalAdmin = async function(id = null) {
        let adm = null;
        if (id) { const d = await db.collection('users').doc(id).get(); if (d.exists) adm = { id: d.id, ...d.data() }; }
        const content = `<div class="space-y-3">${!id ? `<div><label>Email</label><input id="a-email" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>` : ''}<div><label>Senha ${id ? '<span class="text-xs text-red-500">(Não editável)</span>' : ''}</label><input id="a-pass-manual" type="text" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${id ? 'disabled value="******"' : 'placeholder="Mínimo 6 caracteres"'} ></div><div><label>Nome</label><input id="a-nome" value="${adm?adm.nome:''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div></div>`;
        app.showModal(id?'Editar':'Novo', content, async() => {
            const nome = document.getElementById('a-nome').value.trim();
            if(!id) {
                const email = document.getElementById('a-email').value.trim();
                const pass = document.getElementById('a-pass-manual').value.trim();
                if(!email||!pass||!nome) return alert('Preencha tudo');
                if (pass.length < 6) return alert('A senha deve ter pelo menos 6 caracteres.');
                try {
                    const uid = await app.createUserWithReclaim(email, pass);
                    await db.collection('users').doc(uid).set({nome, email, tipo:'admin'});
                    alert('Administrador criado com sucesso!');
                } catch (err) { alert("ERRO AO CRIAR ADMIN: " + err.message); }
            } else await db.collection('users').doc(id).update({nome});
            app.renderContent();
        });
    };

    app.promoverProfessor = async function(id) {
        if (!confirm('Promover este professor a administrador?')) return; await db.collection('users').doc(id).update({ tipo: 'admin' });
        if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
        app.showToast('Professor promovido a Administrador', 'success'); app.renderContent();
    };

    app.demoverAdmin = async function(id) {
        if (!confirm('Rebaixar este administrador para professor?')) return; await db.collection('users').doc(id).update({ tipo: 'professor' });
        if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
        app.showToast('Administrador rebaixado para Professor', 'success'); app.renderContent();
    };

    app.modalTurma = async function(id = null) {
        const professores = (await app.getCollection('users')).filter(u => ['professor', 'secretaria'].includes(u.tipo));
        let turma = null;
        if (id) { const doc = await db.collection('turmas').doc(id).get(); if (doc.exists) turma = { id: doc.id, ...doc.data() }; }
        const content = `<div><label class="block text-sm mb-1">Nome</label><input type="text" id="turma-nome" value="${turma?turma.nome:''}" class="w-full px-3 py-2 border rounded mb-3 dark:bg-slate-700 dark:border-slate-600 dark:text-white"><label class="block text-sm mb-1">SIGOP</label><input type="text" id="turma-sigop" value="${turma?turma.sigop || '':''}" class="w-full px-3 py-2 border rounded mb-3 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: SIGOP-2026-001"><label class="block text-sm mb-1">Professores/Secretaria</label><div class="h-32 overflow-y-auto border p-2 bg-gray-50 dark:bg-slate-700 dark:border-slate-600">${professores.map(p => `<label class="flex items-center gap-2 p-1 dark:text-gray-300"><input type="checkbox" class="prof-check" value="${p.id}" ${(turma?.professores || []).includes(p.id)?'checked':''}>${p.nome}</label>`).join('')}</div></div>`;
        app.showModal(id?'Editar':'Nova', content, async()=>{ const nome = document.getElementById('turma-nome').value.trim(); const sigop = document.getElementById('turma-sigop').value.trim(); const profs = Array.from(document.querySelectorAll('.prof-check:checked')).map(c=>c.value); if(!nome) return alert('Nome obrigatório'); const data = { nome, sigop, professores: profs }; const label = app.formatTurmaLabelText(data, 'Turma', true); if(id) { await db.collection('turmas').doc(id).update(data); if (app.logAcesso) app.logAcesso('turma_editada', label); } else { await db.collection('turmas').add({...data, alunos:[]}); if (app.logAcesso) app.logAcesso('turma_criada', label); } app.renderContent(); });
    };

    app.modalComponentes = async function(turmaId) {
        const professores = (await app.getCollection('users')).filter(u => ['professor', 'secretaria'].includes(u.tipo));
        const compsSnap = await db.collection('componentes').where('turmaId', '==', turmaId).get(); const lista = compsSnap.docs.map(d => ({id: d.id, ...d.data()}));
        const profMap = new Map(professores.map(p => [p.id, p.nome]));
        const formatRange = (comp) => {
            if (!comp.dataInicio && !comp.dataFim) return 'Sem datas definidas';
            if (comp.dataInicio && comp.dataFim) return `${app.formatDateOnly(comp.dataInicio)} - ${app.formatDateOnly(comp.dataFim)}`;
            if (comp.dataInicio) return `Inicio: ${app.formatDateOnly(comp.dataInicio)}`;
            return `Fim: ${app.formatDateOnly(comp.dataFim)}`;
        };
        const content = `
            <div class="space-y-4">
                <div class="space-y-2">
                    <div class="flex gap-2">
                        <input id="comp-nome" placeholder="Nome da Matéria (Ex: Matemática)" class="flex-1 border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <button onclick="app.addComponente('${turmaId}')" class="bg-blue-600 text-white px-3 rounded">Adicionar</button>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                            <label class="block text-xs font-bold mb-1">Data inicial</label>
                            <input type="date" id="comp-data-inicio" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-xs font-bold mb-1">Data final</label>
                            <input type="date" id="comp-data-fim" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold mb-1">Professores/Secretaria</label>
                        <div class="h-28 overflow-y-auto border p-2 bg-gray-50 dark:bg-slate-700 dark:border-slate-600">
                            ${professores.map(p => `<label class="flex items-center gap-2 p-1 dark:text-gray-300"><input type="checkbox" class="comp-prof-check" value="${p.id}">${p.nome}</label>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="max-h-60 overflow-y-auto border rounded p-2 bg-gray-50 dark:bg-slate-700 dark:border-slate-600">
                    ${lista.length === 0 ? '<p class="text-sm text-gray-500 text-center">Nenhum componente cadastrado.</p>' : lista.map(c => {
                        const profNames = (c.professores || []).map(id => profMap.get(id)).filter(Boolean);
                        const displayNames = profNames.slice(0, 2);
                        const extraCount = Math.max(0, profNames.length - displayNames.length);
                        const profText = displayNames.length > 0
                            ? `Professores: ${displayNames.join(', ')}`
                            : 'Sem professor';
                        return `
                        <div class="flex justify-between items-center p-2 border-b last:border-0 border-gray-200 dark:border-slate-600">
                            <div class="min-w-0">
                                <div class="dark:text-white font-medium truncate">${c.nome}</div>
                                <div class="text-xs text-gray-500 dark:text-gray-300">${formatRange(c)}</div>
                                <div class="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-slate-600 dark:text-indigo-200">
                                        <i class="fas fa-chalkboard-teacher"></i>
                                        ${app.escapeHtml(profText)}
                                    </span>
                                    ${extraCount > 0 ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-600 dark:text-gray-200">+${extraCount}</span>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button onclick="app.modalEditarComponente('${c.id}', '${turmaId}')" class="text-blue-600" title="Editar datas">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button onclick="app.deleteComponente('${c.id}', '${turmaId}')" class="text-red-500" title="Excluir">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>`;
        app.showModal('Componentes Curriculares', content, () => {});
    };

    app.modalEditarComponente = async function(componenteId, turmaId) {
        const currentModal = document.querySelector('[id^="m-"]');
        if (currentModal) currentModal.remove();

        const professores = (await app.getCollection('users')).filter(u => ['professor', 'secretaria'].includes(u.tipo));
        const doc = await db.collection('componentes').doc(componenteId).get();
        if (!doc.exists) return alert('Componente nao encontrado.');
        const comp = { id: doc.id, ...doc.data() };

        const content = `
            <div class="space-y-3">
                <div>
                    <label class="block text-sm font-medium mb-1">Componente</label>
                    <input type="text" id="comp-edit-nome" value="${app.escapeHtml(comp.nome || '')}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm font-medium mb-1">Data inicial</label>
                        <input type="date" id="comp-edit-inicio" value="${app.toInputDate(comp.dataInicio)}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Data final</label>
                        <input type="date" id="comp-edit-fim" value="${app.toInputDate(comp.dataFim)}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Professores/Secretaria</label>
                    <div class="h-28 overflow-y-auto border p-2 bg-gray-50 dark:bg-slate-700 dark:border-slate-600">
                        ${professores.map(p => `<label class="flex items-center gap-2 p-1 dark:text-gray-300"><input type="checkbox" class="comp-edit-prof-check" value="${p.id}" ${(comp?.professores || []).includes(p.id) ? 'checked' : ''}>${p.nome}</label>`).join('')}
                    </div>
                </div>
                <div class="flex justify-end">
                    <button type="button" class="text-xs text-blue-600 hover:underline" onclick="document.getElementById('comp-edit-inicio').value='';document.getElementById('comp-edit-fim').value='';">
                        Limpar datas
                    </button>
                </div>
            </div>
        `;

        app.showModal('Editar Componente', content, async () => {
            const nome = document.getElementById('comp-edit-nome').value.trim();
            const dataInicio = document.getElementById('comp-edit-inicio').value;
            const dataFim = document.getElementById('comp-edit-fim').value;
            const hasInicio = Boolean(dataInicio);
            const hasFim = Boolean(dataFim);

            if (!nome) return alert('Informe o nome do componente.');
            if (hasInicio !== hasFim) return alert('Informe data inicial e data final ou limpe ambas.');
            if (hasInicio && dataFim < dataInicio) return alert('A data final deve ser maior ou igual a data inicial.');

            const profs = Array.from(document.querySelectorAll('.comp-edit-prof-check:checked')).map(c => c.value);
            const payload = { nome, professores: profs };
            if (hasInicio) {
                payload.dataInicio = dataInicio;
                payload.dataFim = dataFim;
            } else {
                payload.dataInicio = firebase.firestore.FieldValue.delete();
                payload.dataFim = firebase.firestore.FieldValue.delete();
            }

            await db.collection('componentes').doc(componenteId).update(payload);
            app._componentesCache = null;
            if (app.logAcesso) app.logAcesso('componente_editado', `${nome} (turma:${turmaId})`);
            const modal = document.querySelector('[id^="m-"]');
            if (modal) modal.remove();
            app.modalComponentes(turmaId);
        });
    };

    app.addComponente = async function(turmaId) {
        const nome = document.getElementById('comp-nome').value.trim();
        const dataInicio = document.getElementById('comp-data-inicio').value;
        const dataFim = document.getElementById('comp-data-fim').value;
        if (!nome || !dataInicio || !dataFim) return alert('Informe nome, data inicial e data final.');
        if (dataFim < dataInicio) return alert('A data final deve ser maior ou igual a data inicial.');
        const profs = Array.from(document.querySelectorAll('.comp-prof-check:checked')).map(c => c.value);
        await db.collection('componentes').add({ nome, turmaId, dataInicio, dataFim, professores: profs, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        app._componentesCache = null;
        if (app.logAcesso) app.logAcesso('componente_adicionado', `${nome} (turma:${turmaId})`);
        document.querySelector('[id^="m-"]').remove();
        app.modalComponentes(turmaId);
    };

    app.deleteComponente = async function(id, turmaId) {
        if(!confirm("Excluir componente? Notas vinculadas ficarão órfãs.")) return;
        let data = null;
        try { const doc = await db.collection('componentes').doc(id).get(); if (doc.exists) data = doc.data(); } catch (err) { console.warn('Nao foi possivel ler componente para log:', err); }
        await db.collection('componentes').doc(id).delete();
        app._componentesCache = null;
        if (app.logAcesso) app.logAcesso('componente_excluido', `${data?.nome || 'componente'} (turma:${turmaId})`);
        document.querySelector('[id^="m-"]').remove();
        app.modalComponentes(turmaId);
    };

    app.modalProfessor = async function(id = null) {
        let prof = null;
        if (id) { const d = await db.collection('users').doc(id).get(); if (d.exists) prof = { id: d.id, ...d.data() }; }
        const content = `<div class="space-y-3">${!id ? `<div><label>Email</label><input id="p-email" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>` : ''}<div><label>Senha ${id ? '<span class="text-xs text-red-500">(Não editável)</span>' : ''}</label><input id="p-pass-manual" type="text" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${id ? 'disabled value="******"' : 'placeholder="Mínimo 6 caracteres"'} ></div><div><label>Nome</label><input id="p-nome" value="${prof?prof.nome:''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div></div>`;
        app.showModal(id?'Editar':'Nova', content, async() => {
            const nome = document.getElementById('p-nome').value.trim();
            if(!id) {
                const email = document.getElementById('p-email').value.trim();
                const pass = document.getElementById('p-pass-manual').value.trim();
                if(!email||!pass||!nome) return alert('Preencha tudo');
                if (pass.length < 6) return alert('A senha deve ter pelo menos 6 caracteres.');
                try {
                    const uid = await app.createUserWithReclaim(email, pass);
                    await db.collection('users').doc(uid).set({nome, email, tipo:'professor'});
                    alert('Professor criado com sucesso e senha definida!');
                } catch (err) { alert("ERRO AO CRIAR PROFESSOR: " + err.message); }
            } else {
                await db.collection('users').doc(id).update({nome});
            }
            if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
            app.renderContent();
        });
    };

    app.modalSecretaria = async function(id = null) {
        let secretaria = null;
        if (id) { const d = await db.collection('users').doc(id).get(); if (d.exists) secretaria = { id: d.id, ...d.data() }; }
        const content = `<div class="space-y-3">${!id ? `<div><label>Email</label><input id="s-email" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>` : ''}<div><label>Senha ${id ? '<span class="text-xs text-red-500">(Não editável)</span>' : ''}</label><input id="s-pass-manual" type="text" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${id ? 'disabled value="******"' : 'placeholder="Mínimo 6 caracteres"'} ></div><div><label>Nome</label><input id="s-nome" value="${secretaria ? secretaria.nome : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div></div>`;
        app.showModal(id ? 'Editar' : 'Nova', content, async() => {
            const nome = document.getElementById('s-nome').value.trim();
            if (!id) {
                const email = document.getElementById('s-email').value.trim();
                const pass = document.getElementById('s-pass-manual').value.trim();
                if (!email || !pass || !nome) return alert('Preencha tudo');
                if (pass.length < 6) return alert('A senha deve ter pelo menos 6 caracteres.');
                try {
                    const uid = await app.createUserWithReclaim(email, pass);
                    await db.collection('users').doc(uid).set({ nome, email, tipo: 'secretaria' });
                    alert('Secretaria criada com sucesso e senha definida!');
                } catch (err) {
                    if (err && err.code === 'auth/email-already-in-use') {
                        throw new Error('Email já está em uso por outra conta.');
                    }
                    throw new Error(err?.message || 'Erro ao criar secretaria.');
                }
            } else {
                await db.collection('users').doc(id).update({ nome });
            }
            if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
            app.renderContent();
        });
    };

    app.renderAtividadesMain = async function(container) {
        app._atividadeSalaContext = null;
        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        let minhasTurmas = turmasAtivas;
        if (app.currentUserData && app.perms && app.perms.hasRole('professor', 'secretaria')) {
            const componentes = await app.getComponentesCache();
            minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        } else if (app.currentUserData && app.perms && app.perms.isAluno()) {
            minhasTurmas = turmasAtivas.filter(t => (t.alunos || []).includes(app.currentUserData.id));
        }

        if (minhasTurmas.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Nenhuma turma encontrada.</div>';
            return;
        }

        const cardsHtml = minhasTurmas.map(t => {
            const safeNome = app.formatTurmaLabelText(t, 'Turma', true).replace(/'/g, "\\'").replace(/\n/g, "\\n");
            return `
                <button onclick="app.renderAtividadesSalas('${t.id}', '${safeNome}')" class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-chalkboard text-xl"></i></div>
                        <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                    </div>
                    <h3 class="text-xl font-bold">${app.formatTurmaLabelHtml(t)}</h3>
                    <p class="text-sm text-gray-500 mt-1">Salas da turma</p>
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="mb-6 text-center">
                <h2 class="text-3xl font-bold text-gray-800 dark:text-white"><i class="fas fa-tasks text-blue-600 mr-2"></i>Atividades EAD</h2>
                <p class="text-gray-500 mt-2">Escolha a turma para acessar as salas de atividades EAD.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                ${cardsHtml}
            </div>
        `;
    };

    app.renderAtividadesSalas = async function(turmaId, turmaNome) {
        const content = document.getElementById('content-area');
        content.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';
        const snap = await db.collection('atividades_salas').where('turmaId', '==', turmaId).get();
        const salas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        salas.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const escapeAttr = (value) => String(value || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, "\\n");
        const safeTurmaNome = escapeAttr(turmaNome);
        const canManage = app.perms && app.perms.canCreateForumSala();
        const headerBtn = canManage ? `<button onclick="app.modalAtividadeSala('${turmaId}', '${safeTurmaNome}')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Nova sala</button>` : '';

        const salasHtml = [
            `<button onclick="app.abrirAtividadeSala('${turmaId}', '${safeTurmaNome}', null, null)" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-clipboard-list text-lg"></i></div>
                    <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                </div>
                <h3 class="text-lg font-bold">Sala Principal</h3>
                <p class="text-sm text-gray-500 mt-1">Atividades gerais da turma</p>
            </button>`
        ].concat(salas.map(s => {
            const safeSalaNome = escapeAttr(s.nome || 'Sala');
            const manageBtns = canManage ? `
                <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button onclick="app.modalAtividadeSala('${turmaId}', '${safeTurmaNome}', '${s.id}')" class="p-2 bg-blue-100 text-blue-600 rounded-full" title="Editar sala">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button onclick="app.deleteAtividadeSala('${s.id}', '${turmaId}', '${safeTurmaNome}')" class="p-2 bg-red-100 text-red-600 rounded-full" title="Excluir sala">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            ` : '';
            return `<div class="relative group">
                ${manageBtns}
                <button onclick="app.abrirAtividadeSala('${turmaId}', '${safeTurmaNome}', '${s.id}', '${safeSalaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group w-full">
                    <div class="flex items-center justify-between mb-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-clipboard-check text-lg"></i></div>
                        <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                    </div>
                    <h3 class="text-lg font-bold">${app.escapeHtml(s.nome || 'Sala')}</h3>
                    <p class="text-sm text-gray-500 mt-1">Sala de atividades</p>
                </button>
            </div>`;
        })).join('');

        content.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <button onclick="app.navigate('atividades')" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${app.escapeHtml(turmaNome || 'Turma')}</h2>
                </div>
                ${headerBtn}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${salasHtml}
            </div>
        `;
    };

    app.abrirAtividadeSala = function(turmaId, turmaNome, salaId = null, salaNome = null) {
        app._atividadeSalaContext = { turmaId, turmaNome, salaId, salaNome };
        const content = document.getElementById('content-area');
        content.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';
        const safeTurmaNomeAttr = (turmaNome || '').replace(/'/g, "\\'");
        const safeTitleTurma = app.escapeHtml(turmaNome || 'Turma');
        const safeTitleSala = app.escapeHtml(salaNome || 'Sala Principal');
        app.renderAvaliacoes(content, 'atividade', {
            turmaId,
            salaId,
            title: `Atividades EAD - ${safeTitleTurma} • ${safeTitleSala}`,
            backAction: `app.renderAtividadesSalas('${turmaId}', '${safeTurmaNomeAttr}')`
        });
    };

    app.modalAtividadeSala = async function(turmaId, turmaNome, salaId = null) {
        if (!app.perms || !app.perms.canCreateForumSala()) return alert('Acesso restrito.');
        const turmaNomeFinal = turmaNome || 'Turma';
        let salaAtual = null;
        if (salaId) {
            const doc = await db.collection('atividades_salas').doc(salaId).get();
            if (doc.exists) salaAtual = { id: doc.id, ...doc.data() };
        }
        const content = `<div class="space-y-3"><div><label class="block text-sm font-bold mb-1">Nome da Sala</label><input id="atividade-sala-nome" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${app.escapeHtml(salaAtual?.nome || '')}" placeholder="Ex: Revisao 1"></div></div>`;
        app.showModal(salaId ? 'Editar sala de atividades' : 'Nova sala de atividades', content, async () => {
            const nome = document.getElementById('atividade-sala-nome').value.trim();
            if (!nome) throw new Error('Informe o nome da sala.');
            const payload = {
                nome,
                turmaId,
                turmaNome: turmaNomeFinal,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                atualizadoPorId: app.currentUserData.id,
                atualizadoPorNome: app.currentUserData.nome
            };
            if (salaId) {
                await db.collection('atividades_salas').doc(salaId).update(payload);
                const atividadesSnap = await db.collection('provas')
                    .where('tipo', '==', 'atividade')
                    .where('salaId', '==', salaId)
                    .get();
                if (!atividadesSnap.empty) {
                    const batch = db.batch();
                    atividadesSnap.docs.forEach(doc => batch.update(doc.ref, { salaNome: nome }));
                    await batch.commit();
                }
            } else {
                await db.collection('atividades_salas').add({
                    ...payload,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                    criadoPorId: app.currentUserData.id,
                    criadoPorNome: app.currentUserData.nome
                });
            }
            app.renderAtividadesSalas(turmaId, turmaNomeFinal);
        });
    };

    app.deleteAtividadeSala = async function(salaId, turmaId, turmaNome) {
        if (!app.perms || !app.perms.canCreateForumSala()) return alert('Acesso restrito.');
        if (!confirm('Excluir esta sala?')) return;
        let atividadesAtualizadas = 0;
        const atividadesSnap = await db.collection('provas')
            .where('tipo', '==', 'atividade')
            .where('salaId', '==', salaId)
            .get();
        if (!atividadesSnap.empty) {
            atividadesAtualizadas = atividadesSnap.size;
            const batch = db.batch();
            atividadesSnap.docs.forEach(doc => batch.update(doc.ref, { salaId: null, salaNome: null }));
            await batch.commit();
        }
        await db.collection('atividades_salas').doc(salaId).delete();
        app.toast('success', 'Sala excluida', { 'Atividades desvinculadas': atividadesAtualizadas });
        app.renderAtividadesSalas(turmaId, turmaNome);
    };

    app.renderSelecaoTurma = async function(container, destino) {
        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        let minhasTurmas = turmasAtivas;
        if (app.currentUserData && app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        } else if (app.currentUserData && app.perms && app.perms.isAluno()) {
            minhasTurmas = turmasAtivas.filter(t => (t.alunos || []).includes(app.currentUserData.id));
        }

        if (destino === 'forum') {
            await app.renderForumMain(container, minhasTurmas);
            return;
        }

        const titulo = destino === 'trabalhos' ? 'Trabalhos' : 'Fórum';
        const desc = destino === 'trabalhos' ? 'Chat para colaboração e envio de arquivos.' : 'Espaço para dúvidas e avisos.';
        const icon = destino === 'trabalhos' ? 'fa-briefcase' : 'fa-users';

        let htmlBotao = '';
        if (app.currentUserData && app.perms && app.perms.isAdmin()) {
            htmlBotao = `<div class="mb-4 text-center"><button onclick="app.limparChat('${destino}')" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-trash-alt mr-2"></i>Limpar Todas Mensagens</button><p class="text-xs text-gray-500 mt-1"><i class="fas fa-exclamation-triangle text-yellow-500"></i> Atenção: Apaga permanentemente tudo</p></div>`;
        }

        const cardsHtml = minhasTurmas.map(t => {
            const safeNome = app.formatTurmaLabelText(t, 'Turma', true).replace(/'/g, "\\'").replace(/\n/g, "\\n");
            const handler = destino === 'trabalhos' ? 'abrirTrabalhoTurma' : 'abrirForumTurma';
            return `
                <button onclick="app.${handler}('${t.id}', '${safeNome}')" class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                    <div class="flex items-center justify-between mb-4">
                        <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-chalkboard text-xl"></i></div>
                        <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                    </div>
                    <h3 class="text-xl font-bold">${app.formatTurmaLabelHtml(t)}</h3>
                    <p class="text-sm text-gray-500 mt-1">Acessar sala</p>
                </button>
            `;
        }).join('');

        container.innerHTML = `
            <div class="mb-6 text-center">
                <h2 class="text-3xl font-bold text-gray-800 dark:text-white"><i class="fas ${icon} text-blue-600 mr-2"></i>${titulo}</h2>
                <p class="text-gray-500 mt-2">${desc}</p>
            </div>
            ${htmlBotao}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                ${cardsHtml}
            </div>
        `;
    };

    app.renderTrabalhosSalas = async function(turmaId, turmaNome) {
        const content = document.getElementById('content-area');
        content.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';
        const snap = await db.collection('trabalhos_salas').where('turmaId', '==', turmaId).get();
        const salas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        salas.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const escapeAttr = (value) => String(value || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, "\\n");
        const safeTurmaNome = escapeAttr(turmaNome);
        const role = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        const canManage = role === 'admin' || role === 'professor';
        const headerBtn = canManage ? `<button onclick="app.modalTrabalhoSala('${turmaId}', '${safeTurmaNome}')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Nova sala</button>` : '';
        const salasHtml = [
            `<button onclick="app.abrirChatTrabalho('${turmaId}', '${safeTurmaNome}', null, null)" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-briefcase text-lg"></i></div>
                    <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                </div>
                <h3 class="text-lg font-bold">Sala Principal</h3>
                <p class="text-sm text-gray-500 mt-1">Envio e discussao da turma</p>
            </button>`
        ].concat(salas.map(s => {
            const safeSalaNome = escapeAttr(s.nome || 'Sala');
            const actions = canManage ? `
                <div class="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                    <button onclick="event.preventDefault();event.stopPropagation();app.modalTrabalhoSala('${turmaId}', '${safeTurmaNome}', '${s.id}')" class="p-2 bg-blue-100 text-blue-600 rounded-full" title="Editar sala">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                    <button onclick="event.preventDefault();event.stopPropagation();app.deleteTrabalhoSala('${s.id}', '${turmaId}', '${safeTurmaNome}')" class="p-2 bg-red-100 text-red-600 rounded-full" title="Excluir sala">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            ` : '';
            return `<div class="relative group">
                ${actions}
                <button onclick="app.abrirTrabalhoSala('${turmaId}', '${safeTurmaNome}', '${s.id}', '${safeSalaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group w-full">
                    <div class="flex items-center justify-between mb-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-folder-open text-lg"></i></div>
                        <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                    </div>
                    <h3 class="text-lg font-bold">${app.escapeHtml(s.nome || 'Sala')}</h3>
                    <p class="text-sm text-gray-500 mt-1">Sala de trabalhos</p>
                </button>
            </div>`;
        })).join('');

        content.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <button onclick="app.navigate('trabalhos')" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${app.escapeHtml(turmaNome || 'Turma')}</h2>
                </div>
                ${headerBtn}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${salasHtml}
            </div>
        `;
    };

    app.modalTrabalhoSala = async function(turmaId, turmaNome, salaId = null) {
        const role = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        if (role !== 'admin' && role !== 'professor') return alert('Acesso restrito.');
        const turmaIdFinal = turmaId;
        const turmaNomeFinal = turmaNome || 'Turma';
        let salaAtual = null;
        if (salaId) {
            const doc = await db.collection('trabalhos_salas').doc(salaId).get();
            if (doc.exists) salaAtual = { id: doc.id, ...doc.data() };
        }
        const content = `<div class="space-y-3"><div><label class="block text-sm font-bold mb-1">Nome da Sala</label><input id="trabalho-sala-nome" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${app.escapeHtml(salaAtual?.nome || '')}" placeholder="Ex: Projeto Final"></div></div>`;
        app.showModal(salaId ? 'Editar sala de trabalhos' : 'Nova sala de trabalhos', content, async () => {
            const nome = document.getElementById('trabalho-sala-nome').value.trim();
            if (!nome) throw new Error('Informe o nome da sala.');
            const payload = {
                nome,
                turmaId: turmaIdFinal,
                turmaNome: turmaNomeFinal,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                atualizadoPorId: app.currentUserData.id,
                atualizadoPorNome: app.currentUserData.nome
            };
            if (salaId) {
                await db.collection('trabalhos_salas').doc(salaId).update(payload);
            } else {
                await db.collection('trabalhos_salas').add({
                    ...payload,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                    criadoPorId: app.currentUserData.id,
                    criadoPorNome: app.currentUserData.nome
                });
            }
            app.renderTrabalhosSalas(turmaIdFinal, turmaNomeFinal);
        });
    };

    app.deleteTrabalhoSala = async function(salaId, turmaId, turmaNome) {
        const role = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        if (role !== 'admin' && role !== 'professor') return alert('Acesso restrito.');
        if (!confirm('Excluir esta sala?')) return;
        const { deleted, files } = await app.deleteSalaChatMessages('trabalhos', turmaId, salaId);
        await db.collection('trabalhos_salas').doc(salaId).delete();
        app.toast('success', 'Sala excluida', { Mensagens: deleted, Arquivos: files });
        app.renderTrabalhosSalas(turmaId, turmaNome);
    };

    app.renderForumMain = async function(container, minhasTurmas) {
        if (app.logAcesso) app.logAcesso('forum_acessado', 'lista');
        const escapeJsArg = (value) => String(value || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, "\\n");
        const canCreate = app.perms && app.perms.canCreateForumSala();
        const snap = await db.collection('forum_salas').where('turmaId', '==', 'geral').get();
        const salasGerais = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        salasGerais.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const botaoCriar = canCreate ? '<button onclick="app.modalForumSala(\'geral\', \'Forum\')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Nova sala</button>' : '';
        const showColab = app.perms && app.perms.canAccessColabForum();
        const snapColab = showColab ? await db.collection('forum_salas').where('turmaId', '==', 'colaboradores').get() : null;
        const salasColab = snapColab ? snapColab.docs.map(d => ({ id: d.id, ...d.data() })) : [];
        salasColab.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const botaoCriarColab = showColab ? '<button onclick="app.modalForumSala(\'colaboradores\', \'Colaboradores\')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Nova sala</button>' : '';
        const canDeleteSalaGeral = app.perms && app.perms.canDeleteForumSala({ turmaId: 'geral' });
        const salasGeraisHtml = salasGerais.length === 0
            ? '<div class="text-sm text-gray-500">Nenhuma sala geral criada.</div>'
            : salasGerais.map(s => {
                const safeSalaNome = escapeJsArg(s.nome || 'Sala');
                const deleteBtn = canDeleteSalaGeral ? `
                    <button onclick="app.deleteForumSala('${s.id}', 'geral', 'Forum')" class="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition" title="Excluir sala">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                ` : '';
                return `<div class="relative group">
                    ${deleteBtn}
                    <button onclick="app.abrirForumSala('geral', 'Forum', '${s.id}', '${safeSalaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group w-full">
                        <div class="flex items-center justify-between mb-3">
                            <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-comment-dots text-lg"></i></div>
                            <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                        </div>
                        <h3 class="text-lg font-bold">${app.escapeHtml(s.nome || 'Sala')}</h3>
                        <p class="text-sm text-gray-500 mt-1">Assunto geral</p>
                    </button>
                </div>`;
            }).join('');
        const salasColabHtml = !showColab
            ? ''
            : (salasColab.length === 0
                ? '<div class="text-sm text-gray-500">Nenhuma sala de colaboradores criada.</div>'
                : salasColab.map(s => {
                    const safeSalaNome = escapeJsArg(s.nome || 'Sala');
                    const canDeleteColab = app.perms && app.perms.canDeleteForumSala({ turmaId: 'colaboradores', createdById: s.criadoPorId });
                    const deleteBtn = canDeleteColab ? `
                        <button onclick="app.deleteForumSala('${s.id}', 'colaboradores', 'Colaboradores')" class="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition" title="Excluir sala">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    ` : '';
                    return `<div class="relative group">
                        ${deleteBtn}
                        <button onclick="app.abrirForumSala('colaboradores', 'Colaboradores', '${s.id}', '${safeSalaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group w-full">
                            <div class="flex items-center justify-between mb-3">
                                <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-users text-lg"></i></div>
                                <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                            </div>
                            <h3 class="text-lg font-bold">${app.escapeHtml(s.nome || 'Sala')}</h3>
                            <p class="text-sm text-gray-500 mt-1">Colaboradores</p>
                        </button>
                    </div>`;
                }).join(''));
        const turmasHtml = minhasTurmas.map(t => {
            const safeNome = escapeJsArg(app.formatTurmaLabelText(t, 'Turma', true));
            return `<button onclick="app.abrirForumTurma('${t.id}', '${safeNome}')" class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                <div class="flex items-center justify-between mb-4">
                    <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-chalkboard text-xl"></i></div>
                    <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                </div>
                <h3 class="text-xl font-bold">${app.formatTurmaLabelHtml(t)}</h3>
                <p class="text-sm text-gray-500 mt-1">Salas da turma</p>
            </button>`;
        }).join('');
        const htmlLimpar = app.perms && app.perms.canViewAccessLogs()
            ? '<div class="mb-4 text-center"><button onclick="app.limparChat(\'forum\')" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-trash-alt mr-2"></i>Limpar Todas Mensagens</button><p class="text-xs text-gray-500 mt-1"><i class="fas fa-exclamation-triangle text-yellow-500"></i> Atenção: Apaga permanentemente tudo</p></div>'
            : '';
        container.innerHTML = `
            <div class="mb-6 text-center">
                <h2 class="text-3xl font-bold text-gray-800 dark:text-white"><i class="fas fa-users text-blue-600 mr-2"></i>Fórum</h2>
            </div>
            ${htmlLimpar}
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-800 dark:text-white">Salas gerais</h3>
                ${botaoCriar}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                ${salasGeraisHtml}
            </div>
            ${showColab ? `
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-bold text-gray-800 dark:text-white">Salas de colaboradores</h3>
                ${botaoCriarColab}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                ${salasColabHtml}
            </div>
            ` : ''}
            <div class="mb-4">
                <h3 class="text-lg font-bold text-gray-800 dark:text-white">Salas por turma</h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                ${turmasHtml}
            </div>
        `;
    };

    app.renderForumSalas = async function(turmaId, turmaNome) {
        const content = document.getElementById('content-area');
        content.innerHTML = '<div class="flex justify-center mt-10"><div class="loading border-blue-600 border-t-transparent w-10 h-10 border-4"></div></div>';
        const snap = await db.collection('forum_salas').where('turmaId', '==', turmaId).get();
        const salas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        salas.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const escapeJsArg = (value) => String(value || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\r/g, '')
            .replace(/\n/g, "\\n");
        const safeTurmaNome = escapeJsArg(turmaNome || '');
        const canCreate = app.perms && app.perms.canCreateForumSala();
        const headerBtn = canCreate ? `<button onclick="app.modalForumSala('${turmaId}', '${safeTurmaNome}')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Nova sala</button>` : '';
        const canDeleteSalaTurma = app.perms && app.perms.canDeleteForumSala({ turmaId });
        const salasHtml = [
            `<button onclick="app.abrirForum('${turmaId}', '${safeTurmaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group">
                <div class="flex items-center justify-between mb-3">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-comments text-lg"></i></div>
                    <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                </div>
                <h3 class="text-lg font-bold">Sala Principal</h3>
                <p class="text-sm text-gray-500 mt-1">Discussão geral da turma</p>
            </button>`
        ].concat(salas.map(s => {
            const safeSalaNome = escapeJsArg(s.nome || 'Sala');
            const deleteBtn = canDeleteSalaTurma ? `
                <button onclick="app.deleteForumSala('${s.id}', '${turmaId}', '${safeTurmaNome}')" class="absolute top-3 right-3 p-2 bg-red-100 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition" title="Excluir sala">
                    <i class="fas fa-trash text-xs"></i>
                </button>
            ` : '';
            return `<div class="relative group">
                ${deleteBtn}
                <button onclick="app.abrirForumSala('${turmaId}', '${safeTurmaNome}', '${s.id}', '${safeSalaNome}')" class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm hover:shadow-lg transition border text-left group w-full">
                    <div class="flex items-center justify-between mb-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-110"><i class="fas fa-comment-dots text-lg"></i></div>
                        <i class="fas fa-arrow-right text-gray-300 group-hover:text-blue-500"></i>
                    </div>
                    <h3 class="text-lg font-bold">${app.escapeHtml(s.nome || 'Sala')}</h3>
                    <p class="text-sm text-gray-500 mt-1">Sala de discussão</p>
                </button>
            </div>`;
        })).join('');

        content.innerHTML = `
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                    <button onclick="app.navigate('forum')" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${app.escapeHtml(turmaNome || 'Turma')}</h2>
                </div>
                ${headerBtn}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${salasHtml}
            </div>
        `;
    };

    app.modalForumSala = async function(turmaId, turmaNome) {
        if (!app.perms || !app.perms.canCreateForumSala()) return alert('Acesso restrito.');
        const turmaIdFinal = turmaId || 'geral';
        const turmaNomeFinal = turmaNome || 'Forum';
        const content = `<div class="space-y-3"><div><label class="block text-sm font-bold mb-1">Nome da Sala</label><input id="forum-sala-nome" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: Duvidas da prova"></div></div>`;
        app.showModal('Nova sala de discussão', content, async () => {
            const nome = document.getElementById('forum-sala-nome').value.trim();
            if (!nome) throw new Error('Informe o nome da sala.');
            await db.collection('forum_salas').add({
                nome,
                turmaId: turmaIdFinal,
                turmaNome: turmaNomeFinal,
                criadoPorId: app.currentUserData.id,
                criadoPorNome: app.currentUserData.nome,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });
            if (turmaIdFinal === 'geral') app.renderContent();
            else app.renderForumSalas(turmaIdFinal, turmaNomeFinal);
        });
    };

    app.deleteForumSala = async function(salaId, turmaId, turmaNome) {
        const isGeral = turmaId === 'geral';
        const isColab = turmaId === 'colaboradores';
        let canDelete = false;
        let createdById = null;
        if (isColab) {
            const doc = await db.collection('forum_salas').doc(salaId).get();
            createdById = doc.exists ? doc.data().criadoPorId : null;
        }
        if (app.perms) {
            canDelete = app.perms.canDeleteForumSala({ turmaId, createdById });
        }
        if (!canDelete) return alert('Acesso restrito.');
        if (!confirm('Excluir esta sala?')) return;
        const { deleted, files } = await app.deleteSalaChatMessages('forum', turmaId, salaId);
        await db.collection('forum_salas').doc(salaId).delete();
        app.toast('success', 'Sala excluida', { Mensagens: deleted, Arquivos: files });
        if (isGeral) app.renderContent();
        else if (isColab) app.renderContent();
        else app.renderForumSalas(turmaId, turmaNome);
    };

    // ======= CADASTRO / PERFIL DO USUÁRIO =======
    app.renderCadastro = async function(container) {
        const userData = app.currentUserData || {};
        const userId = userData.id;
        
        console.log('❌? renderCadastro - userData:', userData);
        console.log('❌? renderCadastro - tipo:', userData.tipo);
        
        if (!userId) {
            container.innerHTML = '<div class="text-center text-red-500">Erro: Usuário não identificado.</div>';
            return;
        }

        const doc = await db.collection('users').doc(userId).get();
        const userDoc = doc.exists ? doc.data() : {};
        
        const nome = app.escapeHtml(userDoc.nome || '');
        const email = app.escapeHtml(userDoc.email || '');
        const endereco = app.escapeHtml(userDoc.endereco || '');
        const whatsapp = app.escapeHtml(userDoc.whatsapp || '');
        const isAluno = userDoc.tipo === 'aluno' || userData.tipo === 'aluno';
        
        console.log('❌? É aluno?', isAluno, '- userDoc.tipo:', userDoc.tipo);

        container.innerHTML = `
            <div class="max-w-4xl mx-auto">
                <div class="mb-6">
                    <h2 class="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                        <i class="fas fa-user-cog text-blue-600"></i>
                        Meu Cadastro
                    </h2>
                    <p class="text-gray-500 dark:text-gray-400 mt-2">Gerencie suas informações pessoais e de acesso</p>
                </div>

                <!-- Informações Básicas -->
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-id-card text-blue-600"></i>
                        Informações Básicas
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nome Completo
                            </label>
                            <input type="text" id="cadastro-nome" value="${nome}" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <i class="fas fa-envelope mr-1"></i> Email Atual
                            </label>
                            <div class="px-4 py-2 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300">
                                ${email}
                            </div>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Para alterar o email, use o formulário abaixo</p>
                        </div>
                    </div>
                </div>

                <!-- Contato -->
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-address-book text-green-600"></i>
                        Informações de Contato
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <i class="fas fa-map-marker-alt mr-1"></i> Endereço Completo
                            </label>
                            <textarea id="cadastro-endereco" rows="3" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Rua, número, bairro, cidade, estado, CEP">${endereco}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                <i class="fab fa-whatsapp mr-1"></i> WhatsApp
                            </label>
                            <input type="tel" id="cadastro-whatsapp" value="${whatsapp}" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="(00) 00000-0000">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button onclick="app.salvarDadosCadastro()" 
                            data-loading-label="Salvando informacoes..."
                            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition flex items-center gap-2">
                            <i class="fas fa-save"></i> Salvar Informações
                        </button>
                    </div>
                </div>

                <!-- Notificações Push (apenas para alunos) -->
                ${isAluno ? `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-blue-300 dark:border-blue-700 p-6 mb-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            <i class="fas fa-bell text-blue-600"></i>
                            Notificações no Celular
                        </h3>
                        <span class="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-mono rounded-full">
                            v2.14-DIAG
                        </span>
                    </div>
                    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                        <p class="text-sm text-blue-800 dark:text-blue-200">
                            <i class="fas fa-info-circle mr-2"></i>
                            Receba avisos importantes diretamente no seu celular, mesmo quando o aplicativo estiver fechado.
                        </p>
                        <p class="text-xs text-blue-600 dark:text-blue-300 mt-2">
                            <i class="fas fa-link mr-1"></i> Site atual: <strong>${location.protocol}//${location.hostname}</strong>
                            ${location.protocol !== 'https:' && location.hostname !== 'localhost' ? '<br><i class="fas fa-exclamation-triangle mr-1"></i> ⚠️? Requer HTTPS!' : ''}
                        </p>
                    </div>
                    <div id="notification-status" class="mb-4 p-4 rounded-lg bg-gray-100 dark:bg-slate-700">
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                            <i class="fas fa-circle-notch fa-spin mr-2"></i> Verificando status...
                        </p>
                    </div>
                    <!-- Botões organizados para mobile -->
                    <div class="space-y-3">
                        <button onclick="app.ativarNotificacoes()" 
                            class="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-sm transition flex items-center justify-center gap-2">
                            <i class="fas fa-bell"></i>
                            <span>Ativar Notificações</span>
                        </button>
                        <div class="grid grid-cols-3 gap-2">
                            <button onclick="app.testarNotificacaoLocal()" 
                                class="px-3 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium shadow-sm transition flex items-center justify-center gap-1 text-sm"
                                title="Notificação LOCAL (não usa FCM/backend)">
                                <i class="fas fa-desktop"></i>
                                <span>Local</span>
                            </button>
                            <button onclick="app.testarNotificacao()" 
                                class="px-3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition flex items-center justify-center gap-1 text-sm"
                                title="Notificação via BACKEND (servidor → FCM → celular)">
                                <i class="fas fa-vial"></i>
                                <span>Backend</span>
                            </button>
                            <button onclick="app.diagnosticarNotificacoes()" 
                                class="px-3 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium shadow-sm transition flex items-center justify-center gap-1 text-sm"
                                title="Verificar configuração completa e identificar problemas">
                                <i class="fas fa-stethoscope"></i>
                                <span>Check</span>
                            </button>
                        </div>
                    </div>
                </div>
                ` : ''}

                <!-- Teste de Email (para todos os usuários) -->
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-teal-300 dark:border-teal-700 p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-envelope text-teal-600"></i>
                        Testar Sistema de Email
                    </h3>
                    <div class="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4 mb-4">
                        <p class="text-sm text-teal-800 dark:text-teal-200">
                            <i class="fas fa-info-circle mr-2"></i>
                            Envie um email de teste para verificar se o sistema de notificações por email está funcionando corretamente.
                        </p>
                    </div>
                    <button onclick="app.testarEmail()" 
                        class="w-full px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium shadow-sm transition flex items-center justify-center gap-2"
                        title="Testar envio de email via SendGrid">
                        <i class="fas fa-paper-plane"></i>
                        <span>Enviar Email de Teste</span>
                    </button>
                </div>

                <!-- Alterar Email -->
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-yellow-300 dark:border-yellow-700 p-6 mb-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-envelope-open-text text-yellow-600"></i>
                        Alterar Email de Acesso
                    </h3>
                    <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                        <p class="text-sm text-yellow-800 dark:text-yellow-200">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            <strong>Atenção:</strong> Ao alterar seu email, você precisará fazer login novamente com o novo email. 
                            Seus dados e histórico serão preservados.
                        </p>
                    </div>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Novo Email
                            </label>
                            <input type="email" id="cadastro-novo-email" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                                placeholder="seu-novo-email@exemplo.com">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Senha Atual (para confirmar)
                            </label>
                            <input type="password" id="cadastro-senha-confirma-email" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-yellow-500 outline-none"
                                placeholder="Digite sua senha atual">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button onclick="app.alterarEmail()" 
                            class="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium shadow-sm transition flex items-center gap-2">
                            <i class="fas fa-sync-alt"></i> Alterar Email
                        </button>
                    </div>
                </div>

                <!-- Alterar Senha -->
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-orange-300 dark:border-orange-700 p-6">
                    <h3 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-key text-orange-600"></i>
                        Alterar Senha
                    </h3>
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Senha Atual
                            </label>
                            <input type="password" id="cadastro-senha-atual" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="Digite sua senha atual">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nova Senha
                            </label>
                            <input type="password" id="cadastro-senha-nova" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="Mínimo 6 caracteres">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Confirmar Nova Senha
                            </label>
                            <input type="password" id="cadastro-senha-nova-confirma" 
                                class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none"
                                placeholder="Digite novamente a nova senha">
                        </div>
                    </div>
                    <div class="mt-6 flex justify-end">
                        <button onclick="app.alterarSenha()" 
                            class="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium shadow-sm transition flex items-center gap-2">
                            <i class="fas fa-lock"></i> Alterar Senha
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Verificar status de notificações se for aluno
        if (isAluno) {
            console.log('✅ É aluno! Verificando status de notificações...');
            setTimeout(() => {
                app.verificarStatusNotificacoes();
            }, 500);
        } else {
            console.log('ℹ️? Não é aluno, seção de notificações não será exibida');
        }
    };

    app.verificarStatusNotificacoes = async function() {
        const statusDiv = document.getElementById('notification-status');
        if (!statusDiv) return;

        try {
            // Verificar se as funções estão disponíveis
            if (typeof isNotificationSupported !== 'function') {
                statusDiv.innerHTML = `
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        <i class="fas fa-exclamation-circle mr-2"></i> Sistema de notificações não carregado
                    </p>
                `;
                return;
            }

            if (!isNotificationSupported()) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-red-600 dark:text-red-400">
                        <i class="fas fa-times-circle mr-2"></i> Notificações não suportadas neste navegador
                    </p>
                `;
                return;
            }

            const permission = Notification.permission;
            const userData = app.currentUserData || {};
            const hasToken = userData.fcmToken ? true : false;

            if (permission === 'granted' && hasToken) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-green-600 dark:text-green-400">
                        <i class="fas fa-check-circle mr-2"></i> Notificações ativadas e funcionando!
                    </p>
                `;
            } else if (permission === 'granted' && !hasToken) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-yellow-600 dark:text-yellow-400">
                        <i class="fas fa-exclamation-triangle mr-2"></i> Permissão concedida, mas token não registrado. Clique em "Ativar Notificações"
                    </p>
                `;
            } else if (permission === 'denied') {
                statusDiv.innerHTML = `
                    <p class="text-sm text-red-600 dark:text-red-400">
                        <i class="fas fa-ban mr-2"></i> Notificações bloqueadas. Desbloqueie nas configurações do navegador.
                    </p>
                `;
            } else {
                statusDiv.innerHTML = `
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                        <i class="fas fa-bell-slash mr-2"></i> Notificações não ativadas. Clique em "Ativar Notificações".
                    </p>
                `;
            }
        } catch (error) {
            console.error('Erro ao verificar status:', error);
            statusDiv.innerHTML = `
                <p class="text-sm text-gray-600 dark:text-gray-400">
                    <i class="fas fa-question-circle mr-2"></i> Erro ao verificar status
                </p>
            `;
        }
    };

    app.ativarNotificacoes = async function() {
        const statusDiv = document.getElementById('notification-status');
        
        try {
            // Verificar se o service worker file existe
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-blue-600 dark:text-blue-400">
                        <i class="fas fa-circle-notch fa-spin mr-2"></i> Verificando arquivos necessários...
                    </p>
                `;
            }
            
            // Testar se o service worker está acessível
            try {
                const swResponse = await fetch('/firebase-messaging-sw.js', { method: 'HEAD' });
                if (!swResponse.ok) {
                    const msg = 'Arquivo firebase-messaging-sw.js não encontrado. Entre em contato com o administrador.';
                    app.showToast(msg, 'error');
                    if (statusDiv) {
                        statusDiv.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400"><i class="fas fa-times-circle mr-2"></i> ${msg}</p>`;
                    }
                    return;
                }
                console.log('✅ Service Worker file acessível');
            } catch (fetchError) {
                console.warn('⚠️? Não foi possível verificar service worker file:', fetchError);
            }
            
            // Atualizar status: verificando
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-blue-600 dark:text-blue-400">
                        <i class="fas fa-circle-notch fa-spin mr-2"></i> Verificando compatibilidade...
                    </p>
                `;
            }
            
            // Usar as funções já importadas globalmente
            if (typeof registerForNotifications !== 'function' || typeof isNotificationSupported !== 'function') {
                const msg = 'Sistema de notificações não carregado. Recarregue a página (Ctrl+R).';
                app.showToast(msg, 'error');
                if (statusDiv) {
                    statusDiv.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400"><i class="fas fa-times-circle mr-2"></i> ${msg}</p>`;
                }
                return;
            }
            
            if (!isNotificationSupported()) {
                const msg = 'Notificações não suportadas neste navegador. Use Chrome, Firefox ou Edge atualizado.';
                app.showToast(msg, 'error');
                if (statusDiv) {
                    statusDiv.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400"><i class="fas fa-times-circle mr-2"></i> ${msg}</p>`;
                }
                return;
            }

            // Atualizar status: solicitando
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-blue-600 dark:text-blue-400">
                        <i class="fas fa-circle-notch fa-spin mr-2"></i> Solicitando permissão...
                    </p>
                `;
            }
            app.showToast('Permita as notificações quando solicitado', 'info');
            
            const userId = app.currentUserData?.id;
            if (!userId) {
                const msg = 'Erro: Usuário não identificado. Faça login novamente.';
                app.showToast(msg, 'error');
                if (statusDiv) {
                    statusDiv.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400"><i class="fas fa-times-circle mr-2"></i> ${msg}</p>`;
                }
                return;
            }
            
            // Atualizar status: registrando
            if (statusDiv) {
                statusDiv.innerHTML = `
                    <p class="text-sm text-blue-600 dark:text-blue-400">
                        <i class="fas fa-circle-notch fa-spin mr-2"></i> Registrando token FCM...
                    </p>
                `;
            }
            
            const schoolId = store.activeSchoolId;
            if (!schoolId) {
                const msg = 'Erro: Escola não identificada. Selecione uma escola e tente novamente.';
                app.showToast(msg, 'error');
                if (statusDiv) {
                    statusDiv.innerHTML = `<p class="text-sm text-red-600 dark:text-red-400"><i class="fas fa-times-circle mr-2"></i> ${msg}</p>`;
                }
                return;
            }

            const registered = await registerForNotifications(userId, schoolId);
            
            if (registered) {
                app.showToast('✅ Notificações ativadas com sucesso!', 'success');
                
                // Recarregar dados do usuário
                const doc = await db.collection('users').doc(userId).get();
                if (doc.exists) {
                    store.currentUserData = { id: userId, ...doc.data() };
                }
                
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        <p class="text-sm text-green-600 dark:text-green-400">
                            <i class="fas fa-check-circle mr-2"></i> Notificações ativadas! Você receberá avisos no celular.
                        </p>
                    `;
                }
                
                app.verificarStatusNotificacoes();
            }
        } catch (error) {
            console.error('Erro ao ativar notificações:', error);
            const errorMsg = error.message || 'Erro desconhecido';
            
            // Exibir mensagem de erro detalhada
            const firstLine = errorMsg.split('\n')[0];
            app.showToast(firstLine.substring(0, 50) + '...', 'error');
            
            if (statusDiv) {
                // Formatar mensagem para melhor visualização
                const formattedMsg = errorMsg
                    .replace(/={3,}|─{3,}|━{3,}|-{{3,}}/g, '<hr class="my-2 border-red-300">') // Separadores
                    .replace(/📋/g, '<i class="fas fa-clipboard mr-2"></i>')
                    .replace(/❌?❌/g, '<i class="fas fa-times-circle mr-1 text-red-500"></i>')
                    .replace(/🔗/g, '<i class="fas fa-link mr-1"></i>')
                    .replace(/\n\n/g, '<br><br>')
                    .replace(/\n/g, '<br>');
                
                statusDiv.innerHTML = `
                    <div class="text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div class="text-red-800 dark:text-red-200 font-mono text-xs leading-relaxed">
                            ${formattedMsg}
                        </div>
                        <button onclick="navigator.clipboard.writeText(\`${errorMsg.replace(/`/g, '\\`')}\`); app.showToast('Erro copiado!', 'success')" 
                            class="mt-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded">
                            <i class="fas fa-copy mr-1"></i> Copiar detalhes
                        </button>
                    </div>
                `;
            }
        }
    };

    app.testarNotificacao = async function() {
        try {
            const userId = app.currentUserData?.id;
            if (!userId) {
                app.showToast('Usuário não identificado', 'error');
                return;
            }

            console.log('🧪 Testando notificação para usuário:', userId);
            app.showToast('Enviando notificação de teste...', 'info');
            
            // Recarregar dados do usuário do Firestore para ter certeza do token
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                app.showToast('Usuário não encontrado no banco', 'error');
                return;
            }
            
            const userData = userDoc.data();
            console.log('👤 Dados do usuário:', {
                fcmToken: userData.fcmToken ? 'PRESENTE (' + userData.fcmToken.substring(0, 20) + '...)' : 'AUSENTE',
                notificationsEnabled: userData.notificationsEnabled
            });
            
            if (!userData.fcmToken) {
                app.showToast('❌?❌ Token FCM não encontrado. Ative as notificações primeiro.', 'warning');
                return;
            }
            
            if (userData.notificationsEnabled === false) {
                app.showToast('❌?❌ Notificações desabilitadas. Ative primeiro.', 'warning');
                return;
            }
            
            console.log('📤 Enviando notificação via Firebase Function...');
            console.log('⚙️? Configurando Firebase Functions...');
            
            // Verificar se Firebase Functions está disponível
            if (!firebase.functions) {
                throw new Error('Firebase Functions não está disponível. Verifique a configuração.');
            }
            
            // Configurar região (use-case para Firebase Functions no Brasil)
            const functions = firebase.functions();
            
            console.log('🌎 Firebase Functions configurado');
            
            // Usar diretamente a Firebase Function
            const sendNotification = functions.httpsCallable('sendNotificationToUser');
            const schoolId = app.activeSchoolId || localStorage.getItem('activeSchoolId') || 'SENATB072';
            
            console.log('📡 Chamando função sendNotificationToUser...');
            
            const result = await sendNotification({
                schoolId,
                userId: userId,
                title: '🔔 Notificação de Teste - SENATEDU',
                body: 'Parabéns! Se você recebeu isto, as notificações estão funcionando perfeitamente! 🎉',
                icon: '/icon-192.png',
                data: {
                    type: 'test',
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                }
            });
            
            console.log('📬 Resultado do envio:', result.data);
            
            if (result.data.success) {
                app.showToast('✅ Notificação de teste enviada! Verifique seu dispositivo em alguns segundos.', 'success');
                console.log('✅ Message ID:', result.data.messageId);
                
                // Criar uma notificação local como fallback para debug
                if ('Notification' in window && Notification.permission === 'granted') {
                    console.log('🔔 Criando notificação local adicional para debug...');
                    
                    // Usar Service Worker Registration se disponível
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification('🔔 Debug: Teste SENATEDU', {
                            body: 'Esta é uma notificação local. A notificação push deve chegar separadamente.',
                            icon: '/icon-192.png',
                            tag: 'test-notification',
                            badge: '/badge-72.png',
                            requireInteraction: false
                        });
                        console.log('✅ Notificação local criada via Service Worker');
                    }).catch(err => {
                        console.warn('⚠️? Não foi possível criar notificação local:', err);
                    });
                }
            } else {
                const reason = result.data.reason || 'unknown';
                const message = result.data.message || 'Não foi possível enviar';
                console.error('❌?❌ Falha ao enviar:', reason, message);
                
                if (reason === 'no-token') {
                    app.showToast('❌?❌ Token FCM não registrado. Ative as notificações.', 'error');
                } else if (reason === 'disabled') {
                    app.showToast('❌?❌ Notificações desabilitadas. Ative nas configurações.', 'error');
                } else {
                    app.showToast('❌?❌ Erro: ' + message, 'error');
                }
            }
        } catch (error) {
            console.error('❌?❌ Erro ao enviar notificação de teste:', error);
            console.error('Detalhes:', {
                code: error.code,
                message: error.message,
                details: error.details
            });
            
            let errorMsg = error.message;
            
            // Mensagens de erro mais amigáveis
            if (error.code === 'functions/not-found') {
                errorMsg = 'Função não encontrada. Verifique se o Firebase Functions está deployado.';
            } else if (error.code === 'functions/permission-denied') {
                errorMsg = 'Permissão negada. Faça login novamente.';
            } else if (error.code === 'functions/unauthenticated') {
                errorMsg = 'Não autenticado. Faça login novamente.';
            }
            
            app.showToast('❌?❌ Erro: ' + errorMsg, 'error');
        }
    };

    app.testarNotificacaoLocal = async function() {
        try {
            console.log('🧪 Testando notificação LOCAL (sem FCM/Backend)...');
            
            if (Notification.permission !== 'granted') {
                app.showToast('❌?❌ Permissões de notificação não concedidas!', 'error');
                return;
            }
            
            const registration = await navigator.serviceWorker.ready;
            
            await registration.showNotification('🔔 Teste LOCAL - SENATEDU', {
                body: '✅ SE VOCÊ VIU ESTA notificação:\n→ O problema NÃO é no navegador/Service Worker\n→ O problema É na entrega do FCM (token expirado, Android bloqueando, etc.)',
                icon: '/icon-192.png',
                badge: '/badge-72.png',
                vibrate: [200, 100, 200, 100, 200],
                requireInteraction: true,
                tag: 'test-local-' + Date.now(),
                data: {
                    type: 'test-local',
                    timestamp: new Date().toISOString()
                }
            });
            
            console.log('✅ Notificação local enviada com sucesso!');
            app.showToast('📱 Notificação LOCAL enviada! Verifique a bandeja do celular.', 'success');
            
            setTimeout(() => {
                app.showToast('💡 Se viu a notificação local mas não vê as do backend: Desative e reative as notificações para gerar novo token.', 'info');
            }, 3000);
            
        } catch (error) {
            console.error('❌?❌ Erro ao enviar notificação local:', error);
            app.showToast('Erro ao enviar notificação local: ' + error.message, 'error');
        }
    };

    // Função global de diagnóstico completo de notificações
    window.diagnosticarNotificacoes = async function() {
        const checks = [];
        let resumo = '';
        let statusGeral = 'OK';
        
        // TESTE 1: Verificar APIs do navegador
        try {
            const notificationAPI = 'Notification' in window;
            const serviceWorkerAPI = 'serviceWorker' in navigator;
            const permission = Notification.permission;
            
            checks.push({
                nome: 'APIs do Navegador',
                ok: notificationAPI && serviceWorkerAPI,
                detalhes: `Notification API: ${notificationAPI ? '✓' : '✗'} | Service Worker: ${serviceWorkerAPI ? '✓' : '✗'} | Permissão: ${permission}`
            });
            
            if (!notificationAPI || !serviceWorkerAPI) statusGeral = 'ERRO';
        } catch (err) {
            checks.push({
                nome: 'APIs do Navegador',
                ok: false,
                detalhes: 'Erro ao verificar: ' + err.message
            });
            statusGeral = 'ERRO';
        }
        
        // TESTE 2: Verificar permissões
        try {
            const permission = Notification.permission;
            const ok = permission === 'granted';
            
            checks.push({
                nome: 'Permissões de Notificação',
                ok: ok,
                detalhes: ok ? 'Concedidas ✓' : `Status: ${permission} - ${permission === 'denied' ? 'BLOQUEADAS pelo usuário!' : 'Ainda não solicitadas'}`
            });
            
            if (!ok && permission === 'denied') statusGeral = 'ERRO';
            if (!ok && permission === 'default') statusGeral = 'ALERTA';
        } catch (err) {
            checks.push({
                nome: 'Permissões de Notificação',
                ok: false,
                detalhes: 'Erro: ' + err.message
            });
            statusGeral = 'ERRO';
        }
        
        // TESTE 3: Verificar Service Worker
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            const hasActive = regs.some(r => r.active?.state === 'activated');
            
            checks.push({
                nome: 'Service Worker',
                ok: hasActive,
                detalhes: `Registrados: ${regs.length} | Ativos: ${hasActive ? 'SIM' : 'NÃO'}`
            });
            
            if (!hasActive) statusGeral = 'ERRO';
        } catch (err) {
            checks.push({
                nome: 'Service Worker',
                ok: false,
                detalhes: 'Erro: ' + err.message
            });
            statusGeral = 'ERRO';
        }
        
        // TESTE 4: Verificar Token FCM no banco
        try {
            const userId = window.app?.currentUserData?.id;
            if (userId) {
                const doc = await db.collection('users').doc(userId).get();
                const user = doc.data();
                const hasToken = !!user?.fcmToken;
                const enabled = user?.notificationsEnabled !== false;
                const tokenValid = user?.fcmToken?.length > 100;
                
                checks.push({
                    nome: 'Token FCM no Banco',
                    ok: hasToken && enabled && tokenValid,
                    detalhes: `Token: ${hasToken ? '✓' : '✗'} | Habilitadas: ${enabled ? '✓' : '✗'} | Válido: ${tokenValid ? '✓' : '✗' }${hasToken ? ' (' + user.fcmToken.length + ' chars)' : ''}`
                });
                
                if (!hasToken || !enabled) statusGeral = statusGeral === 'OK' ? 'ALERTA' : statusGeral;
            } else {
                checks.push({
                    nome: 'Token FCM no Banco',
                    ok: false,
                    detalhes: 'Usuário não está logado'
                });
                statusGeral = 'ERRO';
            }
        } catch (err) {
            checks.push({
                nome: 'Token FCM no Banco',
                ok: false,
                detalhes: 'Erro: ' + err.message
            });
            if (statusGeral === 'OK') statusGeral = 'ALERTA';
        }
        
        // TESTE 5: Verificar HTTPS (para PWA)
        try {
            const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
            
            checks.push({
                nome: 'Protocolo Seguro (HTTPS)',
                ok: isSecure,
                detalhes: `${location.protocol}//${location.hostname} ${isSecure ? '✓' : '✗ (Requer HTTPS para funcionar em produção)'}`
            });
            
            if (!isSecure && location.hostname !== 'localhost') {
                if (statusGeral === 'OK') statusGeral = 'ALERTA';
            }
        } catch (err) {
            checks.push({
                nome: 'Protocolo Seguro',
                ok: false,
                detalhes: 'Erro: ' + err.message
            });
        }
        
        // TESTE 6: Teste de notificação local (se possível)
        try {
            if (Notification.permission === 'granted') {
                await navigator.serviceWorker.ready;
                checks.push({
                    nome: 'Notificação Local (Teste)',
                    ok: true,
                    detalhes: 'Pronto para enviar notificações locais ✓'
                });
            } else {
                checks.push({
                    nome: 'Notificação Local (Teste)',
                    ok: false,
                    detalhes: 'Permissões não concedidas - não é possível testar'
                });
                if (statusGeral === 'OK') statusGeral = 'ALERTA';
            }
        } catch (err) {
            checks.push({
                nome: 'Notificação Local (Teste)',
                ok: false,
                detalhes: 'Erro: ' + err.message
            });
            if (statusGeral === 'OK') statusGeral = 'ALERTA';
        }
        
        // Gerar resumo
        const problems = checks.filter(c => !c.ok).length;
        if (problems === 0) {
            resumo = '✅ Todos os testes passaram! O sistema está configurado corretamente.\n\n';
            resumo += '⚠️? SE AINDA ASSIM as notificações não chegam:\n';
            resumo += '1❌?⃣ Token pode estar expirado → Desative e reative notificações\n';
            resumo += '2❌?⃣ Modo economia de bateria → Desative ou adicione Chrome às exceções\n';
            resumo += '3❌?⃣ Chrome bloqueado pelo Android → Vá em Configurações → Apps → Chrome → Notificações\n';
            resumo += '4❌?⃣ Conexão instável → Verifique se há internet no momento do envio\n';
            resumo += '5❌?⃣ Clique no botão "Testar" para verificar se o backend está funcionando\n';
        } else {
            resumo = `⚠️? ${problems} problema(s) detectado(s). Veja os detalhes acima.\n\n`;
            
            // Sugestões específicas
            if (checks.find(c => c.nome.includes('Permissões') && !c.ok)) {
                resumo += '💡 Clique em "Ativar Notificações" para conceder permissões.\n';
            }
            if (checks.find(c => c.nome.includes('Service Worker') && !c.ok)) {
                resumo += '💡 Recarregue a página (F5) e tente ativar novamente.\n';
            }
            if (checks.find(c => c.nome.includes('Token FCM') && !c.ok)) {
                resumo += '💡 Desative e reative as notificações para gerar novo token.\n';
            }
            if (checks.find(c => c.nome.includes('HTTPS') && !c.ok)) {
                resumo += '💡 Este site precisa estar em HTTPS para notificações funcionarem.\n';
            }
        }
        
        return { checks, resumo, statusGeral };
    };

    app.diagnosticarNotificacoes = async function() {
        try {
            app.showToast('Executando diagnóstico...', 'info');
            
            const result = await window.diagnosticarNotificacoes();
            
            // Montar mensagem com resultado
            let mensagem = `📋 DIAGNÓSTICO DE NOTIFICAÇÕES\n`;
            mensagem += `${'='.repeat(40)}\n\n`;
            
            result.checks.forEach(check => {
                const icon = check.ok ? '✅' : '❌?❌';
                mensagem += `${icon} ${check.nome}\n`;
                mensagem += `   ${check.detalhes}\n\n`;
            });
            
            mensagem += `${'='.repeat(40)}\n`;
            mensagem += `${result.resumo}\n`;
            mensagem += `Status: ${result.statusGeral}`;
            
            // Mostrar em modal
            app.showModal('Diagnóstico do Sistema de Notificações', 
                `<pre class="bg-gray-100 dark:bg-slate-700 p-4 rounded-lg overflow-x-auto text-xs whitespace-pre">${mensagem}</pre>`,
                null,
                { confirmText: 'Fechar', showCancel: false }
            );
            
            // Também exibir toast com resultado geral
            if (result.statusGeral === 'OK') {
                app.showToast('✅ Todo o sistema está OK!', 'success');
            } else {
                const problemasCount = result.checks.filter(c => !c.ok).length;
                app.showToast(`⚠️? ${problemasCount} problema(s) detectado(s). Veja os detalhes.`, 'warning');
            }
        } catch (error) {
            console.error('Erro ao executar diagnóstico:', error);
            app.showToast('Erro ao executar diagnóstico: ' + error.message, 'error');
        }
    };

    app.testarEmail = async function() {
        try {
            // Obter email do usuário atual
            const user = auth.currentUser;
            if (!user) {
                app.showToast('Você precisa estar logado!', 'error');
                return;
            }

            const userEmail = user.email || app.currentUserData?.email;
            if (!userEmail) {
                app.showToast('Email do usuário não encontrado!', 'error');
                return;
            }

            const schoolId = store.activeSchoolId || app.currentUserData?.schoolId || app.currentUserData?.escolaId;
            if (!schoolId) {
                app.showToast('Escola ativa não encontrada. Selecione uma escola e tente novamente.', 'error');
                return;
            }

            app.showToast('📧 Enviando email de teste...', 'info');

            // Obter token de autenticação
            const idToken = await auth.currentUser.getIdToken();

            // Chamar HTTP Function com Bearer token
            const response = await fetch('https://us-central1-educloud-sistema.cloudfunctions.net/sendEmailHttp', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Content-Type': 'application/json',
                    'x-school-id': schoolId
                },
                body: JSON.stringify({
                    schoolId,
                    to: userEmail,
                    subject: 'Teste SENATEDU - Sistema de Email Funcional! ✅',
                    html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #4CAF50; color: white; padding: 30px 20px; border-radius: 5px 5px 0 0; text-align: center; }
                            .content { background: #f9f9f9; padding: 30px 20px; border: 1px solid #ddd; }
                            .success-icon { font-size: 48px; margin-bottom: 10px; }
                            .button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; 
                                      border-radius: 5px; display: inline-block; margin: 15px 0; font-weight: bold; }
                            .footer { background: #f1f1f1; padding: 15px; border-radius: 0 0 5px 5px; 
                                      font-size: 12px; color: #666; text-align: center; }
                            .info-box { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <div class="success-icon">✅</div>
                                <h1 style="margin: 0;">Sistema de Email Funcionando!</h1>
                            </div>
                            <div class="content">
                                <h2>Olá, ${app.currentUserData?.nome || 'Usuário'}! 👋</h2>
                                <p>Este é um email de <strong>teste</strong> do sistema SENATEDU.</p>
                                <p>Se você está lendo esta mensagem, significa que o <strong>envio de emails via SendGrid está funcionando perfeitamente!</strong></p>
                                
                                <div class="info-box">
                                    <strong>📋 Detalhes do Teste:</strong>
                                    <ul style="margin: 10px 0; padding-left: 20px;">
                                        <li>Enviado em: ${new Date().toLocaleString('pt-BR')}</li>
                                        <li>Destinatário: ${userEmail}</li>
                                        <li>Sistema: SENATEDU v2.0</li>
                                        <li>Provider: SendGrid (via Firebase Functions)</li>
                                    </ul>
                                </div>

                                <p>A partir de agora, você receberá notificações por email quando:</p>
                                <ul>
                                    <li>📝 Uma nova prova for publicada</li>
                                    <li>📚 Uma nova atividade EAD for disponibilizada</li>
                                    <li>📢 Avisos importantes forem postados</li>
                                </ul>

                                <p style="text-align: center;">
                                    <a href="https://educloud-sistema.web.app" class="button">Acessar Sistema</a>
                                </p>
                            </div>
                            <div class="footer">
                                <p><strong>SENATEDU - Sistema de Gestão Escolar</strong></p>
                                <p>Esta é uma mensagem automática. Por favor, não responda este email.</p>
                                <p>Se você tiver dúvidas, entre em contato com o administrador do sistema.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
                })
            });

            if (!response.ok) {
                let errorData = null;
                try {
                    errorData = await response.json();
                } catch (_e) {
                    errorData = null;
                }
                throw new Error(
                    errorData?.message
                    || errorData?.error
                    || `HTTP error! status: ${response.status}`
                );
            }

            const result = await response.json();

            console.log('✅ Email enviado com sucesso:', result);
            
            app.showModal(
                '✅ Email Enviado com Sucesso!',
                `
                <div class="text-center py-4">
                    <div class="text-6xl mb-4">📧</div>
                    <p class="text-lg mb-4">Email de teste enviado para:</p>
                    <p class="font-bold text-xl text-blue-600 dark:text-blue-400 mb-4">${userEmail}</p>
                    <div class="bg-gray-100 dark:bg-slate-700 rounded-lg p-4 text-sm text-left">
                        <p class="font-semibold mb-2">Informações do envio:</p>
                        <ul class="space-y-1 text-gray-600 dark:text-gray-300">
                            <li>✅ <strong>Status:</strong> Enviado com sucesso</li>
                            <li>📬 <strong>Message ID:</strong> ${result.messageId}</li>
                            <li>🎯 <strong>Aceito por:</strong> ${result.accepted?.join(', ') || userEmail}</li>
                        </ul>
                    </div>
                    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Verifique sua caixa de entrada (e spam) em alguns segundos.
                    </p>
                </div>
                `,
                null,
                { confirmText: 'OK', showCancel: false }
            );
            
            app.showToast('Email enviado! Verifique sua caixa de entrada.', 'success');
        } catch (error) {
            console.error('❌ Erro ao enviar email:', error);
            
            let mensagemErro = 'Erro ao enviar email';
            if (error.message) {
                mensagemErro = error.message;
            }
            
            app.showToast('❌ ' + mensagemErro, 'error');
            
            app.showModal(
                '❌ Erro ao Enviar Email',
                `
                <div class="text-center py-4">
                    <div class="text-6xl mb-4">⚠️?</div>
                    <p class="text-lg mb-4">Não foi possível enviar o email de teste.</p>
                    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-sm text-left">
                        <p class="font-semibold mb-2 text-red-800 dark:text-red-200">Detalhes do erro:</p>
                        <p class="text-red-600 dark:text-red-300 font-mono text-xs">${mensagemErro}</p>
                    </div>
                    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Entre em contato com o administrador do sistema se o problema persistir.
                    </p>
                </div>
                `,
                null,
                { confirmText: 'OK', showCancel: false }
            );
        }
    };

    app.salvarDadosCadastro = async function() {
        const userId = app.currentUserData?.id;
        if (!userId) return alert('Erro: Usuário não identificado.');

        const nome = document.getElementById('cadastro-nome').value.trim();
        const endereco = document.getElementById('cadastro-endereco').value.trim();
        const whatsapp = document.getElementById('cadastro-whatsapp').value.trim();

        if (!nome) return alert('Nome é obrigatório.');

        try {
            await db.collection('users').doc(userId).update({
                nome,
                endereco,
                whatsapp,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Atualiza os dados locais
            app.currentUserData.nome = nome;
            app.currentUserData.endereco = endereco;
            app.currentUserData.whatsapp = whatsapp;

            if (app.invalidateUsersCache) app.invalidateUsersCache();
            if (app.logAcesso) app.logAcesso('cadastro_atualizado', 'Dados pessoais');

            app.showToast('Informações salvas com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao salvar dados:', error);
            alert('Erro ao salvar: ' + error.message);
        }
    };

    app.alterarEmail = async function() {
        const novoEmail = document.getElementById('cadastro-novo-email').value.trim();
        const senhaAtual = document.getElementById('cadastro-senha-confirma-email').value.trim();
        const userId = app.currentUserData?.id;

        if (!novoEmail) return alert('Digite o novo email.');
        if (!senhaAtual) return alert('Digite sua senha atual para confirmar.');
        if (!userId) return alert('Erro: Usuário não identificado.');

        if (!novoEmail.includes('@')) return alert('Email inválido.');

        if (!confirm('Tem certeza que deseja alterar seu email? Você precisará fazer login novamente.')) return;

        try {
            const user = firebase.auth().currentUser;
            if (!user) return alert('Usuário não autenticado.');

            // Reautenticação
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
            await user.reauthenticateWithCredential(credential);

            // Atualiza email no Firebase Auth
            await user.updateEmail(novoEmail);

            // Atualiza email no Firestore
            await db.collection('users').doc(userId).update({
                email: novoEmail,
                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (app.invalidateUsersCache) app.invalidateUsersCache();
            if (app.logAcesso) app.logAcesso('email_alterado', `Novo: ${novoEmail}`);

            alert('Email alterado com sucesso! Você será desconectado. Faça login novamente com o novo email.');
            
            // Desloga o usuário
            await firebase.auth().signOut();
        } catch (error) {
            console.error('Erro ao alterar email:', error);
            let mensagem = 'Erro ao alterar email: ';
            
            if (error.code === 'auth/wrong-password') {
                mensagem += 'Senha incorreta.';
            } else if (error.code === 'auth/email-already-in-use') {
                mensagem += 'Este email já está em uso.';
            } else if (error.code === 'auth/invalid-email') {
                mensagem += 'Email inválido.';
            } else if (error.code === 'auth/requires-recent-login') {
                mensagem += 'Por segurança, faça login novamente antes de alterar o email.';
            } else {
                mensagem += error.message;
            }
            
            alert(mensagem);
        }
    };

    app.alterarSenha = async function() {
        const senhaAtual = document.getElementById('cadastro-senha-atual').value.trim();
        const senhaNova = document.getElementById('cadastro-senha-nova').value.trim();
        const senhaNovaConfirma = document.getElementById('cadastro-senha-nova-confirma').value.trim();

        if (!senhaAtual) return alert('Digite sua senha atual.');
        if (!senhaNova) return alert('Digite a nova senha.');
        if (!senhaNovaConfirma) return alert('Confirme a nova senha.');
        
        if (senhaNova.length < 6) return alert('A nova senha deve ter pelo menos 6 caracteres.');
        if (senhaNova !== senhaNovaConfirma) return alert('As senhas não coincidem.');

        try {
            const user = firebase.auth().currentUser;
            if (!user) return alert('Usuário não autenticado.');

            // Reautenticação
            const credential = firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
            await user.reauthenticateWithCredential(credential);

            // Atualiza senha
            await user.updatePassword(senhaNova);

            if (app.logAcesso) app.logAcesso('senha_alterada', 'Senha atualizada');

            // Limpa os campos
            document.getElementById('cadastro-senha-atual').value = '';
            document.getElementById('cadastro-senha-nova').value = '';
            document.getElementById('cadastro-senha-nova-confirma').value = '';

            app.showToast('Senha alterada com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao alterar senha:', error);
            let mensagem = 'Erro ao alterar senha: ';
            
            if (error.code === 'auth/wrong-password') {
                mensagem += 'Senha atual incorreta.';
            } else if (error.code === 'auth/weak-password') {
                mensagem += 'Senha muito fraca.';
            } else if (error.code === 'auth/requires-recent-login') {
                mensagem += 'Por segurança, faça login novamente antes de alterar a senha.';
            } else {
                mensagem += error.message;
            }
            
            alert(mensagem);
        }
    };
}