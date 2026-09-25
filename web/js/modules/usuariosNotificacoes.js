import { collection } from '../services/db.js';
import { sendNotificationEmailV2 } from '../services/email.js';

export function extendUsuariosNotificacoes(app) {
    app.renderNotificacoes = async function(container) {
        if (!app.currentUserData || !(app.perms && (app.perms.hasRole('admin', 'professor')))) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito.</div>';
            return;
        }

        const allTurmas = await app.getCollection('turmas');
        const turmasAtivas = allTurmas.filter(t => !t.concluida);
        const componentes = await app.getComponentesCache();

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

                <div class="p-6">
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
                                <input type="text" id="notif-individual-title" placeholder="Ex: Novo Simulado Disponivel" class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="50">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-2 dark:text-gray-300">Mensagem</label>
                                <textarea id="notif-individual-body" rows="4" placeholder="Ex: Um novo simulado de Matematica esta disponivel para voce." class="w-full p-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" maxlength="200"></textarea>
                            </div>
                            <button onclick="app.sendIndividualNotification()" class="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                                <i class="fas fa-paper-plane mr-2"></i>Enviar Notificação
                            </button>
                        </div>
                    </div>

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

            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <h3 class="text-lg font-bold mb-4 dark:text-white flex items-center gap-2">
                    <i class="fas fa-history text-blue-600"></i> Histórico Recente
                </h3>
                <div id="notification-history" class="space-y-2 max-h-96 overflow-y-auto">
                    <p class="text-gray-500 dark:text-gray-400 text-center py-4">Carregando histórico...</p>
                </div>
            </div>
        `;

        setTimeout(async () => {
            const alunos = (await app.getCollection('users')).filter(u => u.tipo === 'aluno').sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            const selectAluno = document.getElementById('notif-individual-aluno');
            if (selectAluno) {
                selectAluno.innerHTML = '<option value="">Selecione um aluno...</option>' +
                    alunos.map(a => `<option value="${a.id}">${app.escapeHtml(a.nome || a.email)}</option>`).join('');
            }

            app.loadNotificationHistory();
        }, 100);
    };

    app.showNotificationTab = function(tabName) {
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

            const notifications = await collection('notifications')
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
}
