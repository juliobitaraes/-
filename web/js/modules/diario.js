import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendDiario(app) {
    app._diarioExpandedByGroup = app._diarioExpandedByGroup || {};
    app._diarioTurmaOpenById = app._diarioTurmaOpenById || {};
    app._diarioAtividadesDraft = app._diarioAtividadesDraft || {};
    app._diarioPendingNotas = app._diarioPendingNotas || {};
    app._diarioNotaSaveTimers = app._diarioNotaSaveTimers || {};

    const ensureValidProvaResultados = async (resultados = [], provas = []) => {
        const validProvaIds = new Set((provas || []).map((prova) => prova?.id).filter(Boolean));
        const resultadosValidos = (resultados || []).filter((resultado) => validProvaIds.has(resultado?.provaId));
        const resultadosOrfaos = (resultados || []).filter((resultado) => resultado?.id && resultado?.provaId && !validProvaIds.has(resultado.provaId));
        const canCleanup = app.perms && (app.perms.isAdmin() || app.perms.isProfessor());

        if (!canCleanup || resultadosOrfaos.length === 0 || typeof app.getSchoolCollectionRef !== 'function') {
            return resultadosValidos;
        }

        const schoolId = store.activeSchoolId || app.currentUserData?.schoolId || app.currentUserData?.escolaId;
        if (schoolId) {
            try {
                await functions.httpsCallable('repairSchoolProvaResultados')({ schoolId });
            } catch (error) {
                console.warn('Falha ao solicitar reparo backend dos resultados de prova:', error);
            }
        }

        const cleanupMarker = resultadosOrfaos.map((resultado) => resultado.id).sort().join('|');
        app._orphanedProvaCleanupDone = app._orphanedProvaCleanupDone || new Set();
        if (!cleanupMarker || app._orphanedProvaCleanupDone.has(cleanupMarker) || app._orphanedProvaCleanupRunning === cleanupMarker) {
            return resultadosValidos;
        }

        app._orphanedProvaCleanupRunning = cleanupMarker;
        try {
            const batchWriter = firebase.firestore().batch();
            const resultadosRef = app.getSchoolCollectionRef('provas_resultados');
            resultadosOrfaos.forEach((resultado) => {
                batchWriter.delete(resultadosRef.doc(resultado.id));
            });
            await batchWriter.commit();
            app._orphanedProvaCleanupDone.add(cleanupMarker);
        } catch (error) {
            console.warn('Falha ao limpar resultados de provas orfaos no diario:', error);
        } finally {
            app._orphanedProvaCleanupRunning = null;
        }

        return resultadosValidos;
    };

    const getResultadoTimestampMs = (resultado) => {
        const raw = resultado?.data;
        if (!raw) return 0;
        if (typeof raw?.toDate === 'function') {
            const date = raw.toDate();
            return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
        }
        if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };

    const shouldUseBestAttempt = (prova) => typeof prova?.attempts === 'number' && (prova.attempts === 0 || prova.attempts > 1);

    const consolidateResultadosByProvaAluno = (resultados = [], provas = []) => {
        const provasMap = new Map((provas || []).map((prova) => [prova?.id, prova]));
        const consolidated = new Map();

        (resultados || []).forEach((resultado) => {
            const provaId = resultado?.provaId;
            const alunoId = resultado?.alunoId;
            if (!provaId || !alunoId) return;

            const prova = provasMap.get(provaId);
            if (!prova) return;

            const key = `${provaId}::${alunoId}`;
            const prev = consolidated.get(key);
            const currentNota = parseFloat(resultado?.nota);
            const prevNota = prev ? parseFloat(prev?.nota) : Number.NEGATIVE_INFINITY;
            const currentMs = getResultadoTimestampMs(resultado);
            const prevMs = prev ? getResultadoTimestampMs(prev) : Number.NEGATIVE_INFINITY;

            if (shouldUseBestAttempt(prova)) {
                const currentNotaValid = Number.isFinite(currentNota);
                const prevNotaValid = Number.isFinite(prevNota);
                if (!prev || (currentNotaValid && !prevNotaValid) || (currentNotaValid && prevNotaValid && currentNota > prevNota) || (currentNotaValid && prevNotaValid && currentNota === prevNota && currentMs > prevMs)) {
                    consolidated.set(key, resultado);
                }
                return;
            }

            if (!prev || currentMs > prevMs) consolidated.set(key, resultado);
        });

        return consolidated;
    };

    app.renderTurmaResultados = async function(turmaId, turmaNome, options = {}) {
        const mode = options.mode || 'notasTrabalhos';
        const targetPrefix = options.targetPrefix || 'dash-turma';
        const sectionPrefix = mode === 'atividadesEad' ? 'ead' : 'notas';
        const onlyAtividades = mode === 'atividadesEad';
        app._diarioRenderContext = app._diarioRenderContext || {};
        app._diarioRenderContext[`${sectionPrefix}-${turmaId}`] = { turmaId, turmaNome, options };
        const isAlunoUser = app.perms && app.perms.isAluno();
        const userRole = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        const canShowGerenciarComponentes = app.perms
            && app.perms.canManageComponentes()
            && userRole !== 'professor'
            && userRole !== 'aluno';
        const canSeeSIGOP = app.perms && (app.perms.isAdmin() || app.perms.isProfessor());
        const componentes = (await db.collection('componentes').where('turmaId', '==', turmaId).get()).docs.map(d => ({id: d.id, ...d.data()}));
        const allProvas = await app.getCollection('provas');
        const atividadesDiario = onlyAtividades ? [] : await app.getCollection('diario_atividades');
        const todasNotasTrabalhos = onlyAtividades ? [] : await app.getCollection('trabalhos_notas');
        const users = await app.getCollection('users');
        const turmaDoc = await db.collection('turmas').doc(turmaId).get();
        const alunosIds = turmaDoc.data()?.alunos || [];
        let alunosDaTurma = users.filter(u => u.tipo === 'aluno' && alunosIds.includes(u.id));
        const resultados = await ensureValidProvaResultados(await app.getCollection('provas_resultados'), allProvas);
        if (app.perms && app.perms.isAluno()) alunosDaTurma = alunosDaTurma.filter(a => a.id === app.currentUserData.id);
        const compareByName = (a, b) => (a?.nome || '').localeCompare(b?.nome || '', 'pt-BR', { sensitivity: 'base' });
        alunosDaTurma.sort(compareByName);
        const turmaNomeHtml = app.formatTurmaTextToHtml(turmaNome || 'Turma');
        const safeTurmaNomeAttr = (turmaNome || 'Turma').replace(/'/g, "\\'").replace(/\n/g, "\\n");
        const turmaContentId = `${targetPrefix}-${turmaId}-content`;
        const turmaToggleId = `${targetPrefix}-${turmaId}-toggle`;
        const turmaIsOpen = isAlunoUser || app._diarioTurmaOpenById[`${targetPrefix}-${turmaId}`] === true;
        const isAtividade = (p) => String(p?.tipo || '').trim().toLowerCase() === 'atividade';
        // Regra de negocio: atividades (EAD e avulsas) nao alimentam o Diario regular.
        const provasTurma = allProvas
            .filter(p => p.turmaId === turmaId)
            .filter(p => onlyAtividades ? isAtividade(p) : !isAtividade(p));
        const resultadoSelecionadoMap = consolidateResultadosByProvaAluno(resultados, provasTurma);
        let html = `
            <div class="flex justify-between items-center mb-6 border-b dark:border-slate-600 pb-4">
                <h3 class="font-bold text-2xl text-blue-900 dark:text-blue-400">${turmaNomeHtml}</h3>
                <div class="flex items-center gap-2">
                    ${canShowGerenciarComponentes ? `<button type="button" onclick="event.preventDefault(); event.stopPropagation(); app.modalComponentes('${turmaId}')" class="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-bold hover:bg-purple-200">Gerenciar Componentes</button>` : ''}
                    <button type="button" id="${turmaToggleId}" onclick="event.preventDefault(); event.stopPropagation(); app.toggleDiarioTurma('${turmaContentId}', '${turmaToggleId}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 ${isAlunoUser ? 'hidden' : ''}" aria-expanded="${turmaIsOpen ? 'true' : 'false'}" aria-controls="${turmaContentId}">
                        <i class="fas ${turmaIsOpen ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1"></i><span data-label>${turmaIsOpen ? 'Recolher' : 'Expandir'}</span>
                    </button>
                </div>
            </div>
            <div id="${turmaContentId}" class="space-y-6 ${turmaIsOpen ? '' : 'hidden'}">
        `;

        if (componentes.length === 0) {
            html += `<p class="text-gray-500 italic">Nenhum componente curricular cadastrado nesta turma.</p>`;
        } else {
            const normalize = (value) => String(value || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ');
            const parseCompDate = (value) => {
                if (!value) return null;
                const parsed = app.parseDateOnly ? app.parseDateOnly(value) : new Date(value);
                if (!parsed || Number.isNaN(parsed.getTime())) return null;
                return parsed;
            };
            let componentesOrdenados = [...componentes].sort((a, b) => {
                const aInicio = parseCompDate(a.dataInicio);
                const bInicio = parseCompDate(b.dataInicio);
                if (aInicio && bInicio && aInicio.getTime() !== bInicio.getTime()) {
                    return aInicio - bInicio;
                }
                if (aInicio && !bInicio) return -1;
                if (!aInicio && bInicio) return 1;

                const aFim = parseCompDate(a.dataFim);
                const bFim = parseCompDate(b.dataFim);
                if (aFim && bFim && aFim.getTime() !== bFim.getTime()) {
                    return aFim - bFim;
                }
                if (aFim && !bFim) return -1;
                if (!aFim && bFim) return 1;

                return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });
            });
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const isCompEmAndamento = (comp) => {
                const inicio = parseCompDate(comp.dataInicio);
                if (!inicio) return false;
                const fim = parseCompDate(comp.dataFim);
                const hojeMs = hoje.getTime();
                if (inicio.getTime() > hojeMs) return false;
                if (!fim) return true;
                return fim.getTime() >= hojeMs;
            };
            const isCompProxima = (comp) => {
                const inicio = parseCompDate(comp.dataInicio);
                if (!inicio) return false;
                return inicio.getTime() > hoje.getTime();
            };
            const isCompConcluida = (comp) => {
                const fim = parseCompDate(comp.dataFim);
                if (!fim) return false;
                return fim.getTime() < hoje.getTime();
            };
            let componentesDisponiveisPorData = componentesOrdenados.length;
            if (isAlunoUser) {
                componentesOrdenados = componentesOrdenados.filter((comp) => {
                    const inicio = parseCompDate(comp.dataInicio);
                    if (!inicio) return true;
                    return inicio.getTime() <= hoje.getTime();
                });
                componentesDisponiveisPorData = componentesOrdenados.length;
            }
            const primeiraProximaComp = componentesOrdenados.find((comp) => !isCompConcluida(comp) && !isCompEmAndamento(comp) && isCompProxima(comp));
            const primeiraProximaCompId = primeiraProximaComp ? primeiraProximaComp.id : null;
            html += `
                <div class="flex flex-wrap items-center gap-3 mb-2 text-xs text-gray-600 dark:text-gray-300">
                    <span class="inline-flex items-center gap-2">
                        <span class="w-3 h-3 rounded-sm bg-emerald-500"></span>
                        Componente em andamento
                    </span>
                    <span class="inline-flex items-center gap-2">
                        <span class="w-3 h-3 rounded-sm bg-amber-500"></span>
                        Primeira próxima componente
                    </span>
                    <span class="inline-flex items-center gap-2">
                        <span class="w-3 h-3 rounded-sm bg-slate-500"></span>
                        Componente concluída
                    </span>
                </div>
            `;
            function notasTrabDoCompBase(compId, compNomeNorm) {
                return onlyAtividades ? [] : todasNotasTrabalhos.filter((n) => {
                    if (n.turmaId !== turmaId) return false;
                    if (n.componenteId === compId) return true;
                    if (normalize(n.componenteNome) === compNomeNorm) return true;
                    return normalize(n.componenteId) === compNomeNorm;
                });
            }

            if (componentesOrdenados.length === 0) {
                if (isAlunoUser && componentesDisponiveisPorData === 0) {
                    html += `<p class="text-gray-500 italic">Nenhum componente curricular disponível até a data atual.</p>`;
                } else {
                    html += `<p class="text-gray-500 italic">Nenhum componente curricular disponível para exibição.</p>`;
                }
            }

            componentesOrdenados.forEach(comp => {
                const compKey = `${sectionPrefix}-${turmaId}-${comp.id}`;
                const compContentId = `diario-comp-${compKey}`;
                const compToggleId = `diario-toggle-${compKey}`;
                const compGroupId = `${targetPrefix}-${turmaId}`;
                const isCompOpen = isAlunoUser || app._diarioExpandedByGroup[compGroupId] === compContentId;
                const compEmAndamento = isCompEmAndamento(comp);
                const compConcluida = !compEmAndamento && isCompConcluida(comp);
                const compProxima = !compEmAndamento && !compConcluida && comp.id === primeiraProximaCompId;
                const compHeaderClass = compEmAndamento
                    ? 'rounded-md px-3 py-2 bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-500/60'
                    : (compProxima
                        ? 'rounded-md px-3 py-2 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-500/60'
                        : (compConcluida ? 'rounded-md px-3 py-2 bg-slate-100 border border-slate-300 dark:bg-slate-800/70 dark:border-slate-600' : ''));
                const provasDoComp = provasTurma.filter(p => p.componenteId === comp.id);
                const compNomeNorm = normalize(comp.nome);
                const notasTrabDoComp = notasTrabDoCompBase(comp.id, compNomeNorm);
                const draftKey = `${sectionPrefix}-${turmaId}-${comp.id}`;
                const atividadesSalvas = atividadesDiario.filter(activity => activity.turmaId === turmaId && activity.componenteId === comp.id);
                const atividadesDraft = onlyAtividades ? [] : [...atividadesSalvas.map(activity => ({ id: activity.id, title: activity.titulo })), ...(app._diarioAtividadesDraft[draftKey] || [])]
                    .filter((activity, index, list) => list.findIndex(item => item.id === activity.id) === index);
                const titulosTrabalhos = onlyAtividades ? [] : [...new Set(notasTrabDoComp.map(n => n.titulo))];
                const titulosAtividades = [...new Set([...titulosTrabalhos, ...atividadesDraft.map(activity => activity.title).filter(Boolean)])];
                const canCreateAtividade = app.perms && app.perms.canLancarNotaManual();
                const exportHandler = onlyAtividades
                    ? `app.exportarDiarioAtividadesEad('${turmaId}', '${safeTurmaNomeAttr}', '${comp.nome}', '${comp.id}')`
                    : `app.exportarDiario('${turmaId}', '${safeTurmaNomeAttr}', '${comp.nome}', '${comp.id}')`;

                html += `
                    <div class="mb-8">
                        <div class="flex justify-between items-center mb-2 ${compHeaderClass}">
                            <h4 class="font-bold text-lg text-gray-700 dark:text-white flex items-center gap-2">
                                <i class="fas fa-book text-blue-500"></i> ${comp.nome}
                                ${compEmAndamento ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-600 text-white">Em andamento</span>' : ''}
                                ${compProxima ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500 text-white">Próxima</span>' : ''}
                                ${compConcluida ? '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-slate-600 text-white">Concluída</span>' : ''}
                            </h4>
                            <div class="flex items-center gap-2">
                                ${isAlunoUser ? '' : `
                                    <button type="button" id="${compToggleId}" data-accordion-group="${compGroupId}" onclick="event.preventDefault(); event.stopPropagation(); app.toggleDiarioComponent('${compContentId}', '${compToggleId}', '${compGroupId}')" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200" aria-expanded="${isCompOpen ? 'true' : 'false'}" aria-controls="${compContentId}">
                                        <i class="fas ${isCompOpen ? 'fa-chevron-up' : 'fa-chevron-down'} mr-1"></i><span data-label>${isCompOpen ? 'Ocultar alunos' : 'Mostrar alunos'}</span>
                                    </button>
                                `}
                                ${canCreateAtividade && !onlyAtividades ? `<button type="button" onclick="event.preventDefault(); event.stopPropagation(); app.criarAtividadeDiario('${turmaId}', '${safeTurmaNomeAttr}', '${comp.id}', '${String(comp.nome).replace(/'/g, "\\'")}', '${targetPrefix}', '${mode}')" class="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>Criar Atividade</button>` : ''}
                                <button type="button" onclick="event.preventDefault(); event.stopPropagation(); ${exportHandler}" class="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"><i class="fas fa-file-excel mr-1"></i>Excel</button>
                            </div>
                        </div>
                        <div id="${compContentId}" class="accordion-content ${isCompOpen ? 'open' : ''} overflow-x-auto border rounded-lg dark:border-slate-600">
                            <table id="table-${sectionPrefix}-${comp.id}" class="w-full text-left text-sm font-semibold text-gray-900 dark:text-white">
                                <thead class="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
                                    <tr>
                                        <th class="p-3">Aluno</th>
                                        ${provasDoComp.map(p => `<th class="p-3 text-center min-w-[100px] ${isAtividade(p) ? 'text-indigo-600 dark:text-indigo-400' : (p.provaRecuperacao ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400')}">${p.titulo}${isAtividade(p) ? ' <span class="text-xs font-normal opacity-75">(EAD)</span>' : (p.provaRecuperacao ? ' <span class="text-xs font-normal opacity-75">(Recup.)</span>' : '')}</th>`).join('')}
                                        ${titulosAtividades.map(t => {
                                            const draft = atividadesDraft.find(activity => activity.title === t);
                                            const titleHtml = draft ? `<span class="cursor-pointer" title="Duplo clique para renomear" ondblclick="event.preventDefault(); event.stopPropagation(); app.renomearAtividadeDiario('${turmaId}', '${comp.id}', '${draft.id}', undefined, '${targetPrefix}', '${mode}')">${app.escapeHtml(t)}</span>` : app.escapeHtml(t);
                                            const deleteHtml = draft && canCreateAtividade ? `<button type="button" title="Excluir atividade" aria-label="Excluir atividade" onclick="event.preventDefault(); event.stopPropagation(); app.excluirAtividadeDiario('${turmaId}', '${comp.id}', '${draft.id}', '', '${targetPrefix}', '${mode}')" class="ml-1 text-red-600 hover:text-red-800"><i class="fas fa-trash-alt"></i></button>` : '';
                                            return `<th class="p-3 text-center min-w-[140px] text-yellow-600 dark:text-yellow-500"><span class="inline-flex items-center justify-center gap-1">${titleHtml}${deleteHtml}</span></th>`;
                                        }).join('')}
                                        <th class="p-3 text-center font-bold text-gray-800 dark:text-white bg-gray-100 dark:bg-slate-600">Total (0-100)</th>
                                        ${canSeeSIGOP ? `<th class="p-3 text-center font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 min-w-[110px]">Nota SIGOP</th>` : ''}
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                                    ${alunosDaTurma.map(aluno => {
                                        let somaTotal = 0; let qtdNotas = 0;
                                        const provaRecupIds = provasDoComp.filter(p => p.provaRecuperacao === true).map(p => p.id);
                                        const notasRecuperacao = resultados
                                            .filter(r => provaRecupIds.includes(r.provaId) && r.alunoId === aluno.id)
                                            .map(r => parseFloat(r.nota))
                                            .filter((nota) => Number.isFinite(nota));
                                        const melhorNotaRecuperacao = notasRecuperacao.length > 0 ? Math.max(...notasRecuperacao) : null;
                                        const temRecuperacao = melhorNotaRecuperacao != null;
                                        const htmlProvas = provasDoComp.map(p => {
                                            const res = resultadoSelecionadoMap.get(`${p.id}::${aluno.id}`);
                                            if(!res) return `<td class="p-3 text-center text-gray-700 dark:text-white cursor-pointer" data-nota-type="prova" data-diario-mode="${mode}" data-prova-id="${p.id}" data-aluno-id="${aluno.id}" data-turma-id="${turmaId}" data-comp-id="${comp.id}" data-diario-prefix="${targetPrefix}" title="Duplo clique para lançar nota" ondblclick="event.preventDefault(); event.stopPropagation(); app.iniciarEdicaoNotaDiario(this)">-</td>`;
                                            const nota = parseFloat(res.nota);
                                            if (!temRecuperacao && !p.provaRecuperacao) { somaTotal += nota; qtdNotas++; }
                                            const cellClass = p.provaRecuperacao ? 'text-orange-600 dark:text-orange-400 font-semibold' : '';
                                            return `<td class="p-3 text-center ${cellClass} cursor-pointer" data-nota-type="prova" data-diario-mode="${mode}" data-resultado-id="${res.id}" data-aluno-id="${aluno.id}" data-turma-id="${turmaId}" data-diario-prefix="${targetPrefix}" title="Duplo clique para editar" ondblclick="event.preventDefault(); event.stopPropagation(); app.iniciarEdicaoNotaDiario(this)">${nota.toFixed(1)}</td>`;
                                        }).join('');
                                        const htmlTrabalhos = titulosAtividades.map(titulo => {
                                            const draft = atividadesDraft.find(activity => activity.title === titulo);
                                            const notaObj = notasTrabDoComp.find(n => n.alunoId === aluno.id && (draft?.id ? (n.activityId === draft.id || (!n.activityId && n.titulo === titulo)) : n.titulo === titulo));
                                            if (draft) {
                                                const pendingKey = `${draft.id}::${aluno.id}`;
                                                const pendingNota = app._diarioPendingNotas[pendingKey];
                                                const notaExibida = pendingNota !== undefined ? pendingNota : (notaObj ? notaObj.nota : '');
                                                if (notaExibida !== '' && !temRecuperacao) {
                                                    const nota = Number(notaExibida);
                                                    if (Number.isFinite(nota)) { somaTotal += nota; qtdNotas++; }
                                                }
                                                return `<td class="p-2 text-center"><input type="number" min="0" max="100" step="0.1" value="${notaExibida}" data-diario-activity-id="${draft.id}" data-diario-mode="${mode}" data-aluno-id="${aluno.id}" data-turma-id="${turmaId}" data-comp-id="${comp.id}" data-comp-nome="${app.escapeHtml(comp.nome)}" class="w-20 rounded border border-yellow-300 px-2 py-1 text-center text-sm" oninput="app.atualizarTotalLinhaDiario(this); app.agendarSalvamentoAtividadeDiario(this)" onkeydown="if(event.key === 'Enter'){event.preventDefault(); event.stopPropagation(); event.currentTarget.blur(); app.salvarAtividadeDiarioNota(event.currentTarget, true); return false;}" onchange="app.salvarAtividadeDiarioNota(this, true)"></td>`;
                                            }
                                            if(!notaObj) return `<td class="p-3 text-center text-gray-700 dark:text-white cursor-pointer" data-nota-type="manual" data-nota-id="" data-activity-id="${draft?.id || ''}" data-titulo="${app.escapeHtml(titulo)}" data-aluno-id="${aluno.id}" data-turma-id="${turmaId}" data-comp-id="${comp.id}" data-comp-nome="${app.escapeHtml(comp.nome)}" data-diario-prefix="${targetPrefix}" title="Duplo clique para lançar nota" ondblclick="event.preventDefault(); event.stopPropagation(); app.iniciarEdicaoNotaDiario(this)">-</td>`;
                                            const nota = parseFloat(notaObj.nota); if (!temRecuperacao) { somaTotal += nota; qtdNotas++; } return `<td class="p-3 text-center cursor-pointer" data-nota-type="manual" data-nota-id="${notaObj.id}" data-activity-id="${notaObj.activityId || ''}" data-titulo="${app.escapeHtml(titulo)}" data-aluno-id="${aluno.id}" data-turma-id="${turmaId}" data-comp-id="${comp.id}" data-comp-nome="${app.escapeHtml(comp.nome)}" data-diario-prefix="${targetPrefix}" title="Duplo clique para editar" ondblclick="event.preventDefault(); event.stopPropagation(); app.iniciarEdicaoNotaDiario(this)">${nota.toFixed(1)}</td>`;
                                        }).join('');
                                        const totalFinal = temRecuperacao ? Math.min(60, melhorNotaRecuperacao) : Math.min(100, somaTotal);
                                        const corFinal = totalFinal >= 60 ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-800 dark:text-gray-200 font-bold';
                                        return `
                                        <tr class="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                                            <td class="p-3 font-medium text-gray-900 dark:text-white">
                                                <div class="flex items-center justify-between gap-2">
                                                    <span>${aluno.nome}</span>
                                                    ${app.perms && app.perms.canLancarNotaManual() ? `
                                                        <button type="button" onclick="event.preventDefault(); event.stopPropagation(); app.modalNotasAluno('${aluno.id}')" class="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition">
                                                            <i class=\"fas fa-star mr-1\"></i> Gerenciar Notas
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </td>
                                            ${htmlProvas}
                                            ${htmlTrabalhos}
                                            <td data-diario-total class="p-3 text-center bg-gray-50 dark:bg-slate-800 border-l dark:border-slate-700 ${corFinal}">${totalFinal.toFixed(1)}</td>
                                            ${canSeeSIGOP ? `<td class="p-3 text-center bg-purple-50 dark:bg-purple-900/20 border-l dark:border-slate-700 text-purple-700 dark:text-purple-300 font-bold">${(Math.ceil((totalFinal / 10) / 0.05) * 0.05).toFixed(2)}</td>` : ''}
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;

        const el = document.getElementById(`${targetPrefix}-${turmaId}`);
        if (el) el.innerHTML = html;
    };

    app.criarAtividadeDiario = async function(turmaId, turmaNome, componenteId, componenteNome, targetPrefix, mode = 'notasTrabalhos') {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        app.capturarNotasPendentesDiario();
        app.preservarEstadoDiario(turmaId, componenteId, targetPrefix, mode);
        const sectionPrefix = mode === 'atividadesEad' ? 'ead' : 'notas';
        const draftKey = `${sectionPrefix}-${turmaId}-${componenteId}`;
        app._diarioAtividadesDraft[draftKey] = app._diarioAtividadesDraft[draftKey] || [];
        const activityId = `atividade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('diario_atividades').doc(activityId).set({ turmaId, turmaNome, componenteId, componenteNome, titulo: 'Nova atividade', criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        app._diarioAtividadesDraft[draftKey].push({ id: activityId, title: 'Nova atividade' });
        const context = app._diarioRenderContext?.[`${sectionPrefix}-${turmaId}`];
        if (context) await app.renderTurmaResultados(context.turmaId, context.turmaNome, context.options);
    };

    app.renomearAtividadeDiario = async function(turmaId, componenteId, activityId, title, targetPrefix, mode = 'notasTrabalhos') {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        const sectionPrefix = mode === 'atividadesEad' ? 'ead' : 'notas';
        app.preservarEstadoDiario(turmaId, componenteId, targetPrefix, mode);
        const draftKey = `${sectionPrefix}-${turmaId}-${componenteId}`;
        const atividadesSnapshot = await db.collection('diario_atividades').get();
        const atividadesSalvas = atividadesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const draft = [...atividadesSalvas.filter(activity => activity.id === activityId), ...(app._diarioAtividadesDraft[draftKey] || [])].find(activity => activity.id === activityId);
        if (!draft) return;
        const normalizedTitle = String(title || prompt('Nome da atividade:', draft.title || draft.titulo || '') || '').trim();
        if (!normalizedTitle) return alert('Informe o nome da atividade.');
        const previousTitle = draft.title || draft.titulo || '';
        const localDraft = (app._diarioAtividadesDraft[draftKey] || []).find(activity => activity.id === activityId);
        if (localDraft) localDraft.title = normalizedTitle;
        await db.collection('diario_atividades').doc(activityId).update({ titulo: normalizedTitle, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        const notasRelacionadasSnapshot = await db.collection('trabalhos_notas').where('turmaId', '==', turmaId).get();
        const notasRelacionadas = notasRelacionadasSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(nota => nota.activityId === activityId || (nota.turmaId === turmaId && nota.componenteId === componenteId && !nota.activityId && nota.titulo === previousTitle));
        for (const nota of notasRelacionadas) await db.collection('trabalhos_notas').doc(nota.id).update({ titulo: normalizedTitle, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        const context = app._diarioRenderContext?.[`${sectionPrefix}-${turmaId}`];
        if (context) await app.renderTurmaResultados(context.turmaId, context.turmaNome, context.options);
    };

    app.excluirAtividadeDiario = async function(turmaId, componenteId, activityId, title, targetPrefix, mode = 'notasTrabalhos') {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        app.preservarEstadoDiario(turmaId, componenteId, targetPrefix, mode);
        const atividadeSnapshot = await db.collection('diario_atividades').doc(activityId).get();
        const atividadeSalva = atividadeSnapshot.exists ? { id: atividadeSnapshot.id, ...atividadeSnapshot.data() } : null;
        const activityTitle = title || atividadeSalva?.titulo || atividadeSalva?.title || 'esta atividade';
        if (!confirm(`Excluir a atividade "${activityTitle}" e todas as notas lançadas nela?`)) return;
        const notasSnapshot = await db.collection('trabalhos_notas').where('turmaId', '==', turmaId).get();
        const notas = notasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(nota => nota.activityId === activityId || (nota.componenteId === componenteId && nota.titulo === activityTitle));
        for (const nota of notas) await db.collection('trabalhos_notas').doc(nota.id).delete();
        await db.collection('diario_atividades').doc(activityId).delete();
        const draftKey = `${mode === 'atividadesEad' ? 'ead' : 'notas'}-${turmaId}-${componenteId}`;
        app._diarioAtividadesDraft[draftKey] = (app._diarioAtividadesDraft[draftKey] || []).filter(activity => activity.id !== activityId);
        const sectionPrefix = mode === 'atividadesEad' ? 'ead' : 'notas';
        const context = app._diarioRenderContext?.[`${sectionPrefix}-${turmaId}`];
        if (context) await app.renderTurmaResultados(context.turmaId, context.turmaNome, context.options);
    };

    app.agendarSalvamentoAtividadeDiario = function(input) {
        const key = `${input.dataset.diarioActivityId}::${input.dataset.alunoId}`;
        clearTimeout(app._diarioNotaSaveTimers[key]);
        app._diarioNotaSaveTimers[key] = setTimeout(() => app.salvarAtividadeDiarioNota(input, false), 450);
    };

    app.salvarAtividadeDiarioNota = async function(input, renderAfterSave = true) {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        const activityId = input?.dataset?.diarioActivityId;
        const alunoId = input?.dataset?.alunoId;
        const turmaId = input?.dataset?.turmaId;
        const componenteId = input?.dataset?.compId;
        app.preservarEstadoDiario(turmaId, componenteId, input?.dataset?.diarioPrefix || 'dash-notas-turma', 'notasTrabalhos');
        const draftKey = `notas-${turmaId}-${componenteId}`;
        const atividadesSnapshot = await db.collection('diario_atividades').get();
        const atividadesSalvas = atividadesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const draft = [...atividadesSalvas.filter(activity => activity.id === activityId), ...(app._diarioAtividadesDraft[draftKey] || [])].find(activity => activity.id === activityId);
        const nota = String(input.value || '').trim();
        if (!draft || !alunoId || !turmaId || !componenteId) return;
        if (input.dataset.saving === 'true') return;
        input.dataset.saving = 'true';
        if (app.showToast) app.showToast('Salvando nota...', 'info');
        app._diarioPendingNotas[`${activityId}::${alunoId}`] = nota;
        if (nota !== '' && (!Number.isFinite(Number(nota)) || Number(nota) < 0 || Number(nota) > 100)) {
            input.dataset.saving = 'false';
            input.value = '';
            return alert('Informe uma nota entre 0 e 100.');
        }
        if (nota !== '' && !(await app.podeSalvarNotaDiario({ turmaId, componenteId, alunoId, activityId, nota: Number(nota), diarioMode: input?.dataset?.diarioMode }))) { input.dataset.saving = 'false'; return; }
        try {
            const notasSnapshot = await db.collection('trabalhos_notas').where('turmaId', '==', turmaId).get();
            const notasExistentes = notasSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(notaItem => notaItem.componenteId === componenteId && notaItem.alunoId === alunoId && (notaItem.activityId === activityId || notaItem.titulo === draft.title));
            for (const notaExistente of notasExistentes) await db.collection('trabalhos_notas').doc(notaExistente.id).delete();
            if (nota !== '') {
                const context = app._diarioRenderContext?.[`notas-${turmaId}`];
                await db.collection('trabalhos_notas').add({ activityId, alunoId, turmaId, turmaNome: context?.turmaNome || '', componenteId, componenteNome: input.dataset.compNome || '', titulo: draft.title, nota: parseFloat(nota), criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
            }
        } catch (error) {
            input.dataset.saving = 'false';
            console.error('Falha ao salvar nota da atividade:', error);
            if (app.showToast) app.showToast(`Não foi possível salvar a nota: ${error?.message || 'erro de acesso ao banco'}`, 'error');
            return;
        }
        delete app._diarioPendingNotas[`${activityId}::${alunoId}`];
        const context = app._diarioRenderContext?.[`notas-${turmaId}`];
        if (renderAfterSave && context) await app.renderTurmaResultados(context.turmaId, context.turmaNome, context.options);
        if (!renderAfterSave) input.dataset.saving = 'false';
        if (app.showToast) app.showToast('Nota salva com sucesso!', 'success');
    };

    app.iniciarEdicaoNotaDiario = function(cell) {
        if (!cell || !app.perms || !app.perms.canLancarNotaManual()) return;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = cell.dataset.notaType === 'prova' ? '60' : '100';
        input.step = '0.1';
        input.value = cell.textContent.trim() === '-' ? '' : cell.textContent.trim();
        input.className = 'w-20 rounded border border-blue-300 px-2 py-1 text-center text-sm';
        [...cell.attributes].filter(attribute => attribute.name.startsWith('data-')).forEach(attribute => input.setAttribute(attribute.name, attribute.value));
        input.oninput = () => app.atualizarTotalLinhaDiario(input);
        input.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                input.blur();
                if (input.dataset.saving !== 'true') app.salvarEdicaoNotaDiario(input);
                return;
            }
        };
        input.onchange = () => app.salvarEdicaoNotaDiario(input);
        cell.replaceChildren(input);
        input.focus();
        input.select();
    };

    app.salvarEdicaoNotaDiario = async function(input) {
        if (input.dataset.saving === 'true') return;
        input.dataset.saving = 'true';
        const nota = parseFloat(input.value);
        const max = input.dataset.notaType === 'prova' ? 60 : 100;
        if (!Number.isFinite(nota) || nota < 0 || nota > max) { input.dataset.saving = 'false'; return alert(`Informe uma nota entre 0 e ${max}.`); }
        if (!(await app.podeSalvarNotaDiario({ turmaId: input.dataset.turmaId, componenteId: input.dataset.compId, alunoId: input.dataset.alunoId, activityId: input.dataset.activityId, notaId: input.dataset.notaId, nota, provaId: input.dataset.provaId, resultadoId: input.dataset.resultadoId, notaType: input.dataset.notaType, diarioMode: input.dataset.diarioMode }))) { input.dataset.saving = 'false'; return; }
        app.preservarEstadoDiario(input.dataset.turmaId, input.dataset.compId, input.dataset.diarioPrefix || 'dash-notas-turma', 'notasTrabalhos');
        if (app.showToast) app.showToast('Salvando nota...', 'info');
        try {
            if (input.dataset.notaType === 'prova') {
                if (input.dataset.resultadoId) await db.collection('provas_resultados').doc(input.dataset.resultadoId).update({ nota, ajustadoPor: app.currentUserData.id, ajustadoEm: firebase.firestore.FieldValue.serverTimestamp() });
                else await db.collection('provas_resultados').doc(`diario_${input.dataset.provaId}_${input.dataset.alunoId}`).set({ provaId: input.dataset.provaId, alunoId: input.dataset.alunoId, nota: nota.toFixed(1), respostas: {}, data: firebase.firestore.FieldValue.serverTimestamp(), ajustadoPor: app.currentUserData.id }, { merge: true });
            } else {
                if (input.dataset.notaId) await db.collection('trabalhos_notas').doc(input.dataset.notaId).update({ nota, ...(input.dataset.activityId ? { activityId: input.dataset.activityId } : {}), ...(input.dataset.titulo ? { titulo: input.dataset.titulo } : {}), atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
                else await db.collection('trabalhos_notas').add({ ...(input.dataset.activityId ? { activityId: input.dataset.activityId } : {}), alunoId: input.dataset.alunoId, turmaId: input.dataset.turmaId, turmaNome: app._diarioRenderContext?.[`notas-${input.dataset.turmaId}`]?.turmaNome || '', componenteId: input.dataset.compId, componenteNome: input.dataset.compNome || '', titulo: input.dataset.titulo || 'Atividade', nota, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
            }
        } catch (error) {
            input.dataset.saving = 'false';
            console.error('Falha ao salvar nota do diario:', error);
            if (app.showToast) app.showToast(`Não foi possível salvar a nota: ${error?.message || 'erro de acesso ao banco'}`, 'error');
            return;
        }
        const context = app._diarioRenderContext?.[`notas-${input.dataset.turmaId}`];
        if (context) await app.renderTurmaResultados(context.turmaId, context.turmaNome, context.options);
        if (app.showToast) app.showToast('Nota atualizada!');
    };

    app.atualizarTotalLinhaDiario = function(input) {
        const row = input?.closest('tr');
        const totalCell = row?.querySelector('[data-diario-total]');
        if (!row || !totalCell) return;
        let total = 0;
        row.querySelectorAll('td').forEach((cell) => {
            if (cell === totalCell) return;
            const field = cell.querySelector('input[type="number"]');
            const rawValue = field ? field.value : (cell.dataset.notaType ? cell.textContent : '');
            const value = Number(String(rawValue || '').trim());
            if (Number.isFinite(value)) total += value;
        });
        totalCell.textContent = Math.min(100, total).toFixed(1);
    };

    app.capturarNotasPendentesDiario = function() {
        document.querySelectorAll('input[data-diario-activity-id]').forEach((input) => {
            app._diarioPendingNotas[`${input.dataset.diarioActivityId}::${input.dataset.alunoId}`] = input.value;
        });
    };

    app.podeSalvarNotaDiario = async function({ turmaId, componenteId, alunoId, activityId, notaId, nota, provaId, resultadoId, notaType, diarioMode = 'notasTrabalhos' }) {
        const provasSnapshot = await db.collection('provas').get();
        const provas = provasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const resultadosSnapshot = await db.collection('provas_resultados').get();
        const resultados = resultadosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const notasSnapshot = await db.collection('trabalhos_notas').where('turmaId', '==', turmaId).get();
        const notasTrabalhos = notasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let total = 0;
        provas.filter(prova => prova.turmaId === turmaId && prova.componenteId === componenteId && (diarioMode === 'atividadesEad' ? prova.tipo === 'atividade' : prova.tipo !== 'atividade') && !prova.provaRecuperacao).forEach(prova => {
            const resultadosProva = resultados.filter(resultado => resultado.provaId === prova.id && resultado.alunoId === alunoId && resultado.id !== resultadoId);
            if (resultadosProva.length) total += Math.max(...resultadosProva.map(resultado => Number(resultado.nota)).filter(Number.isFinite), 0);
        });
        if (diarioMode !== 'atividadesEad') notasTrabalhos.filter(item => item.componenteId === componenteId && item.alunoId === alunoId && item.id !== notaId && item.activityId !== activityId).forEach(item => {
            const valor = Number(item.nota);
            if (Number.isFinite(valor)) total += valor;
        });
        if (notaType === 'prova' && provaId) {
            const prova = provas.find(item => item.id === provaId);
            if (prova?.provaRecuperacao !== true) total += nota;
        } else total += nota;
        if (total > 100) {
            alert('A soma das notas não pode ultrapassar 100 pontos.');
            return false;
        }
        return true;
    };

    app.preservarEstadoDiario = function(turmaId, componenteId, targetPrefix = 'dash-notas-turma', mode = 'notasTrabalhos') {
        const sectionPrefix = mode === 'atividadesEad' ? 'ead' : 'notas';
        const turmaKey = `${targetPrefix}-${turmaId}`;
        const turmaContent = document.getElementById(`${turmaKey}-content`);
        if (turmaContent) app._diarioTurmaOpenById[turmaKey] = !turmaContent.classList.contains('hidden');
        const contentId = `diario-comp-${sectionPrefix}-${turmaId}-${componenteId}`;
        const componentContent = document.getElementById(contentId);
        if (componentContent && componentContent.classList.contains('open')) app._diarioExpandedByGroup[turmaKey] = contentId;
    };

    app.toggleDiarioComponent = function(contentId, toggleId, groupId = null) {
        const content = document.getElementById(contentId);
        const toggle = document.getElementById(toggleId);
        if (!content || !toggle) return;

        const isOpen = content.classList.toggle('open');

        if (isOpen && groupId) {
            const groupButtons = document.querySelectorAll(`[data-accordion-group="${groupId}"]`);
            groupButtons.forEach((btn) => {
                if (btn.id === toggleId) return;
                const targetId = btn.getAttribute('aria-controls');
                const targetContent = targetId ? document.getElementById(targetId) : null;
                if (targetContent && targetContent.classList.contains('open')) {
                    targetContent.classList.remove('open');
                    btn.setAttribute('aria-expanded', 'false');
                    const otherLabel = btn.querySelector('[data-label]');
                    if (otherLabel) otherLabel.textContent = 'Mostrar alunos';
                    const otherIcon = btn.querySelector('i');
                    if (otherIcon) {
                        otherIcon.classList.add('fa-chevron-down');
                        otherIcon.classList.remove('fa-chevron-up');
                    }
                }
            });
            app._diarioExpandedByGroup[groupId] = contentId;
        } else if (!isOpen && groupId && app._diarioExpandedByGroup[groupId] === contentId) {
            delete app._diarioExpandedByGroup[groupId];
        }

        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        const label = toggle.querySelector('[data-label]');
        if (label) label.textContent = isOpen ? 'Ocultar alunos' : 'Mostrar alunos';
        const icon = toggle.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-chevron-down', !isOpen);
            icon.classList.toggle('fa-chevron-up', isOpen);
        }
    };

    app.exportarDiario = async function(turmaId, turmaNome, compNome, compId) {
        const formatResultDate = (value) => {
            if (!value) return '';
            let d = value;
            if (typeof value.toDate === 'function') d = value.toDate();
            else if (typeof value.seconds === 'number') d = new Date(value.seconds * 1000);
            else d = new Date(value);
            if (Number.isNaN(d)) return '';
            return d.toLocaleString('pt-BR');
        };
        const compareByName = (a, b) => (a?.nome || '').localeCompare(b?.nome || '', 'pt-BR', { sensitivity: 'base' });

        const turmaDoc = await db.collection('turmas').doc(turmaId).get();
        const alunosIds = turmaDoc.data()?.alunos || [];
        const users = await app.getCollection('users');
        let alunosDaTurma = users.filter(u => u.tipo === 'aluno' && alunosIds.includes(u.id));
        if (app.perms && app.perms.isAluno()) alunosDaTurma = alunosDaTurma.filter(a => a.id === app.currentUserData.id);
        alunosDaTurma.sort(compareByName);

        const componentes = await app.getCollection('componentes');
        const allProvas = await app.getCollection('provas');
        const resultados = await app.getCollection('provas_resultados');
        const todasNotasTrabalhos = await app.getCollection('trabalhos_notas');

        const normalize = (value) => String(value || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ');

        const comp = componentes.find(c => c.id === compId) || { nome: compNome };
        const compNomeNorm = normalize(comp.nome || compNome);
        const provasDoComp = allProvas.filter(p => p.turmaId === turmaId && p.componenteId === compId);
        const notasTrabDoComp = todasNotasTrabalhos.filter(n => {
            if (n.turmaId !== turmaId) return false;
            if (n.componenteId === compId) return true;
            if (normalize(n.componenteNome) === compNomeNorm) return true;
            return normalize(n.componenteId) === compNomeNorm;
        });
        const titulosTrabalhos = [...new Set(notasTrabDoComp.map(n => n.titulo))];

        const header = ['Aluno'];
        provasDoComp.forEach((p) => {
            header.push(`Nota - ${p.titulo}${p.provaRecuperacao ? ' (Recuperação)' : ''}`);
            header.push(`Data/Hora - ${p.titulo}`);
        });
        titulosTrabalhos.forEach((t) => header.push(t));
        header.push('Total (0-100)');
        const provaRecupIdsExport = provasDoComp.filter(p => p.provaRecuperacao === true).map(p => p.id);

        const rows = alunosDaTurma.map((aluno) => {
            let somaTotal = 0;
            let qtdNotas = 0;
            const row = [aluno.nome];
            const notasRecuperacaoExport = resultados
                .filter(r => provaRecupIdsExport.includes(r.provaId) && r.alunoId === aluno.id)
                .map(r => parseFloat(r.nota))
                .filter((nota) => Number.isFinite(nota));
            const melhorNotaRecuperacaoExport = notasRecuperacaoExport.length > 0 ? Math.max(...notasRecuperacaoExport) : null;
            const temRecuperacaoExport = melhorNotaRecuperacaoExport != null;

            provasDoComp.forEach((p) => {
                const res = resultados.find(r => r.provaId === p.id && r.alunoId === aluno.id);
                if (!res) {
                    row.push('');
                    row.push('');
                    return;
                }
                const nota = parseFloat(res.nota);
                if (Number.isFinite(nota)) {
                    if (!temRecuperacaoExport && !p.provaRecuperacao) { somaTotal += nota; qtdNotas++; }
                    row.push(nota.toFixed(1));
                } else {
                    row.push('');
                }
                row.push(formatResultDate(res.data));
            });

            titulosTrabalhos.forEach((titulo) => {
                const notaObj = notasTrabDoComp.find(n => n.alunoId === aluno.id && n.titulo === titulo);
                if (!notaObj) {
                    row.push('');
                    return;
                }
                const nota = parseFloat(notaObj.nota);
                if (Number.isFinite(nota)) {
                    if (!temRecuperacaoExport) { somaTotal += nota; qtdNotas++; }
                    row.push(nota.toFixed(1));
                } else {
                    row.push('');
                }
            });

            const totalFinal = temRecuperacaoExport ? Math.min(60, melhorNotaRecuperacaoExport) : Math.min(100, somaTotal);
            row.push(totalFinal.toFixed(1));
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Diário');
        XLSX.writeFile(wb, `${turmaNome}_${compNome}_Diario.xlsx`);
    };

    app.exportarDiarioAtividadesEad = async function(turmaId, turmaNome, compNome, compId) {
        const formatResultDate = (value) => {
            if (!value) return '';
            let d = value;
            if (typeof value.toDate === 'function') d = value.toDate();
            else if (typeof value.seconds === 'number') d = new Date(value.seconds * 1000);
            else d = new Date(value);
            if (Number.isNaN(d)) return '';
            return d.toLocaleString('pt-BR');
        };
        const compareByName = (a, b) => (a?.nome || '').localeCompare(b?.nome || '', 'pt-BR', { sensitivity: 'base' });

        const turmaDoc = await db.collection('turmas').doc(turmaId).get();
        const alunosIds = turmaDoc.data()?.alunos || [];
        const users = await app.getCollection('users');
        let alunosDaTurma = users.filter(u => u.tipo === 'aluno' && alunosIds.includes(u.id));
        if (app.perms && app.perms.isAluno()) alunosDaTurma = alunosDaTurma.filter(a => a.id === app.currentUserData.id);
        alunosDaTurma.sort(compareByName);

        const componentes = await app.getCollection('componentes');
        const allProvas = await app.getCollection('provas');
        const resultados = await app.getCollection('provas_resultados');

        const isAtividade = (p) => String(p?.tipo || '').trim().toLowerCase() === 'atividade';
        const comp = componentes.find(c => c.id === compId) || { nome: compNome };
        const provasDoComp = allProvas.filter(p => p.turmaId === turmaId && p.componenteId === compId && isAtividade(p));

        const header = ['Aluno'];
        provasDoComp.forEach((p) => {
            header.push(`Nota - ${p.titulo}`);
            header.push(`Data/Hora - ${p.titulo}`);
        });
        header.push('Total (0-100)');

        const rows = alunosDaTurma.map((aluno) => {
            let somaTotal = 0;
            let qtdNotas = 0;
            const row = [aluno.nome];

            provasDoComp.forEach((p) => {
                const res = resultados.find(r => r.provaId === p.id && r.alunoId === aluno.id);
                if (!res) {
                    row.push('');
                    row.push('');
                    return;
                }
                const nota = parseFloat(res.nota);
                if (Number.isFinite(nota)) {
                    somaTotal += nota;
                    qtdNotas++;
                    row.push(nota.toFixed(1));
                } else {
                    row.push('');
                }
                row.push(formatResultDate(res.data));
            });

            const totalFinal = Math.min(100, somaTotal);
            row.push(totalFinal.toFixed(1));
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Simulados');
        XLSX.writeFile(wb, `${turmaNome}_${comp.nome || compNome}_Diario_Atividades_EAD.xlsx`);
    };

    app.modalNotasAluno = async function(alunoId) {
        const canManageManual = app.perms && app.perms.canLancarNotaManual();
        const role = String(app.currentUserData?.tipo || '').trim().toLowerCase();
        const alunoDoc = await db.collection('users').doc(alunoId).get(); const alunoData = alunoDoc.data();
        const turmas = await app.getCollection('turmas');
        let turmasPermitidas = turmas.filter(t => (t.alunos || []).includes(alunoId));
        if (['professor', 'secretaria'].includes(role)) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmasPermitidas, componentes);
        }
        const notasTrabalhos = (await app.getCollection('trabalhos_notas')).filter(n => n.alunoId === alunoId);
        const componentes = await app.getCollection('componentes');
        const provas = await app.getCollection('provas');
        const resultadosProvas = (await ensureValidProvaResultados(await app.getCollection('provas_resultados'), provas)).filter(r => r.alunoId === alunoId);
        const provasMap = new Map(provas.map(p => [p.id, p]));
        const resultadosFiltrados = resultadosProvas.filter(r => {
            const prova = provasMap.get(r.provaId);
            return prova && turmasPermitidas.some(t => t.id === prova.turmaId);
        });
        const canEditProvas = app.perms && app.perms.canAjustarNotaProva();
        const canDeleteProvaNotas = app.perms && app.perms.canLancarNotaManual();

        const componentesProvas = Array.from(new Map(resultadosFiltrados.map(r => {
            const prova = provasMap.get(r.provaId) || {};
            const compId = prova.componenteId || 'geral';
            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            return [compId, { id: compId, nome: compNome }];
        })).values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const modalId = 'm-' + Date.now();
        const provasContentId = `notas-provas-${modalId}`;
        const historicoContentId = `notas-historico-${modalId}`;
        const provasSearchId = `notas-provas-busca-${modalId}`;
        const provasCompFilterId = `notas-provas-comp-${modalId}`;
        const provasCountId = `notas-provas-count-${modalId}`;

        const notasProvasHtml = resultadosFiltrados.length === 0
            ? '<div class="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/50 p-4 text-sm text-gray-500 dark:text-gray-400">Nenhuma prova com resultado registrado.</div>'
            : `<div class="space-y-3">${resultadosFiltrados.map(r => {
                const prova = provasMap.get(r.provaId) || {};
                const compId = prova.componenteId || 'geral';
                const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
                const notaVal = Number.isFinite(parseFloat(r.nota)) ? parseFloat(r.nota) : 0;
                const searchToken = `${String(prova.titulo || '')} ${String(compNome || '')}`
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9 ]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                const inputId = `nota-prova-${r.id}`;
                const deleteButton = canDeleteProvaNotas
                    ? `<button onclick="app.excluirNotaProva('${r.id}', '${alunoId}')" class="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-semibold transition">Excluir</button>`
                    : '';
                const editControls = canEditProvas
                    ? `<div class="flex items-center gap-2 flex-wrap md:justify-end">
                            <div class="flex items-center gap-2 bg-gray-50 dark:bg-slate-700/70 border border-gray-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5">
                                <input id="${inputId}" type="number" min="0" max="60" step="0.5" value="${notaVal.toFixed(1)}" class="w-20 bg-transparent text-right font-semibold text-gray-700 dark:text-white focus:outline-none">
                                <span class="text-xs text-gray-500 dark:text-gray-300">/ 60</span>
                            </div>
                            <button onclick="app.atualizarNotaProva('${r.id}', '${alunoId}')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-semibold transition">Salvar</button>
                            ${deleteButton}
                        </div>`
                    : `<div class="flex items-center gap-2 md:justify-end"><span class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-bold text-sm">${notaVal.toFixed(1)} / 60</span>${deleteButton}</div>`;
                return `
                    <div class="nota-prova-item rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-3 md:p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3" data-comp-id="${compId}" data-search="${searchToken}">
                        <div class="min-w-0">
                            <div class="font-semibold text-gray-800 dark:text-gray-100 truncate">${app.escapeHtml(prova.titulo || 'Prova')}</div>
                            <div class="text-xs text-blue-700 dark:text-blue-300 font-semibold mt-0.5">${app.escapeHtml(compNome)}</div>
                        </div>
                        ${editControls}
                    </div>
                `;
            }).join('')}</div>`;

        const provasToolbarHtml = resultadosFiltrados.length === 0 ? '' : `
            <div class="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2 mb-3">
                <input id="${provasSearchId}" type="text" placeholder="Buscar prova ou componente..." class="w-full p-2.5 border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-500 dark:text-white">
                <select id="${provasCompFilterId}" class="w-full p-2.5 border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-500 dark:text-white">
                    <option value="">Todos os componentes</option>
                    ${componentesProvas.map(comp => `<option value="${comp.id}">${app.escapeHtml(comp.nome)}</option>`).join('')}
                </select>
                <div id="${provasCountId}" class="text-xs md:text-sm font-semibold text-gray-500 dark:text-gray-300 self-center md:text-right"></div>
            </div>
        `;

        const content = `<div class="space-y-5">
            <div class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4">
                <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">Aluno</div>
                <div class="mt-1 font-semibold text-gray-800 dark:text-white">${app.escapeHtml(alunoData?.nome || 'Aluno')}</div>
            </div>
            <section class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 md:p-5">
                <button type="button" data-section-toggle data-target="${provasContentId}" class="w-full flex items-center justify-between gap-3 text-left">
                    <h4 class="font-bold text-lg text-gray-800 dark:text-white">Notas de Provas/Simulados</h4>
                    <i class="fas fa-chevron-up text-gray-500"></i>
                </button>
                <div id="${provasContentId}" class="mt-3">
                    ${provasToolbarHtml}
                    ${notasProvasHtml}
                </div>
            </section>
            <section class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 md:p-5">
                <button type="button" data-section-toggle data-target="${historicoContentId}" data-start-collapsed="true" class="w-full flex items-center justify-between gap-3 text-left">
                    <h4 class="font-bold text-lg text-gray-800 dark:text-white">Historico de Notas</h4>
                    <i class="fas fa-chevron-up text-gray-500"></i>
                </button>
                <div id="${historicoContentId}" class="mt-3">
                    <ul class="text-sm space-y-2 text-gray-600 dark:text-gray-300">${notasTrabalhos.length === 0 ? '<li class="rounded-lg bg-gray-50 dark:bg-slate-700/60 p-3">Nenhum trabalho lançado.</li>' : notasTrabalhos.map(n => { const compNome = componentes.find(c => c.id === n.componenteId)?.nome || 'Geral'; const deleteBtn = canManageManual ? `<button onclick="app.excluirNotaManual('${n.id}', '${alunoId}')" class="text-red-500 hover:text-red-700" title="Excluir nota manual"><i class="fas fa-times"></i></button>` : ''; return `<li class="flex justify-between items-center gap-2 rounded-lg border border-gray-100 dark:border-slate-700 p-2.5"><span class="min-w-0">${n.titulo} <span class="text-xs text-blue-700 dark:text-blue-300 font-semibold">(${compNome})</span></span> <div class="flex items-center gap-2"><span class="font-bold text-gray-800 dark:text-gray-100">${n.nota}</span>${deleteBtn}</div></li>`; }).join('')}</ul>
                </div>
            </section>
        </div>`;
        const div = document.createElement('div'); div.id = modalId; div.className = 'fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 md:p-4 fade-in'; div.innerHTML = `<div class="notas-modal-root bg-gray-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto border border-gray-200 dark:border-slate-700"><div class="sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-gray-200 dark:border-slate-700 p-4 md:p-5 flex justify-between items-center"><div><h3 class="font-bold text-xl text-gray-800 dark:text-white">Gerenciar Notas</h3><p class="text-xs text-gray-500 dark:text-gray-400">Edite resultados de provas e consulte o historico de notas.</p></div><button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2" title="Fechar"><i class="fas fa-times"></i></button></div><div class="p-4 md:p-6">${content}</div><div class="sticky bottom-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur p-4 md:p-5 border-t border-gray-200 dark:border-slate-700 flex justify-end"><button onclick="document.getElementById('${modalId}').remove(); app.renderContent()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition font-semibold">Fechar e Atualizar</button></div></div>`; document.body.appendChild(div);

        const provasSearchEl = document.getElementById(provasSearchId);
        const provasCompEl = document.getElementById(provasCompFilterId);
        const provasCountEl = document.getElementById(provasCountId);
        const provaItems = Array.from(div.querySelectorAll('.nota-prova-item'));
        const updateProvasCount = (visiveis) => {
            if (!provasCountEl) return;
            const total = provaItems.length;
            provasCountEl.textContent = `${visiveis} de ${total} itens`;
        };
        const applyProvasFilter = () => {
            if (provaItems.length === 0) return;
            const rawBusca = String(provasSearchEl?.value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9 ]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const compSelecionado = String(provasCompEl?.value || '');
            let visiveis = 0;
            provaItems.forEach((item) => {
                const token = String(item.dataset.search || '');
                const compId = String(item.dataset.compId || '');
                const matchBusca = !rawBusca || token.includes(rawBusca);
                const matchComp = !compSelecionado || compId === compSelecionado;
                const mostrar = matchBusca && matchComp;
                item.classList.toggle('hidden', !mostrar);
                if (mostrar) visiveis += 1;
            });
            updateProvasCount(visiveis);
        };

        if (provasSearchEl) provasSearchEl.addEventListener('input', applyProvasFilter);
        if (provasCompEl) provasCompEl.addEventListener('change', applyProvasFilter);
        if (provaItems.length > 0) applyProvasFilter();

        Array.from(div.querySelectorAll('[data-section-toggle]')).forEach((button) => {
            const targetId = button.getAttribute('data-target');
            if (!targetId) return;
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            const iconEl = button.querySelector('i');
            const setState = (expanded) => {
                targetEl.classList.toggle('hidden', !expanded);
                button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                if (iconEl) {
                    iconEl.classList.toggle('fa-chevron-up', expanded);
                    iconEl.classList.toggle('fa-chevron-down', !expanded);
                }
            };
            const startCollapsed = button.getAttribute('data-start-collapsed') === 'true';
            setState(!startCollapsed);
            button.addEventListener('click', () => {
                const expanded = button.getAttribute('aria-expanded') === 'true';
                setState(!expanded);
            });
        });
    };

    app.atualizarNotaProva = async function(resultadoId, alunoId) {
        if (!app.perms || !app.perms.canAjustarNotaProva()) return alert('Acesso restrito.');
        const input = document.getElementById(`nota-prova-${resultadoId}`);
        if (!input) return;
        const notaVal = parseFloat(input.value);
        if (!Number.isFinite(notaVal) || notaVal < 0 || notaVal > 60) return alert('Informe uma nota entre 0 e 60.');
        await db.collection('provas_resultados').doc(resultadoId).update({
            nota: notaVal.toFixed(1),
            ajustadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            ajustadoPor: app.currentUserData.id
        });
        if (app.logAcesso) app.logAcesso('nota_prova_ajustada', `resultado:${resultadoId}`);
        document.querySelector('[id^="m-"]').remove(); app.modalNotasAluno(alunoId); app.showToast('Nota atualizada!');
    };

    app.excluirNotaProva = async function(resultadoId, alunoId) {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        if (!confirm('Excluir este resultado de prova?')) return;
        await db.collection('provas_resultados').doc(resultadoId).delete();
        if (app.logAcesso) app.logAcesso('nota_prova_excluida', `resultado:${resultadoId}`);
        document.querySelector('[id^="m-"]').remove();
        app.modalNotasAluno(alunoId);
        if (app.showToast) app.showToast('Resultado de prova excluído!', 'success');
    };

    app.excluirNotaManual = async function(notaId, alunoId) {
        if (!app.perms || !app.perms.canLancarNotaManual()) return alert('Acesso restrito.');
        if(!confirm("Excluir esta nota?")) return; await db.collection('trabalhos_notas').doc(notaId).delete(); document.querySelector('[id^="m-"]').remove(); app.modalNotasAluno(alunoId);
    };

    // ======= DASHBOARD / TURMAS / PROFESSORES / SELEÇÃO =======
}