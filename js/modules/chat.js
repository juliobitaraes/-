import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendChat(app) {
    app.abrirChatTrabalho = function(turmaId, turmaNome, salaId = null, salaNome = null) {
        app.renderChatInterface(turmaId, turmaNome, 'trabalhos', 15, salaId, salaNome);
    };
    app.abrirTrabalhoTurma = function(turmaId, turmaNome) { app.renderTrabalhosSalas(turmaId, turmaNome); };
    app.abrirTrabalhoSala = function(turmaId, turmaNome, salaId, salaNome) {
        app.renderChatInterface(turmaId, turmaNome, 'trabalhos', 15, salaId, salaNome);
    };
    app.abrirForum = function(turmaId, turmaNome) { app.renderChatInterface(turmaId, turmaNome, 'forum', 5, null, null); };
    app.abrirForumTurma = function(turmaId, turmaNome) { app.renderForumSalas(turmaId, turmaNome); };
    app.abrirForumSala = function(turmaId, turmaNome, salaId, salaNome) {
        if (turmaId === 'colaboradores' && app.perms && !app.perms.canAccessColabForum()) {
            alert('Acesso restrito.');
            return;
        }
        app.renderChatInterface(turmaId, turmaNome, 'forum', 5, salaId, salaNome);
    };

    app.renderChatInterface = function(turmaId, turmaNome, collectionName, limitMB, salaId = null, salaNome = null) {
        if (collectionName === 'forum' && app.logAcesso) {
            const detalhe = salaId ? `turma:${turmaId} sala:${salaId}` : `turma:${turmaId}`;
            app.logAcesso('forum_acessado', detalhe);
        }
        const content = document.getElementById('content-area');
        const safeTurmaNome = app.escapeHtml(turmaNome || 'Turma');
        const safeTurmaNomeAttr = (turmaNome || '').replace(/'/g, "\\'");
        const safeSalaNome = app.escapeHtml(salaNome || '');
        const isSalaChat = collectionName === 'forum' || collectionName === 'trabalhos';
        const salaBadge = isSalaChat && safeSalaNome ? ` <span class="text-sm text-gray-400">• ${safeSalaNome}</span>` : '';
        const backAction = collectionName === 'forum'
            ? (turmaId === 'geral' ? 'app.renderContent()' : `app.renderForumSalas('${turmaId}', '${safeTurmaNomeAttr}')`)
            : (collectionName === 'trabalhos' ? `app.renderTrabalhosSalas('${turmaId}', '${safeTurmaNomeAttr}')` : `app.navigate('${collectionName}')`);
        content.innerHTML = `<div class="flex flex-col h-[calc(100vh-140px)] bg-white dark:bg-slate-800 rounded-xl shadow-lg border dark:border-slate-700 overflow-hidden"><div class="p-4 bg-gray-50 dark:bg-slate-750 border-b dark:border-slate-600 flex justify-between items-center"><div class="flex items-center gap-3"><button onclick="${backAction}" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button><h3 class="font-bold text-lg dark:text-white border-l pl-3 border-gray-300 dark:border-slate-600">${safeTurmaNome}${salaBadge}</h3></div><span class="text-xs font-mono text-gray-400">Limite Upload: ${limitMB}MB</span></div><div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900"><div class="flex justify-center"><div class="loading"></div></div></div><div class="p-4 bg-white dark:bg-slate-800 border-t dark:border-slate-700"><form id="chat-form" class="flex gap-2 items-end"><label class="cursor-pointer p-3 text-gray-500 hover:text-blue-600 dark:text-gray-400 transition" title="Enviar Arquivo"><i class="fas fa-paperclip text-xl"></i><input type="file" id="chat-file" class="hidden" onchange="app.handleChatFileSelect(this)"></label><div class="flex-1 bg-gray-100 dark:bg-slate-700 rounded-lg flex flex-col px-3 py-2"><div id="file-preview" class="hidden text-xs text-blue-600 dark:text-blue-400 mb-1 border-b pb-1 border-gray-200 dark:border-slate-600 flex justify-between"><span id="file-name">arquivo.pdf</span><button type="button" onclick="app.clearChatFile()" class="text-red-500"><i class="fas fa-times"></i></button></div><textarea id="chat-input" rows="1" class="w-full bg-transparent border-none outline-none resize-none dark:text-white max-h-32" placeholder="Digite sua mensagem..."></textarea></div><button type="submit" id="send-btn" class="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition transform hover:scale-105"><i class="fas fa-paper-plane"></i></button></form></div></div>`;
        const tx = document.getElementById('chat-input'); tx.addEventListener("input", function(){ this.style.height = "auto"; this.style.height = (this.scrollHeight) + "px"; });
        document.getElementById('chat-form').onsubmit = async (e) => {
            e.preventDefault();
            const text = tx.value.trim();
            const editingId = document.getElementById('editing-message-id')?.value;

            if (editingId) {
                if (!text) { alert('Digite uma mensagem'); return; }
                try {
                    await db.collection(collectionName).doc(editingId).update({ text: text, editedAt: firebase.firestore.FieldValue.serverTimestamp(), edited: true });
                    app.cancelEdit();
                    app.showToast('Mensagem atualizada!', 'success');
                } catch (err) { console.error('Erro ao editar:', err); alert('Erro ao editar mensagem'); }
                return;
            }

            const fileInput = document.getElementById('chat-file');
            const file = fileInput.files[0];
            if (!text && !file) return;

            let fileUrl = null; let fileType = null; let fileName = null;

            if (file) {
                if (file.size > limitMB * 1024 * 1024) { alert(`Arquivo muito grande! O limite é ${limitMB}MB.`); return; }
                if (collectionName === 'trabalhos') {
                    const ext = file.name.split('.').pop().toLowerCase(); const allowed = ['doc','docx','xls','xlsx','ppt','pptx','pdf','jpg','jpeg','png','gif']; if(!allowed.includes(ext)) { alert('Formato não permitido em Trabalhos. Apenas Office, PDF e Imagens.'); return; }
                }
                app.showToast('Enviando arquivo...', 'info');
                try {
                    const ref = storage.ref().child(`${collectionName}/${turmaId}/${Date.now()}_${file.name}`);
                    const snapshot = await ref.put(file);
                    fileUrl = await snapshot.ref.getDownloadURL(); fileType = file.type; fileName = file.name;
                } catch (err) { console.error('Erro upload:', err); alert('ERRO NO UPLOAD: ' + err.message); return; }
            }

            const payload = { turmaId, userId: app.currentUserData.id, userName: app.currentUserData.nome, text: text, fileUrl, fileType, fileName, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
            if (isSalaChat && salaId) {
                payload.salaId = salaId;
                payload.salaNome = salaNome || 'Sala';
            }
            await db.collection(collectionName).add(payload);

            tx.value = ''; tx.style.height = 'auto'; app.clearChatFile();
        };

        const salaKey = isSalaChat ? (salaId || null) : null;
        const matchSala = (data) => {
            if (!isSalaChat) return true;
            const msgSala = data.salaId || null;
            if (!salaKey) return !msgSala;
            return msgSala === salaKey;
        };

        app.activeListener = db.collection(collectionName).where('turmaId', '==', turmaId).orderBy('createdAt', 'asc').onSnapshot(snapshot => {
            const msgContainer = document.getElementById('chat-messages'); if (!msgContainer) return; if(msgContainer.innerHTML.includes('loading')) msgContainer.innerHTML = '';
            let hasRelevantChanges = false;
            snapshot.docChanges().forEach(change => {
                const data = change.doc.data();
                if (!matchSala(data)) return;
                if (change.type === 'added') {
                    const isMe = data.userId === app.currentUserData.id; const canManage = isMe || (app.perms && app.perms.isAdmin()); const time = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...'; const editedMark = data.edited ? '<span class="text-xs opacity-70 ml-1">(editado)</span>' : '';
                    let attachmentHtml = '';
                    if (data.fileUrl) {
                        const isImg = data.fileType && data.fileType.startsWith('image');
                        if (isImg) attachmentHtml = `<div class="mt-2"><a href="${data.fileUrl}" target="_blank"><img src="${data.fileUrl}" class="max-w-[200px] rounded-lg border dark:border-slate-600"></a></div>`;
                        else attachmentHtml = `<div class="mt-2"><a href="${data.fileUrl}" target="_blank" class="flex items-center gap-2 bg-gray-200 dark:bg-slate-700 p-2 rounded text-sm hover:bg-gray-300 transition dark:text-white"><i class="fas fa-file-download"></i> ${data.fileName}</a></div>`;
                    }

                    const actionBtns = canManage ? `
                        <div class="absolute ${isMe ? '-left-16' : '-right-16'} top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onclick="app.editMessage('${change.doc.id}', '${collectionName}', this)" 
                                class="p-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition" title="Editar">
                                <i class="fas fa-pen text-xs"></i>
                            </button>
                            <button onclick="app.deleteMessage('${change.doc.id}', '${collectionName}', '${data.fileUrl || ''}')" 
                                class="p-1.5 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-800 transition" title="Excluir">
                                <i class="fas fa-trash text-xs"></i>
                            </button>
                        </div>
                    ` : '';

                    const html = `
                        <div id="msg-${change.doc.id}" class="flex flex-col ${isMe ? 'items-end' : 'items-start'} fade-in group relative pr-10" data-text="${app.escapeHtml(data.text || '')}">
                            <span class="text-xs text-gray-400 mb-1 ml-1 flex items-center gap-1">
                                ${isMe ? 'Você' : data.userName} • ${time}${editedMark}
                            </span>
                            <div class="chat-bubble ${isMe ? 'chat-me' : 'chat-other'} shadow-sm relative">
                                <p class="whitespace-pre-wrap">${app.escapeHtml(data.text || '')}</p>
                                ${attachmentHtml}
                                ${actionBtns}
                            </div>
                        </div>
                    `;

                    msgContainer.insertAdjacentHTML('beforeend', html);
                    hasRelevantChanges = true;
                } else if (change.type === 'modified') {
                    const msgEl = document.getElementById(`msg-${change.doc.id}`); if (msgEl) { const pEl = msgEl.querySelector('p'); const editedMark = data.edited ? '<span class="text-xs opacity-70 ml-1">(editado)</span>' : ''; if (pEl) pEl.innerHTML = app.escapeHtml(data.text || '') + editedMark; msgEl.dataset.text = data.text || ''; hasRelevantChanges = true; }
                }
            });
            if (hasRelevantChanges) msgContainer.scrollTop = msgContainer.scrollHeight;
        });
    };

    app.handleChatFileSelect = function(input) { if(input.files && input.files[0]) { document.getElementById('file-preview').classList.remove('hidden'); document.getElementById('file-name').textContent = input.files[0].name; } };

    app.clearChatFile = function() { const el = document.getElementById('chat-file'); if(el) el.value = ''; const preview = document.getElementById('file-preview'); if(preview) preview.classList.add('hidden'); };

    app.editMessage = function(msgId, collectionName, btnElement) {
        const msgDiv = document.getElementById(`msg-${msgId}`);
        if (!msgDiv) return;
        const text = msgDiv.dataset.text || '';
        const input = document.getElementById('chat-input'); input.value = text; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 128) + 'px'; input.focus();
        let indicator = document.getElementById('editing-indicator'); const form = document.getElementById('chat-form');
        if (!indicator) {
            indicator = document.createElement('div'); indicator.id = 'editing-indicator'; indicator.className = 'mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg flex justify-between items-center';
            indicator.innerHTML = `
                <span class="text-sm text-blue-700 dark:text-blue-400">
                    <i class="fas fa-pen mr-2"></i>Editando mensagem
                </span>
                <button type="button" onclick="app.cancelEdit()" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 text-sm">
                    <i class="fas fa-times"></i> Cancelar
                </button>
            `;
            form.parentNode.insertBefore(indicator, form);
        }
        indicator.classList.remove('hidden');
        let hiddenId = document.getElementById('editing-message-id'); if (!hiddenId) { hiddenId = document.createElement('input'); hiddenId.type = 'hidden'; hiddenId.id = 'editing-message-id'; form.appendChild(hiddenId); }
        hiddenId.value = msgId;
        const sendBtn = document.getElementById('send-btn') || form.querySelector('button[type="submit"]'); if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-check"></i>'; sendBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700'); sendBtn.classList.add('bg-green-600', 'hover:bg-green-700'); }
    };

    app.cancelEdit = function() {
        const input = document.getElementById('chat-input'); if (input) { input.value = ''; input.style.height = 'auto'; }
        const indicator = document.getElementById('editing-indicator'); if (indicator) indicator.classList.add('hidden');
        const hiddenId = document.getElementById('editing-message-id'); if (hiddenId) hiddenId.value = '';
        const form = document.getElementById('chat-form'); const sendBtn = document.getElementById('send-btn') || form?.querySelector('button[type="submit"]'); if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>'; sendBtn.classList.add('bg-blue-600', 'hover:bg-blue-700'); sendBtn.classList.remove('bg-green-600', 'hover:bg-green-700'); }
    };

    app.deleteMessage = function(msgId, collectionName, fileUrl) {
        if (!confirm('Tem certeza que deseja excluir esta mensagem?')) return;
        if (fileUrl) {
            try { const fileRef = firebase.storage().refFromURL(fileUrl); fileRef.delete().catch(e => console.log('Arquivo já não existe')); } catch (e) { console.log('Erro ao deletar arquivo:', e); }
        }
        db.collection(collectionName).doc(msgId).delete().then(() => {
            app.toast('success', 'Mensagem excluida');
            const el = document.getElementById(`msg-${msgId}`);
            if (el) { el.style.opacity = '0'; el.style.transform = 'scale(0.9)'; setTimeout(() => el.remove(), 200); }
        }).catch(err => { console.error('Erro ao deletar:', err); app.toastError('Erro ao excluir mensagem', err); });
    };

    app.limparChat = async function(collectionName) {
        if (!confirm('ATENÇÃO!\n\nIsso apagará TODAS as mensagens e arquivos do ' + collectionName.toUpperCase() + ' permanentemente.\n\nEsta ação não pode ser desfeita!\n\nDeseja continuar?')) return;
        if (!confirm('Confirmação final: Digite "APAGAR" para confirmar')) return;
        const confirmacao = prompt('Digite "APAGAR" para confirmar:'); if (confirmacao !== 'APAGAR') { app.toast('info', 'Operação cancelada'); return; }
        app.toast('info', 'Iniciando limpeza');
        try {
            const snapshot = await db.collection(collectionName).get(); let count = 0; let arquivosDeletados = 0;
            for (const doc of snapshot.docs) {
                const data = doc.data();
                if (data.fileUrl) {
                    try { const fileRef = firebase.storage().refFromURL(data.fileUrl); await fileRef.delete(); arquivosDeletados++; } catch (e) { console.log('Arquivo não existe'); }
                }
                await doc.ref.delete(); count++;
            }
            app.toast('success', 'Limpeza concluida', { Mensagens: count, Arquivos: arquivosDeletados });
            app.renderContent();
        } catch (err) { console.error('Erro:', err); app.toastError('Erro na limpeza', err); }
    };

    app.deleteSalaChatMessages = async function(collectionName, turmaId, salaId) {
        if (!collectionName || !turmaId || !salaId) return { deleted: 0, files: 0 };
        let deleted = 0;
        let files = 0;
        const baseQuery = db.collection(collectionName)
            .where('turmaId', '==', turmaId)
            .where('salaId', '==', salaId);

        while (true) {
            const snap = await baseQuery.limit(200).get();
            if (snap.empty) break;
            const batch = db.batch();
            for (const doc of snap.docs) {
                const data = doc.data();
                if (data.fileUrl) {
                    try {
                        const fileRef = firebase.storage().refFromURL(data.fileUrl);
                        await fileRef.delete();
                        files++;
                    } catch (e) {
                        console.log('Arquivo nao existe');
                    }
                }
                batch.delete(doc.ref);
                deleted++;
            }
            await batch.commit();
        }
        return { deleted, files };
    };

    // ======= DI�?RIO / NOTAS =======
}