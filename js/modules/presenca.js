import { storage } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import {
    buildAlunosEmRisco,
    buildPresencaPersistenciaData,
    buildPresencaResumo,
    buildRegistrosIniciais,
    getChangedFrequencyStatusStudents,
    notifyFrequencyChanges
} from '../services/frequencia.js';

const db = { batch, collection };

export function extendPresenca(app) {
    app.getAcademicAttendanceDates = function(componente, feriadosSet = new Set()) {
        if (!componente || !componente.dataInicio || !componente.dataFim) return [];

        const inicio = app.parseDateOnly(componente.dataInicio);
        const fim = app.parseDateOnly(componente.dataFim);
        if (!inicio || !fim || fim < inicio) return [];

        const datas = [];
        for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
            const diaSemana = d.getDay();
            if (diaSemana === 0 || diaSemana === 6) continue;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (feriadosSet.has(key)) continue;
            datas.push(key);
        }

        return datas;
    };

    app.presencaSelectTurma = function(turmaId) {
        app._presencaState = { turmaId, componenteId: '', data: '' };
        app.renderContent();
    };

    app.presencaSelectComponente = function(componenteId) {
        const state = app._presencaState || {};
        app._presencaState = { turmaId: state.turmaId || '', componenteId, data: '' };
        app.renderContent();
    };

    app.presencaSelectData = function(data) {
        const state = app._presencaState || {};
        app._presencaState = { turmaId: state.turmaId || '', componenteId: state.componenteId || '', data };
        app.renderContent();
    };

    app.setPresencaStatus = function(alunoId, presente) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const atual = app._presencaDraft.registros[alunoId] || {};
        const isPresente = Boolean(presente);
        app._presencaDraft.registros[alunoId] = {
            ...atual,
            presente: isPresente,
            bonificacaoStatus: isPresente ? 'pendente' : app.normalizeBonificacaoStatus(atual.bonificacaoStatus)
        };
        app.renderPresencaRows();
    };

    app.setPresencaJustificativa = function(alunoId, justificativa) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const atual = app._presencaDraft.registros[alunoId] || {};
        app._presencaDraft.registros[alunoId] = {
            ...atual,
            justificativa: String(justificativa || '')
        };
    };

    app.uploadPresencaComprovante = async function(alunoId, inputEl) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const file = inputEl && inputEl.files ? inputEl.files[0] : null;
        if (!file) return;

        try {
            const atual = app._presencaDraft.registros[alunoId] || {};
            const statusInfo = app.getPresencaStatusInfo(atual);
            if (statusInfo.isPresente) {
                app.showToast('O comprovante e permitido apenas para faltas.', 'warning');
                inputEl.value = '';
                return;
            }

            const maxBytes = 10 * 1024 * 1024;
            if (file.size > maxBytes) {
                app.showToast('Arquivo excede 10MB.', 'error');
                inputEl.value = '';
                return;
            }

            app.showToast('Enviando comprovante...', 'info');
            const draft = app._presencaDraft;
            const safeName = String(file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_');
            const ref = storage.ref().child(`frequencia_comprovantes/${draft.turmaId}/${draft.componenteId}/${draft.data}/${alunoId}/${Date.now()}_${safeName}`);
            const snapshot = await ref.put(file);
            const comprovanteUrl = await snapshot.ref.getDownloadURL();

            app._presencaDraft.registros[alunoId] = {
                ...atual,
                comprovanteUrl,
                comprovanteNome: file.name,
                comprovanteTipo: file.type || 'application/octet-stream'
            };

            app.renderPresencaRows();
            app.showToast('Comprovante anexado com sucesso.', 'success');
        } catch (error) {
            console.error('Erro no upload do comprovante:', error);
            app.showToast('Erro ao enviar comprovante.', 'error');
        } finally {
            if (inputEl) inputEl.value = '';
        }
    };

    app.removerPresencaComprovante = function(alunoId) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const atual = app._presencaDraft.registros[alunoId] || {};
        app._presencaDraft.registros[alunoId] = {
            ...atual,
            comprovanteUrl: '',
            comprovanteNome: '',
            comprovanteTipo: '',
            bonificacaoStatus: 'pendente'
        };
        app.renderPresencaRows();
    };

    app.setPresencaBonificacaoStatus = function(alunoId, status) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const atual = app._presencaDraft.registros[alunoId] || {};
        app._presencaDraft.registros[alunoId] = {
            ...atual,
            bonificacaoStatus: app.normalizeBonificacaoStatus(status)
        };
    };

    app.previewPresencaComprovante = function(alunoId) {
        if (!app._presencaDraft || !app._presencaDraft.registros) return;
        const reg = app._presencaDraft.registros[alunoId] || {};
        if (!reg.comprovanteUrl) return;

        const url = app.escapeHtml(reg.comprovanteUrl);
        const nome = app.escapeHtml(reg.comprovanteNome || 'Comprovante');
        const tipo = String(reg.comprovanteTipo || '').toLowerCase();
        const isImage = tipo.startsWith('image/');

        if (!isImage) {
            window.open(reg.comprovanteUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        const content = `
            <div class="space-y-3">
                <div class="text-sm text-gray-600 dark:text-gray-300">${nome}</div>
                <div class="border rounded-lg overflow-hidden dark:border-slate-600 bg-black/5 dark:bg-slate-900/40">
                    <img src="${url}" alt="${nome}" class="w-full h-auto max-h-[70vh] object-contain" />
                </div>
            </div>
        `;
        app.showInfoModal('Preview do Comprovante', content);
    };

    app.computePresencaResumo = function(alunos, registros) {
        return buildPresencaResumo(alunos, registros, app.getPresencaStatusInfo);
    };

    app.renderPresencaRow = function(aluno, reg) {
        const statusInfo = app.getPresencaStatusInfo(reg);
        const isPresente = statusInfo.isPresente;
        const statusBonificacao = statusInfo.bonificacaoStatus;
        const fileInputId = `freq-file-${aluno.id}`;

        return `
            <tr class="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/40">
                <td class="p-3 font-medium text-gray-800 dark:text-gray-100 align-top">${app.escapeHtml(aluno.nome || 'Aluno')}</td>
                <td class="p-3 align-top whitespace-nowrap">
                    <div class="flex items-center gap-2 whitespace-nowrap">
                        <button onclick="app.setPresencaStatus('${aluno.id}', true)" class="px-3 py-1 rounded-lg text-sm ${isPresente ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}">Presente</button>
                        <button onclick="app.setPresencaStatus('${aluno.id}', false)" class="px-3 py-1 rounded-lg text-sm ${!isPresente ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300'}">Falta</button>
                    </div>
                </td>
                <td class="p-3 align-top">
                    <div class="space-y-2">
                        <input type="text" value="${app.escapeHtml(reg.justificativa || '')}" oninput="app.setPresencaJustificativa('${aluno.id}', this.value)" placeholder="Opcional" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white" />

                        <div class="hidden md:flex items-center gap-2 min-w-[860px]">
                            <label for="${fileInputId}" class="px-3 py-1 rounded-lg text-xs cursor-pointer ${isPresente ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300'}">
                                <i class="fas fa-upload mr-1"></i>Comprovante
                            </label>
                            <input id="${fileInputId}" type="file" class="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onchange="app.uploadPresencaComprovante('${aluno.id}', this)" ${isPresente ? 'disabled' : ''} />
                            ${reg.comprovanteUrl ? `
                                <a href="${app.escapeHtml(reg.comprovanteUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 dark:text-blue-400 hover:underline max-w-[170px] truncate">
                                    <i class="fas fa-file-alt mr-1"></i>${app.escapeHtml(reg.comprovanteNome || 'Abrir comprovante')}
                                </a>
                                <button type="button" onclick="app.previewPresencaComprovante('${aluno.id}')" class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300">
                                    <i class="fas fa-image mr-1"></i>Preview
                                </button>
                                <button type="button" onclick="app.removerPresencaComprovante('${aluno.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300">
                                    <i class="fas fa-trash mr-1"></i>Remover
                                </button>
                            ` : `<span class="text-xs text-gray-400">${isPresente ? 'Disponivel para faltas' : 'Sem comprovante anexado'}</span>`}
                            <label class="text-xs text-gray-500 dark:text-gray-400">Bonificacao</label>
                            <select onchange="app.setPresencaBonificacaoStatus('${aluno.id}', this.value)" class="px-2 py-1 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white w-[110px]" ${isPresente ? 'disabled' : ''}>
                                <option value="pendente" ${statusBonificacao === 'pendente' ? 'selected' : ''}>Pendente</option>
                                <option value="aprovada" ${statusBonificacao === 'aprovada' ? 'selected' : ''}>Aprovada</option>
                                <option value="rejeitada" ${statusBonificacao === 'rejeitada' ? 'selected' : ''}>Rejeitada</option>
                            </select>
                            ${isPresente ? '<span class="text-xs text-gray-400 whitespace-nowrap">Somente para faltas</span>' : ''}
                        </div>

                        <div class="md:hidden flex items-center gap-2 flex-wrap">
                            <label for="${fileInputId}" class="px-3 py-1 rounded-lg text-xs cursor-pointer ${isPresente ? 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300'}">
                                <i class="fas fa-upload mr-1"></i>Comprovante
                            </label>
                            <select onchange="app.setPresencaBonificacaoStatus('${aluno.id}', this.value)" class="px-2 py-1 border rounded text-xs dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${isPresente ? 'disabled' : ''}>
                                <option value="pendente" ${statusBonificacao === 'pendente' ? 'selected' : ''}>Pendente</option>
                                <option value="aprovada" ${statusBonificacao === 'aprovada' ? 'selected' : ''}>Aprovada</option>
                                <option value="rejeitada" ${statusBonificacao === 'rejeitada' ? 'selected' : ''}>Rejeitada</option>
                            </select>
                            ${reg.comprovanteUrl ? `<a href="${app.escapeHtml(reg.comprovanteUrl)}" target="_blank" rel="noopener noreferrer" class="text-xs text-blue-600 dark:text-blue-400 hover:underline">Arquivo</a>` : ''}
                            ${reg.comprovanteUrl ? `<details class="text-xs"><summary class="cursor-pointer text-gray-500">Mais</summary><div class="mt-1 flex gap-2"><button type="button" onclick="app.previewPresencaComprovante('${aluno.id}')" class="px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700">Preview</button><button type="button" onclick="app.removerPresencaComprovante('${aluno.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700">Remover</button></div></details>` : ''}
                            ${isPresente ? '<span class="text-xs text-gray-400">Somente para faltas</span>' : ''}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    };

    app.renderPresencaRows = function() {
        const tbody = document.getElementById('presenca-table-body');
        const resumo = document.getElementById('presenca-resumo');
        if (!tbody || !app._presencaDraft || !Array.isArray(app._presencaDraft.alunos)) return;

        const registros = app._presencaDraft.registros || {};
        const alunos = app._presencaDraft.alunos;
        const resumoData = app.computePresencaResumo(alunos, registros);
        tbody.innerHTML = alunos.map((aluno) => app.renderPresencaRow(aluno, registros[aluno.id] || {})).join('');

        if (resumo) {
            resumo.innerHTML = `
                <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-sm">
                    <i class="fas fa-check-circle"></i>${resumoData.presentes} presencas efetivas
                </span>
                <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 text-sm">
                    <i class="fas fa-times-circle"></i>${resumoData.faltas} faltas efetivas
                </span>
                ${resumoData.bonificadas > 0 ? `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-sm"><i class="fas fa-award"></i>${resumoData.bonificadas} faltas bonificadas</span>` : ''}
            `;
        }
    };

    app.salvarPresenca = async function() {
        if (!app._presencaDraft || !app._presencaDraft.docId) {
            app.showToast('Nenhum registro de frequencia carregado.', 'error');
            return;
        }

        const draft = app._presencaDraft;
        const baseline = app._presencaBaselineRegistros || {};
        const persistencia = buildPresencaPersistenciaData(
            draft.alunos,
            draft.registros,
            app.currentUserData.id,
            app.getPresencaStatusInfo
        );

        const serverTimestamp = (window.firebase
            && firebase.firestore
            && firebase.firestore.FieldValue
            && typeof firebase.firestore.FieldValue.serverTimestamp === 'function')
            ? firebase.firestore.FieldValue.serverTimestamp()
            : new Date();

        await db.collection('presencas').doc(draft.docId).set({
            turmaId: draft.turmaId,
            turmaNome: draft.turmaNome,
            componenteId: draft.componenteId,
            componenteNome: draft.componenteNome,
            data: draft.data,
            registros: persistencia.registros,
            totalPresentes: persistencia.totais.presentes,
            totalFaltas: persistencia.totais.faltas,
            totalBonificadas: persistencia.totais.bonificadas,
            atualizadoPor: app.currentUserData.id,
            atualizadoEm: serverTimestamp
        }, { merge: true });

        const role = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        if (['admin', 'professor'].includes(role) && typeof app.notifyAluno === 'function') {
            const turmaNome = draft.turmaNome || 'Turma';
            const componenteNome = draft.componenteNome || 'Componente';
            const dataLabel = (app.parseDateOnly(draft.data) || new Date(draft.data)).toLocaleDateString('pt-BR');

            const changes = getChangedFrequencyStatusStudents(
                draft.alunos,
                draft.registros,
                baseline,
                app.getPresencaStatusInfo
            );

            await notifyFrequencyChanges(changes, app.notifyAluno, ({ statusTexto }) => ({
                titulo: 'Atualizacao de frequencia',
                mensagem: `Sua frequencia foi atualizada em ${dataLabel} (${turmaNome} - ${componenteNome}). Status: ${statusTexto}.`,
                meta: {
                    turmaNome,
                    notificationType: 'frequencia',
                    link: window.location.href
                }
            }));
        }

        app._presencaBaselineRegistros = JSON.parse(JSON.stringify(draft.registros || {}));
        app.showToast('Frequencia salva com sucesso.', 'success');
    };

    app.buildFrequenciaAlunoRegistros = function(userId, presencas, turmasMap, componentesMap) {
        const registrosAluno = [];

        presencas.forEach((p) => {
            if (!p || !p.registros || typeof p.registros !== 'object') return;
            const reg = p.registros[userId];
            if (!reg) return;

            const statusInfo = app.getPresencaStatusInfo(reg);
            const dataObj = app.parseDateOnly(p.data) || new Date(p.data);
            const isDataValida = !Number.isNaN(dataObj?.getTime?.());

            registrosAluno.push({
                dataObj: isDataValida ? dataObj : new Date(0),
                dataLabel: isDataValida ? dataObj.toLocaleDateString('pt-BR') : (p.data || '-'),
                turmaNome: turmasMap.get(p.turmaId) || p.turmaNome || 'Turma',
                componenteNome: componentesMap.get(p.componenteId) || p.componenteNome || 'Componente',
                statusLabel: statusInfo.statusLabel,
                presencaEfetiva: statusInfo.presencaEfetiva,
                justificativa: String(reg.justificativa || ''),
                comprovanteUrl: String(reg.comprovanteUrl || ''),
                comprovanteNome: String(reg.comprovanteNome || '')
            });
        });

        registrosAluno.sort((a, b) => b.dataObj - a.dataObj);
        return registrosAluno;
    };

    app.computeFrequenciaAlunoMetricas = function(registrosAluno) {
        const totalAulas = registrosAluno.length;
        const totalPresencasEfetivas = registrosAluno.filter((r) => r.presencaEfetiva).length;
        const totalFaltasEfetivas = Math.max(0, totalAulas - totalPresencasEfetivas);
        const totalBonificadas = registrosAluno.filter((r) => r.statusLabel === 'Falta bonificada').length;
        const percentual = totalAulas > 0 ? (totalPresencasEfetivas / totalAulas) * 100 : 0;

        return {
            totalAulas,
            totalPresencasEfetivas,
            totalFaltasEfetivas,
            totalBonificadas,
            percentual
        };
    };

    app.renderFrequenciaAlunoRow = function(row) {
        const statusClass = row.statusLabel === 'Presente'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : (row.statusLabel === 'Falta bonificada'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300');
        const resultadoClass = row.presencaEfetiva ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

        return `
            <tr class="border-b last:border-0 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30">
                <td class="p-3">${app.escapeHtml(row.dataLabel)}</td>
                <td class="p-3">${app.escapeHtml(row.turmaNome)}</td>
                <td class="p-3">${app.escapeHtml(row.componenteNome)}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-xs font-medium ${statusClass}">${app.escapeHtml(row.statusLabel)}</span></td>
                <td class="p-3 font-semibold ${resultadoClass}">${row.presencaEfetiva ? 'Conta presença' : 'Conta falta'}</td>
                <td class="p-3">${app.escapeHtml(row.justificativa || '-')}</td>
                <td class="p-3">${row.comprovanteUrl ? `<a href="${app.escapeHtml(row.comprovanteUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline text-xs">${app.escapeHtml(row.comprovanteNome || 'Abrir')}</a>` : '<span class="text-xs text-gray-400">-</span>'}</td>
            </tr>
        `;
    };

    app.renderFrequenciaAlunoRows = function(registrosAluno) {
        if (registrosAluno.length === 0) {
            return '<tr><td colspan="7" class="p-4 text-center text-sm text-gray-500">Nenhum registro de frequencia encontrado.</td></tr>';
        }
        return registrosAluno.map((row) => app.renderFrequenciaAlunoRow(row)).join('');
    };

    app.renderFrequenciaAlunoCards = function(metricas) {
        return `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div class="text-xs text-gray-500">Aulas Registradas</div><div class="text-xl font-bold text-gray-800 dark:text-white">${metricas.totalAulas}</div></div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div class="text-xs text-gray-500">Presenças Efetivas</div><div class="text-xl font-bold text-green-600 dark:text-green-400">${metricas.totalPresencasEfetivas}</div></div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div class="text-xs text-gray-500">Faltas Efetivas</div><div class="text-xl font-bold text-red-600 dark:text-red-400">${metricas.totalFaltasEfetivas}</div></div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4"><div class="text-xs text-gray-500">Frequência Geral</div><div class="text-xl font-bold ${metricas.percentual >= 75 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}">${metricas.percentual.toFixed(1)}%</div>${metricas.totalBonificadas > 0 ? `<div class="text-xs text-amber-600 dark:text-amber-400 mt-1">${metricas.totalBonificadas} falta(s) bonificada(s)</div>` : ''}</div>
            </div>
        `;
    };

    app.renderFrequenciaAluno = async function(container) {
        if (!app.currentUserData || !(app.perms && app.perms.isAluno())) {
            container.innerHTML = '<div class="text-center text-gray-500 dark:text-gray-400">Acesso restrito.</div>';
            return;
        }

        const userId = app.currentUserData.id;
        const [turmas, componentes, presencas] = await Promise.all([
            app.getCollection('turmas'),
            app.getCollection('componentes'),
            app.getCollection('presencas')
        ]);

        const turmasMap = new Map(turmas.map(t => [t.id, app.formatTurmaLabelText(t, 'Turma', true).replace(/\n/g, ' ')]));
        const componentesMap = new Map(componentes.map(c => [c.id, c.nome || 'Componente']));
        const registrosAluno = app.buildFrequenciaAlunoRegistros(userId, presencas, turmasMap, componentesMap);
        const metricas = app.computeFrequenciaAlunoMetricas(registrosAluno);
        const rows = app.renderFrequenciaAlunoRows(registrosAluno);

        container.innerHTML = `
            <div class="space-y-6">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-user-check text-blue-600"></i> Minha Frequencia</h2>
                    <p class="text-sm text-gray-500 dark:text-gray-400">Acompanhe suas presencas, faltas e bonificacoes.</p>
                </div>
                ${app.renderFrequenciaAlunoCards(metricas)}
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="px-4 py-3 border-b dark:border-slate-700"><h3 class="font-semibold text-gray-800 dark:text-white">Historico de Frequencia</h3></div>
                    <div class="overflow-x-auto"><table class="w-full min-w-[980px] text-left text-sm"><thead class="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200"><tr><th class="p-3">Data</th><th class="p-3">Turma</th><th class="p-3">Componente</th><th class="p-3">Status</th><th class="p-3">Resultado</th><th class="p-3">Justificativa</th><th class="p-3">Comprovante</th></tr></thead><tbody class="dark:text-gray-300">${rows}</tbody></table></div>
                </div>
            </div>
        `;
    };

    app.renderPresencaEquipeHeader = function(docId) {
        return `
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div><h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-user-check text-blue-600"></i> Frequencia dos Alunos</h2><p class="text-sm text-gray-500 dark:text-gray-400">Lancamento com base nas datas letivas da agenda academica.</p></div>
                <button ${docId ? '' : 'disabled'} onclick="app.salvarPresenca()" class="px-4 py-2 rounded-lg text-white ${docId ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gray-400 cursor-not-allowed'}"><i class="fas fa-save mr-2"></i>Salvar Frequencia</button>
            </div>
        `;
    };

    app.renderPresencaEquipeRisco = function(alunosEmRisco) {
        const rows = alunosEmRisco.length === 0
            ? '<tr><td colspan="4" class="p-4 text-center text-sm text-green-600 dark:text-green-400">Nenhum aluno em risco de frequencia nesta turma.</td></tr>'
            : alunosEmRisco
                .slice(0, 8)
                .map((row) => `<tr class="border-b last:border-0 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30"><td class="p-3 font-medium text-gray-800 dark:text-gray-100">${app.escapeHtml(row.alunoNome)}</td><td class="p-3 text-center">${row.presencas}</td><td class="p-3 text-center">${row.faltas}</td><td class="p-3 text-center font-semibold text-red-600 dark:text-red-400">${row.frequencia.toFixed(1)}%</td></tr>`)
                .join('');

        return `
            <div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between"><h3 class="font-semibold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-triangle-exclamation text-amber-500"></i> Indicador de Risco da Turma</h3><span class="text-xs text-gray-500">Corte: abaixo de 75%</span></div>
                <div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200"><tr><th class="p-3">Aluno</th><th class="p-3 text-center">Presencas</th><th class="p-3 text-center">Faltas</th><th class="p-3 text-center">Frequencia</th></tr></thead><tbody class="dark:text-gray-300">${rows}</tbody></table></div>
            </div>
        `;
    };

    app.renderPresencaEquipeFiltros = function({ turmasPermitidas, turmaId, compsTurma, componenteId, datasAcademicas, dataSelecionada }) {
        return `
            <div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Turma</label><select onchange="app.presencaSelectTurma(this.value)" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">${turmasPermitidas.map((t) => `<option value="${t.id}" ${t.id === turmaId ? 'selected' : ''}>${app.escapeHtml(app.formatTurmaLabelText(t, 'Turma'))}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Componente</label><select onchange="app.presencaSelectComponente(this.value)" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">${compsTurma.length === 0 ? '<option value="">Sem componentes</option>' : compsTurma.map((c) => `<option value="${c.id}" ${c.id === componenteId ? 'selected' : ''}>${app.escapeHtml(c.nome || 'Componente')}</option>`).join('')}</select></div>
                <div><label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data Letiva</label><select onchange="app.presencaSelectData(this.value)" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">${datasAcademicas.length === 0 ? `<option value="${dataSelecionada}">${app.escapeHtml((app.parseDateOnly(dataSelecionada) || new Date()).toLocaleDateString('pt-BR'))}</option>` : datasAcademicas.map((d) => { const parsed = app.parseDateOnly(d); const label = parsed ? parsed.toLocaleDateString('pt-BR') : d; return `<option value="${d}" ${d === dataSelecionada ? 'selected' : ''}>${app.escapeHtml(label)}</option>`; }).join('')}</select></div>
            </div>
        `;
    };

    app.renderPresencaEquipeLista = function(totalAlunos) {
        return `
            <div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div class="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between"><h3 class="font-semibold text-gray-800 dark:text-white">Lista de Frequencia (${totalAlunos} aluno(s))</h3><div id="presenca-resumo" class="flex items-center gap-2"></div></div>
                <div class="overflow-x-auto"><table class="w-full min-w-full md:min-w-[1060px] text-left text-sm table-fixed"><thead class="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200"><tr><th class="p-3 w-2/5">Aluno</th><th class="p-3 w-1/5">Status</th><th class="p-3 w-2/5">Justificativa</th></tr></thead><tbody id="presenca-table-body"></tbody></table></div>
            </div>
        `;
    };

    app.renderPresencas = async function(container) {
        const [turmas, componentes, users, eventos, presencas] = await Promise.all([
            app.getCollection('turmas'),
            app.getCollection('componentes'),
            app.getCollection('users'),
            app.getCollection('eventos_calendario'),
            app.getCollection('presencas')
        ]);

        const turmasAtivas = turmas.filter(t => !t.concluida);
        let turmasPermitidas = turmasAtivas;
        let componentesPermitidos = componentes;

        if (app.perms && app.perms.isProfessor()) {
            turmasPermitidas = app.filterTurmasByProfessor(turmasAtivas, componentes);
            componentesPermitidos = componentes.filter(c => app.componentHasProfessor(c, app.currentUserData.id));
        }

        if (turmasPermitidas.length === 0) {
            container.innerHTML = '<div class="text-center py-10 text-gray-500 dark:text-gray-300">Nenhuma turma encontrada para lancamento de frequencia.</div>';
            return;
        }

        const feriadosSet = new Set(
            eventos
                .filter(e => ['feriado', 'recesso'].includes(String(e.tipo || '').trim().toLowerCase()))
                .map(e => {
                    const parsed = app.parseDateOnly(e.data);
                    if (!parsed || Number.isNaN(parsed)) return null;
                    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
                })
                .filter(Boolean)
        );

        const state = app._presencaState || {};
        const turmaId = state.turmaId && turmasPermitidas.some(t => t.id === state.turmaId) ? state.turmaId : turmasPermitidas[0].id;
        const compsTurma = componentesPermitidos.filter(c => c.turmaId === turmaId).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
        const componenteId = state.componenteId && compsTurma.some(c => c.id === state.componenteId) ? state.componenteId : (compsTurma[0]?.id || '');
        const componenteAtual = compsTurma.find(c => c.id === componenteId) || null;
        const datasAcademicas = app.getAcademicAttendanceDates(componenteAtual, feriadosSet);
        const dataSelecionada = state.data && datasAcademicas.includes(state.data) ? state.data : (datasAcademicas[datasAcademicas.length - 1] || app.toInputDate(new Date()));
        app._presencaState = { turmaId, componenteId, data: dataSelecionada };

        const turma = turmasPermitidas.find(t => t.id === turmaId);
        const alunos = users.filter(u => u.tipo === 'aluno' && (turma?.alunos || []).includes(u.id)).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));
        const alunosMap = new Map(alunos.map(a => [a.id, a.nome || 'Aluno']));
        const alunosEmRisco = buildAlunosEmRisco(
            presencas,
            turmaId,
            alunosMap,
            app.getPresencaStatusInfo,
            75
        );

        let registrosExistentes = {};
        const docId = componenteId ? `${turmaId}_${componenteId}_${dataSelecionada}` : '';
        if (docId) {
            const doc = await db.collection('presencas').doc(docId).get();
            registrosExistentes = doc.exists ? (doc.data().registros || {}) : {};
        }

        const registros = buildRegistrosIniciais(alunos, registrosExistentes, app.normalizeBonificacaoStatus);

        app._presencaDraft = { docId, turmaId, turmaNome: turma?.nome || 'Turma', componenteId, componenteNome: componenteAtual?.nome || 'Componente', data: dataSelecionada, alunos, registros };
        app._presencaBaselineRegistros = JSON.parse(JSON.stringify(registros || {}));

        const filtrosHtml = app.renderPresencaEquipeFiltros({
            turmasPermitidas,
            turmaId,
            compsTurma,
            componenteId,
            datasAcademicas,
            dataSelecionada
        });

        container.innerHTML = `
            <div class="space-y-6">
                ${app.renderPresencaEquipeHeader(docId)}
                ${app.renderPresencaEquipeRisco(alunosEmRisco)}
                ${filtrosHtml}
                ${app.renderPresencaEquipeLista(alunos.length)}
            </div>
        `;

        app.renderPresencaRows();
    };
}
