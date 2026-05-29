import { db } from '../services/init.js';
import { getCollection, getSchoolCollection, invalidateSchoolCollectionCache } from '../services/db.js';
import { getActiveSchoolId } from '../config/school.js';
import { store } from '../store.js';
import {
    registerForNotifications,
    onMessageListener,
    setupTokenRefresh,
    isNotificationSupported,
    diagnosticarNotificacoes
} from '../services/notifications.js';

export function extendCoreUtilities(app) {
    app.installSaveButtonLoadingDelegation = function() {
        if (app._saveButtonLoadingDelegationInstalled) return;
        app._saveButtonLoadingDelegationInstalled = true;

        document.addEventListener('click', (event) => {
            const button = event.target && event.target.closest ? event.target.closest('button') : null;
            if (!button) return;
            if (!button.isConnected) return;
            if (button.dataset.noLoading === 'true') return;

            // Modal confirm buttons already have native loading handling.
            const buttonId = String(button.id || '');
            if (buttonId.startsWith('btn-c-m-') || buttonId.startsWith('btn-s-m-')) return;

            const label = String(button.textContent || '').trim().toLowerCase();
            if (!label) return;
            if (label.includes('fechar e atualizar')) return;
            if (!/\b(salvar|atualizar)\b/i.test(label)) return;
            if (button.disabled) return;
            if (button.dataset.autoSaveLoading === '1') return;

            const originalHtml = button.innerHTML;
            const isAtualizar = /\batualizar\b/i.test(label);
            const customLoadingLabel = String(button.dataset.loadingLabel || '').trim();
            button.dataset.autoSaveLoading = '1';
            button.dataset.autoSaveOriginalHtml = originalHtml;
            button.disabled = true;
            button.classList.add('opacity-80', 'cursor-wait');
            button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${customLoadingLabel || (isAtualizar ? 'Atualizando...' : 'Salvando...')}`;

            // Fallback to avoid leaving button locked if flow does not re-render.
            setTimeout(() => {
                if (!button.isConnected) return;
                if (button.dataset.autoSaveLoading !== '1') return;
                button.disabled = false;
                button.classList.remove('opacity-80', 'cursor-wait');
                button.innerHTML = button.dataset.autoSaveOriginalHtml || originalHtml;
                delete button.dataset.autoSaveLoading;
                delete button.dataset.autoSaveOriginalHtml;
            }, 12000);
        }, true);
    };

    app.formatBytes = function(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, exp);
        return `${value.toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
    };

    app.getSchoolCollectionRef = function(name) {
        const schoolId = app.activeSchoolId || getActiveSchoolId();
        return db.collection('schools').doc(schoolId).collection(name);
    };

    app.moneyInputToNumber = function(rawValue) {
        const normalized = String(rawValue || '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '');
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    };

    app.numberToMoneyInput = function(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '';
        return n.toFixed(2).replace('.', ',');
    };

    app.formatCurrencyBRL = function(value) {
        const n = Number(value);
        const safeValue = Number.isFinite(n) ? n : 0;
        return safeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    app.normalizeDateInput = function(value) {
        if (!value) return '';
        if (typeof value === 'string') return value.slice(0, 10);
        if (value && typeof value.toDate === 'function') {
            return value.toDate().toISOString().slice(0, 10);
        }
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    };

    app.getCollection = async function(name) {
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        if (name === 'avisos') {
            return getCollection(name);
        }
        return getSchoolCollection(schoolId, name);
    };

    window.registerForNotifications = registerForNotifications;
    window.isNotificationSupported = isNotificationSupported;
    window.onMessageListener = onMessageListener;
    window.setupTokenRefresh = setupTokenRefresh;
    window.diagnosticarNotificacoes = diagnosticarNotificacoes;

    app.reclaimEmailIfDeleted = async function(email) {
        const reclaimFn = firebase.functions().httpsCallable('reclaimUserByEmail');
        return reclaimFn({ email });
    };

    app.createUserWithReclaim = async function(email, senha) {
        try {
            return await app.criarUsuarioSemDeslogar(email, senha);
        } catch (err) {
            if (err && err.code === 'auth/email-already-in-use') {
                try {
                    const result = await app.reclaimEmailIfDeleted(email);
                    if (result && result.data && result.data.reclaimed) {
                        return await app.criarUsuarioSemDeslogar(email, senha);
                    }
                } catch (reclaimErr) {
                    if (reclaimErr && reclaimErr.message) {
                        throw new Error(reclaimErr.message);
                    }
                }
                throw new Error('Email ja esta em uso por outra conta ativa.');
            }
            throw err;
        }
    };

    app.deleteItem = async function(col, id) {
        let data = null;
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        const itemRef = db.collection('schools').doc(schoolId).collection(col).doc(id);
        try {
            const doc = await itemRef.get();
            if (doc.exists) data = doc.data();
        } catch (err) {
            console.warn('Nao foi possivel ler item para log:', err);
        }
        const isRecuperacao = col === 'provas' && data?.provaRecuperacao === true;
        if (isRecuperacao && !(app.perms && app.perms.hasRole && app.perms.hasRole('admin', 'professor'))) {
            alert('Somente Administrador e Professor podem excluir prova de recuperacao.');
            return;
        }
        if (col === 'provas' && !isRecuperacao && (data?.published === true || data?.wasPublished === true || data?.concluida === true)) {
            alert('Proibido excluir prova que já foi publicada. Você pode apenas editar.');
            return;
        }
        let confirmMessage = 'Excluir item?';
        if (col === 'provas') {
            const tipoAvaliacao = data?.tipo === 'atividade' ? 'atividade' : 'prova';
            const titulo = data?.titulo ? ` "${data.titulo}"` : '';
            if (isRecuperacao) {
                confirmMessage = `Excluir ${tipoAvaliacao} de recuperacao${titulo}? As notas de recuperacao serao removidas e as notas anteriores serao restauradas.`;
            } else {
                confirmMessage = `Excluir ${tipoAvaliacao} rascunho${titulo}?`;
            }
        } else if (col === 'turmas') {
            confirmMessage = `Excluir turma${data?.nome ? ` "${data.nome}"` : ''}?`;
        } else if (col === 'avisos') {
            confirmMessage = `Excluir aviso${data?.titulo ? ` "${data.titulo}"` : ''}?`;
        } else if (col === 'materiais') {
            confirmMessage = `Excluir material${data?.titulo ? ` "${data.titulo}"` : ''}?`;
        }
        if (!confirm(confirmMessage)) return;
        try {
            if (col === 'provas') {
                const resultadosSnap = await db.collection('schools')
                    .doc(schoolId)
                    .collection('provas_resultados')
                    .where('provaId', '==', id)
                    .get();
                const batchWriter = db.batch();
                resultadosSnap.forEach((resultadoDoc) => {
                    batchWriter.delete(resultadoDoc.ref);
                });
                batchWriter.delete(itemRef);
                await batchWriter.commit();
            } else {
                await itemRef.delete();
            }
        } catch (err) {
            console.error('Erro ao excluir item:', err);
            alert(err?.message || 'Nao foi possivel excluir este item.');
            return;
        }
        invalidateSchoolCollectionCache(schoolId, col);
        if (col === 'provas') invalidateSchoolCollectionCache(schoolId, 'provas_resultados');
        if (col === 'provas') {
            try {
                await functions.httpsCallable('repairSchoolProvaResultados')({ schoolId, provaId: id });
            } catch (error) {
                console.warn('Falha ao reparar resultados de prova no backend:', error);
            }
        }
        if (app.logAcesso) {
            if (col === 'provas') {
                const tipo = data?.tipo === 'atividade' ? 'atividade' : 'prova';
                const acao = tipo === 'atividade'
                    ? 'atividade_excluida'
                    : (isRecuperacao ? 'prova_recuperacao_excluida' : 'prova_excluida');
                const detalheBase = isRecuperacao ? 'prova_recuperacao' : tipo;
                const detalhe = data?.titulo ? `${detalheBase}:${data.titulo}` : detalheBase;
                app.logAcesso(acao, detalhe);
            } else if (col === 'turmas') {
                app.logAcesso('turma_excluida', data?.nome || 'turma');
            }
        }
        app.renderContent();
    };

    app.deleteUsuario = async function(id) {
        if (!confirm('Remover usuário?')) return;
        let data = null;
        const schoolId = store.activeSchoolId || getActiveSchoolId();
        try {
            const doc = await db.collection('schools').doc(schoolId).collection('users').doc(id).get();
            if (doc.exists) data = doc.data();
        } catch (err) {
            console.warn('Nao foi possivel ler usuario para log:', err);
        }
        try {
            const deleteUserFn = firebase.functions().httpsCallable('deleteUserByUid');
            await deleteUserFn({ uid: id, schoolId });
        } catch (err) {
            alert(err?.message || 'Erro ao excluir usuario.');
            return;
        }
        if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
        if (app.logAcesso && data) {
            const tipo = data.tipo || 'usuario';
            const nome = data.nome || 'usuario';
            const acao = tipo === 'aluno' ? 'aluno_excluido' : (tipo === 'professor' ? 'professor_excluido' : (tipo === 'admin' ? 'administrador_excluido' : 'usuario_excluido'));
            app.logAcesso(acao, nome);
        }
        app.renderContent();
    };

    app.getTreinamentosCatalogo = function() {
        return [
            {
                id: 'lean',
                titulo: 'Metodologia Lean',
                descricao: 'Treinamento focado em melhoria continua, eliminacao de desperdicios e aumento de eficiencia operacional.',
                arquivo: 'Metodologia Lean.html',
                icone: 'fa-diagram-project',
                cor: 'from-blue-600 to-cyan-500'
            },
            {
                id: 'nr20',
                titulo: 'NR20',
                descricao: 'Treinamento de seguranca para atividades com inflamaveis e combustiveis, conforme requisitos da NR20.',
                arquivo: 'NR20_Version2.html',
                icone: 'fa-shield-halved',
                cor: 'from-amber-500 to-orange-500'
            },
            {
                id: 'nr11',
                titulo: 'NR11',
                descricao: 'Treinamento de seguranca para transporte, movimentacao, armazenagem e manuseio de materiais conforme a NR11.',
                arquivo: 'NR11.html',
                icone: 'fa-forklift',
                cor: 'from-emerald-600 to-teal-500'
            },
            {
                id: 'nr12',
                titulo: 'NR12',
                descricao: 'Treinamento de seguranca no trabalho em maquinas e equipamentos, conforme requisitos da NR12.',
                arquivo: 'NR12.html',
                icone: 'fa-gears',
                cor: 'from-rose-600 to-red-500'
            }
        ];
    };

    app.getTreinamentoPublicUrl = function(arquivo) {
        const options = arguments.length > 1 && arguments[1] ? arguments[1] : {};
        const fileName = String(arquivo || '').trim();
        const baseUrl = window.location.origin;
        const url = new URL(`${baseUrl}/Treinamentos/${encodeURIComponent(fileName)}`);
        const schoolId = String(options.schoolId || app.activeSchoolId || '').trim();
        const participanteNome = String(options.participanteNome || '').trim();
        const treinamentoId = String(options.treinamentoId || '').trim();
        if (schoolId) url.searchParams.set('escola', schoolId);
        if (participanteNome) url.searchParams.set('nome', participanteNome);
        if (treinamentoId) url.searchParams.set('treinamento', treinamentoId);
        return url.toString();
    };

    app.copyTreinamentoLink = async function(arquivo, treinamentoId) {
        const url = app.getTreinamentoPublicUrl(arquivo, {
            schoolId: app.activeSchoolId,
            treinamentoId
        });
        try {
            await navigator.clipboard.writeText(url);
            app.showToast('Link copiado com sucesso!', 'success');
        } catch (error) {
            const fallback = document.createElement('textarea');
            fallback.value = url;
            fallback.setAttribute('readonly', 'readonly');
            fallback.style.position = 'absolute';
            fallback.style.left = '-9999px';
            document.body.appendChild(fallback);
            fallback.select();
            document.execCommand('copy');
            document.body.removeChild(fallback);
            app.showToast('Link copiado com sucesso!', 'success');
        }
    };

    app.openTreinamentoComIdentificacao = function(arquivo, titulo, treinamentoId) {
        const storageKey = `treinamento_participante_nome:${String(app.activeSchoolId || '').trim() || 'global'}`;
        const nomeAnterior = String(localStorage.getItem(storageKey) || '').trim();
        const safeNomeAnterior = app.escapeHtml(nomeAnterior);
        const safeTitulo = app.escapeHtml(titulo || 'Treinamento');

        const content = `
            <div class="space-y-3">
                <p class="text-sm text-slate-600 dark:text-slate-300">Para iniciar o treinamento, informe seu nome completo.</p>
                <div>
                    <label for="treinamento-nome-input" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome completo</label>
                    <input id="treinamento-nome-input" type="text" value="${safeNomeAnterior}" placeholder="Digite seu nome" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                </div>
            </div>
        `;

        app.showModal(`Iniciar ${safeTitulo}`, content, async () => {
            const input = document.getElementById('treinamento-nome-input');
            const nome = String(input && input.value ? input.value : '').trim();
            if (nome.length < 3) throw new Error('Informe um nome com pelo menos 3 caracteres.');

            localStorage.setItem(storageKey, nome);
            const url = app.getTreinamentoPublicUrl(arquivo, {
                schoolId: app.activeSchoolId,
                participanteNome: nome,
                treinamentoId
            });
            window.open(url, '_blank', 'noopener');
            app.showToast('Treinamento aberto em nova aba.', 'success');
        }, {
            confirmLabel: 'Iniciar treinamento'
        });
    };

    app.modalQrCodeTreinamento = function(arquivo, titulo, treinamentoId) {
        const url = app.getTreinamentoPublicUrl(arquivo, {
            schoolId: app.activeSchoolId,
            treinamentoId
        });
        const safeUrl = app.escapeHtml(url);
        const safeUrlAttr = url.replace(/'/g, "\\'");
        const safeTitulo = app.escapeHtml(titulo || 'Treinamento');
        const qrId = `qr-treinamento-${Date.now()}`;
        const downloadId = `btn-download-qr-treinamento-${Date.now()}`;

        const content = `
            <div class="space-y-4 text-center">
                <p class="text-sm text-gray-600 dark:text-gray-300">Compartilhe o QR Code para acesso rapido ao treinamento por link publico.</p>
                <div id="${qrId}" class="flex justify-center my-4"></div>
                <div class="flex items-center gap-2 bg-gray-50 dark:bg-slate-700 rounded-lg p-3">
                    <input type="text" readonly value="${safeUrl}" class="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none truncate">
                    <button onclick="navigator.clipboard.writeText('${safeUrlAttr}').then(()=>app.showToast('Link copiado!','success'))" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"><i class="fas fa-copy mr-1"></i>Copiar</button>
                </div>
                <button id="${downloadId}" class="px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 text-sm"><i class="fas fa-download mr-2"></i>Baixar QR Code</button>
            </div>
        `;

        app.showModal(`QR Code — ${safeTitulo}`, content, () => {});

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
                    link.download = `qrcode-${String(arquivo || 'treinamento').replace(/\s+/g, '-').toLowerCase()}.png`;
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

    app.renderTreinamentos = async function(content) {
        const catalogo = app.getTreinamentosCatalogo();
        const userType = (store.currentUserData && store.currentUserData.tipo) ? store.currentUserData.tipo : '';
        const canViewRegistros = ['admin', 'professor'].includes(userType);
        let registrosTreinamento = [];

        if (canViewRegistros && app.activeSchoolId) {
            try {
                const snap = await db.collection('schools')
                    .doc(app.activeSchoolId)
                    .collection('treinamentos_registros')
                    .orderBy('entradaEm', 'desc')
                    .limit(200)
                    .get();
                registrosTreinamento = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            } catch (error) {
                console.warn('Falha ao carregar registros de treinamento:', error);
            }
        }

        const formatDateTime = (value) => {
            if (!value) return '-';
            let dateObj = null;
            if (value && typeof value.toDate === 'function') dateObj = value.toDate();
            else if (value instanceof Date) dateObj = value;
            else if (typeof value === 'number') dateObj = new Date(value);
            else if (typeof value === 'string') dateObj = new Date(value);
            if (!dateObj || Number.isNaN(dateObj.getTime())) return '-';
            return dateObj.toLocaleString('pt-BR');
        };

        const toDate = (value) => {
            if (!value) return null;
            if (value && typeof value.toDate === 'function') {
                const tsDate = value.toDate();
                return Number.isNaN(tsDate.getTime()) ? null : tsDate;
            }
            if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
            if (typeof value === 'number' || typeof value === 'string') {
                const d = new Date(value);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            return null;
        };

        const registrosNormalizados = registrosTreinamento.map((registro) => ({
            ...registro,
            entradaDate: toDate(registro.entradaEm),
            saidaDate: toDate(registro.saidaEm)
        }));

        const cardsHtml = catalogo.map((item) => {
            const urlPublica = app.getTreinamentoPublicUrl(item.arquivo, {
                schoolId: app.activeSchoolId,
                treinamentoId: item.id
            });
            const safeTitulo = app.escapeHtml(item.titulo);
            const safeDescricao = app.escapeHtml(item.descricao);
            const safeUrl = app.escapeHtml(urlPublica);
            const safeArquivoAttr = String(item.arquivo).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeTituloAttr = String(item.titulo).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const safeTreinamentoIdAttr = String(item.id).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            return `
                <article class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm hover:shadow-lg transition">
                    <div class="flex items-start justify-between gap-3 mb-4">
                        <div>
                            <h3 class="text-xl font-semibold text-slate-900 dark:text-white">${safeTitulo}</h3>
                            <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">${safeDescricao}</p>
                        </div>
                        <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${item.cor} text-white flex items-center justify-center text-lg shadow">
                            <i class="fas ${item.icone}"></i>
                        </div>
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 rounded-lg p-2 mb-4 break-all">
                        ${safeUrl}
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="app.openTreinamentoComIdentificacao('${safeArquivoAttr}', '${safeTituloAttr}', '${safeTreinamentoIdAttr}')" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                            <i class="fas fa-arrow-up-right-from-square mr-1"></i>Abrir
                        </button>
                        <button onclick="app.copyTreinamentoLink('${safeArquivoAttr}', '${safeTreinamentoIdAttr}')" class="px-3 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-800">
                            <i class="fas fa-copy mr-1"></i>Copiar link
                        </button>
                        <button onclick="app.modalQrCodeTreinamento('${safeArquivoAttr}', '${safeTituloAttr}', '${safeTreinamentoIdAttr}')" class="px-3 py-2 bg-purple-700 text-white rounded-lg text-sm hover:bg-purple-800">
                            <i class="fas fa-qrcode mr-1"></i>QR Code
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        const renderRegistrosRows = (listaRegistros) => listaRegistros.map((registro) => {
            const nome = app.escapeHtml(String(registro.participanteNome || 'Nao informado'));
            const treinamento = app.escapeHtml(String(registro.treinamentoTitulo || registro.treinamentoId || '-'));
            const entrada = app.escapeHtml(formatDateTime(registro.entradaEm));
            const saida = app.escapeHtml(formatDateTime(registro.saidaEm));
            const concluido = registro.concluido === true;
            return `
                <tr class="border-b border-slate-200 dark:border-slate-700">
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${nome}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${treinamento}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${entrada}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${saida}</td>
                    <td class="px-3 py-2 text-sm ${concluido ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}">${concluido ? 'Sim' : 'Nao'}</td>
                </tr>
            `;
        }).join('');

        const filtrosHtml = canViewRegistros
            ? `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2 mb-3">
                    <div>
                        <label for="filtro-nome-participante" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome</label>
                        <input id="filtro-nome-participante" type="text" placeholder="Buscar participante" class="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    </div>
                    <div>
                        <label for="filtro-treinamento" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Treinamento</label>
                        <select id="filtro-treinamento" class="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                            <option value="todos">Todos</option>
                            ${catalogo.map((item) => `<option value="${app.escapeHtml(item.id)}">${app.escapeHtml(item.titulo)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label for="filtro-concluido" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Concluido</label>
                        <select id="filtro-concluido" class="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                            <option value="todos">Todos</option>
                            <option value="sim">Sim</option>
                            <option value="nao">Nao</option>
                        </select>
                    </div>
                    <div>
                        <label for="filtro-data-inicio" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Entrada de</label>
                        <input id="filtro-data-inicio" type="date" class="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    </div>
                    <div>
                        <label for="filtro-data-fim" class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Entrada ate</label>
                        <input id="filtro-data-fim" type="date" class="w-full px-2 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200">
                    </div>
                    <div class="flex items-end">
                        <button id="btn-limpar-filtros-treinamento" class="w-full px-3 py-2 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100 rounded-lg text-sm hover:bg-slate-300 dark:hover:bg-slate-600">Limpar filtros</button>
                    </div>
                </div>
            `
            : '';

        const registrosHtml = canViewRegistros
            ? `
                <section class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 shadow-sm">
                    <div class="flex items-center justify-between gap-3 mb-3">
                        <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Registros de Treinamentos</h3>
                        <span id="treinamentos-registros-count" class="text-xs text-slate-500 dark:text-slate-400">${registrosTreinamento.length} registro(s)</span>
                    </div>
                    ${filtrosHtml}
                    <div class="overflow-x-auto">
                        <table class="min-w-full">
                            <thead>
                                <tr class="bg-slate-100 dark:bg-slate-700/60">
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Nome</th>
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Treinamento</th>
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Entrada</th>
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Saida</th>
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Concluido</th>
                                </tr>
                            </thead>
                            <tbody id="treinamentos-registros-body">
                                ${renderRegistrosRows(registrosNormalizados) || '<tr><td colspan="5" class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">Nenhum registro encontrado.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </section>
            `
            : '';

        content.innerHTML = `
            <div class="space-y-6">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    ${cardsHtml}
                </div>
                ${registrosHtml}
            </div>
        `;

        if (canViewRegistros) {
            const selectTreinamento = document.getElementById('filtro-treinamento');
            const selectConcluido = document.getElementById('filtro-concluido');
            const inputInicio = document.getElementById('filtro-data-inicio');
            const inputFim = document.getElementById('filtro-data-fim');
            const inputNome = document.getElementById('filtro-nome-participante');
            const btnLimpar = document.getElementById('btn-limpar-filtros-treinamento');
            const bodyEl = document.getElementById('treinamentos-registros-body');
            const countEl = document.getElementById('treinamentos-registros-count');

            const applyFilters = function() {
                const treinamentoFiltro = selectTreinamento ? selectTreinamento.value : 'todos';
                const concluidoFiltro = selectConcluido ? selectConcluido.value : 'todos';
                const inicioRaw = inputInicio ? inputInicio.value : '';
                const fimRaw = inputFim ? inputFim.value : '';
                const nomeRaw = inputNome ? String(inputNome.value || '').trim().toLowerCase() : '';

                const inicio = inicioRaw ? new Date(`${inicioRaw}T00:00:00`) : null;
                const fim = fimRaw ? new Date(`${fimRaw}T23:59:59`) : null;

                const filtrados = registrosNormalizados.filter((registro) => {
                    const nomeRegistro = String(registro.participanteNome || '').toLowerCase();
                    if (nomeRaw && !nomeRegistro.includes(nomeRaw)) return false;
                    if (treinamentoFiltro !== 'todos' && String(registro.treinamentoId || '') !== treinamentoFiltro) return false;
                    if (concluidoFiltro === 'sim' && registro.concluido !== true) return false;
                    if (concluidoFiltro === 'nao' && registro.concluido === true) return false;
                    if (inicio && registro.entradaDate && registro.entradaDate < inicio) return false;
                    if (fim && registro.entradaDate && registro.entradaDate > fim) return false;
                    if ((inicio || fim) && !registro.entradaDate) return false;
                    return true;
                });

                if (bodyEl) {
                    bodyEl.innerHTML = renderRegistrosRows(filtrados)
                        || '<tr><td colspan="5" class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
                }
                if (countEl) countEl.textContent = `${filtrados.length} registro(s)`;
            };

            [inputNome, selectTreinamento, selectConcluido, inputInicio, inputFim].forEach((el) => {
                if (!el) return;
                el.addEventListener(el.tagName === 'INPUT' && el.type === 'text' ? 'input' : 'change', applyFilters);
            });

            if (btnLimpar) {
                btnLimpar.addEventListener('click', () => {
                    if (selectTreinamento) selectTreinamento.value = 'todos';
                    if (selectConcluido) selectConcluido.value = 'todos';
                    if (inputInicio) inputInicio.value = '';
                    if (inputFim) inputFim.value = '';
                    if (inputNome) inputNome.value = '';
                    applyFilters();
                });
            }
        }
    };

    app.setMobileMenuState = function(isOpen) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const toggleButton = document.getElementById('mobile-sidebar-toggle');
        if (!sidebar) return;
        sidebar.classList.toggle('hidden', !isOpen);
        if (overlay) {
            overlay.classList.toggle('hidden', !isOpen);
            overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        }
        if (toggleButton) {
            toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            toggleButton.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
        }
        const icon = toggleButton ? toggleButton.querySelector('i') : null;
        if (icon) {
            icon.classList.toggle('fa-bars', !isOpen);
            icon.classList.toggle('fa-times', isOpen);
        }
        document.body.classList.toggle('mobile-menu-open', !!isOpen);
        if (isOpen) sidebar.focus();
        else if (toggleButton) toggleButton.focus();
    };

    app.toggleSidebarMobile = function() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        const isOpen = sidebar.classList.contains('hidden');
        app.setMobileMenuState(isOpen);
    };

    app.closeSidebarMobile = function() {
        app.setMobileMenuState(false);
    };
}
