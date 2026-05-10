import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendComunicacao(app) {
    app.modalAviso = async function(id = null, options = {}) {
        let aviso = null;
        if (id) {
            const doc = await db.collection('avisos').doc(id).get();
            aviso = { id: doc.id, ...doc.data() };
        }
        const targetAlunoId = options.alunoId || (aviso && aviso.tipo === 'aluno' ? aviso.alunoId : null);
        const targetAlunoNome = options.alunoNome || (aviso && aviso.tipo === 'aluno' ? aviso.alunoNome : null);
        const targetTurmaId = options.turmaId || (aviso && aviso.tipo === 'aluno' ? aviso.turmaId : null);
        const targetTurmaNome = options.turmaNome || (aviso && aviso.tipo === 'aluno' ? aviso.turmaNome : null);
        const turmas = await app.getCollection('turmas');
        let turmasOpcoes = turmas;
        if (app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            turmasOpcoes = app.filterTurmasByProfessor(turmas, componentes);
        }
        const safeAlunoNome = app.escapeHtml(targetAlunoNome || 'Aluno');
        const alunoOption = targetAlunoId ? `<option value="aluno:${targetAlunoId}" selected>Aluno: ${safeAlunoNome}</option>` : '';
        const selectDisabled = targetAlunoId ? 'disabled' : '';
        const selectHelp = targetAlunoId ? '<p class="text-xs text-gray-500 mt-1">Aviso privado para este aluno.</p>' : '';
        const optionGeral = app.perms && app.perms.isAdmin() ? '<option value="geral">Geral (Toda a Escola)</option>' : '';
        const optionColab = !app.perms || !app.perms.isAluno() ? '<option value="colaboradores">Colaboradores (Admins e Professores)</option>' : '';
        const content = `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-bold mb-1">Titulo</label>
                    <input id="aviso-titulo" value="${aviso ? aviso.titulo : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Destino</label>
                    <select id="aviso-destino" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${selectDisabled}>
                        ${alunoOption}
                        ${optionGeral}
                        ${optionColab}
                        ${turmasOpcoes.map(t => `<option value="${t.id}" ${aviso && aviso.turmaId === t.id ? 'selected' : ''}>${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('')}
                    </select>
                    ${selectHelp}
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Conteudo</label>
                    <textarea id="aviso-conteudo" rows="4" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">${aviso ? aviso.conteudo : ''}</textarea>
                </div>
            </div>
        `;
        app.showModal(id ? 'Editar Aviso' : 'Novo Aviso', content, async () => {
            const titulo = document.getElementById('aviso-titulo').value;
            const destino = document.getElementById('aviso-destino').value;
            const conteudo = document.getElementById('aviso-conteudo').value;
            if (!titulo || !conteudo) throw new Error('Preencha todos os campos.');
            let tipo = 'turma';
            if (destino === 'geral') tipo = 'geral';
            else if (destino === 'colaboradores') tipo = 'colaboradores';
            else if (destino && destino.startsWith('aluno:')) tipo = 'aluno';
            const data = {
                titulo,
                conteudo,
                autorId: app.currentUserData.id,
                autorNome: app.currentUserData.nome,
                tipo,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (tipo === 'turma') {
                data.turmaId = destino;
                const turmaObj = turmasOpcoes.find(t => t.id === destino);
                data.turmaNome = turmaObj ? app.formatTurmaLabelText(turmaObj, 'Turma', true) : 'Turma';
            }
            if (tipo === 'aluno') {
                const alunoId = destino.split(':')[1];
                if (!alunoId) throw new Error('Aluno inválido para aviso.');
                data.alunoId = alunoId;
                data.alunoNome = targetAlunoNome || (aviso ? aviso.alunoNome : null) || 'Aluno';
                data.turmaId = targetTurmaId || (aviso ? aviso.turmaId : null) || null;
                data.turmaNome = targetTurmaNome || (aviso ? aviso.turmaNome : null) || null;
            }
            if (id) await db.collection('avisos').doc(id).update(data);
            else {
                await db.collection('avisos').add({ ...data, leituras: [] });
                if (tipo === 'turma' && data.turmaId) {
                    const assunto = `Novo aviso da turma ${data.turmaNome || 'Turma'}`;
                    const mensagem = `${titulo}\n\n${conteudo}`;
                    app.notifyAlunosTurma(data.turmaId, assunto, mensagem, { turmaNome: data.turmaNome });
                }
                // Enviar notificação para aluno individual
                if (tipo === 'aluno' && data.alunoId) {
                    const assunto = `Novo aviso para você`;
                    const mensagem = `${titulo}\n\n${conteudo}`;
                    app.notifyAluno(data.alunoId, assunto, mensagem, { turmaNome: data.turmaNome });
                }
            }
            app.renderContent();
        });
    };

    app.modalAvisoAluno = function(alunoId, alunoNome, turmaId, turmaNome) {
        if (!alunoId) return;
        app.modalAviso(null, { alunoId, alunoNome, turmaId, turmaNome });
    };

    app.verLeituras = async function(avisoId) {
        const doc = await db.collection('avisos').doc(avisoId).get();
        const leituras = doc.data().leituras || [];
        const users = await app.getCollection('users');
        const buttons = document.querySelectorAll(`[data-aviso-leituras="${avisoId}"]`);
        buttons.forEach((btn) => {
            btn.innerHTML = `<i class="fas fa-eye"></i> ${leituras.length} Leituras`;
        });
        const html = leituras.length === 0
            ? '<p>Ninguem leu ainda.</p>'
            : `<ul class="space-y-2">${leituras.map(l => {
                const uid = l.userId || l.alunoId;
                const u = users.find(user => user.id === uid);
                const nome = u ? u.nome : (l.userNome || 'Usuario Excluido');
                const tipo = u ? u.tipo : (l.userTipo || 'indefinido');
                const data = new Date(l.data).toLocaleDateString() + ' ' + new Date(l.data).toLocaleTimeString();
                return `<li class="text-sm border-b pb-1 flex justify-between"><span>${nome} <span class="text-xs text-gray-400">(${tipo})</span></span> <span class="text-gray-400 text-xs">${data}</span></li>`;
            }).join('')}</ul>`;
        app.showModal('Leituras do Aviso', html, async () => {});
    };

    app.marcarLeitura = async function(avisoId) {
        const docRef = db.collection('avisos').doc(avisoId);
        const doc = await docRef.get();
        const leituras = doc.data().leituras || [];
        const uid = app.currentUserData.id;
        const jaLeu = leituras.find(l => (l.userId || l.alunoId) === uid);
        if (!jaLeu) {
            const leitura = {
                userId: uid,
                userNome: app.currentUserData.nome || 'Usuario',
                userTipo: app.getUserRole() || 'indefinido',
                data: new Date().toISOString()
            };
            if (app.perms && app.perms.isAluno()) leitura.alunoId = uid;
            leituras.push(leitura);
            await docRef.update({ leituras });
            app.logAcesso('leitura_aviso', `aviso:${avisoId}`);
            app.renderContent();
        }
    };
    app.modalEventoCalendario = async function(editId = null) {
        const turmas = await app.getCollection('turmas');
        let eventEdit = null;
        if (editId) {
            const doc = await db.collection('eventos_calendario').doc(editId).get();
            if (doc.exists) eventEdit = { id: doc.id, ...doc.data() };
        }

        const tipoOptions = ['evento','feriado','recesso','trabalho','atividade'];

        const content = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold mb-1">Título</label>
                        <input id="evt-titulo" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${eventEdit ? eventEdit.titulo : ''}">
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">Data e Hora</label>
                        <input id="evt-data" type="datetime-local" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${eventEdit ? (eventEdit.data || '') : ''}">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-bold mb-1">Tipo</label>
                        <select id="evt-tipo" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="">Selecione...</option>
                            ${tipoOptions.map(t => `<option value="${t}" ${eventEdit && eventEdit.tipo === t ? 'selected' : ''}>${app.capitalize(t)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-bold mb-1">Turma (opcional)</label>
                        <select id="evt-turma" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="">Geral</option>
                            ${turmas.map(t => `<option value="${t.id}" ${eventEdit && eventEdit.turmaId === t.id ? 'selected' : ''}>${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-bold mb-1">Descrição</label>
                    <textarea id="evt-conteudo" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" rows="4">${eventEdit ? (eventEdit.conteudo || '') : ''}</textarea>
                </div>
                <div id="evt-list" class="space-y-2 pt-2 border-t dark:border-slate-600"></div>
            </div>
        `;

        app.showModal(editId ? 'Editar Evento' : 'Gerenciar Agenda', content, async () => {
            const isEdit = Boolean(editId && eventEdit);
            const tituloInput = document.getElementById('evt-titulo').value.trim();
            const dataInput = document.getElementById('evt-data').value;
            const tipoInput = document.getElementById('evt-tipo').value;
            const turmaId = document.getElementById('evt-turma').value || null;
            const conteudo = document.getElementById('evt-conteudo').value.trim();

            const titulo = tituloInput || (isEdit ? (eventEdit.titulo || '') : '');
            const data = dataInput || (isEdit ? (eventEdit.data || '') : '');
            const tipo = tipoInput || (isEdit ? (eventEdit.tipo || '') : '');

            if (!titulo || !data || !tipo) throw new Error('Preencha Título, Data e Tipo.');

            const payload = { titulo, data, tipo, turmaId, conteudo, criadoEm: firebase.firestore.FieldValue.serverTimestamp() };
            if (editId) {
                await db.collection('eventos_calendario').doc(editId).update(payload);
                app.showToast('Evento atualizado', 'success');
            } else {
                await db.collection('eventos_calendario').add(payload);
                app.showToast('Evento criado', 'success');
                if (turmaId && (tipo === 'trabalho' || tipo === 'atividade')) {
                    const turmaObj = turmas.find(t => t.id === turmaId);
                    const turmaNome = turmaObj ? app.formatTurmaLabelText(turmaObj, 'Turma', true) : 'Turma';
                    const tipoLabel = tipo === 'trabalho' ? 'Trabalho' : 'Atividade';
                    app.notifyAlunosTurma(turmaId, `Novo ${tipoLabel}: ${titulo}`, `${turmaNome}\n\n${titulo}${conteudo ? '\n\n' + conteudo : ''}`, { turmaNome, notificationType: tipo });
                }
            }
            app.renderContent();
        });

        // render current events list inside modal (admin view)
        const listDiv = document.getElementById('evt-list');
        if (!listDiv) return;
        listDiv.innerHTML = '<div class="flex items-center justify-center py-6"><div class="loading"></div></div>';
        try {
            const snap = await db.collection('eventos_calendario').orderBy('data', 'desc').get();
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (items.length === 0) listDiv.innerHTML = '<p class="text-sm text-gray-500">Nenhum evento cadastrado.</p>';
            else {
                listDiv.innerHTML = items.map(ev => {
                    const turmaNome = ev.turmaId ? (app.formatTurmaLabelText(turmas.find(t => t.id === ev.turmaId), 'Turma', true) || 'Turma') : 'Geral';
                    const turmaNomeHtml = app.formatTurmaTextToHtml(turmaNome);
                    return `
                        <div class="flex justify-between items-start p-2 border rounded dark:border-slate-700 bg-white dark:bg-slate-800">
                            <div>
                                <div class="font-bold">${ev.titulo} <span class="text-xs text-gray-400">• ${app.capitalize(ev.tipo)}</span></div>
                                <div class="text-xs text-gray-500">${new Date(ev.data).toLocaleString()} • ${turmaNomeHtml}</div>
                                <div class="text-sm text-gray-600 dark:text-gray-300 mt-1">${ev.conteudo || ''}</div>
                            </div>
                            <div class="flex flex-col gap-2 ml-4">
                                <button onclick="app.modalEventoCalendario('${ev.id}')" class="text-blue-600 hover:text-blue-800 text-sm">Editar</button>
                                <button onclick="app.deleteEventoCalendario('${ev.id}')" class="text-red-600 hover:text-red-800 text-sm">Excluir</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (err) { listDiv.innerHTML = `<div class="text-sm text-red-500">Erro ao carregar: ${err.message}</div>`; }
    };

    app.deleteEventoCalendario = async function(id) {
        if (!confirm('Confirma exclusão do evento?')) return;
        try {
            await db.collection('eventos_calendario').doc(id).delete();
            app.toast('success', 'Evento excluido');
            app.modalEventoCalendario();
        } catch (err) {
            console.error(err);
            app.toastError('Erro ao excluir evento', err);
        }
    };

    // ======= CHAT / FÓRUM =======
}