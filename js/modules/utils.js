import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendUtils(app) {
    app.formatTurmaLabelText = function(turma, fallback = 'Turma', multiline = false) {
        if (!turma) return fallback;
        const nome = String(turma.nome || '').trim();
        const sigop = String(turma.sigop || '').trim();
        if (!nome && sigop) return `SIGOP: ${sigop}`;
        if (!nome) return fallback;
        if (!sigop) return nome;
        return multiline ? `${nome}\nSIGOP: ${sigop}` : `${nome} - SIGOP: ${sigop}`;
    };

    app.formatTurmaLabelHtml = function(turma, fallback = 'Turma') {
        if (!turma) return app.escapeHtml(fallback);
        const nome = String(turma.nome || '').trim();
        const sigop = String(turma.sigop || '').trim();
        const safeNome = app.escapeHtml(nome || fallback);
        if (!sigop) return safeNome;
        return `${safeNome}<div class="text-xs text-gray-500 dark:text-gray-300">SIGOP: ${app.escapeHtml(sigop)}</div>`;
    };

    app.formatTurmaTextToHtml = function(label, fallback = 'Turma') {
        const safe = app.escapeHtml(label || fallback);
        return safe.replace(/\n/g, '<br>');
    };

    app.formatTurmaLabel = function(turma, fallback = 'Turma') {
        return app.formatTurmaLabelText(turma, fallback, false);
    };

    app.getUserRole = function() {
        return String(app.currentUserData?.tipo || '').trim().toLowerCase();
    };

    app.getComponentesCache = async function() {
        if (Array.isArray(app._componentesCache)) return app._componentesCache;
        const comps = await app.getCollection('componentes');
        app._componentesCache = comps;
        return comps;
    };

    app.componentHasProfessor = function(comp, userId) {
        if (!comp || !userId) return false;
        if (Array.isArray(comp.professores) && comp.professores.includes(userId)) return true;
        if (Array.isArray(comp.professorIds) && comp.professorIds.includes(userId)) return true;
        if (comp.professorId && comp.professorId === userId) return true;
        if (comp.professorUid && comp.professorUid === userId) return true;
        return false;
    };

    app.getProfessorTurmaIdsFromComponentes = function(componentes, userId) {
        const ids = new Set();
        if (!Array.isArray(componentes)) return ids;
        componentes.forEach(comp => {
            if (!comp || !comp.turmaId) return;
            if (app.componentHasProfessor(comp, userId)) ids.add(comp.turmaId);
        });
        return ids;
    };

    app.filterTurmasByProfessor = function(turmas, componentes, userId) {
        if (!Array.isArray(turmas)) return [];
        const uid = userId || app.currentUserData?.id;
        if (!uid) return [];
        const direct = turmas.filter(t => Array.isArray(t.professores) && t.professores.includes(uid));
        if (!Array.isArray(componentes)) return direct;
        const compTurmas = app.getProfessorTurmaIdsFromComponentes(componentes, uid);
        const merged = new Map();
        direct.forEach(t => merged.set(t.id, t));
        turmas.forEach(t => { if (compTurmas.has(t.id)) merged.set(t.id, t); });
        return Array.from(merged.values());
    };

    app.formatToastMessage = function(message, counts = null) {
        let text = String(message || '').trim();
        if (!text) text = 'Aviso';
        if (!/[.!?]$/.test(text)) text += '.';
        const parts = [];
        if (counts && typeof counts === 'object') {
            Object.entries(counts).forEach(([label, value]) => {
                if (value === undefined || value === null) return;
                parts.push(`${label}: ${value}.`);
            });
        }
        if (parts.length > 0) text = `${text} ${parts.join(' ')}`.trim();
        return text;
    };

    app.toast = function(type, message, counts = null) {
        const text = app.formatToastMessage(message, counts);
        if (app.showToast) app.showToast(text, type || 'info');
        else alert(text);
    };

    app.toastError = function(context, err) {
        const detail = err && err.message ? err.message : (err ? String(err) : '');
        const message = detail ? `${context}: ${detail}` : context;
        app.toast('error', `Erro: ${message}`);
    };

    app.notifyAlunosTurma = async function(turmaId, assunto, mensagem, options = {}) {
        if (!turmaId) return;
        try {
            const [turmas, users] = await Promise.all([
                app.getCollection('turmas'),
                app.getCollection('users')
            ]);
            const turma = turmas.find(t => t.id === turmaId);
            const turmaLabel = (options.turmaNome
                || (turma ? app.formatTurmaLabelText(turma, 'Turma', true) : 'Turma'))
                .replace(/\n/g, ' ');
            const alunoIds = turma && Array.isArray(turma.alunos) ? turma.alunos : [];
            const alunos = users.filter(u => u.tipo === 'aluno' && alunoIds.includes(u.id));
            
            if (alunos.length === 0) return;

            // Verificar se e-mails estão habilitados (pode desabilitar se atingir limite do EmailJS)
            const emailsHabilitados = localStorage.getItem('sendEmails') !== 'false';
            
            // Enviar emails (se habilitado)
            if (emailsHabilitados) {
                const alunosComEmail = alunos.filter(a => a.email);
                if (alunosComEmail.length > 0) {
                    console.log(`📧 Enviando e-mails para ${alunosComEmail.length} alunos...`);
                    const results = await Promise.allSettled(alunosComEmail.map(a =>
                        sendNotificationEmailV2(
                            a.email,
                            a.nome || 'Aluno',
                            assunto,
                            mensagem,
                            { turma: turmaLabel, link: options.link || '' }
                        )
                    ));
                    
                    const emailsSuccess = results.filter(r => r.status === 'fulfilled').length;
                    const emailsFailed = results.filter(r => r.status === 'rejected').length;
                    
                    console.log(`✅ E-mails enviados: ${emailsSuccess} sucesso, ${emailsFailed} falhas`);
                    
                    if (emailsFailed > 0) {
                        console.warn(`⚠�? ${emailsFailed} e-mails falharam`);
                    }
                }
            } else {
                console.log('ℹ�? Envio de e-mails desabilitado (apenas notificações push)');
            }

            // Enviar notificações push para celulares (sempre habilitado)
            const alunosComToken = alunos.filter(a => a.fcmToken && a.notificationsEnabled !== false);
            if (alunosComToken.length > 0) {
                console.log(`📱 Enviando notificações push para ${alunosComToken.length} alunos...`);
                
                try {
                    const sendNotificationToMultiple = firebase.functions().httpsCallable('sendNotificationToMultipleUsers');
                    const result = await sendNotificationToMultiple({
                        userIds: alunosComToken.map(a => a.id),
                        title: assunto,
                        body: mensagem,
                        icon: '/icon-192.png',
                        data: {
                            turmaId: turmaId,
                            type: options.notificationType || 'prova',
                            url: options.link || window.location.href
                        }
                    });
                    
                    console.log(`✅ Notificações push enviadas:`, result.data);
                    console.log(`   Sucesso: ${result.data.success}`);
                    console.log(`   Falhas: ${result.data.failed}`);
                    console.log(`   Sem token: ${result.data.noToken}`);
                    console.log(`   Desabilitadas: ${result.data.disabled}`);
                } catch (pushError) {
                    console.warn('⚠�? Erro ao enviar notificações push:', pushError);
                    // Não falhar se notificações push não funcionarem
                }
            } else {
                console.log('ℹ�? Nenhum aluno com notificações ativadas encontrado');
            }
        } catch (err) {
            console.warn('Falha ao notificar alunos:', err);
        }
    };

    app.notifyAluno = async function(alunoId, assunto, mensagem, options = {}) {
        if (!alunoId) return;
        try {
            const users = await app.getCollection('users');
            const aluno = users.find(u => u.id === alunoId);
            
            if (!aluno) return;

            const turmaLabel = options.turmaNome || '';
            const emailsHabilitados = localStorage.getItem('sendEmails') !== 'false';

            // Enviar email se aluno tiver email e emails estiverem habilitados
            if (emailsHabilitados && aluno.email) {
                console.log(`📧 Enviando e-mail para ${aluno.nome}...`);
                try {
                    await sendNotificationEmailV2(
                        aluno.email,
                        aluno.nome || 'Aluno',
                        assunto,
                        mensagem,
                        { turma: turmaLabel, link: options.link || '' }
                    );
                    console.log(`✅ E-mail enviado com sucesso`);
                } catch (emailError) {
                    console.warn('⚠�? Erro ao enviar e-mail:', emailError);
                }
            }

            // Enviar notificação push se aluno tiver token
            if (aluno.fcmToken && aluno.notificationsEnabled !== false) {
                console.log(`📱 Enviando notificação push para ${aluno.nome}...`);
                
                try {
                    const sendNotificationToUser = firebase.functions().httpsCallable('sendNotificationToUser');
                    const result = await sendNotificationToUser({
                        userId: alunoId,
                        title: assunto,
                        body: mensagem,
                        icon: '/icon-192.png',
                        data: {
                            type: options.notificationType || 'aviso',
                            url: options.link || window.location.href
                        }
                    });
                    
                    console.log(`✅ Notificação push enviada:`, result.data);
                } catch (pushError) {
                    console.warn('⚠�? Erro ao enviar notificação push:', pushError);
                }
            }
        } catch (err) {
            console.warn('Falha ao notificar aluno:', err);
        }
    };

    app.logAcesso = async function(acao, detalhes = '') {
        if (!app.currentUserData) return;
        const payload = {
            userId: app.currentUserData.id,
            userNome: app.currentUserData.nome || 'Usuario',
            userTipo: app.getUserRole() || 'indefinido',
            acao: acao || 'acao',
            detalhes: detalhes || '',
            data: firebase.firestore.FieldValue.serverTimestamp()
        };
        try {
            await db.collection('logs_acesso').add(payload);
        } catch (err) {
            console.warn('Falha ao registrar acesso:', err);
        }
    };

    app.exportRelatoriosExcel = function(rows, filename = 'Relatorio_Acessos.xlsx') {
        if (!Array.isArray(rows) || rows.length === 0) return alert('Nao ha dados para exportar.');
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Acessos');
        XLSX.writeFile(wb, filename);
    };

    if (!app._logHooksInit) {
        const originalLogout = app.logout ? app.logout.bind(app) : null;
        if (originalLogout) {
            app.logout = async function() {
                await app.logAcesso('logout', 'auth');
                originalLogout();
            };
        }
        const originalNavigate = app.navigate ? app.navigate.bind(app) : null;
        if (originalNavigate) {
            app.navigate = function(view) {
                originalNavigate(view);
                app.logAcesso('navegar', view);
            };
        }
        app._logHooksInit = true;
    }

}