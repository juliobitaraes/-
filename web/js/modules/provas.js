import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import {
    createProvaResultado,
    createProva,
    getComponentesByTurma,
    getProvaById,
    getProvaDocRef,
    getTurmaById,
    updateProva
} from '../services/provasRepository.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendProvas(app) {
    // ======= PROVAS / AVALIAÇÕES (migrated from app-full.js) =======
    const parseAvaliacaoDate = (value) => {
        if (!value) return null;
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        if (typeof value?.toDate === 'function') {
            const converted = value.toDate();
            if (converted instanceof Date && !Number.isNaN(converted.getTime())) return converted;
        }
        if (typeof value?.seconds === 'number') {
            const converted = new Date(value.seconds * 1000);
            if (!Number.isNaN(converted.getTime())) return converted;
        }
        const converted = new Date(value);
        return Number.isNaN(converted.getTime()) ? null : converted;
    };

    const mergeDateAndTime = (baseDate, timeValue) => {
        if (!baseDate || !timeValue) return null;
        const [hoursRaw, minutesRaw] = String(timeValue).split(':');
        const hours = parseInt(hoursRaw, 10);
        const minutes = parseInt(minutesRaw, 10);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
        const merged = new Date(baseDate);
        merged.setHours(hours, minutes, 0, 0);
        return merged;
    };

    const formatDateTimeLabel = (value) => {
        const parsed = parseAvaliacaoDate(value);
        if (!parsed) return 'data não definida';
        return parsed.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const sortResultadosByData = (resultados = []) => [...resultados].sort((left, right) => {
        const leftMs = parseAvaliacaoDate(left?.data)?.getTime() || 0;
        const rightMs = parseAvaliacaoDate(right?.data)?.getTime() || 0;
        return leftMs - rightMs;
    });

    const cloneQuestoes = (questions = []) => questions.map((question, index) => ({
        ...question,
        id: Date.now() + index,
        options: Array.isArray(question?.options) ? [...question.options] : []
    }));

    const normalizeComparableText = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const normalizeOptionText = (value) => normalizeComparableText(value)
        .replace(/^[a-z]\s*[\)\].:-]?\s*/i, '')
        .trim();

    const resolveQuestionCorrectIndex = (question = {}, options = []) => {
        const max = Array.isArray(options) ? options.length : 0;
        if (max <= 0) return 0;

        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        const coerceNumericIndex = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                if (Number.isInteger(value) && value >= 0 && value < max) return value;
                if (Number.isInteger(value) && value >= 1 && value <= max) return value - 1;
                return null;
            }

            if (typeof value === 'string') {
                const numeric = value.trim().replace(',', '.');
                if (/^\d+(\.0+)?$/.test(numeric)) {
                    const parsed = parseInt(numeric, 10);
                    if (Number.isInteger(parsed) && parsed >= 0 && parsed < max) return parsed;
                    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= max) return parsed - 1;
                }
            }

            return null;
        };

        const tryResolveFromValue = (value) => {
            const numericIdx = coerceNumericIndex(value);
            if (Number.isInteger(numericIdx)) return numericIdx;

            const raw = String(value || '').trim();
            if (!raw) return null;

            const normalized = normalizeComparableText(raw);
            const letterMatch = normalized.match(/^([a-z])(?:\s*[\)\].:-]|\b)/i)
                || normalized.match(/\b([a-z])\b/i);
            if (letterMatch && letterMatch[1]) {
                const letter = letterMatch[1].toUpperCase();
                const idx = letters.indexOf(letter);
                if (idx >= 0 && idx < max) return idx;
            }

            const normalizedOptions = options.map((opt) => normalizeOptionText(opt));
            const rawAsOption = normalizeOptionText(raw);
            const exactIdx = normalizedOptions.findIndex((opt) => opt && opt === rawAsOption);
            if (exactIdx >= 0) return exactIdx;

            const containsIdx = normalizedOptions.findIndex((opt) => opt && normalized.includes(opt));
            if (containsIdx >= 0) return containsIdx;

            return null;
        };

        const candidates = [
            question.correctIndex,
            question.correct_index,
            question.correct,
            question.correta,
            question.answer,
            question.resposta,
            question.gabarito,
            question.rightAnswer,
            question.correctAnswer,
            question.answerText,
            question.correctText
        ];

        for (const candidate of candidates) {
            const idx = tryResolveFromValue(candidate);
            if (Number.isInteger(idx)) return idx;
        }

        return 0;
    };

    const countPendingIaReview = (questions = []) => (Array.isArray(questions) ? questions : [])
        .filter((question) => question?.aiGenerated === true && question?.reviewedByTeacher !== true)
        .length;

    const extractTituloFromLogDetalhe = (detalhes = '', tipo = 'prova') => {
        const prefix = `${tipo}:`;
        const raw = String(detalhes || '');
        if (!raw.toLowerCase().startsWith(prefix)) return raw.trim();
        return raw.slice(prefix.length).trim();
    };

    const getComparableTimestampMs = (value) => parseAvaliacaoDate(value)?.getTime() || 0;

    const getProvaCreationMs = (prova = {}) => getComparableTimestampMs(
        prova?.criadoEm || prova?.createdAt || prova?.created_at || prova?.dataCriacao || prova?.dataAgendada || prova?.data
    );

    const sortProvasByCreationDesc = (provas = []) => [...provas].sort((left, right) => {
        const diff = getProvaCreationMs(right) - getProvaCreationMs(left);
        if (diff !== 0) return diff;
        const dataDiff = getComparableTimestampMs(right?.dataAgendada) - getComparableTimestampMs(left?.dataAgendada);
        if (dataDiff !== 0) return dataDiff;
        return String(right?.titulo || '').localeCompare(String(left?.titulo || ''), 'pt-BR');
    });

    const resetActiveExamState = () => {
        if (app.questionTimer) clearInterval(app.questionTimer);
        app.questionTimer = null;
        app.activeExamData = null;
        app.activeExamAnswers = [];
        app.activeExamQuestionTimes = [];
        app.activeExamQuestionStartedAt = null;
        app.currentQuestionIndex = 0;
        app._selectedExamOption = null;
    };

    app.getAvaliacaoDisponibilidade = function(prova, options = {}) {
        if (!prova) {
            return {
                available: false,
                reason: 'not_found',
                message: 'Prova não encontrada.',
                attemptsDone: 0,
                allowed: 1,
                startAt: null,
                deadlineAt: null
            };
        }

        if (prova.concluida === true) {
            return {
                available: false,
                reason: 'concluded',
                message: 'Esta prova foi concluída e finalizada pela equipe.',
                attemptsDone: 0,
                allowed: 0,
                startAt: null,
                deadlineAt: null
            };
        }

        const resultados = Array.isArray(options.resultados) ? sortResultadosByData(options.resultados) : [];
        const attemptsDone = Number.isInteger(options.attemptsDone) ? options.attemptsDone : resultados.length;
        const allowed = typeof prova.attempts === 'number' ? prova.attempts : 1;
        const now = options.now instanceof Date ? options.now : new Date();
        const nomeAvaliacao = prova.tipo === 'atividade' ? 'simulado' : 'prova';
        const startAt = prova.dataInicio
            ? parseAvaliacaoDate(prova.dataInicio)
            : (prova.horaInicio ? mergeDateAndTime(parseAvaliacaoDate(prova.dataAgendada), prova.horaInicio) : parseAvaliacaoDate(prova.dataAgendada));
        const deadlineAt = prova.dataFim
            ? parseAvaliacaoDate(prova.dataFim)
            : (prova.horaFim ? mergeDateAndTime(parseAvaliacaoDate(prova.dataAgendada), prova.horaFim) : parseAvaliacaoDate(prova.dataAgendada));

        if (startAt && now < startAt) {
            return {
                available: false,
                reason: 'before_start',
                message: `A ${nomeAvaliacao} estará disponível em ${formatDateTimeLabel(startAt)}.`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        if (deadlineAt && now > deadlineAt) {
            return {
                available: false,
                reason: 'expired',
                message: `O prazo para realizar esta ${nomeAvaliacao} encerrou em ${formatDateTimeLabel(deadlineAt)}.`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        if (allowed > 0 && attemptsDone >= allowed) {
            const notasValidas = resultados.map(r => parseFloat(r.nota)).filter(n => Number.isFinite(n));
            const notaExibida = allowed > 1
                ? (notasValidas.length > 0 ? Math.max(...notasValidas) : null)
                : (resultados[resultados.length - 1] && typeof resultados[resultados.length - 1].nota !== 'undefined' ? resultados[resultados.length - 1].nota : null);
            const notaLabel = allowed > 1 ? 'Maior nota' : 'Última nota';
            const notaMsg = notaExibida != null ? ` ${notaLabel}: ${notaExibida}.` : '';
            return {
                available: false,
                reason: 'attempt_limit',
                message: `Você atingiu o número máximo de tentativas (${allowed}).${notaMsg}`,
                attemptsDone,
                allowed,
                startAt,
                deadlineAt
            };
        }

        return {
            available: true,
            reason: 'available',
            message: '',
            attemptsDone,
            allowed,
            startAt,
            deadlineAt
        };
    };

    app.backfillProvaCreatorsIfNeeded = async function(provas = []) {
        if (!(app.perms && app.perms.isAdmin && app.perms.isAdmin())) return false;
        if (!Array.isArray(provas) || provas.length === 0) return false;

        const schoolId = store.activeSchoolId || app.currentUserData?.schoolId || app.currentUserData?.escolaId;
        if (!schoolId) return false;

        const pending = provas.filter((prova) => !String(prova?.criadoPorNome || '').trim());
        if (pending.length === 0) return false;

        const cacheKey = `provas:${schoolId}:${pending.length}`;
        if (app._provaCreatorBackfillRunning === cacheKey) return false;
        if (app._provaCreatorBackfillDone === cacheKey) return false;

        app._provaCreatorBackfillRunning = cacheKey;
        try {
            const logs = await app.getCollection('logs_acesso');
            const logsPorTipo = {
                prova: logs
                    .filter((log) => log.acao === 'prova_criada')
                    .map((log) => ({
                        ...log,
                        tituloNormalizado: normalizeComparableText(extractTituloFromLogDetalhe(log.detalhes, 'prova')),
                        dataMs: getComparableTimestampMs(log.data)
                    })),
                atividade: logs
                    .filter((log) => log.acao === 'atividade_criada')
                    .map((log) => ({
                        ...log,
                        tituloNormalizado: normalizeComparableText(extractTituloFromLogDetalhe(log.detalhes, 'atividade')),
                        dataMs: getComparableTimestampMs(log.data)
                    }))
            };

            const updates = [];
            pending.forEach((prova) => {
                const tipoBase = prova.tipo === 'atividade' ? 'atividade' : 'prova';
                const tituloNormalizado = normalizeComparableText(prova.titulo);
                if (!tituloNormalizado) return;

                const createdAtMs = getComparableTimestampMs(prova.criadoEm);
                const candidatos = logsPorTipo[tipoBase]
                    .filter((log) => log.tituloNormalizado === tituloNormalizado)
                    .sort((left, right) => {
                        const leftDelta = Math.abs((left.dataMs || 0) - createdAtMs);
                        const rightDelta = Math.abs((right.dataMs || 0) - createdAtMs);
                        return leftDelta - rightDelta;
                    });

                const melhor = candidatos[0];
                if (!melhor || !String(melhor.userNome || '').trim()) return;

                updates.push({
                    id: prova.id,
                    payload: {
                        criadoPorId: melhor.userId || null,
                        criadoPorNome: melhor.userNome || 'Usuario',
                        autorMigradoEm: firebase.firestore.FieldValue.serverTimestamp()
                    }
                });
            });

            if (updates.length === 0) {
                app._provaCreatorBackfillDone = cacheKey;
                return false;
            }

            const batchWriter = firebase.firestore().batch();
            updates.forEach(({ id, payload }) => {
                batchWriter.update(getProvaDocRef(id), payload);
            });
            await batchWriter.commit();

            app._provaCreatorBackfillDone = cacheKey;
            return true;
        } catch (error) {
            console.warn('Falha ao preencher autores antigos das provas:', error);
            return false;
        } finally {
            app._provaCreatorBackfillRunning = null;
        }
    };

    app.renderAvaliacoes = async function(container, tipo, options = {}) {
        const turmas = await app.getCollection('turmas');
        const componentes = await app.getComponentesCache();
        const isQuizView = tipo === 'atividade' && options.quizMode === true;
        const isSimuladosListView = tipo === 'atividade' && !isQuizView;
        let provas = (await app.getCollection('provas')).filter((p) => {
            if (p.tipo !== tipo) return false;
            if (tipo !== 'atividade') return true;
            return isQuizView ? p.quiz === true : p.quiz !== true && p.avulsaPublica !== true;
        });
        const hasSalaFilter = Object.prototype.hasOwnProperty.call(options, 'salaId');
        const turmaFilter = options.turmaId || null;
        const salaFilter = hasSalaFilter ? options.salaId : null;
        const isAluno = app.currentUserData && app.perms && app.perms.isAluno();
        const resultadosAlunoPorProva = new Map();
        let resultadosSimulados = [];

        if (isAluno) {
            const resultadosAluno = (await app.getCollection('provas_resultados'))
                .filter(r => r.alunoId === app.currentUserData.id);
            resultadosAluno.forEach((resultado) => {
                const lista = resultadosAlunoPorProva.get(resultado.provaId) || [];
                lista.push(resultado);
                resultadosAlunoPorProva.set(resultado.provaId, lista);
            });
        }

        const carregarResultadosSimulados = async () => {
            if (!isSimuladosListView || isAluno) return;
            const [todosResultados, todosUsuarios] = await Promise.all([
                app.getCollection('provas_resultados'),
                app.getCollection('users')
            ]);
            const provasPorId = new Map(provas.map((prova) => [prova.id, prova]));
            const usuariosPorId = new Map(todosUsuarios.map((usuario) => [usuario.id, usuario]));
            const consolidados = new Map();

            todosResultados
                .filter((resultado) => provasPorId.has(resultado.provaId))
                .forEach((resultado) => {
                    const prova = provasPorId.get(resultado.provaId);
                    const usuario = usuariosPorId.get(resultado.alunoId) || {};
                    const participanteId = resultado.alunoId || resultado.alunoEmail || resultado.alunoNome;
                    if (!participanteId) return;
                    const nota = Number(resultado.nota || 0);
                    const data = parseAvaliacaoDate(resultado.data);
                    const chave = `${resultado.provaId}::${participanteId}`;
                    const atual = consolidados.get(chave);
                    const tentativasConfiguradas = Number(prova.attempts || 1);
                    const usarMelhorNota = tentativasConfiguradas === 0 || tentativasConfiguradas > 1;
                    const deveSubstituir = !atual
                        || (usarMelhorNota && (nota > atual.nota || (nota === atual.nota && (data?.getTime() || 0) > atual.dataMs)))
                        || (!usarMelhorNota && (data?.getTime() || 0) >= atual.dataMs);

                    const registro = {
                        provaId: prova.id,
                        titulo: prova.titulo || 'Simulado',
                        alunoNome: usuario.nome || resultado.alunoNome || 'Aluno',
                        alunoEmail: usuario.email || resultado.alunoEmail || '-',
                        dataLabel: data ? data.toLocaleString('pt-BR') : '-',
                        dataISO: data ? data.toISOString().slice(0, 10) : '',
                        dataMs: data?.getTime() || 0,
                        nota,
                        valor: Number(resultado.valor || prova.valor || 0),
                        tentativas: (atual?.tentativas || 0) + 1,
                        tentativasConfiguradas
                    };
                    if (deveSubstituir) consolidados.set(chave, registro);
                    else if (atual) atual.tentativas += 1;
                });

            resultadosSimulados = [...consolidados.values()]
                .sort((a, b) => b.dataMs - a.dataMs || a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'));
        };

        if (isAluno) {
            const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId) && p.published === true);
            // Recovery provas are only visible to explicitly permitted students
            provas = provas.filter(p => {
                if (p.provaRecuperacao === true && Array.isArray(p.alunosPermitidos) && p.alunosPermitidos.length > 0) {
                    return p.alunosPermitidos.includes(app.currentUserData.id);
                }
                return true;
            });
        } else if (app.currentUserData && app.perms && app.perms.isProfessor()) {
            const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId));
        }

        if (isQuizView && !isAluno) {
            const currentUserId = String(app.currentUserData?.id || '').trim();
            provas = provas.filter((prova) => String(prova.criadoPorId || '').trim() === currentUserId);
        }

        if (turmaFilter) {
            provas = provas.filter(p => p.turmaId === turmaFilter);
        }
        if (tipo === 'atividade' && hasSalaFilter) {
            if (salaFilter) provas = provas.filter(p => p.salaId === salaFilter);
            else provas = provas.filter(p => !p.salaId);
        }
        await carregarResultadosSimulados();

        if (tipo === 'prova') {
            const didBackfill = await app.backfillProvaCreatorsIfNeeded(provas);
            if (didBackfill) {
                provas = (await app.getCollection('provas')).filter(p => p.tipo === tipo);
                if (isAluno) {
                    const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
                    provas = provas.filter(p => minhasTurmas.includes(p.turmaId) && p.published === true);
                    provas = provas.filter(p => {
                        if (p.provaRecuperacao === true && Array.isArray(p.alunosPermitidos) && p.alunosPermitidos.length > 0) {
                            return p.alunosPermitidos.includes(app.currentUserData.id);
                        }
                        return true;
                    });
                } else if (app.currentUserData && app.perms && app.perms.isProfessor()) {
                    const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                    provas = provas.filter(p => minhasTurmas.includes(p.turmaId));
                }
                if (turmaFilter) {
                    provas = provas.filter(p => p.turmaId === turmaFilter);
                }
            }
        }

        const singularLabel = tipo === 'atividade' ? (isQuizView ? 'Quiz' : 'Simulado') : app.capitalize(tipo);
        const titleLabel = options.title || (tipo === 'atividade' ? (isQuizView ? 'Quiz' : 'Simulados') : `${app.capitalize(tipo)}s`);
        const createButtonLabel = tipo === 'atividade' ? `Novo ${singularLabel}` : `Nova ${singularLabel}`;
        const backAction = options.backAction || '';
        const isAlunoProvasView = isAluno && tipo === 'prova';

        if (typeof app.setProvasStatusFilter !== 'function') {
            app.setProvasStatusFilter = function(filter) {
                const next = ['todas', 'ativas', 'concluidas'].includes(filter) ? filter : 'todas';
                app.provasStatusFilter = next;
                if (store.currentView === 'provas') app.renderContent();
            };
        }
        if (!app.provasStatusFilter) app.provasStatusFilter = 'todas';

        if (!app.provasTurmaFilter) app.provasTurmaFilter = 'todas';
        if (!app.provasComponenteFilter) app.provasComponenteFilter = 'todos';

        if (typeof app.setProvasTurmaFilter !== 'function') {
            app.setProvasTurmaFilter = function(filter) {
                app.provasTurmaFilter = filter || 'todas';
                app.provasComponenteFilter = 'todos';
                if (store.currentView === 'provas') app.renderContent();
            };
        }
        if (typeof app.setProvasComponenteFilter !== 'function') {
            app.setProvasComponenteFilter = function(filter) {
                app.provasComponenteFilter = filter || 'todos';
                if (store.currentView === 'provas') app.renderContent();
            };
        }

        const provasComTurma = app.provasTurmaFilter === 'todas'
            ? provas
            : provas.filter((prova) => prova.turmaId === app.provasTurmaFilter);
        const provasFiltradas = app.provasComponenteFilter === 'todos'
            ? provasComTurma
            : provasComTurma.filter((prova) => prova.componenteId === app.provasComponenteFilter);

        const turmasMap = new Map(turmas.map((turma) => [turma.id, turma]));
        const componentesMap = new Map(componentes.map((componente) => [componente.id, componente]));

        const turmasDisponiveis = [...new Map(provas.map((prova) => {
            const turma = turmasMap.get(prova.turmaId);
            const label = turma
                ? app.formatTurmaLabelText(turma, 'Turma', true)
                : (prova.turmaNome || 'Turma sem cadastro');
            return [prova.turmaId || label, { id: prova.turmaId, label }];
        }).filter(([, item]) => Boolean(item.id))).values()]
            .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));

        const componentesDisponiveis = [...new Map(provasComTurma.map((prova) => {
            const componente = componentesMap.get(prova.componenteId);
            const label = componente?.nome || 'Geral';
            return [prova.componenteId || label, { id: prova.componenteId, label }];
        }).filter(([, item]) => Boolean(item.id))).values()]
            .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));

        const buildProvasGroupedByTurmaComponente = (lista = []) => {
            const gruposTurma = new Map();

            lista.forEach((prova) => {
                const turma = turmasMap.get(prova.turmaId);
                const componente = componentesMap.get(prova.componenteId);
                const turmaKey = prova.turmaId || '__sem_turma__';
                const componenteKey = prova.componenteId || '__sem_componente__';
                const turmaLabel = turma
                    ? app.formatTurmaLabelText(turma, 'Turma', true)
                    : (prova.turmaNome || 'Turma sem cadastro');
                const componenteLabel = componente?.nome || 'Geral';
                const provaCreationMs = getProvaCreationMs(prova);

                if (!gruposTurma.has(turmaKey)) {
                    gruposTurma.set(turmaKey, {
                        turmaKey,
                        turmaLabel,
                        latestMs: 0,
                        total: 0,
                        componentes: new Map()
                    });
                }

                const turmaGroup = gruposTurma.get(turmaKey);
                turmaGroup.total += 1;
                turmaGroup.latestMs = Math.max(turmaGroup.latestMs, provaCreationMs);

                if (!turmaGroup.componentes.has(componenteKey)) {
                    turmaGroup.componentes.set(componenteKey, {
                        componenteKey,
                        componenteLabel,
                        latestMs: 0,
                        total: 0,
                        provas: []
                    });
                }

                const componenteGroup = turmaGroup.componentes.get(componenteKey);
                componenteGroup.total += 1;
                componenteGroup.latestMs = Math.max(componenteGroup.latestMs, provaCreationMs);
                componenteGroup.provas.push(prova);
            });

            return [...gruposTurma.values()]
                .sort((left, right) => right.latestMs - left.latestMs || left.turmaLabel.localeCompare(right.turmaLabel, 'pt-BR'))
                .map((turmaGroup) => ({
                    ...turmaGroup,
                    componentes: [...turmaGroup.componentes.values()]
                        .sort((left, right) => right.latestMs - left.latestMs || left.componenteLabel.localeCompare(right.componenteLabel, 'pt-BR'))
                        .map((componenteGroup) => ({
                            ...componenteGroup,
                            provas: sortProvasByCreationDesc(componenteGroup.provas)
                        }))
                }));
        };

        const renderGroupedProvasList = (lista = [], emptyMessage = 'Nenhuma prova encontrada.') => {
            const grupos = buildProvasGroupedByTurmaComponente(lista);
            if (grupos.length === 0) return renderEmptyState(emptyMessage);

            return grupos.map((turmaGroup) => `
                <section class="space-y-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 class="text-lg font-bold text-gray-800 dark:text-white">${app.escapeHtml(turmaGroup.turmaLabel)}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${turmaGroup.total} prova(s) em ${turmaGroup.componentes.length} componente(s).</p>
                        </div>
                        <span class="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold dark:bg-slate-700 dark:text-slate-200">${turmaGroup.total}</span>
                    </div>
                    <div class="space-y-4">
                        ${turmaGroup.componentes.map((componenteGroup) => `
                            <div class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40 p-4">
                                <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                                    <h5 class="font-semibold text-gray-800 dark:text-white">${app.escapeHtml(componenteGroup.componenteLabel)}</h5>
                                    <span class="px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 text-xs font-semibold border border-gray-200 dark:border-slate-600">${componenteGroup.total}</span>
                                </div>
                                <div class="space-y-4">
                                    ${componenteGroup.provas.map((prova) => renderAvaliacaoCard(prova)).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            `).join('');
        };

        app.toggleConclusaoProva = async function(provaId, shouldConclude) {
            if (!(app.perms && app.perms.canEditAvaliacao())) {
                alert('Acesso restrito.');
                return;
            }
            const msg = shouldConclude
                ? 'Marcar esta prova como concluída? Ela irá para o painel de Provas Concluídas.'
                : 'Reabrir esta prova? Ela voltará para o painel principal de provas.';
            if (!confirm(msg)) return;
            const patch = shouldConclude
                ? { concluida: true, concluidaEm: firebase.firestore.FieldValue.serverTimestamp(), published: false }
                : { concluida: false, concluidaEm: firebase.firestore.FieldValue.delete() };
            await updateProva(provaId, patch);
            if (app.logAcesso) {
                app.logAcesso(shouldConclude ? 'prova_concluida' : 'prova_reaberta', `prova:${provaId}`);
            }
            await app.renderContent();
        };

        app.copiarProva = async function(provaId) {
            if (!(app.perms && app.perms.canEditAvaliacao())) {
                alert('Acesso restrito.');
                return;
            }
            await app.modalCriarProva('prova', provaId, { copyMode: true });
        };

        const renderAvaliacaoCard = (p, meta = {}) => {
            const canEdit = app.perms && app.perms.canEditAvaliacao();
            const isPublished = p.published === true;
            const isConcluded = p.concluida === true;
            const isRecuperacao = p.provaRecuperacao === true;
            const isQuiz = tipo === 'atividade' && isQuizView && p.quiz === true;
            const canControlQuiz = isQuiz && canEdit && (!p.criadoPorId || p.criadoPorId === app.currentUserData?.id);
            const isDeletionBlocked = !isRecuperacao && !isQuiz && !isSimuladosListView && (isPublished || p.wasPublished === true || isConcluded);
            const qtdQuestoes = (p.questions || []).length;
            const compNome = componentes.find(c => c.id === p.componenteId)?.nome || 'Geral';
            const dataBase = parseAvaliacaoDate(p.dataAgendada);
            const dataFormatada = dataBase
                ? `${dataBase.toLocaleDateString('pt-BR')} ${dataBase.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Data n/d';
            const statusLabel = isConcluded ? 'Concluída' : (isPublished ? 'Publicada' : 'Rascunho');
            const statusClass = isConcluded
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : (isPublished
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300');
            const turmaNomeHtml = app.formatTurmaTextToHtml(p.turmaNome || 'Turma');
            const criadoPorNome = String(p.criadoPorNome || '').trim();
            const safeTitulo = String(p.titulo || 'Sem título');
            const actionButtons = [];

            if (tipo === 'atividade' && (p.avulsaPublica === true || (isQuizView && p.quiz === true)) && typeof app.modalQrCodeAtividade === 'function') {
                actionButtons.push(`<button onclick="app.modalQrCodeAtividade('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-lg text-sm hover:bg-purple-200"><i class="fas fa-qrcode"></i> QR Code</button>`);
            }
            if (tipo === 'prova' && canEdit) {
                actionButtons.push(`<button onclick="app.toggleConclusaoProva('${p.id}', ${isConcluded ? 'false' : 'true'})" class="flex items-center gap-1 px-3 py-1.5 ${isConcluded ? 'bg-teal-100 text-teal-700 hover:bg-teal-200 dark:bg-teal-900/30 dark:text-teal-300' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300'} rounded-lg text-sm"><i class="fas ${isConcluded ? 'fa-rotate-left' : 'fa-flag-checkered'}"></i> ${isConcluded ? 'Reabrir' : 'Concluir'}</button>`);
                actionButtons.push(`<button onclick="app.copiarProva('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-lg text-sm hover:bg-sky-200"><i class="fas fa-copy"></i> Copiar</button>`);
            }
            if (canControlQuiz) {
                actionButtons.push(`<button onclick="app.${p.quizStatus === 'running' || p.quizStatus === 'waiting' ? 'avancarQuizAoVivo' : 'iniciarQuizAoVivo'}('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 ${p.quizStatus === 'running' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'} rounded-lg text-sm"><i class="fas ${p.quizStatus === 'running' ? 'fa-forward' : 'fa-play'}"></i> ${p.quizStatus === 'running' ? 'Avançar' : (p.quizStatus === 'waiting' ? 'Liberar' : 'Abrir')}</button>`);
            }
            if (canControlQuiz && ['running', 'finished'].includes(p.quizStatus)) {
                actionButtons.push(`<button onclick="app.reiniciarQuizAoVivo('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 rounded-lg text-sm hover:bg-rose-200"><i class="fas fa-rotate-left"></i> Reiniciar</button>`);
            }
            if (isQuiz && canControlQuiz) {
                actionButtons.push(`<button onclick="app.abrirTelaRankingQuiz('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 rounded-lg text-sm hover:bg-cyan-200"><i class="fas fa-display"></i> Exibir na tela</button>`);
            }
            if (canEdit) {
                actionButtons.push(`<button onclick="app.modalCriarProva('${tipo}', '${p.id}', ${tipo === 'atividade' && isQuizView ? '{ quizMode: true }' : '{}'})" class="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-200"><i class="fas fa-pen"></i> Editar</button>`);
            }
            if (tipo === 'prova' || tipo === 'atividade') {
                actionButtons.push(`<button onclick="app.downloadGabaritoPDF('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-lg text-sm hover:bg-emerald-200"><i class="fas fa-file-pdf"></i> Gabarito</button>`);
                actionButtons.push(`<button onclick="app.downloadProvaImpressaPDF('${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-lg text-sm hover:bg-sky-200"><i class="fas fa-print"></i> Imprimir</button>`);
            }
            if (canEdit && !isDeletionBlocked) {
                actionButtons.push(`<button onclick="app.deleteItem('provas', '${p.id}')" class="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-lg text-sm hover:bg-red-200"><i class="fas fa-trash"></i> Excluir</button>`);
            }

            return `
                <div class="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex-1 min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="inline-flex flex-shrink-0 items-center px-3 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusLabel}</span>
                            </div>
                            <h3 class="font-bold text-xl text-gray-800 dark:text-white leading-tight mt-3">${app.escapeHtml(safeTitulo)}</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">${qtdQuestoes} questão(ões) • ${Number(p.valor || 0)} pontos</p>
                            <div class="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-500 dark:text-gray-400">
                                <span>${turmaNomeHtml}</span>
                                ${criadoPorNome ? `<span>Criada por: ${app.escapeHtml(criadoPorNome)}</span>` : ''}
                                <span>${compNome}</span>
                            </div>
                        </div>
                    </div>

                    ${!isQuiz ? `<div class="mt-4 flex items-center gap-2 border-t border-gray-100 dark:border-slate-600 pt-4 text-xs text-gray-500 dark:text-gray-400">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${dataFormatada}</span>
                    </div>` : ''}

                    ${actionButtons.length ? `
                        <div class="mt-4 pt-4 border-t border-gray-100 dark:border-slate-600 flex flex-wrap items-center justify-end gap-2">
                            ${actionButtons.join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        };

        const renderEmptyState = (message) => `
            <div class="col-span-full bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                ${message}
            </div>
        `;

        const opcoesFiltroSimulado = [...new Map(resultadosSimulados.map((resultado) => [resultado.provaId, resultado.titulo])).entries()]
            .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt-BR'));
        const tabelaResultadosSimuladosHtml = isSimuladosListView && !isAluno ? `
            <div class="mt-8">
                <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-3"><i class="fas fa-table mr-2 text-blue-600"></i>Notas dos alunos</h3>
                <div class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-7 gap-3">
                        <div class="md:col-span-2">
                            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Buscar por nome ou e-mail</label>
                            <input id="filtro-busca-simulados" type="text" placeholder="Digite nome ou e-mail" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Simulado</label>
                            <select id="filtro-simulado" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm">
                                <option value="">Todos os simulados</option>
                                ${opcoesFiltroSimulado.map(([id, titulo]) => `<option value="${app.escapeHtml(id)}">${app.escapeHtml(titulo)}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Data inicial</label>
                            <input id="filtro-data-inicio-simulados" type="date" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Data final</label>
                            <input id="filtro-data-fim-simulados" type="date" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white text-sm">
                        </div>
                        <div class="flex items-end">
                            <button id="btn-limpar-filtros-simulados" class="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600 text-sm"><i class="fas fa-filter-circle-xmark mr-1"></i>Limpar filtros</button>
                        </div>
                        <div class="flex items-end">
                            <button id="btn-exportar-resultados-simulados" class="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"><i class="fas fa-file-excel mr-1"></i>Exportar Excel</button>
                        </div>
                    </div>
                    <div class="overflow-auto rounded-xl border border-gray-200 dark:border-slate-700">
                        <table class="min-w-full text-sm">
                            <thead class="bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                                <tr>
                                    <th class="text-left px-4 py-3 font-semibold">Nome do aluno</th>
                                    <th class="text-left px-4 py-3 font-semibold">E-mail</th>
                                    <th class="text-left px-4 py-3 font-semibold">Data realizada</th>
                                    <th class="text-left px-4 py-3 font-semibold">Simulado</th>
                                    <th class="text-left px-4 py-3 font-semibold">Tentativas</th>
                                    <th class="text-left px-4 py-3 font-semibold">Nota</th>
                                </tr>
                            </thead>
                            <tbody id="tabela-resultados-simulados-body" class="divide-y divide-gray-100 dark:divide-slate-700 bg-white dark:bg-slate-900/40 text-gray-700 dark:text-gray-200"></tbody>
                        </table>
                    </div>
                    <p id="info-total-resultados-simulados" class="text-xs text-gray-500 dark:text-gray-400"></p>
                </div>
            </div>
        ` : '';

        app.renderQuizLiveMonitor = function(provaId, prova) {
            const target = document.getElementById(`quiz-live-monitor-${provaId}`);
            if (!target) return;
            const questions = Array.isArray(prova.questions) ? prova.questions : [];
            const questionIndex = Number(prova.quizQuestionIndex || 0);
            const question = questions[questionIndex];
            if (prova.quizStatus === 'finished') {
                app.renderQuizLiveFinalRanking(provaId, prova, target);
                return;
            }
            if (!question || prova.quizStatus !== 'running') {
                collection('quiz_participantes').where('atividadeId', '==', provaId).get().then((snapshot) => {
                    const emoticons = ['🚀', '⭐', '⚡', '👻', '💜', '☀️', '🌙', '👑', '🔥', '💎', '😎', '🤩', '🎯', '🦄', '🎉'];
                    const emoticonFor = (name) => emoticons[[...String(name || 'Aluno')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % emoticons.length];
                    const participantes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((left, right) => String(left.nome || '').localeCompare(String(right.nome || ''), 'pt-BR'));
                    target.innerHTML = `<div class="rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 p-4"><h3 class="font-bold text-blue-900 dark:text-blue-200 mb-3"><i class="fas fa-users mr-2"></i>Alunos na sala (${participantes.length})</h3>${participantes.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">${participantes.map((participante) => `<div class="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm"><span class="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-2xl">${emoticonFor(participante.nome)}</span><span class="truncate text-sm font-semibold text-blue-900 flex-1">${app.escapeHtml(participante.nome || 'Aluno')}</span><button type="button" onclick="app.removerParticipanteQuiz('${provaId}', '${app.escapeHtml(participante.id)}')" class="text-red-500 hover:text-red-700" title="Remover aluno da sala" aria-label="Remover ${app.escapeHtml(participante.nome || 'aluno')}"><i class="fas fa-user-minus"></i></button></div>`).join('')}</div>` : '<p class="text-sm text-blue-700 dark:text-blue-300">Aguardando os alunos entrarem na sala...</p>'}</div>`;
                });
                return;
            }
            const sessionId = prova.quizSessionId;
            const startedAt = prova.quizQuestionStartedAt?.toDate ? prova.quizQuestionStartedAt.toDate().getTime() : Date.now();
            const timeLimit = Number(question.timeLimit || prova.quizTempoQuestao || 30);
            const preparationSeconds = 5;
            const elapsedSinceRelease = Math.floor((Date.now() - startedAt) / 1000);
            const preparationLeft = Math.max(0, preparationSeconds - elapsedSinceRelease);
            const elapsedSeconds = Math.max(0, elapsedSinceRelease - preparationSeconds);
            const secondsLeft = Math.max(0, timeLimit - elapsedSeconds);
            const timeExpired = secondsLeft <= 0;
            const namesPromise = app.getUsersCache().catch(() => []);
            const resultsPromise = collection('provas_resultados').where('provaId', '==', provaId).get();
            Promise.all([namesPromise, resultsPromise]).then(([users, results]) => {
                const names = new Map(users.map((user) => [user.id, user.nome || user.id]));
                const counts = new Array((question.options || []).length).fill(0);
                const ranking = new Map();
                results.docs.forEach((doc) => {
                    const result = doc.data();
                    if (result.quizResposta !== true || result.quizSessionId !== sessionId) return;
                    const current = ranking.get(result.alunoId) || { nome: result.alunoNome || names.get(result.alunoId) || result.alunoId, acertos: 0, tempoTotal: 0, pontosQuiz: 0 };
                    if (result.questaoIndex === questionIndex && Number.isInteger(result.resposta)) counts[result.resposta] = (counts[result.resposta] || 0) + 1;
                    const answeredQuestion = questions[result.questaoIndex];
                    const acertou = Number(result.resposta) === resolveQuestionCorrectIndex(answeredQuestion || {}, answeredQuestion?.options || []);
                    if (acertou) {
                        current.acertos += 1;
                        current.tempoTotal += Number(result.tempoResposta) || 0;
                    }
                    current.pontosQuiz += Number(result.pontosQuiz) || (acertou ? 1000 + Math.max(0, Number(question?.timeLimit || prova.quizTempoQuestao || 30) - (Number(result.tempoResposta) || 0)) * 30 : 0);
                    ranking.set(result.alunoId, current);
                });
                const totalVotes = counts.reduce((sum, value) => sum + value, 0) || 1;
                const optionsHtml = (question.options || []).map((option, index) => {
                    const votes = counts[index] || 0;
                    const percent = Math.round((votes / totalVotes) * 100);
                    const isCorrect = timeExpired && index === resolveQuestionCorrectIndex(question, question.options || []);
                    return `<div class="space-y-1 ${isCorrect ? 'rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2 shadow-md ring-2 ring-emerald-400' : ''}"><div class="flex justify-between text-xs dark:text-slate-200"><span class="${isCorrect ? 'font-bold text-emerald-800 dark:text-emerald-200' : ''}">${String.fromCharCode(65 + index)}) ${app.escapeHtml(option)}${isCorrect ? ' <i class="fas fa-check-circle ml-1 text-emerald-600"></i>' : ''}</span><strong>${votes} voto(s)</strong></div><div class="h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="h-full ${isCorrect ? 'bg-emerald-500' : 'bg-blue-600'} transition-all duration-500" style="width: ${percent}%"></div></div></div>`;
                }).join('');
                const orderedRanking = [...ranking.values()].sort((left, right) => right.acertos - left.acertos || right.pontosQuiz - left.pontosQuiz || left.tempoTotal - right.tempoTotal);
                const rankingHtml = orderedRanking.length === 0 ? '<p class="text-sm text-gray-500">Aguardando respostas dos alunos...</p>' : orderedRanking.map((item, index) => `<div class="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"><strong class="w-8 text-center text-amber-600">${index + 1}º</strong><span class="flex-1 dark:text-white">${app.escapeHtml(item.nome)}</span><span class="text-xs font-semibold text-blue-600">${item.acertos} acerto(s)</span><span class="text-xs text-gray-500">${Number(item.tempoTotal || 0).toFixed(1)}s</span></div>`).join('');
                const isPreparing = preparationLeft > 0;
                const timerPercent = Math.max(0, Math.min(100, (secondsLeft / timeLimit) * 100));
                target.innerHTML = `${timeExpired ? '<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><i class="fas fa-clock mr-2"></i>Tempo da questão encerrado. Aguarde o professor avançar.</div>' : ''}<div class="mb-4 rounded-xl border-2 ${isPreparing ? 'border-blue-300 bg-blue-50' : (secondsLeft <= 5 ? 'border-red-400 bg-red-50' : 'border-blue-300 bg-blue-50')} p-4 text-center shadow-md"><p class="text-xs font-bold uppercase tracking-widest ${isPreparing ? 'text-blue-700' : (secondsLeft <= 5 ? 'text-red-700' : 'text-blue-700')}" >${isPreparing ? 'Preparação' : 'Tempo restante'}</p><p class="mt-1 text-4xl font-black tabular-nums ${isPreparing ? 'text-blue-700' : (secondsLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-blue-700')}">${isPreparing ? preparationLeft : secondsLeft}s</p><div class="mt-2 h-3 overflow-hidden rounded-full bg-white/70"><div class="h-full ${isPreparing ? 'bg-blue-600' : (secondsLeft <= 5 ? 'bg-red-500' : 'bg-blue-600')} transition-all duration-700" style="width: ${isPreparing ? (preparationLeft / preparationSeconds) * 100 : timerPercent}%"></div></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-5"><div><p class="text-xs font-semibold uppercase text-blue-600 mb-2">Questão ${questionIndex + 1} de ${questions.length}</p><h3 class="text-lg font-bold dark:text-white mb-4">${app.escapeHtml(question.text)}</h3><div class="space-y-3">${optionsHtml}</div></div><div><h3 class="font-bold dark:text-white mb-3"><i class="fas fa-ranking-star text-amber-500 mr-2"></i>Ranking atualizado</h3><div class="space-y-1">${rankingHtml}</div></div></div>`;
            });
        };

        app.removerParticipanteQuiz = async function(provaId, participanteId) {
            if (!participanteId || !provaId) return;
            const prova = await getProvaDocRef(provaId).get();
            if (!prova.exists || prova.data()?.quizStatus !== 'waiting') return alert('Só é possível remover alunos antes da primeira questão.');
            if (!confirm('Remover este aluno da sala do Quiz?')) return;
            await collection('quiz_participantes').doc(participanteId).delete();
        };

        app.renderQuizLiveFinalRanking = function(provaId, prova, target) {
            const sessionId = prova.quizSessionId;
            Promise.all([app.getUsersCache().catch(() => []), collection('provas_resultados').where('provaId', '==', provaId).get()]).then(([users, results]) => {
                const names = new Map(users.map((user) => [user.id, user.nome || user.id]));
                const ranking = new Map();
                results.docs.forEach((doc) => { const result = doc.data(); if (result.quizResposta !== true || result.quizSessionId !== sessionId) return; const item = ranking.get(result.alunoId) || { nome: result.alunoNome || names.get(result.alunoId) || result.alunoId, acertos: 0, tempoTotal: 0, pontosQuiz: 0 }; const question = (prova.questions || [])[result.questaoIndex]; const acertou = question && Number(result.resposta) === resolveQuestionCorrectIndex(question, question.options || []); if (acertou) { item.acertos += 1; item.tempoTotal += Number(result.tempoResposta) || 0; } item.pontosQuiz += Number(result.pontosQuiz) || (acertou ? 1000 + Math.max(0, Number(question?.timeLimit || prova.quizTempoQuestao || 30) - (Number(result.tempoResposta) || 0)) * 30 : 0); ranking.set(result.alunoId, item); });
                const rows = [...ranking.values()].sort((left, right) => right.acertos - left.acertos || left.tempoTotal - right.tempoTotal).map((item, index) => `<div class="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700"><strong class="w-8 text-center text-amber-600">${index + 1}º</strong><span class="flex-1 dark:text-white">${app.escapeHtml(item.nome)}</span><span class="text-xs font-semibold text-blue-600">${item.acertos} acerto(s)</span><span class="text-xs text-gray-500">${item.tempoTotal}s</span></div>`).join('') || '<p class="text-sm text-gray-500">Nenhuma resposta registrada.</p>';
                target.innerHTML = `<div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h3 class="font-bold text-emerald-900 mb-3"><i class="fas fa-trophy mr-2"></i>Quiz finalizado</h3><div class="space-y-1">${rows}</div></div>`;
            });
        };

        app.monitorarQuizAoVivo = function(prova) {
            const targetId = `quiz-live-monitor-${prova.id}`;
            if (app._quizTeacherListeners && app._quizTeacherListeners[prova.id]) {
                getProvaDocRef(prova.id).get().then((snapshot) => {
                    if (!snapshot.exists) return;
                    app._quizTeacherProvas = app._quizTeacherProvas || {};
                    app._quizTeacherProvas[prova.id] = { id: snapshot.id, ...snapshot.data() };
                    app.renderQuizLiveMonitor(prova.id, app._quizTeacherProvas[prova.id]);
                });
                return;
            }
            app._quizTeacherListeners = app._quizTeacherListeners || {};
            app._quizTeacherProvas = app._quizTeacherProvas || {};
            app._quizTeacherProvas[prova.id] = prova;
            const provaRef = getProvaDocRef(prova.id);
            app._quizTeacherListeners[prova.id] = provaRef.onSnapshot((snapshot) => {
                if (!snapshot.exists) return;
                app._quizTeacherProvas[snapshot.id] = { id: snapshot.id, ...snapshot.data() };
                app.renderQuizLiveMonitor(snapshot.id, app._quizTeacherProvas[snapshot.id]);
            });
            app._quizTeacherResultListeners = app._quizTeacherResultListeners || {};
            app._quizTeacherResultListeners[prova.id] = collection('provas_resultados').onSnapshot(() => {
                const latest = app._quizTeacherProvas[prova.id];
                if (latest) app.renderQuizLiveMonitor(prova.id, latest);
            });
            app._quizTeacherParticipantListeners = app._quizTeacherParticipantListeners || {};
            app._quizTeacherParticipantListeners[prova.id] = collection('quiz_participantes').where('atividadeId', '==', prova.id).onSnapshot(() => {
                const latest = app._quizTeacherProvas[prova.id];
                if (latest) app.renderQuizLiveMonitor(prova.id, latest);
            });
            app._quizTeacherTimers = app._quizTeacherTimers || {};
            if (app._quizTeacherTimers[prova.id]) clearInterval(app._quizTeacherTimers[prova.id]);
            app._quizTeacherTimers[prova.id] = setInterval(() => {
                const latest = app._quizTeacherProvas[prova.id];
                if (latest) app.renderQuizLiveMonitor(prova.id, latest);
            }, 1000);
        };

        app.renderQuizRanking = async function(provaId) {
            const prova = await getProvaById(provaId);
            if (!prova || prova.tipo !== 'atividade') return;
            const [resultados, usuarios] = await Promise.all([
                app.getCollection('provas_resultados'),
                app.getUsersCache()
            ]);
            const nomes = new Map(usuarios.map((usuario) => [usuario.id, usuario.nome || 'Aluno']));
            const liveResultados = resultados.filter((resultado) => resultado.provaId === provaId && resultado.quizResposta === true && resultado.quizSessionId === prova.quizSessionId);
            const rankingFonte = liveResultados.length > 0 ? liveResultados : resultados.filter((resultado) => resultado.provaId === provaId);
            const ranking = rankingFonte
                .map((resultado) => ({
                    ...resultado,
                    acertos: resultado.quizResposta === true
                        ? (resolveQuestionCorrectIndex(prova.questions[resultado.questaoIndex] || {}, prova.questions[resultado.questaoIndex]?.options || []) === Number(resultado.resposta) ? 1 : 0)
                        : (Number.isFinite(resultado.acertos)
                        ? resultado.acertos
                        : (Array.isArray(resultado.respostas) ? resultado.respostas.filter((resposta, index) => resposta === resolveQuestionCorrectIndex(prova.questions[index] || {}, prova.questions[index]?.options || [])).length : 0)),
                    tempoTotal: resultado.quizResposta === true
                        ? (resolveQuestionCorrectIndex(prova.questions[resultado.questaoIndex] || {}, prova.questions[resultado.questaoIndex]?.options || []) === Number(resultado.resposta) ? Number(resultado.tempoResposta) || 0 : 0)
                        : (Number(resultado.tempoTotal) || (Array.isArray(resultado.temposResposta) ? resultado.temposResposta.reduce((total, tempo) => total + (Number(tempo) || 0), 0) : 0)),
                    pontosQuiz: Number(resultado.pontosQuiz) || 0
                }))
                .reduce((accumulator, resultado) => {
                    const key = resultado.alunoId;
                    const current = accumulator.get(key) || { ...resultado, acertos: 0, tempoTotal: 0, pontosQuiz: 0 };
                    current.acertos += resultado.acertos;
                    current.tempoTotal += resultado.tempoTotal;
                    current.pontosQuiz = Math.max(current.pontosQuiz, resultado.pontosQuiz);
                    current.alunoNome = current.alunoNome || resultado.alunoNome;
                    accumulator.set(key, current);
                    return accumulator;
                }, new Map());
            const rankingOrdenado = [...ranking.values()].sort((left, right) => right.acertos - left.acertos || left.tempoTotal - right.tempoTotal);
            const rows = rankingOrdenado.length === 0
                ? '<p class="text-sm text-gray-500 dark:text-gray-400">Nenhum participante finalizou este Quiz.</p>'
                : rankingOrdenado.map((resultado, index) => `
                    <div class="flex items-center gap-3 rounded-lg px-3 py-2 ${index === 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-slate-700/50'}">
                        <span class="w-7 text-center font-bold ${index < 3 ? 'text-amber-600' : 'text-gray-500'}">${index + 1}º</span>
                        <span class="flex-1 font-medium dark:text-white">${app.escapeHtml(nomes.get(resultado.alunoId) || resultado.alunoNome || 'Aluno')}</span>
                        <span class="text-xs text-gray-500 dark:text-gray-300">${resultado.acertos}/${prova.questions.length} acertos</span>
                        <span class="text-xs text-gray-500 dark:text-gray-300">${resultado.tempoTotal}s</span>
                    </div>
                `).join('');
            app.showInfoModal(`Ranking: ${app.escapeHtml(prova.titulo || 'Quiz')}`, `<div class="space-y-2">${rows}</div>`);
        };

        if (isAlunoProvasView) {
            const provasComMeta = provas.map((prova) => {
                const resultadosAluno = resultadosAlunoPorProva.get(prova.id) || [];
                const disponibilidadeAluno = app.getAvaliacaoDisponibilidade(prova, { resultados: resultadosAluno });
                const ultimaTentativa = sortResultadosByData(resultadosAluno).slice(-1)[0] || null;
                return { prova, resultadosAluno, disponibilidadeAluno, ultimaTentativa };
            });

            const provasEmAberto = provasComMeta
                .filter(({ resultadosAluno }) => resultadosAluno.length === 0)
                .sort((left, right) => {
                    const leftMs = parseAvaliacaoDate(left.prova.dataAgendada)?.getTime() || 0;
                    const rightMs = parseAvaliacaoDate(right.prova.dataAgendada)?.getTime() || 0;
                    return leftMs - rightMs;
                });

            const provasRealizadas = provasComMeta
                .filter(({ resultadosAluno }) => resultadosAluno.length > 0)
                .sort((left, right) => {
                    const leftMs = parseAvaliacaoDate(left.ultimaTentativa?.data)?.getTime() || 0;
                    const rightMs = parseAvaliacaoDate(right.ultimaTentativa?.data)?.getTime() || 0;
                    return rightMs - leftMs;
                });

            container.innerHTML = `
                <div class="mb-8 max-w-5xl mx-auto">
                    <div class="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 md:p-7 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition border border-blue-400/40 text-left group w-full">
                        <div class="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/10"></div>
                        <div class="relative flex items-start justify-between gap-4">
                            <div>
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-white/20 mb-3">Destaque</span>
                                <h2 class="text-2xl md:text-3xl font-extrabold leading-tight capitalize">${titleLabel}</h2>
                                <p class="text-sm text-blue-100 mt-2">Acompanhe e gerencie as provas por turma, componente e status de entrega.</p>
                                ${backAction ? `<button onclick="${backAction}" class="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-white/90 hover:text-white"><i class="fas fa-arrow-left"></i> Voltar</button>` : ''}
                            </div>
                            <div class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0">
                                <i class="fas fa-file-signature text-xl"></i>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="space-y-8">
                    <section>
                        <div class="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas em aberto</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Provas visíveis para você. O início só é liberado quando a data de realização chegar.</p>
                            </div>
                            <span class="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold dark:bg-blue-900/30 dark:text-blue-200">${provasEmAberto.length}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${provasEmAberto.length === 0 ? renderEmptyState('Nenhuma prova em aberto.') : provasEmAberto.map(({ prova, resultadosAluno, disponibilidadeAluno }) => renderAvaliacaoCard(prova, { resultadosAluno, disponibilidadeAluno, mode: 'aberta' })).join('')}
                        </div>
                    </section>
                    <section>
                        <div class="flex items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas realizadas</h3>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Histórico das provas que você já realizou. Se ainda houver tentativas disponíveis, a nova tentativa fica aqui.</p>
                            </div>
                            <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-200">${provasRealizadas.length}</span>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            ${provasRealizadas.length === 0 ? renderEmptyState('Você ainda não realizou nenhuma prova.') : provasRealizadas.map(({ prova, resultadosAluno, disponibilidadeAluno }) => renderAvaliacaoCard(prova, { resultadosAluno, disponibilidadeAluno, mode: 'realizada' })).join('')}
                        </div>
                    </section>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="mb-8 max-w-5xl mx-auto">
                <div class="relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 md:p-7 rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.01] transition border border-blue-400/40 text-left group w-full">
                    <div class="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/10"></div>
                    <div class="relative flex items-start justify-between gap-4">
                        <div>
                            <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-white/20 mb-3">Destaque</span>
                            <h2 class="text-2xl md:text-3xl font-extrabold leading-tight capitalize">${titleLabel}</h2>
                            <p class="text-sm text-blue-100 mt-2">Organize provas por turma, componente e status para facilitar o acompanhamento.</p>
                            ${backAction ? `<button onclick="${backAction}" class="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-white/90 hover:text-white"><i class="fas fa-arrow-left"></i> Voltar</button>` : ''}
                        </div>
                        <div class="flex items-center gap-3">
                            ${app.perms && app.perms.canCreateAvaliacao() ? `
                            <button onclick="app.modalCriarProva('${tipo}', null, ${tipo === 'atividade' && isQuizView ? '{ quizMode: true }' : '{}'})" class="px-4 py-2 bg-white/15 text-white rounded-lg hover:bg-white/25 shadow-sm border border-white/20">
                                <i class="fas fa-plus mr-2"></i>${createButtonLabel}
                            </button>` : ''}
                            <div class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white flex-shrink-0">
                                <i class="fas fa-file-signature text-xl"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            ${isSimuladosListView ? '<p class="text-sm text-gray-500 dark:text-gray-400 mb-6">Simulados organizados por turma, com acesso às questões, resultados e materiais em PDF.</p>' : ''}
            ${!isAluno && tipo === 'prova'
                ? (() => {
                    const provasConcluidas = sortProvasByCreationDesc(provasFiltradas.filter((p) => p.concluida === true));
                    const provasAtivas = sortProvasByCreationDesc(provasFiltradas.filter((p) => p.concluida !== true));
                    const showAtivas = app.provasStatusFilter === 'todas' || app.provasStatusFilter === 'ativas';
                    const showConcluidas = app.provasStatusFilter === 'todas' || app.provasStatusFilter === 'concluidas';
                    return `
                        <div class="space-y-8">
                            <div class="space-y-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-4">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="text-sm font-medium text-gray-600 dark:text-gray-300 mr-1">Filtro de status:</span>
                                    <button onclick="app.setProvasStatusFilter('todas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'todas' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Todas</button>
                                    <button onclick="app.setProvasStatusFilter('ativas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'ativas' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Ativas</button>
                                    <button onclick="app.setProvasStatusFilter('concluidas')" class="px-3 py-1 rounded-full text-sm transition ${app.provasStatusFilter === 'concluidas' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}">Concluídas</button>
                                </div>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <label class="block text-sm">
                                        <span class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Turma</span>
                                        <select onchange="app.setProvasTurmaFilter(this.value)" class="w-full p-2.5 border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-500 dark:text-white">
                                            <option value="todas" ${app.provasTurmaFilter === 'todas' ? 'selected' : ''}>Todas as turmas</option>
                                            ${turmasDisponiveis.map((turma) => `<option value="${turma.id}" ${app.provasTurmaFilter === turma.id ? 'selected' : ''}>${app.escapeHtml(turma.label)}</option>`).join('')}
                                        </select>
                                    </label>
                                    <label class="block text-sm">
                                        <span class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Componente curricular</span>
                                        <select onchange="app.setProvasComponenteFilter(this.value)" class="w-full p-2.5 border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-500 dark:text-white">
                                            <option value="todos" ${app.provasComponenteFilter === 'todos' ? 'selected' : ''}>Todos os componentes</option>
                                            ${componentesDisponiveis.map((componente) => `<option value="${componente.id}" ${app.provasComponenteFilter === componente.id ? 'selected' : ''}>${app.escapeHtml(componente.label)}</option>`).join('')}
                                        </select>
                                    </label>
                                    <div class="flex items-end text-xs text-gray-500 dark:text-gray-400">
                                        <div class="rounded-lg bg-gray-50 dark:bg-slate-900/40 border border-gray-200 dark:border-slate-700 px-3 py-2 w-full">As provas são exibidas da mais recente para a mais antiga dentro de cada turma e componente.</div>
                                    </div>
                                </div>
                            </div>
                            ${showAtivas ? `
                            <section>
                                <div class="flex items-center justify-between gap-3 mb-4">
                                    <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas Ativas</h3>
                                    <span class="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold dark:bg-emerald-900/30 dark:text-emerald-200">${provasAtivas.length}</span>
                                </div>
                                ${renderGroupedProvasList(provasAtivas, 'Nenhuma prova ativa.')}
                            </section>
                            ` : ''}
                            ${showConcluidas ? `
                            <details class="group rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-4">
                                <summary class="flex items-center justify-between gap-3 cursor-pointer list-none">
                                    <h3 class="text-xl font-bold text-gray-800 dark:text-white">Provas Concluídas</h3>
                                    <div class="flex items-center gap-2">
                                        <span class="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold dark:bg-indigo-900/30 dark:text-indigo-200">${provasConcluidas.length}</span>
                                        <i class="fas fa-chevron-down text-gray-400 transition group-open:rotate-180"></i>
                                    </div>
                                </summary>
                                <div class="mt-4">
                                    ${renderGroupedProvasList(provasConcluidas, 'Nenhuma prova concluída.')}
                                </div>
                            </details>
                            ` : ''}
                        </div>
                    `;
                })()
                : `<div class="${isSimuladosListView || isQuizView ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}">${provas.map((p) => renderAvaliacaoCard(p)).join('')}</div>`}
            ${tabelaResultadosSimuladosHtml}
        `;
        if (isSimuladosListView && !isAluno) {
            const buscaEl = container.querySelector('#filtro-busca-simulados');
            const selectSimulado = container.querySelector('#filtro-simulado');
            const dataInicioEl = container.querySelector('#filtro-data-inicio-simulados');
            const dataFimEl = container.querySelector('#filtro-data-fim-simulados');
            const btnLimpar = container.querySelector('#btn-limpar-filtros-simulados');
            const btnExportar = container.querySelector('#btn-exportar-resultados-simulados');
            const tbody = container.querySelector('#tabela-resultados-simulados-body');
            const infoTotal = container.querySelector('#info-total-resultados-simulados');
            let resultadosFiltrados = [...resultadosSimulados];
            const renderRows = (rows) => {
                if (!tbody || !infoTotal) return;
                resultadosFiltrados = [...rows];
                tbody.innerHTML = rows.length === 0
                    ? '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-500 dark:text-gray-400">Nenhum resultado encontrado para os filtros selecionados.</td></tr>'
                    : rows.map((resultado) => `<tr><td class="px-4 py-3">${app.escapeHtml(resultado.alunoNome)}</td><td class="px-4 py-3">${app.escapeHtml(resultado.alunoEmail)}</td><td class="px-4 py-3">${app.escapeHtml(resultado.dataLabel)}</td><td class="px-4 py-3">${app.escapeHtml(resultado.titulo)}</td><td class="px-4 py-3">${resultado.tentativas}</td><td class="px-4 py-3 font-semibold">${resultado.nota.toFixed(2)}${resultado.valor > 0 ? ` / ${resultado.valor.toFixed(2)}` : ''}</td></tr>`).join('');
                infoTotal.textContent = `${rows.length} resultado(s) exibido(s)`;
            };
            const aplicarFiltros = () => {
                const termo = String(buscaEl?.value || '').trim().toLowerCase();
                const simuladoId = String(selectSimulado?.value || '');
                const dataInicio = String(dataInicioEl?.value || '');
                const dataFim = String(dataFimEl?.value || '');
                renderRows(resultadosSimulados.filter((resultado) => {
                    const nomeOuEmail = `${resultado.alunoNome} ${resultado.alunoEmail}`.toLowerCase();
                    return (!termo || nomeOuEmail.includes(termo))
                        && (!simuladoId || resultado.provaId === simuladoId)
                        && (!dataInicio || (resultado.dataISO && resultado.dataISO >= dataInicio))
                        && (!dataFim || (resultado.dataISO && resultado.dataISO <= dataFim));
                }));
            };
            [buscaEl, selectSimulado, dataInicioEl, dataFimEl].forEach((element) => element?.addEventListener(element === buscaEl ? 'input' : 'change', aplicarFiltros));
            btnLimpar?.addEventListener('click', () => {
                [buscaEl, selectSimulado, dataInicioEl, dataFimEl].forEach((element) => { if (element) element.value = ''; });
                renderRows(resultadosSimulados);
            });
            btnExportar?.addEventListener('click', () => {
                if (typeof app.exportRelatoriosExcel !== 'function') {
                    alert('Exportação para Excel indisponível neste contexto.');
                    return;
                }
                app.exportRelatoriosExcel((resultadosFiltrados || []).map((resultado) => ({
                    'Nome do aluno': resultado.alunoNome,
                    'E-mail': resultado.alunoEmail,
                    'Data realizada': resultado.dataLabel,
                    Simulado: resultado.titulo,
                    Tentativas: resultado.tentativas,
                    Nota: resultado.nota,
                    'Valor do simulado': resultado.valor
                })), `Resultados_Simulados_${new Date().toISOString().slice(0, 10)}.xlsx`);
            });
            renderRows(resultadosSimulados);
        }
        if (!isAluno && isQuizView) {
            const liveQuizzes = provas.filter((quiz) => ['waiting', 'running'].includes(quiz.quizStatus));
            if (liveQuizzes.length > 0) {
                container.insertAdjacentHTML('afterbegin', liveQuizzes.map((quiz) => `<section class="mb-6 rounded-2xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-800 p-5 shadow-sm"><div class="flex items-center justify-between gap-3 mb-4"><h2 class="text-lg font-bold dark:text-white"><i class="fas fa-satellite-dish text-blue-600 mr-2"></i>${app.escapeHtml(quiz.titulo)} ao vivo</h2><span class="text-xs font-semibold text-emerald-600">Em andamento</span></div><div id="quiz-live-monitor-${quiz.id}"></div></section>`).join(''));
                liveQuizzes.forEach((quiz) => app.monitorarQuizAoVivo(quiz));
            }
        }
    };

    app.renderDiarioPorComponentes = async function(container) {
        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        const componentesCache = await app.getComponentesCache();
        let minhasTurmas = turmasAtivas;
        if (app.perms && app.perms.isProfessor()) { minhasTurmas = app.filterTurmasByProfessor(turmasAtivas, componentesCache); }
        else if (app.perms && app.perms.isAluno()) { minhasTurmas = turmasAtivas.filter(t => t.alunos && t.alunos.includes(app.currentUserData.id)); }

        if (!app.toggleDiarioSection) {
            app.toggleDiarioSection = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                const turmaKey = buttonId.replace(/-toggle$/, '');
                app._diarioTurmaOpenById = app._diarioTurmaOpenById || {};
                app._diarioTurmaOpenById[turmaKey] = !isHidden;
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Expandir' : 'Recolher';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }

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

        if (!app.toggleDiarioTurma) {
            app.toggleDiarioTurma = function(contentId, buttonId) {
                const content = document.getElementById(contentId);
                const button = document.getElementById(buttonId);
                if (!content || !button) return;
                const isHidden = content.classList.toggle('hidden');
                button.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
                const label = button.querySelector('[data-label]');
                if (label) label.textContent = isHidden ? 'Expandir' : 'Recolher';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-down', isHidden);
                    icon.classList.toggle('fa-chevron-up', !isHidden);
                }
            };
        }

        const emptyMsg = minhasTurmas.length === 0 ? '<p class="text-gray-500 dark:text-gray-400">Nenhuma turma encontrada.</p>' : '';
        const notasContentId = 'diario-notas-content';
        const notasToggleId = 'diario-notas-toggle';
        const turmasNotasHtml = minhasTurmas.map(t => `<div id="dash-notas-turma-${t.id}" class="diario-skeleton mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"><div class="loading"></div></div>`).join('');

        const renderHeader = (title, contentId, toggleId) => `
            <div class="mb-6 border-t pt-8 dark:border-slate-700">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white">${title}</h2>
                    <button id="${toggleId}" onclick="app.toggleDiarioSection('${contentId}', '${toggleId}')" class="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-expanded="false" aria-controls="${contentId}">
                        <i class="fas fa-chevron-down mr-1"></i><span data-label>Expandir</span>
                    </button>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="w-full">
                <div id="${notasContentId}" class="space-y-6">
                    ${emptyMsg}${turmasNotasHtml}
                </div>
            </div>
        `;
        for (const t of minhasTurmas) {
            const label = app.formatTurmaLabelText(t, 'Turma', true);
            app.renderTurmaResultados(t.id, label, { mode: 'notasTrabalhos', targetPrefix: 'dash-notas-turma' });
        }
    };

    // Gera PDF do conteúdo atual do manual (usa html2pdf carregado via CDN)
    app.downloadManualPDF = async function() {
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            // Prefer the manual container block if present
            const manualBlock = document.querySelector('#content-area .max-w-4xl');
            const element = manualBlock || document.getElementById('content-area');
            if (!element) return alert('Conteúdo do manual não encontrado para exportar.');
            const opt = { margin: 0.5, filename: 'Manual_SENATEDU.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            html2pdf().set(opt).from(element).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        }
    };

    app.downloadGabaritoPDF = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        let container = null;
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const componentes = await app.getComponentesCache();
            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const dataFormatada = prova.dataAgendada ? new Date(prova.dataAgendada).toLocaleString('pt-BR') : 'Data n/d';
            let turmaLabelText = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaLabelText = app.formatTurmaLabelText(turma, prova.turmaNome || 'N/D', true);
                }
            }
            const turmaLabelHtml = app.formatTurmaTextToHtml(turmaLabelText, 'N/D');
            const safe = app.escapeHtml || ((v) => String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'));
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            const questoesHtml = (prova.questions || []).map((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                const correctIdx = resolveQuestionCorrectIndex(q, opts);
                const correctLetter = letters[correctIdx] || String.fromCharCode(65 + correctIdx);
                const correctText = opts[correctIdx] || '';
                const optsHtml = opts.length === 0 ? '<li>(Sem opções cadastradas)</li>' : opts.map((opt, oidx) => {
                    const letter = letters[oidx] || String.fromCharCode(65 + oidx);
                    const isCorrect = oidx === correctIdx;
                    const optText = String(opt || '').trim();
                    // Verifica se a opção já começa com a letra (ex: "A) texto")
                    const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
                    const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
                    return `<li style="margin: 2px 0;${isCorrect ? ' font-weight: 700;' : ''}">${safe(displayText)}</li>`;
                }).join('');

                // Remove a letra da resposta se ela já estiver incluída no texto
                const correctTextClean = String(correctText || '').trim();
                const correctTextDisplay = /^[A-Z]\)\s/.test(correctTextClean) 
                    ? correctTextClean.substring(3).trim() 
                    : correctTextClean;
                
                return `
                    <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
                        <div style="font-weight: 700; margin-bottom: 6px;">${idx + 1}. ${safe(q.text || '')}</div>
                        <ul style="margin: 0 0 6px 16px; padding: 0; list-style: none;">${optsHtml}</ul>
                        <div style="font-size: 12px; color: #111827;"><span style="font-weight: 700;">Resposta correta:</span> ${correctLetter}${correctTextDisplay ? ' - ' + safe(correctTextDisplay) : ''}</div>
                    </div>
                `;
            }).join('');

            container = document.createElement('div');
            container.style.background = '#ffffff';
            container.style.padding = '24px';
            container.style.width = '800px';
            container.innerHTML = `
                <div style="font-family: Arial, sans-serif; color: #111827;">
                    <div style="border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 16px;">
                        <div style="font-size: 20px; font-weight: 700;">Gabarito - ${safe(prova.titulo || 'Prova')}</div>
                        <div style="font-size: 12px; color: #374151;">Turma: ${turmaLabelHtml}</div>
                        <div style="font-size: 12px; color: #374151;">Componente: ${safe(compNome)}</div>
                        <div style="font-size: 12px; color: #374151;">Data: ${safe(dataFormatada)}</div>
                        <div style="font-size: 12px; color: #374151;">Total de questões: ${(prova.questions || []).length}</div>
                    </div>
                    ${questoesHtml}
                </div>
            `;
            document.body.appendChild(container);

            const fileBase = String(prova.titulo || 'Prova')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '');
            const filename = `Gabarito_${fileBase || 'Prova'}.pdf`;
            const opt = { margin: 0.5, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            await html2pdf().set(opt).from(container).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        } finally {
            if (container && container.parentNode) container.parentNode.removeChild(container);
        }
    };

    app.downloadProvaImpressaPDF = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }
        const ensureScript = (src) => new Promise((resolve, reject) => {
            if (window.html2pdf) return resolve();
            const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
        });
        let container = null;
        try {
            await ensureScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js');
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const componentes = await app.getComponentesCache();
            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const dataFormatada = prova.dataAgendada ? new Date(prova.dataAgendada).toLocaleString('pt-BR') : 'Data n/d';
            let turmaLabelText = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaLabelText = app.formatTurmaLabelText(turma, prova.turmaNome || 'N/D', true);
                }
            }
            const turmaLabelHtml = app.formatTurmaTextToHtml(turmaLabelText, 'N/D');
            const safe = app.escapeHtml || ((v) => String(v)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;'));
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            const questoesHtml = (prova.questions || []).map((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options : [];
                const optsHtml = opts.length === 0
                    ? '<li style="margin: 4px 0;">(Sem opções cadastradas)</li>'
                    : opts.map((opt, oidx) => {
                        const letter = letters[oidx] || String.fromCharCode(65 + oidx);
                        const optText = String(opt || '').trim();
                        const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
                        const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
                        return `<li style="margin: 4px 0;">${safe(displayText)}</li>`;
                    }).join('');

                return `
                    <div style="margin-bottom: 18px; page-break-inside: avoid;">
                        <div style="font-weight: 700; margin-bottom: 8px;">${idx + 1}. ${safe(q.text || '')}</div>
                        <ul style="margin: 0 0 0 16px; padding: 0; list-style: none;">${optsHtml}</ul>
                    </div>
                `;
            }).join('');

            container = document.createElement('div');
            container.style.background = '#ffffff';
            container.style.padding = '24px';
            container.style.width = '800px';
            container.innerHTML = `
                <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.35;">
                    <div style="border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 16px;">
                        <div style="font-size: 20px; font-weight: 700;">${safe(prova.titulo || 'Prova')}</div>
                        <div style="font-size: 12px; color: #374151; margin-top: 4px;">Turma: ${turmaLabelHtml}</div>
                        <div style="font-size: 12px; color: #374151;">Componente: ${safe(compNome)}</div>
                        <div style="font-size: 12px; color: #374151;">Data: ${safe(dataFormatada)}</div>
                        <div style="font-size: 12px; color: #374151;">Total de questões: ${(prova.questions || []).length}</div>
                        <div style="margin-top: 12px; font-size: 13px;"><strong>Aluno:</strong> ________________________________________________</div>
                    </div>
                    ${questoesHtml}
                </div>
            `;
            document.body.appendChild(container);

            const fileBase = String(prova.titulo || 'Prova')
                .replace(/[^a-z0-9]+/gi, '_')
                .replace(/^_+|_+$/g, '');
            const filename = `Prova_Impressa_${fileBase || 'Prova'}.pdf`;
            const opt = { margin: 0.5, filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } };
            await html2pdf().set(opt).from(container).save();
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
        } finally {
            if (container && container.parentNode) container.parentNode.removeChild(container);
        }
    };

    app.exportarResultadosProvaExcel = async function(provaId) {
        if (!provaId) return;
        if (!app.currentUserData || !(app.perms && app.perms.canDownloadGabarito())) {
            return alert('Acesso restrito.');
        }

        try {
            const prova = await getProvaById(provaId);
            if (!prova) return alert('Prova não encontrada.');
            if (!prova.questions || prova.questions.length === 0) return alert('Prova sem questões cadastradas.');

            if (app.perms && app.perms.isProfessor()) {
                const turmas = await app.getCollection('turmas');
                const componentes = await app.getComponentesCache();
                const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
                if (!minhasTurmas.includes(prova.turmaId)) return alert('Acesso restrito.');
            }

            const [allResultados, allUsers, componentes] = await Promise.all([
                app.getCollection('provas_resultados'),
                app.getCollection('users'),
                app.getComponentesCache()
            ]);

            let turmaNome = prova.turmaNome || 'N/D';
            if (prova.turmaId) {
                const turma = await getTurmaById(prova.turmaId);
                if (turma) {
                    turmaNome = app.formatTurmaLabelText(turma, turmaNome, true);
                }
            }

            const compNome = componentes.find(c => c.id === prova.componenteId)?.nome || 'Geral';
            const questions = prova.questions || [];
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

            // Filtrar resultados desta prova (melhor tentativa quando houver múltiplas tentativas ou tentativas ilimitadas)
            const resultadosDaProva = allResultados.filter(r => r.provaId === provaId);
            const usarMelhorNota = typeof prova.attempts === 'number' && (prova.attempts === 0 || prova.attempts > 1);
            const melhorTentativaPorAluno = new Map();
            resultadosDaProva.forEach(r => {
                const prev = melhorTentativaPorAluno.get(r.alunoId);
                if (usarMelhorNota) {
                    const rNota = parseFloat(r.nota);
                    const prevNota = prev ? parseFloat(prev.nota) : -Infinity;
                    if (!prev || rNota > prevNota) melhorTentativaPorAluno.set(r.alunoId, r);
                } else {
                    const rMs = (r.data?.toDate ? r.data.toDate() : new Date(r.data?.seconds ? r.data.seconds * 1000 : r.data || 0)).getTime() || 0;
                    const prevMs = prev ? ((prev.data?.toDate ? prev.data.toDate() : new Date(prev.data?.seconds ? prev.data.seconds * 1000 : prev.data || 0)).getTime() || 0) : -1;
                    if (!prev || rMs > prevMs) melhorTentativaPorAluno.set(r.alunoId, r);
                }
            });

            if (melhorTentativaPorAluno.size === 0) return alert('Nenhum resultado encontrado para esta prova.');

            const usersMap = new Map(allUsers.map(u => [u.id, u]));

            // Cabeçalho
            const header = ['Nome do Aluno', 'Turma', 'Componente Curricular', 'Nota'];
            questions.forEach((q, idx) => {
                const label = `Q${idx + 1}`;
                header.push(`${label} - Resposta do Aluno`);
                header.push(`${label} - Gabarito`);
                header.push(`${label} - Resultado`);
            });

            // Linhas por aluno
            const rows = [];
            const sortedEntries = [...melhorTentativaPorAluno.entries()]
                .map(([alunoId, resultado]) => ({ alunoId, resultado }))
                .sort((a, b) => {
                    const nA = usersMap.get(a.alunoId)?.nome || '';
                    const nB = usersMap.get(b.alunoId)?.nome || '';
                    return nA.localeCompare(nB, 'pt-BR', { sensitivity: 'base' });
                });

            sortedEntries.forEach(({ alunoId, resultado }) => {
                const user = usersMap.get(alunoId);
                const nomeAluno = user?.nome || `Aluno (${alunoId})`;
                const nota = parseFloat(resultado.nota);
                const respostas = Array.isArray(resultado.respostas) ? resultado.respostas : [];

                const row = [nomeAluno, turmaNome, compNome, Number.isFinite(nota) ? nota.toFixed(1) : ''];

                questions.forEach((q, idx) => {
                    const opts = Array.isArray(q.options) ? q.options : [];
                    const correctIdx = resolveQuestionCorrectIndex(q, opts);
                    const alunoIdx = respostas[idx];

                    const gabarito = letters[correctIdx] || String.fromCharCode(65 + correctIdx);
                    const resposta = Number.isInteger(alunoIdx)
                        ? (letters[alunoIdx] || String.fromCharCode(65 + alunoIdx))
                        : '-';
                    const acertou = Number.isInteger(alunoIdx) && alunoIdx === correctIdx ? 'CERTO' : 'ERRADO';

                    row.push(resposta);
                    row.push(gabarito);
                    row.push(acertou);
                });

                rows.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

            // Larguras de coluna
            ws['!cols'] = [
                { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 8 },
                ...questions.flatMap(() => [{ wch: 18 }, { wch: 12 }, { wch: 10 }])
            ];

            const wb = XLSX.utils.book_new();
            const sheetName = String(prova.titulo || 'Resultados').replace(/[\\\/\*\?\[\]\:]/g, '').slice(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            const fileBase = String(prova.titulo || 'Prova').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
            XLSX.writeFile(wb, `Resultados_${fileBase || 'Prova'}.xlsx`);
        } catch (err) {
            console.error('Erro ao exportar resultados:', err);
            alert('Erro ao exportar: ' + (err && err.message));
        }
    };

    app.modalCriarProva = async function(tipo, id = null, options = {}) {
        const turmas = await app.getCollection('turmas');
        const isCopyMode = options && options.copyMode === true;
        const isEditing = Boolean(id) && !isCopyMode;
        const isAvulsaMode = options && options.avulsaMode === true;
        const isQuizMode = tipo === 'atividade' && options && options.quizMode === true;
        app._quizQuestionEditorMode = isQuizMode;

        app.tempQuestoes = [];
        let provaEdit = null;
        const atividadeContext = tipo === 'atividade' && !isQuizMode && !id && !isCopyMode && !isAvulsaMode ? app._atividadeSalaContext : null;

        if(id) {
            provaEdit = await getProvaById(id);
            if(provaEdit) {
                app.tempQuestoes = isCopyMode ? cloneQuestoes(provaEdit.questions || []) : (provaEdit.questions || []);
            }
        }

        const turmasAtivas = turmas.filter(t => !t.concluida);
        let turmasPermitidas = turmasAtivas;
        if (app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        }
        if (isEditing && provaEdit && provaEdit.turmaId && !turmasPermitidas.some(t => t.id === provaEdit.turmaId)) {
            const turmaAtual = turmas.find(t => t.id === provaEdit.turmaId);
            if (turmaAtual) turmasPermitidas = [...turmasPermitidas, turmaAtual];
        }
        if (!isAvulsaMode && !isQuizMode && !isEditing && turmasPermitidas.length === 0) {
            alert('Não há turmas ativas disponíveis para cadastrar nova avaliação.');
            return;
        }
        
        const avaliacaoLabel = tipo === 'atividade'
            ? (isAvulsaMode ? 'atividade avulsa' : (isQuizMode ? 'Quiz' : 'simulado'))
            : 'prova';
        const avaliacaoLabelCap = tipo === 'atividade'
            ? (isAvulsaMode ? 'Atividade Avulsa' : (isQuizMode ? 'Quiz' : 'Simulado'))
            : 'Prova';
        const origemTurmaHtml = provaEdit ? app.formatTurmaTextToHtml(provaEdit.turmaNome || 'Turma original') : '';
        const origemCriador = provaEdit ? String(provaEdit.criadoPorNome || '').trim() : '';
        const origemData = provaEdit && provaEdit.dataAgendada ? formatDateTimeLabel(provaEdit.dataAgendada) : '';

        const content = `
            <div class="space-y-5">
                <div class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">Configuração da ${avaliacaoLabel}</div>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full ${tipo === 'atividade' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}">${avaliacaoLabelCap}</span>
                    </div>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Preencha os dados principais, gere/importe questões e finalize em Salvar ou Publicar.</p>
                </div>

                <details class="group rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4" open>
                    <summary class="font-bold cursor-pointer dark:text-white list-none flex items-center justify-between gap-3">
                        <span>Dados da ${avaliacaoLabel}</span>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300">Obrigatorio</span>
                    </summary>
                    ${isCopyMode ? `
                    <div class="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                        <div class="font-semibold">Você está criando uma nova prova com base nesta avaliação.</div>
                        <div><span class="font-semibold">Origem:</span> ${app.escapeHtml(provaEdit?.titulo || 'Prova')}</div>
                        <div><span class="font-semibold">Turma original:</span><div class="mt-1">${origemTurmaHtml}</div></div>
                        ${origemCriador ? `<div><span class="font-semibold">Criada por:</span> ${app.escapeHtml(origemCriador)}</div>` : ''}
                        ${origemData ? `<div><span class="font-semibold">Data:</span> ${app.escapeHtml(origemData)}</div>` : ''}
                        <div class="font-medium">Escolha outra turma para salvar a cópia.</div>
                    </div>` : ''}
                    ${!isAvulsaMode ? `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Título</label>
                            <input id="prova-titulo" value="${provaEdit ? provaEdit.titulo : ''}" placeholder="Ex: ${avaliacaoLabelCap} 1 - Matematica" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        ${!isQuizMode ? `<div>
                            <label class="block text-sm font-bold mb-1">Turma${isQuizMode ? ' (opcional)' : ''}</label>
                            <select id="prova-turma" onchange="app.handleProvaTurmaChange(this.value)" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione...</option>
                                ${turmasPermitidas.map(t => `<option value="${t.id}" data-nome="${app.formatTurmaLabelText(t, 'Turma', true)}" ${isEditing && provaEdit && provaEdit.turmaId === t.id ? 'selected' : (atividadeContext && atividadeContext.turmaId === t.id ? 'selected' : '')}>${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('')}
                            </select>
                        </div>` : ''}
                    </div>
                    ${!isQuizMode ? `<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Componente Curricular</label>
                            <select id="prova-comp" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione a turma primeiro...</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Data Inicial</label>
                            <input type="datetime-local" id="prova-data-inicio" value="${provaEdit ? (provaEdit.dataInicio || provaEdit.dataAgendada || '') : ''}" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Data Final</label>
                            <input type="datetime-local" id="prova-data-fim" value="${provaEdit ? (provaEdit.dataFim || '') : ''}" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>` : ''}
                    ` : `
                    <div class="space-y-3 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Título</label>
                            <input id="prova-titulo" value="${provaEdit ? provaEdit.titulo : ''}" placeholder="Ex: ${avaliacaoLabelCap} de Segurança" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div class="text-xs rounded-lg border border-purple-300 bg-purple-100 text-purple-900 p-2">
                            Esta atividade avulsa não exige turma, componente curricular, data inicial ou data final. Ela pode ser acessada a qualquer momento via QR Code.
                        </div>
                    </div>
                    `}
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Tentativas (0 = ilimitado)</label>
                            <input type="number" id="prova-attempts" min="0" value="${provaEdit ? (typeof provaEdit.attempts !== 'undefined' ? provaEdit.attempts : 1) : 1}" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Valor da ${avaliacaoLabelCap}${tipo !== 'atividade' ? ' <span class="text-xs font-normal text-gray-400">(normal: máx. 60 pts | recuperação: fixo 100 pts)</span>' : ''}</label>
                            <input type="number" id="prova-valor" min="0" max="100" step="0.5" value="${provaEdit && provaEdit.provaRecuperacao ? 100 : (provaEdit && provaEdit.valor != null ? provaEdit.valor : 10)}" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    ${isQuizMode ? `<div class="mt-3">
                        <label class="block text-sm font-bold mb-1">Tempo de cada questão (segundos)</label>
                        <input type="number" id="quiz-tempo-questao" min="5" max="600" step="1" value="${provaEdit && provaEdit.quizTempoQuestao ? provaEdit.quizTempoQuestao : 30}" class="w-full border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    </div>` : ''}
                    ${tipo !== 'atividade' ? `
                    <div class="mt-3 rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-950/20 p-3">
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" id="prova-recuperacao" ${provaEdit && provaEdit.provaRecuperacao ? 'checked' : ''} onchange="app.toggleRecuperacaoAlunosPanel(this.checked)" class="w-4 h-4 accent-orange-600 rounded border-gray-300 focus:ring-orange-500">
                            <span class="text-sm font-semibold text-orange-700 dark:text-orange-400">Prova de Recuperação</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">(esta prova vale 100 pts, mas o sistema considera no máximo 60 pts)</span>
                        </label>
                    </div>
                    <div id="recuperacao-alunos-panel" class="${provaEdit && provaEdit.provaRecuperacao ? '' : 'hidden'} mt-3 border border-orange-200 dark:border-orange-800 rounded-xl p-3 bg-orange-50 dark:bg-orange-950/20">
                        <div class="flex items-center justify-between mb-2 gap-2 flex-wrap">
                            <span class="text-sm font-semibold text-orange-700 dark:text-orange-400"><i class="fas fa-users mr-1"></i>Alunos autorizados para recuperação</span>
                            <div class="flex gap-2">
                                <button type="button" onclick="app.selecionarTodosAlunosRecuperacao(true)" class="text-xs px-2 py-1 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200">Todos</button>
                                <button type="button" onclick="app.selecionarTodosAlunosRecuperacao(false)" class="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200">Nenhum</button>
                            </div>
                        </div>
                        <div id="recuperacao-notify-preview" class="mb-2 text-xs text-orange-700 dark:text-orange-300 font-medium">Nenhum aluno selecionado para notificação.</div>
                        <div id="recuperacao-alunos-lista" class="max-h-48 overflow-y-auto space-y-1 text-sm">
                            <span class="text-xs text-gray-400 italic">Selecione uma turma para carregar os alunos.</span>
                        </div>
                    </div>` : ''}
                </details>

                <details class="group rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4" open>
                    <summary class="font-bold cursor-pointer dark:text-white list-none flex items-center justify-between gap-3">
                        <span>Gerar com IA</span>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Opcional</span>
                    </summary>
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">Usa Groq ou Gemini configurado no servidor.</div>
                        <div class="flex flex-wrap gap-2">
                            <button id="btn-gerar-ia" onclick="app.gerarQuestoesIA()" class="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 font-semibold"><i class="fas fa-wand-magic-sparkles mr-1"></i>Gerar questoes</button>
                            <button id="btn-gerar-ia-pdf" onclick="app.gerarQuestoesIAComPDF()" class="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700 font-semibold"><i class="fas fa-file-pdf mr-1"></i>Gerar do PDF</button>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 mb-2">
                        <textarea id="ai-tema" rows="5" placeholder="Tema/assunto e instruções do prompt (ex: Funcoes do 1o grau, com foco em graficos, dominio e interpretacao de situacoes-problema)" class="border border-gray-300 p-3 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-y min-h-[120px]"></textarea>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <select id="ai-quantidade" data-allowed="${isAvulsaMode ? '10,20,30' : '10,20,30,40'}" class="border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="10" selected>10 questões</option>
                            <option value="20">20 questões</option>
                            <option value="30">30 questões</option>
                            ${isAvulsaMode ? '' : '<option value="40">40 questões</option>'}
                        </select>
                        <select id="ai-dificuldade" class="border border-gray-300 p-2.5 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="facil">Facil</option>
                            <option value="media" selected>Media</option>
                            <option value="dificil">Dificil</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="ai-pdf-file" type="file" accept=".pdf" class="block w-full text-xs text-gray-700 dark:text-gray-200 file:mr-2 file:py-1.5 file:px-3 file:border-0 file:text-xs file:font-semibold file:rounded file:bg-gray-100 dark:file:bg-slate-600 dark:file:text-white">
                    </div>
                    <div id="ia-progress-container" class="hidden mt-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 p-3">
                        <div class="flex items-center justify-between text-xs mb-1">
                            <span id="ia-progress-label" class="font-semibold text-indigo-700 dark:text-indigo-300">Preparando geração...</span>
                            <div class="flex items-center gap-3 text-indigo-700 dark:text-indigo-300">
                                <span id="ia-progress-eta">ETA --:--</span>
                                <span id="ia-progress-count">0/0</span>
                            </div>
                        </div>
                        <div class="w-full h-2 rounded-full bg-indigo-100 dark:bg-slate-700 overflow-hidden">
                            <div id="ia-progress-bar" class="h-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>
                </details>

                <details class="group rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4" open>
                    <summary class="font-bold cursor-pointer dark:text-white list-none flex items-center justify-between gap-3">
                        <span>Questoes</span>
                        <span class="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Obrigatorio</span>
                    </summary>
                    <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">Edite inline e defina a correta.</div>
                        <div class="flex gap-2">
                            <button onclick="app.baixarModeloQuestoes()" class="text-xs text-blue-600 underline">Baixar Modelo Excel</button>
                            <label class="cursor-pointer bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 font-semibold">
                                <i class="fas fa-file-excel mr-1"></i> Importar Excel
                                <input type="file" hidden accept=".xlsx, .xls" onchange="app.importarQuestoesExcel(this)">
                            </label>
                        </div>
                    </div>

                    <div id="lista-questoes" class="space-y-2 mb-4 max-h-72 overflow-y-auto"></div>

                    <div class="bg-gray-50 dark:bg-slate-700/70 p-3 rounded-xl border dark:border-slate-600">
                        <div class="flex gap-2 mb-2">
                            <input id="q-enunciado" placeholder="Enunciado da questao..." class="flex-1 border border-gray-300 p-2.5 rounded-lg dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                            <input id="q-op1" placeholder="Opcao A (Correta)" class="border border-green-300 p-2.5 rounded-lg dark:bg-slate-600 dark:border-green-800 dark:text-white">
                            <input id="q-op2" placeholder="Opcao B" class="border border-gray-300 p-2.5 rounded-lg dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op3" placeholder="Opcao C" class="border border-gray-300 p-2.5 rounded-lg dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op4" placeholder="Opcao D" class="border border-gray-300 p-2.5 rounded-lg dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <button onclick="app.addQuestao()" class="w-full py-2 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 font-semibold">+ Adicionar Manualmente</button>
                    </div>
                </details>
            </div>
        `;

        const resolvePublished = (override) => {
            if (typeof override === 'boolean') return override;
            if (isCopyMode) return false;
            if (provaEdit && typeof provaEdit.published === 'boolean') return provaEdit.published;
            return false;
        };

        const resolveWasPublished = (override) => {
            if (override === true) return true;
            if (isCopyMode) return false;
            if (provaEdit && provaEdit.wasPublished === true) return true;
            if (provaEdit && provaEdit.published === true) return true;
            return false;
        };

        const saveProva = async (publishOverride = null) => {
            const titulo = document.getElementById('prova-titulo').value;
            const select = document.getElementById('prova-turma');
            const turmaId = isAvulsaMode ? null : (select?.value || '');
            const turmaNome = isAvulsaMode ? 'Atividade Avulsa' : (select?.options?.[select.selectedIndex]?.dataset?.nome || '');
            const componenteEl = document.getElementById('prova-comp');
            const componenteId = isAvulsaMode || isQuizMode ? null : (componenteEl?.value || '');
            const compSelect = document.getElementById('prova-comp');
            const componenteNome = isAvulsaMode ? 'Acesso Livre' : (compSelect?.options?.[compSelect.selectedIndex]?.textContent?.trim() || 'Componente não definido');
            const dataInicio = isAvulsaMode || isQuizMode ? null : (document.getElementById('prova-data-inicio')?.value || null);
            const dataFim = isAvulsaMode || isQuizMode ? null : (document.getElementById('prova-data-fim')?.value || null);
            const dataAgendada = isAvulsaMode || isQuizMode ? null : dataInicio;
            const attemptsVal = parseInt(document.getElementById('prova-attempts').value, 10);
            const attempts = Number.isInteger(attemptsVal) && attemptsVal >= 0 ? attemptsVal : 1;
            const provaRecuperacaoEl = document.getElementById('prova-recuperacao');
            const provaRecuperacao = tipo !== 'atividade' && provaRecuperacaoEl ? provaRecuperacaoEl.checked : false;
            const valorRaw = parseFloat(document.getElementById('prova-valor')?.value);
            const valorProva = provaRecuperacao
                ? 100
                : ((!isNaN(valorRaw) && valorRaw >= 0 && valorRaw <= 60) ? valorRaw : 10);
            const quizTempoQuestaoRaw = parseInt(document.getElementById('quiz-tempo-questao')?.value || '30', 10);
            const quizTempoQuestao = Number.isInteger(quizTempoQuestaoRaw) && quizTempoQuestaoRaw >= 5 && quizTempoQuestaoRaw <= 600 ? quizTempoQuestaoRaw : 30;
            const alunosPermitidos = provaRecuperacao
                ? Array.from(document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked')).map(el => el.dataset.alunoId)
                : null;
            let salaId = null;
            let salaNome = null;
            if (tipo === 'atividade') {
                const salaSelect = document.getElementById('atividade-sala');
                if (salaSelect) {
                    salaId = salaSelect.value || null;
                    const salaLabel = salaSelect.options[salaSelect.selectedIndex]?.textContent || '';
                    salaNome = salaId ? salaLabel.trim() : null;
                }
            }

            if (!titulo || app.tempQuestoes.length === 0) throw new Error('Informe o título e adicione pelo menos uma questão.');
            if (isAvulsaMode && !isEditing && ![10, 20, 30].includes(app.tempQuestoes.length)) {
                throw new Error('Nova atividade avulsa deve possuir 10, 20 ou 30 questões.');
            }
            if (!isAvulsaMode && !isQuizMode && !turmaId) {
                throw new Error('Selecione uma turma para esta avaliação.');
            }
            if (!isAvulsaMode && !isQuizMode && (!componenteId || !dataInicio || !dataFim)) {
                throw new Error('Preencha todos os dados (incluindo Data Inicial e Data Final).');
            }
            
            // Validar que todas as questões têm pelo menos 4 opções válidas
            const questoesInvalidas = app.tempQuestoes.filter((q, idx) => {
                const opts = Array.isArray(q.options) ? q.options.filter(o => String(o || '').trim()) : [];
                if (opts.length < 4) {
                    console.warn(`Questão ${idx + 1} tem apenas ${opts.length} opções válidas:`, q.options);
                    return true;
                }
                return false;
            });
            
            if (questoesInvalidas.length > 0) {
                throw new Error(`${questoesInvalidas.length} questão(ões) com menos de 4 opções válidas. Verifique o console para detalhes.`);
            }

            const pendentesIa = countPendingIaReview(app.tempQuestoes);
            if (pendentesIa > 0) {
                throw new Error(
                    `Há ${pendentesIa} questão(ões) gerada(s) por IA sem revisão docente marcada. ` +
                    'Revise e marque todas como revisadas antes de salvar/publicar.'
                );
            }
            
            if (!isAvulsaMode && !isQuizMode && new Date(dataFim) <= new Date(dataInicio)) throw new Error('A Data Final deve ser posterior à Data Inicial.');
            if (!isAvulsaMode && isCopyMode && provaEdit && turmaId === provaEdit.turmaId) throw new Error('Selecione outra turma para salvar a cópia da prova.');
            if (provaRecuperacao && (!Array.isArray(alunosPermitidos) || alunosPermitidos.length === 0)) {
                throw new Error('Selecione pelo menos um aluno para a prova de recuperação.');
            }

            const payload = {
                titulo, turmaId, turmaNome, componenteId, tipo, dataAgendada,
                dataInicio,
                dataFim,
                valor: valorProva,
                provaRecuperacao: provaRecuperacao,
                alunosPermitidos: alunosPermitidos,
                questions: app.tempQuestoes,
                attempts,
                published: resolvePublished(publishOverride),
                wasPublished: resolveWasPublished(publishOverride),
                ...(isQuizMode ? {
                    quizTempoQuestao,
                    questions: app.tempQuestoes.map((question) => ({ ...question, timeLimit: Number.isInteger(question.timeLimit) && question.timeLimit >= 5 ? question.timeLimit : quizTempoQuestao })),
                    quizStatus: isEditing ? (provaEdit?.quizStatus || 'draft') : 'draft',
                    quizQuestionIndex: isEditing ? (Number.isInteger(provaEdit?.quizQuestionIndex) ? provaEdit.quizQuestionIndex : -1) : -1
                } : {})
            };
            if (tipo === 'atividade') {
                payload.quiz = isQuizMode;
                payload.salaId = salaId;
                payload.salaNome = salaNome;
                payload.avulsaPublica = isAvulsaMode;
            }

            const tipoBase = tipo === 'atividade' ? 'atividade' : 'prova';
            if(isEditing) {
                await updateProva(id, payload);
                if (app.logAcesso) app.logAcesso(`${tipoBase}_editada`, `${tipoBase}:${titulo}`);
            } else {
                await createProva({
                    ...payload,
                    criadoPorId: app.currentUserData?.id || null,
                    criadoPorNome: app.currentUserData?.nome || '',
                    copiadaDeProvaId: isCopyMode ? id : null,
                    copiadaDeTitulo: isCopyMode ? (provaEdit?.titulo || '') : '',
                    copiadaDeTurmaNome: isCopyMode ? (provaEdit?.turmaNome || '') : ''
                });
                if (app.logAcesso) app.logAcesso(isCopyMode ? `${tipoBase}_copiada` : `${tipoBase}_criada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true && app.logAcesso) {
                app.logAcesso(`${tipoBase}_publicada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true && !isAvulsaMode) {
                // Formatar data de forma mais clara
                let dataFormatada = 'Data não definida';
                if (dataAgendada) {
                    const dataProva = new Date(dataAgendada);
                    const dataStr = dataProva.toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                    });
                    const horaStr = dataProva.toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    dataFormatada = `${dataStr} às ${horaStr}`;
                }
                
                const turmaLabel = String(turmaNome || 'Turma').replace(/\n/g, ' ');
                const assunto = `${tipoBase === 'atividade' ? (isQuizMode ? 'Quiz' : 'Simulado') : app.capitalize(tipoBase)} publicado: ${titulo}`;
                const mensagem = `Curso: ${turmaLabel}\nComponente: ${componenteNome}\nData: ${dataFormatada}`;
                if (provaRecuperacao) {
                    const totalSelecionados = Array.isArray(alunosPermitidos) ? alunosPermitidos.length : 0;
                    const confirmMsg = totalSelecionados === 1
                        ? 'Publicar esta prova de recuperação e notificar 1 aluno selecionado?'
                        : `Publicar esta prova de recuperação e notificar ${totalSelecionados} alunos selecionados?`;
                    if (!confirm(confirmMsg)) return;
                }
                
                // Enviar notificações (email + push para celular)
                app.notifyAlunosTurma(turmaId, assunto, mensagem, { 
                    turmaNome: turmaLabel,
                    link: `${window.location.origin}/#${tipo === 'atividade' ? 'atividades' : 'provas'}`,
                    notificationType: tipo === 'atividade' ? 'atividade' : 'prova',
                    targetAlunoIds: provaRecuperacao ? alunosPermitidos : null
                });
            }
            if (isAvulsaMode && typeof app.renderAtividadesAvulsas === 'function') {
                app.renderAtividadesAvulsas(document.getElementById('content-area'));
            } else {
                app.renderContent();
            }
        };

        const modalTitle = tipo === 'atividade'
            ? (isAvulsaMode
                ? (isEditing ? 'Editar Atividade Avulsa' : (isCopyMode ? 'Copiar Atividade Avulsa' : 'Nova Atividade Avulsa'))
                : (isEditing ? 'Editar Quiz' : (isCopyMode ? 'Copiar Quiz' : 'Novo Quiz')))
            : (isEditing ? `Editar ${app.capitalize(tipo)}` : (isCopyMode ? `Copiar ${app.capitalize(tipo)}` : `Nova ${app.capitalize(tipo)}`));

        app.showModal(modalTitle, content, async () => {
            await saveProva(null);
        }, {
            modalWidthClass: 'max-w-6xl',
            secondaryLabel: 'Publicar',
            secondaryClass: 'px-4 py-2 bg-emerald-600 text-white rounded-lg',
            onSecondary: async () => {
                await saveProva(true);
            }
        });

        setTimeout(() => {
            const recuperacaoEl = document.getElementById('prova-recuperacao');
            app.syncValorProvaByRecuperacao(Boolean(recuperacaoEl && recuperacaoEl.checked));
            app.updateRecuperacaoSelectionInfo();
            app.updateRecuperacaoPublishButtonLabel();
        }, 0);

        app.renderListaQuestoes();
        setTimeout(() => {
            const tituloInput = document.getElementById('prova-titulo');
            if (tituloInput) {
                tituloInput.focus();
                tituloInput.setSelectionRange(tituloInput.value.length, tituloInput.value.length);
            }
        }, 50);
        const initialTurmaId = isAvulsaMode
            ? null
            : (isEditing ? (provaEdit ? provaEdit.turmaId : null) : (atividadeContext ? atividadeContext.turmaId : null));
        const initialSalaId = isEditing ? (provaEdit ? (provaEdit.salaId || null) : null) : (atividadeContext ? atividadeContext.salaId || null : null);
        const initialAlunosPermitidos = provaEdit && Array.isArray(provaEdit.alunosPermitidos) ? provaEdit.alunosPermitidos : null;
        if (initialTurmaId) {
            app.handleProvaTurmaChange(initialTurmaId, provaEdit ? provaEdit.componenteId : null, initialSalaId, initialAlunosPermitidos);
        }
    };

    app.baixarModeloQuestoes = function() {
        const data = [ { Enunciado: "Quanto é 2+2?", OpcaoA: "4", OpcaoB: "3", OpcaoC: "5", OpcaoD: "6", Correta: "A" }, { Enunciado: "Capital do Brasil?", OpcaoA: "Brasília", OpcaoB: "Rio", OpcaoC: "SP", OpcaoD: "Bahia", Correta: "A" } ];
        const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Questoes"); XLSX.writeFile(wb, "Modelo_Questoes_Prova.xlsx");
    };

    app.importarQuestoesExcel = function(input) {
        const file = input.files[0]; if(!file) return; const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                let imported = 0;
                json.forEach(row => {
                    if(row.Enunciado && row.OpcaoA) {
                        let correctIdx = 0; const c = String(row.Correta).toUpperCase().trim();
                        if(c === 'B') correctIdx = 1; if(c === 'C') correctIdx = 2; if(c === 'D') correctIdx = 3;
                        app.tempQuestoes.push({
                            id: Date.now() + Math.random(),
                            text: row.Enunciado,
                            options: [row.OpcaoA, row.OpcaoB, row.OpcaoC, row.OpcaoD],
                            correct: correctIdx,
                            timeLimit: null,
                            aiGenerated: false,
                            reviewedByTeacher: true
                        });
                        imported++;
                    }
                });
                app.renderListaQuestoes(); alert(`${imported} questões importadas!`); input.value = '';
            } catch(err) { alert("Erro na importação: " + err.message); }
        }; reader.readAsArrayBuffer(file);
    };

    app.setIAGenerationBusy = function(isBusy) {
        ['btn-gerar-ia', 'btn-gerar-ia-pdf'].forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.disabled = Boolean(isBusy);
            btn.classList.toggle('opacity-60', Boolean(isBusy));
            btn.classList.toggle('cursor-not-allowed', Boolean(isBusy));
        });
    };

    app.setIAProgress = function(done, total, label = 'Gerando questoes com IA...') {
        const container = document.getElementById('ia-progress-container');
        const bar = document.getElementById('ia-progress-bar');
        const count = document.getElementById('ia-progress-count');
        const eta = document.getElementById('ia-progress-eta');
        const labelEl = document.getElementById('ia-progress-label');
        if (!container || !bar || !count || !labelEl || !eta) return;

        const target = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 1;
        const current = Math.max(0, Math.min(Number(done) || 0, target));
        const pct = Math.max(0, Math.min(100, Math.round((current / target) * 100)));

        const formatEta = (seconds) => {
            const value = Math.max(0, Math.ceil(seconds));
            const min = Math.floor(value / 60);
            const sec = value % 60;
            return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        };

        const now = Date.now();
        if (!app._iaProgressState || current === 0 || app._iaProgressState.total !== target || current < app._iaProgressState.lastDone) {
            app._iaProgressState = {
                startedAt: now,
                total: target,
                lastDone: current,
                lastTs: now,
                rateEma: 0
            };
        } else if (current > app._iaProgressState.lastDone) {
            const deltaDone = current - app._iaProgressState.lastDone;
            const deltaSeconds = Math.max((now - app._iaProgressState.lastTs) / 1000, 0.001);
            const instantRate = deltaDone / deltaSeconds;
            const alpha = 0.35;
            app._iaProgressState.rateEma = app._iaProgressState.rateEma > 0
                ? (alpha * instantRate) + ((1 - alpha) * app._iaProgressState.rateEma)
                : instantRate;
            app._iaProgressState.lastDone = current;
            app._iaProgressState.lastTs = now;
        }

        let etaText = 'ETA --:--';
        if (current >= target && target > 0) {
            etaText = 'ETA 00:00';
        } else if (current > 0 && app._iaProgressState && app._iaProgressState.startedAt) {
            const elapsedSeconds = (now - app._iaProgressState.startedAt) / 1000;
            const baseRate = elapsedSeconds > 0 ? current / elapsedSeconds : 0;
            const rate = app._iaProgressState.rateEma > 0 ? app._iaProgressState.rateEma : baseRate;
            if (rate > 0) {
                const remainingSeconds = (target - current) / rate;
                etaText = `ETA ${formatEta(remainingSeconds)}`;
            }
        }

        container.classList.remove('hidden');
        bar.style.width = `${pct}%`;
        count.textContent = `${current}/${target}`;
        eta.textContent = etaText;
        labelEl.textContent = label;
    };

    app.resetIAProgress = function() {
        if (app._iaProgressHideTimer) {
            clearTimeout(app._iaProgressHideTimer);
            app._iaProgressHideTimer = null;
        }
        const container = document.getElementById('ia-progress-container');
        const bar = document.getElementById('ia-progress-bar');
        const count = document.getElementById('ia-progress-count');
        const eta = document.getElementById('ia-progress-eta');
        const labelEl = document.getElementById('ia-progress-label');
        app._iaProgressState = null;
        if (!container || !bar || !count || !labelEl || !eta) return;
        bar.style.width = '0%';
        count.textContent = '0/0';
        eta.textContent = 'ETA --:--';
        labelEl.textContent = 'Preparando geração...';
        container.classList.add('hidden');
    };

    app.finishIAProgress = function(done, total, label = 'Concluido') {
        app.setIAProgress(done, total, label);
        if (app._iaProgressHideTimer) clearTimeout(app._iaProgressHideTimer);
        app._iaProgressHideTimer = setTimeout(() => {
            app.resetIAProgress();
        }, 1800);
    };

    app.completarQuantidadeQuestoesIA = async function(questions, quantidade, gerarLote, onProgress) {
        const merged = Array.isArray(questions) ? [...questions] : [];
        let attempt = 0;
        const maxAttempts = 8;
        const minBatchSize = 3;
        const maxBatchSize = 10;

        if (typeof onProgress === 'function') onProgress(Math.min(merged.length, quantidade), quantidade);

        while (merged.length < quantidade && attempt < maxAttempts) {
            const faltantes = quantidade - merged.length;
            attempt += 1;
            try {
                const loteSolicitado = Math.max(Math.min(faltantes, maxBatchSize), minBatchSize);
                let extra = await gerarLote(loteSolicitado);
                if ((!Array.isArray(extra) || extra.length === 0) && loteSolicitado > minBatchSize) {
                    // Alguns provedores retornam vazio para lotes grandes; tenta um lote menor antes de desistir.
                    extra = await gerarLote(minBatchSize);
                }
                if (!Array.isArray(extra) || extra.length === 0) break;
                extra.forEach(q => merged.push(q));
                if (typeof onProgress === 'function') onProgress(Math.min(merged.length, quantidade), quantidade);
            } catch (err) {
                console.warn('⚠️? Falha ao complementar questões da IA:', err);
                break;
            }
        }

        return merged.slice(0, quantidade);
    };

    app.gerarQuestoesIA = async function() {
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeSelect = document.getElementById('ai-quantidade');
        const allowedQuantidades = String(quantidadeSelect?.dataset?.allowed || '10,20,30,40')
            .split(',')
            .map((item) => parseInt(item, 10))
            .filter((item) => Number.isInteger(item) && item > 0);
        const quantidadeRaw = parseInt(quantidadeSelect?.value || String(allowedQuantidades[0] || 10), 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'openai/gpt-oss-20b').trim();
        const modeloPadrao = 'openai/gpt-oss-20b';
        const quantidade = allowedQuantidades.includes(quantidadeRaw) ? quantidadeRaw : (allowedQuantidades[0] || 10);
        const tempo = 60;

        if (!tema) return alert('Informe o tema/assunto para gerar as questoes.');
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-xc7p3stbca-uc.a.run.app/api/generate-questions';

        try {
            app.setIAGenerationBusy(true);
            app.setIAProgress(0, quantidade, 'Gerando questoes com IA...');
            console.log('🚀 Gerando questões com IA:', { tema, quantidade, dificuldade, tempo, modelo, endpoint });
            if (app.showToast) app.showToast('Gerando questoes com IA local...', 'info');
            const gerarLote = async (quantidadeLote, modeloLote = modelo) => {
                const payload = JSON.stringify({ tema, quantidade: quantidadeLote, dificuldade, tempo, modelo: modeloLote });
                let res = null;
                let lastError = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        res = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: payload
                        });
                        if (res.ok) break;
                    } catch (err) {
                        lastError = err;
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
                if (!res || !res.ok) {
                    let detail = '';
                    if (res) {
                        console.error('❌?❌ Resposta não OK:', res.status, res.statusText);
                        try {
                            const errPayload = await res.json();
                            console.error('❌?❌ Erro da API:', errPayload);
                            detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                        } catch {
                            try {
                                const textError = await res.text();
                                console.error('❌?❌ Erro (texto):', textError);
                                detail = `: ${textError}`;
                            } catch { detail = ''; }
                        }
                        throw new Error(`Falha no servidor IA (${res.status})${detail}`);
                    }
                    console.error('❌?❌ Sem resposta do servidor:', lastError);
                    throw new Error(`Falha no servidor IA: ${lastError ? lastError.message : 'Sem resposta'}`);
                }
                console.log('✅ Resposta OK:', res.status, res.statusText);
                const responsePayload = await res.json();
                console.log('🤖 Resposta da IA (raw):', responsePayload);
                console.log('📊 Tipo da resposta:', typeof responsePayload);
                console.log('📊 É array?:', Array.isArray(responsePayload));
                console.log('📊 Tem questions?:', responsePayload?.questions);
                return app.normalizeQuestoesIA(responsePayload);
            };

            let questions = await gerarLote(quantidade);
            app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Gerando questoes com IA...');
            if (questions.length === 0 && modelo !== modeloPadrao) {
                console.warn('⚠️ IA sem questões no modelo informado. Tentando modelo padrão...');
                if (app.showToast) app.showToast('IA retornou vazio. Tentando modelo padrao...', 'warning');
                questions = await gerarLote(quantidade, modeloPadrao);
                app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Tentando modelo padrao...');
            }
            if (questions.length === 0 && quantidade > 10) {
                console.warn('⚠️ IA sem questões no lote cheio. Tentando lote reduzido de 10...');
                if (app.showToast) app.showToast('IA retornou vazio. Tentando lote reduzido...', 'warning');
                questions = await gerarLote(10, modelo === modeloPadrao ? modelo : modeloPadrao);
                app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Tentando lote reduzido...');
                if (questions.length > 0 && questions.length < quantidade) {
                    questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, async (faltantes) => {
                        const modeloFallback = modelo === modeloPadrao ? modelo : modeloPadrao;
                        return await gerarLote(faltantes, modeloFallback);
                    }, (done, total) => app.setIAProgress(done, total, 'Completando questoes...'));
                }
            }
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, gerarLote, (done, total) => app.setIAProgress(done, total, 'Completando questoes...'));
            }

            console.log('✅ Questões normalizadas:', questions.length, questions);

            if (questions.length === 0) {
                console.error('❌?❌ Nenhuma questão válida retornada pela IA.');
                throw new Error('Nenhuma questao valida retornada. Verifique o console para detalhes.');
            }
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            app.finishIAProgress(Math.min(questions.length, quantidade), quantidade, 'Questoes prontas');
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas.`, 'success');
        } catch (err) {
            app.resetIAProgress();
            console.error('Erro IA:', err);
            alert('Erro ao gerar questoes: ' + (err && err.message ? err.message : err));
        } finally {
            app.setIAGenerationBusy(false);
        }
    };

    app.gerarQuestoesIAComPDF = async function() {
        const fileInput = document.getElementById('ai-pdf-file');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeSelect = document.getElementById('ai-quantidade');
        const allowedQuantidades = String(quantidadeSelect?.dataset?.allowed || '10,20,30,40')
            .split(',')
            .map((item) => parseInt(item, 10))
            .filter((item) => Number.isInteger(item) && item > 0);
        const quantidadeRaw = parseInt(quantidadeSelect?.value || String(allowedQuantidades[0] || 10), 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'openai/gpt-oss-20b').trim();
        const modeloPadrao = 'openai/gpt-oss-20b';
        const quantidade = allowedQuantidades.includes(quantidadeRaw) ? quantidadeRaw : (allowedQuantidades[0] || 10);
        const tempo = 60;

        if (!file) return alert('Selecione um PDF para gerar as questoes.');
        const endpoint = localStorage.getItem('aiPdfEndpoint') || 'https://senatedu-proxy-xc7p3stbca-uc.a.run.app/api/generate-questions-from-pdf';

        try {
            app.setIAGenerationBusy(true);
            app.setIAProgress(0, quantidade, 'Lendo PDF e gerando questoes...');
            if (app.showToast) app.showToast('Lendo PDF e gerando questoes...', 'info');
            const gerarLote = async (quantidadeLote, modeloLote = modelo) => {
                const form = new FormData();
                form.append('file', file);
                form.append('tema', tema);
                form.append('quantidade', String(quantidadeLote));
                form.append('dificuldade', dificuldade);
                form.append('tempo', String(tempo));
                form.append('modelo', modeloLote);

                let res = null;
                let lastError = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        res = await fetch(endpoint, {
                            method: 'POST',
                            body: form
                        });
                        if (res.ok) break;
                    } catch (err) {
                        lastError = err;
                    }
                    await new Promise(r => setTimeout(r, 800));
                }
                if (!res || !res.ok) {
                    let detail = '';
                    if (res) {
                        try {
                            const errPayload = await res.json();
                            detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                        } catch {
                            try { detail = `: ${await res.text()}`; } catch { detail = ''; }
                        }
                        throw new Error(`Falha no servidor IA (${res.status})${detail}`);
                    }
                    throw new Error(`Falha no servidor IA: ${lastError ? lastError.message : 'Sem resposta'}`);
                }
                return await res.json();
            };

            let payload = await gerarLote(quantidade);
            let questions = app.normalizeQuestoesIA(payload);
            app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Lendo PDF e gerando questoes...');
            if (questions.length === 0 && modelo !== modeloPadrao) {
                if (app.showToast) app.showToast('IA retornou vazio. Tentando modelo padrao...', 'warning');
                payload = await gerarLote(quantidade, modeloPadrao);
                questions = app.normalizeQuestoesIA(payload);
                app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Tentando modelo padrao...');
            }
            if (questions.length === 0 && quantidade > 10) {
                if (app.showToast) app.showToast('IA retornou vazio. Tentando lote reduzido...', 'warning');
                payload = await gerarLote(10, modelo === modeloPadrao ? modelo : modeloPadrao);
                questions = app.normalizeQuestoesIA(payload);
                app.setIAProgress(Math.min(questions.length, quantidade), quantidade, 'Tentando lote reduzido...');
            }
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, async (faltantes) => {
                    const complementoPayload = await gerarLote(faltantes, modelo === modeloPadrao ? modelo : modeloPadrao);
                    return app.normalizeQuestoesIA(complementoPayload);
                }, (done, total) => app.setIAProgress(done, total, 'Completando questoes...'));
            }
            if (questions.length === 0) throw new Error('Nenhuma questao valida retornada.');
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            app.finishIAProgress(Math.min(questions.length, quantidade), quantidade, 'Questoes prontas');
            if (payload && payload.warning) {
                if (app.showToast) app.showToast(payload.warning, 'info');
                else alert(payload.warning);
            }
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas do PDF.`, 'success');
        } catch (err) {
            app.resetIAProgress();
            console.error('Erro IA PDF:', err);
            alert('Erro ao gerar questoes do PDF: ' + (err && err.message ? err.message : err));
        } finally {
            app.setIAGenerationBusy(false);
        }
    };

    app.testarIA = async function() {
        if (!app.currentUserData || !(app.perms && app.perms.canManageSistema())) {
            return alert('Acesso restrito.');
        }
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-xc7p3stbca-uc.a.run.app/api/generate-questions';
        const tempo = 60;
        const payload = JSON.stringify({
            tema: 'Teste rapido do sistema',
            quantidade: 1,
            dificuldade: 'media',
            tempo,
            modelo: 'openai/gpt-oss-20b'
        });
        try {
            if (app.showToast) app.showToast('Testando IA...', 'info');
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            if (!res.ok) {
                let detail = '';
                try {
                    const errPayload = await res.json();
                    detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                } catch {
                    try { detail = `: ${await res.text()}`; } catch { detail = ''; }
                }
                throw new Error(`Falha no servidor IA (${res.status})${detail}`);
            }
            const responsePayload = await res.json();
            const questions = app.normalizeQuestoesIA(responsePayload, tempo);
            if (questions.length === 0) {
                const hint = responsePayload && responsePayload.warning
                    ? ` (${responsePayload.warning})`
                    : '';
                if (app.showToast) app.showToast(`IA respondeu, mas sem questoes validas${hint}.`, 'warning');
                else alert(`IA respondeu, mas sem questoes validas${hint}.`);
                return;
            }
            if (app.showToast) app.showToast('IA OK: resposta valida recebida.', 'success');
            else alert('IA OK: resposta valida recebida.');
        } catch (err) {
            console.error('Erro teste IA:', err);
            alert('Erro ao testar IA: ' + (err && err.message ? err.message : err));
        }
    };

    app.backupSistema = async function() {
        if (!app.currentUserData || !(app.perms && app.perms.canManageSistema())) {
            return alert('Acesso restrito.');
        }
        const collections = [
            'users',
            'turmas',
            'componentes',
            'provas',
            'provas_resultados',
            'trabalhos_notas',
            'avisos',
            'eventos_calendario',
            'materiais',
            'logs_acesso',
            'atividades_salas',
            'trabalhos_salas',
            'forum_salas'
        ];
        const backup = {
            generatedAt: new Date().toISOString(),
            collections: {},
            counts: {}
        };
        try {
            if (app.showToast) app.showToast('Gerando backup...', 'info');
            for (const name of collections) {
                try {
                    const docs = await app.getCollection(name);
                    backup.collections[name] = docs;
                    backup.counts[name] = docs.length;
                } catch (err) {
                    backup.collections[name] = { error: err && err.message ? err.message : String(err) };
                    backup.counts[name] = 0;
                }
            }
            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const a = document.createElement('a');
            a.href = url;
            a.download = `senatedu-backup-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            if (app.showToast) app.showToast('Backup pronto para download.', 'success');
        } catch (err) {
            console.error('Erro backup:', err);
            alert('Erro ao gerar backup: ' + (err && err.message ? err.message : err));
        }
    };

    app.extractQuestoesFromIaPayload = function(payload) {
        const parseJsonLoose = (value) => {
            if (typeof value !== 'string') return null;
            const text = value.trim();
            if (!text) return null;

            try {
                return JSON.parse(text);
            } catch {
                // Continua abaixo com tentativas por recorte.
            }

            const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (fencedMatch && fencedMatch[1]) {
                try {
                    return JSON.parse(fencedMatch[1].trim());
                } catch {
                    // Continua abaixo com tentativa por bloco.
                }
            }

            const blockMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (blockMatch && blockMatch[1]) {
                try {
                    return JSON.parse(blockMatch[1]);
                } catch {
                    return null;
                }
            }

            return null;
        };

        const isQuestionLike = (item) => {
            if (!item || typeof item !== 'object') return false;
            return Boolean(
                item.text || item.enunciado || item.question || item.pergunta
                || item.options || item.alternativas || item.opcoes || item.opcoesAlternativas
            );
        };

        const queue = [];
        const seen = new WeakSet();
        const candidates = [];

        const enqueue = (value) => {
            if (value == null) return;
            if (typeof value === 'object') {
                if (seen.has(value)) return;
                seen.add(value);
            }
            queue.push(value);
        };

        enqueue(payload);

        while (queue.length > 0) {
            const current = queue.shift();

            if (typeof current === 'string') {
                const parsed = parseJsonLoose(current);
                if (parsed != null) enqueue(parsed);
                continue;
            }

            if (Array.isArray(current)) {
                if (current.some(isQuestionLike)) {
                    candidates.push(current);
                }
                current.forEach(enqueue);
                continue;
            }

            if (!current || typeof current !== 'object') continue;

            const arrayKeys = ['questions', 'questoes', 'perguntas', 'itens', 'items', 'data'];
            arrayKeys.forEach((key) => {
                if (Array.isArray(current[key]) && current[key].some(isQuestionLike)) {
                    candidates.push(current[key]);
                }
            });

            ['response', 'output', 'text', 'content', 'result', 'message'].forEach((key) => {
                const value = current[key];
                if (typeof value === 'string') enqueue(value);
            });

            Object.values(current).forEach(enqueue);
        }

        if (candidates.length === 0) return [];
        const nonEmpty = candidates.find(arr => arr.length > 0);
        return nonEmpty || candidates[0];
    };

    app.normalizeQuestoesIA = function(payload) {
        console.log('🔄 Normalizando questões IA. Payload:', payload);

        const raw = app.extractQuestoesFromIaPayload(payload);
        console.log('📋 Questões raw extraídas:', raw.length, raw);
        
        const normalized = [];
        raw.forEach((q, index) => {
            console.log(`❌? Processando questão ${index + 1}:`, q);
            
            const text = (q.text || q.enunciado || q.question || q.pergunta || '').trim();
            if (!text) {
                console.warn(`⚠️? Questão ${index + 1} sem texto/enunciado`);
                return;
            }
            
            let options = q.options || q.alternativas || q.opcoes || q.opcoesAlternativas;
            console.log(`❌? Opções encontradas para questão ${index + 1}:`, options, 'tipo:', typeof options);
            
            if (options && !Array.isArray(options) && typeof options === 'object') {
                options = Object.values(options);
                console.log(`🔄 Opções convertidas de objeto para array:`, options);
            }
            if (!Array.isArray(options)) {
                console.warn(`⚠️? Questão ${index + 1} sem opções em formato de array. Tipo encontrado:`, typeof options);
                return;
            }
            
            console.log(`📝 Opções antes de map/filter para questão ${index + 1}:`, options);
            options = options.map(o => String(o || '').trim()).filter(Boolean);
            console.log(`📝 Opções após map/filter para questão ${index + 1}:`, options, 'quantidade:', options.length);
            
            // Garantir 4 opções preenchendo com placeholders se necessário
            while (options.length < 4) {
                const idx = options.length;
                options.push(`Opção ${String.fromCharCode(65 + idx)}`);
            }
            if (options.length > 4) options = options.slice(0, 4);
            
            console.log(`✅ Opções finais para questão ${index + 1} (após garantir 4 opções):`, options);

            const correct = resolveQuestionCorrectIndex(q, options);

            const normalizedQuestion = {
                id: Date.now() + Math.random(),
                text,
                options,
                correct,
                timeLimit: null,
                aiGenerated: true,
                reviewedByTeacher: false
            };
            console.log(`✅ Questão ${index + 1} normalizada com sucesso:`, normalizedQuestion);
            normalized.push(normalizedQuestion);
        });
        
        console.log('✅ Total de questões normalizadas:', normalized.length);
        return normalized;
    };

    app.carregarComponentesSelect = async function(turmaId, targetId, selectedValue = null) {
        const target = document.getElementById(targetId);
        target.innerHTML = '<option value="">Carregando...</option>';
        if(!turmaId) { target.innerHTML = '<option value="">Selecione a turma primeiro...</option>'; return; }
        const comps = await getComponentesByTurma(turmaId);
        if(comps.length === 0) { target.innerHTML = '<option value="">Nenhum componente nesta turma</option>'; return; }
        const userId = app.currentUserData?.id;
        const isProf = app.perms && app.perms.hasRole('professor', 'secretaria');
        const filtered = comps.filter(comp => {
            if (!isProf) return true;
            const hasProfFields = Array.isArray(comp.professores)
                || Array.isArray(comp.professorIds)
                || Boolean(comp.professorId)
                || Boolean(comp.professorUid);
            if (!hasProfFields) return true;
            return app.componentHasProfessor(comp, userId);
        });
        if (filtered.length === 0) {
            target.innerHTML = '<option value="">Nenhum componente vinculado</option>';
            return;
        }
        const parseCompDate = (value) => {
            if (!value) return null;
            const parsed = app.parseDateOnly ? app.parseDateOnly(value) : new Date(value);
            if (!parsed || Number.isNaN(parsed.getTime())) return null;
            return parsed;
        };
        const sorted = [...filtered].sort((a, b) => {
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

        target.innerHTML = sorted
            .map(c => `<option value="${c.id}" ${selectedValue === c.id ? 'selected' : ''}>${c.nome || 'Componente'}</option>`)
            .join('');
    };

    app.carregarSalasAtividadeSelect = async function(turmaId, targetId, selectedValue = null) {
        const target = document.getElementById(targetId);
        if (!target) return;
        target.innerHTML = '<option value="">Carregando...</option>';
        if (!turmaId) {
            target.innerHTML = '<option value="">Sala Principal</option>';
            return;
        }
        const salasSnap = await db.collection('atividades_salas').where('turmaId', '==', turmaId).get();
        const salas = salasSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const options = ['<option value="">Sala Principal</option>'].concat(
            salas.map(s => `<option value="${s.id}" ${selectedValue === s.id ? 'selected' : ''}>${s.nome || 'Sala'}</option>`)
        );
        target.innerHTML = options.join('');
    };

    app.handleProvaTurmaChange = function(turmaId, selectedComponenteId = null, selectedSalaId = null, preSelectedAlunosIds = null) {
        app.carregarComponentesSelect(turmaId, 'prova-comp', selectedComponenteId);
        if (document.getElementById('atividade-sala')) {
            app.carregarSalasAtividadeSelect(turmaId, 'atividade-sala', selectedSalaId);
        }
        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (recuperacaoEl && recuperacaoEl.checked) {
            app.carregarAlunosRecuperacao(turmaId, preSelectedAlunosIds);
        }
    };

    app.toggleRecuperacaoAlunosPanel = function(checked) {
        const panel = document.getElementById('recuperacao-alunos-panel');
        if (!panel) return;
        panel.classList.toggle('hidden', !checked);
        app.syncValorProvaByRecuperacao(checked);
        app.updateRecuperacaoSelectionInfo();
        if (checked) {
            const turmaSelect = document.getElementById('prova-turma');
            const turmaId = turmaSelect ? turmaSelect.value : null;
            if (turmaId) app.carregarAlunosRecuperacao(turmaId);
        }
    };

    app.syncValorProvaByRecuperacao = function(isRecuperacao) {
        const valorInput = document.getElementById('prova-valor');
        if (!valorInput) return;

        if (isRecuperacao) {
            if (!valorInput.dataset.valorNormal) {
                valorInput.dataset.valorNormal = valorInput.value || '10';
            }
            valorInput.value = '100';
            valorInput.min = '100';
            valorInput.max = '100';
            valorInput.readOnly = true;
            valorInput.classList.add('bg-gray-100', 'dark:bg-slate-600');
            return;
        }

        valorInput.min = '0';
        valorInput.max = '60';
        valorInput.readOnly = false;
        valorInput.classList.remove('bg-gray-100', 'dark:bg-slate-600');
        if (valorInput.value === '100') {
            valorInput.value = valorInput.dataset.valorNormal || '10';
        }
        delete valorInput.dataset.valorNormal;
    };

    app.updateRecuperacaoPublishButtonLabel = function() {
        const publishButton = document.querySelector('[id^="btn-s-m-"]');
        if (!publishButton) return;

        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (!recuperacaoEl || !recuperacaoEl.checked) {
            publishButton.textContent = 'Publicar';
            return;
        }

        const selectedCount = document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked').length;
        if (selectedCount <= 0) {
            publishButton.textContent = 'Publicar recuperação';
        } else if (selectedCount === 1) {
            publishButton.textContent = 'Publicar e notificar 1 aluno';
        } else {
            publishButton.textContent = `Publicar e notificar ${selectedCount} alunos`;
        }
    };

    app.updateRecuperacaoSelectionInfo = function() {
        const preview = document.getElementById('recuperacao-notify-preview');
        const recuperacaoEl = document.getElementById('prova-recuperacao');
        if (!preview || !recuperacaoEl || !recuperacaoEl.checked) {
            app.updateRecuperacaoPublishButtonLabel();
            return;
        }
        const selectedCount = document.querySelectorAll('#recuperacao-alunos-lista input[type=checkbox][data-aluno-id]:checked').length;
        if (selectedCount === 0) {
            preview.textContent = 'Nenhum aluno selecionado para notificação.';
        } else if (selectedCount === 1) {
            preview.textContent = '1 aluno será notificado ao publicar esta recuperação.';
        } else {
            preview.textContent = `${selectedCount} alunos serão notificados ao publicar esta recuperação.`;
        }
        app.updateRecuperacaoPublishButtonLabel();
    };

    app.carregarAlunosRecuperacao = async function(turmaId, preSelectedIds = null) {
        const lista = document.getElementById('recuperacao-alunos-lista');
        if (!lista) return;
        if (!turmaId) {
            lista.innerHTML = '<span class="text-xs text-gray-400 italic">Selecione uma turma para carregar os alunos.</span>';
            return;
        }
        lista.innerHTML = '<span class="text-xs text-gray-400 italic">Carregando alunos...</span>';
        try {
            const turma = await getTurmaById(turmaId);
            const alunosIds = turma?.alunos || [];
            const users = await app.getCollection('users');
            const alunos = users
                .filter(u => u.tipo === 'aluno' && alunosIds.includes(u.id))
                .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
            // Determine pre-selected IDs: passed param, or from provaEdit stored on closure
            let selected = Array.isArray(preSelectedIds) ? new Set(preSelectedIds) : null;
            if (!selected) {
                // Try to read from the panel's existing checked checkboxes (already loaded)
                const existing = lista.querySelectorAll('input[type=checkbox][data-aluno-id]:checked');
                if (existing.length > 0) {
                    selected = new Set(Array.from(existing).map(el => el.dataset.alunoId));
                } else {
                    selected = new Set();
                }
            }
            if (alunos.length === 0) {
                lista.innerHTML = '<span class="text-xs text-gray-400 italic">Nenhum aluno matriculado nesta turma.</span>';
                app.updateRecuperacaoSelectionInfo();
                return;
            }
            lista.innerHTML = alunos.map(a => `
                <label class="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-orange-100 dark:hover:bg-orange-900/30">
                    <input type="checkbox" data-aluno-id="${a.id}" ${selected.has(a.id) ? 'checked' : ''} class="w-4 h-4 accent-orange-600" onchange="app.updateRecuperacaoSelectionInfo()">
                    <span class="text-gray-700 dark:text-gray-200">${app.escapeHtml(a.nome || a.id)}</span>
                </label>
            `).join('');
            app.updateRecuperacaoSelectionInfo();
        } catch (err) {
            lista.innerHTML = '<span class="text-xs text-red-400">Erro ao carregar alunos.</span>';
            console.error('Erro carregarAlunosRecuperacao:', err);
        }
    };

    app.selecionarTodosAlunosRecuperacao = function(select) {
        const lista = document.getElementById('recuperacao-alunos-lista');
        if (!lista) return;
        lista.querySelectorAll('input[type=checkbox][data-aluno-id]').forEach(el => { el.checked = select; });
        app.updateRecuperacaoSelectionInfo();
    };

    app.addQuestao = function() {
        const enun = document.getElementById('q-enunciado').value; const op1 = document.getElementById('q-op1').value; const op2 = document.getElementById('q-op2').value; const op3 = document.getElementById('q-op3').value; const op4 = document.getElementById('q-op4').value;
        if(!enun || !op1 || !op2) return alert("Preencha enunciado e pelo menos 2 opções.");
        app.tempQuestoes.push({
            id: Date.now(),
            text: enun,
            options: [op1, op2, op3, op4].filter(o => o),
            correct: 0,
            timeLimit: null,
            aiGenerated: false,
            reviewedByTeacher: true
        });
        app.renderListaQuestoes();
        document.getElementById('q-enunciado').value = ''; document.getElementById('q-op1').value = ''; document.getElementById('q-op2').value = ''; document.getElementById('q-op3').value = ''; document.getElementById('q-op4').value = '';
    };

    app.renderListaQuestoes = function() {
        const div = document.getElementById('lista-questoes');
        if (!div) return; 
        const safe = app.escapeHtml || ((v) => String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;'));
        const editingIndex = Number.isInteger(app._editingQuestaoIndex) ? app._editingQuestaoIndex : -1;
        if (!app.tempQuestoes || app.tempQuestoes.length === 0) {
            div.innerHTML = '<div class="text-xs text-gray-500">Nenhuma questao adicionada.</div>';
            return;
        }
        div.innerHTML = app.tempQuestoes.map((q, i) => {
            const opts = Array.isArray(q.options) ? q.options : [];
            const isEditing = i === editingIndex;
            const isIaGenerated = q && q.aiGenerated === true;
            const isReviewPending = isIaGenerated && q.reviewedByTeacher !== true;
            if (isEditing) {
                const o1 = opts[0] || '';
                const o2 = opts[1] || '';
                const o3 = opts[2] || '';
                const o4 = opts[3] || '';
                return `
                    <div class="text-sm bg-white dark:bg-slate-800 p-3 rounded border dark:border-slate-600">
                        <div class="flex items-center justify-between mb-2">
                            <div class="font-bold">Editando ${i + 1}</div>
                            ${isReviewPending ? '<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">IA pendente de revisão</span>' : ''}
                            <div class="flex gap-2 text-xs">
                                <button onclick="app.saveEditQuestao(${i})" data-loading-label="Salvando questao..." class="px-2 py-1 bg-emerald-600 text-white rounded">Salvar</button>
                                <button onclick="app.cancelEditQuestao()" class="px-2 py-1 bg-gray-200 dark:bg-slate-600 dark:text-white rounded">Cancelar</button>
                            </div>
                        </div>
                        <div class="mb-2">
                            <input id="edit-q-text" value="${safe(q.text || '')}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Enunciado">
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <input id="edit-q-op1" value="${safe(o1)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao A">
                            <input id="edit-q-op2" value="${safe(o2)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao B">
                            <input id="edit-q-op3" value="${safe(o3)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao C">
                            <input id="edit-q-op4" value="${safe(o4)}" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Opcao D">
                        </div>
                        <div>
                            <select id="edit-q-correct" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="0" ${q.correct === 0 ? 'selected' : ''}>Correta: A</option>
                                <option value="1" ${q.correct === 1 ? 'selected' : ''}>Correta: B</option>
                                <option value="2" ${q.correct === 2 ? 'selected' : ''}>Correta: C</option>
                                <option value="3" ${q.correct === 3 ? 'selected' : ''}>Correta: D</option>
                            </select>
                        </div>
                        ${app._quizQuestionEditorMode ? `<div class="mt-2"><label class="block text-xs font-semibold mb-1 dark:text-slate-200">Tempo desta questão (segundos)</label><input id="edit-q-time" type="number" min="5" max="600" step="1" value="${Number.isInteger(q.timeLimit) && q.timeLimit >= 5 ? q.timeLimit : 30}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>` : ''}
                    </div>
                `;
            }
            return `
                <div class="text-sm bg-white dark:bg-slate-800 p-2 rounded border dark:border-slate-600 flex justify-between items-center">
                    <div class="truncate flex-1">
                        <span class="font-bold mr-2">${i+1}.</span>
                        <span>${safe(q.text || '')}</span>
                        ${isIaGenerated ? `<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${isReviewPending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${isReviewPending ? 'IA: revisar' : 'IA revisada'}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                        ${isReviewPending ? `<button onclick="app.marcarQuestaoRevisada(${i})" class="text-emerald-600" title="Marcar revisão desta questão">Revisada</button>` : ''}
                        <button onclick="app.startEditQuestao(${i})" class="text-blue-500"><i class="fas fa-pen"></i></button>
                        <button onclick="app.removeQuestao(${i})" class="text-red-500"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    };

    app.marcarQuestaoRevisada = function(index) {
        if (!app.tempQuestoes[index]) return;
        app.tempQuestoes[index] = {
            ...app.tempQuestoes[index],
            reviewedByTeacher: true
        };
        app.renderListaQuestoes();
    };
    
    app.removeQuestao = function(index) { app.tempQuestoes.splice(index, 1); app.renderListaQuestoes(); };

    app.startEditQuestao = function(index) {
        app._editingQuestaoIndex = index;
        app.renderListaQuestoes();
    };

    app.cancelEditQuestao = function() {
        app._editingQuestaoIndex = -1;
        app.renderListaQuestoes();
    };

    app.saveEditQuestao = function(index) {
        const text = (document.getElementById('edit-q-text')?.value || '').trim();
        const op1 = (document.getElementById('edit-q-op1')?.value || '').trim();
        const op2 = (document.getElementById('edit-q-op2')?.value || '').trim();
        const op3 = (document.getElementById('edit-q-op3')?.value || '').trim();
        const op4 = (document.getElementById('edit-q-op4')?.value || '').trim();
        const correct = parseInt(document.getElementById('edit-q-correct')?.value || '0', 10);
        const timeLimitRaw = parseInt(document.getElementById('edit-q-time')?.value || '0', 10);
        if (!text || !op1 || !op2 || !op3 || !op4) return alert('Preencha enunciado e 4 opcoes.');
        if (!app.tempQuestoes[index]) return;
        app.tempQuestoes[index] = {
            ...app.tempQuestoes[index],
            text,
            options: [op1, op2, op3, op4],
            correct: Number.isInteger(correct) ? correct : 0,
            timeLimit: app._quizQuestionEditorMode && Number.isInteger(timeLimitRaw) && timeLimitRaw >= 5 && timeLimitRaw <= 600 ? timeLimitRaw : (app._quizQuestionEditorMode ? 30 : null),
            reviewedByTeacher: true
        };
        app._editingQuestaoIndex = -1;
        app.renderListaQuestoes();
    };

    app.iniciarProva = async function(provaId) {
        const resultados = (await app.getCollection('provas_resultados')).filter(r => r.provaId === provaId && r.alunoId === app.currentUserData.id);
        const prova = await getProvaById(provaId);
        const nomeAvaliacaoCap = prova?.tipo === 'atividade' ? 'Simulado' : 'Prova';
        if(!prova) return alert('Prova não encontrada.');
        if (prova.quiz === true && prova.quizStatus !== 'running') {
            return alert('O professor ainda não iniciou este Quiz ao vivo.');
        }
        if (prova.quiz === true && prova.quizStatus === 'running') {
            app.iniciarQuizAoVivoAluno(provaId);
            return;
        }
        if (app.perms && app.perms.isAluno() && prova.published !== true) return alert(`${nomeAvaliacaoCap} ainda não publicada.`);
        const disponibilidade = app.getAvaliacaoDisponibilidade(prova, { resultados });
        if (!disponibilidade.available) return alert(disponibilidade.message);
        if (!prova.questions || prova.questions.length === 0) return alert(`${nomeAvaliacaoCap} sem questões.`);
        
        // DEBUG: Log detalhado da prova carregada
        console.log('🔍 Prova carregada do banco:', {
            id: prova.id,
            titulo: prova.titulo,
            provaRecuperacao: prova.provaRecuperacao,
            qtdQuestoes: prova.questions.length,
            questao1: prova.questions[0]
        });
        
        app.activeExamData = prova; app.activeExamData.id = provaId; app.activeExamAnswers = new Array(prova.questions.length).fill(null); app.currentQuestionIndex = 0;
        app.activeExamQuestionTimes = new Array(prova.questions.length).fill(0);
        app.renderPassoQuestao();
    };

    app.stopQuizAoVivo = function() {
        if (typeof app._quizLiveUnsubscribe === 'function') app._quizLiveUnsubscribe();
        if (typeof app._quizLiveRankingUnsubscribe === 'function') app._quizLiveRankingUnsubscribe();
        app._quizLiveUnsubscribe = null;
        app._quizLiveRankingUnsubscribe = null;
        if (app._quizLiveTimer) clearInterval(app._quizLiveTimer);
        app._quizLiveTimer = null;
        app._quizLiveState = null;
    };

        app.abrirTelaRankingQuiz = function(provaId) {
            const schoolId = store.activeSchoolId || app.currentUserData?.schoolId || app.currentUserData?.escolaId;
            if (!schoolId || !provaId) {
                alert('Não foi possível identificar a escola ou o Quiz.');
                return;
            }
            const screenUrl = new URL('ranking-quiz.html', window.location.href);
            screenUrl.searchParams.set('escola', schoolId);
            screenUrl.searchParams.set('id', provaId);
            window.open(screenUrl.toString(), '_blank', 'noopener');
        };

    app.iniciarQuizAoVivo = async function(provaId) {
        if (!(app.perms && app.perms.canEditAvaliacao && app.perms.canEditAvaliacao())) return;
        const prova = await getProvaById(provaId);
        if (!prova || prova.quiz !== true) return;
        if (prova.criadoPorId && prova.criadoPorId !== app.currentUserData?.id) return alert('Somente quem criou este Quiz pode controlar a sessão.');
        const participantesAntigos = await collection('quiz_participantes').where('atividadeId', '==', provaId).get();
        const participantesBatch = batch();
        participantesAntigos.docs.forEach((doc) => participantesBatch.delete(doc.ref));
        await participantesBatch.commit();
        await getProvaDocRef(provaId).update({
            quizStatus: 'waiting',
            quizQuestionIndex: -1,
            quizSessionId: `${provaId}_${Date.now()}`,
            quizQuestionStartedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await app.renderContent();
    };

    app.avancarQuizAoVivo = async function(provaId) {
        if (!(app.perms && app.perms.canEditAvaliacao && app.perms.canEditAvaliacao())) return;
        const prova = await getProvaById(provaId);
        if (!prova || prova.quiz !== true || !['waiting', 'running'].includes(prova.quizStatus)) return;
        if (prova.criadoPorId && prova.criadoPorId !== app.currentUserData?.id) return alert('Somente quem criou este Quiz pode controlar a sessão.');
        const nextIndex = Number(prova.quizQuestionIndex) + 1;
        const questions = Array.isArray(prova.questions) ? prova.questions : [];
        if (nextIndex >= questions.length) {
            await getProvaDocRef(provaId).update({ quizStatus: 'finished', quizQuestionStartedAt: firebase.firestore.FieldValue.delete() });
        } else {
            await getProvaDocRef(provaId).update({ quizStatus: 'running', quizQuestionIndex: nextIndex, quizQuestionStartedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
        await app.renderContent();
    };

    app.reiniciarQuizAoVivo = async function(provaId) {
        if (!(app.perms && app.perms.canEditAvaliacao && app.perms.canEditAvaliacao())) return;
        const prova = await getProvaById(provaId);
        if (!prova || prova.quiz !== true) return;
        if (prova.criadoPorId && prova.criadoPorId !== app.currentUserData?.id) return alert('Somente quem criou este Quiz pode reiniciá-lo.');
        if (!confirm('Reiniciar este Quiz? As respostas e o ranking da sessão atual serão apagados.')) return;
        const respostas = await collection('provas_resultados').where('provaId', '==', provaId).get();
        const batchWriter = batch();
        respostas.docs.forEach((doc) => {
            if (doc.data()?.quizResposta === true) batchWriter.delete(doc.ref);
        });
        await batchWriter.commit();
        const participantes = await collection('quiz_participantes').where('atividadeId', '==', provaId).get();
        const participantesBatch = batch();
        participantes.docs.forEach((doc) => participantesBatch.delete(doc.ref));
        await participantesBatch.commit();
        await getProvaDocRef(provaId).update({
            quizStatus: 'draft',
            quizQuestionIndex: -1,
            quizSessionId: firebase.firestore.FieldValue.delete(),
            quizQuestionStartedAt: firebase.firestore.FieldValue.delete()
        });
        await app.renderContent();
    };

    app.responderQuizAoVivo = async function(optionIndex) {
        const state = app._quizLiveState;
        if (!state || state.submitted || state.status !== 'running' || state.expired) return;
        const question = state.questions[state.questionIndex];
        if (!question) return;
        state.submitted = true;
        state.answers[state.questionIndex] = optionIndex;
        await collection('provas_resultados').add({
            provaId: state.provaId,
            alunoId: app.currentUserData.id,
            quizResposta: true,
            quizSessionId: state.sessionId,
            questaoIndex: state.questionIndex,
            resposta: optionIndex,
            tempoResposta: Math.max(0, Math.round((Date.now() - state.questionStartedAt) / 1000)),
            data: firebase.firestore.FieldValue.serverTimestamp()
        });
        app.renderQuizAoVivoState();
    };

    app.renderQuizAoVivoState = function() {
        const state = app._quizLiveState;
        const content = document.getElementById('content-area');
        if (!state || !content) return;
        if (state.status === 'finished') {
            app.stopQuizAoVivo();
            content.innerHTML = '<div class="max-w-2xl mx-auto text-center py-16"><i class="fas fa-trophy text-amber-500 text-5xl mb-4"></i><h2 class="text-2xl font-bold dark:text-white">Quiz encerrado</h2><p class="mt-2 text-gray-500">Confira o ranking final com o professor.</p></div>';
            return;
        }
        const question = state.questions[state.questionIndex];
        if (!question) return;
        const optionsHtml = (question.options || []).map((option, index) => `<button onclick="app.responderQuizAoVivo(${index})" ${state.submitted || state.expired ? 'disabled' : ''} class="w-full text-left p-4 rounded-xl border-2 ${state.submitted || state.expired ? 'border-gray-200 bg-gray-100 opacity-70' : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'} dark:border-slate-600 dark:text-white">${String.fromCharCode(65 + index)}) ${app.escapeHtml(option)}</button>`).join('');
        const ranking = [...state.ranking.values()].sort((a, b) => b.acertos - a.acertos || a.tempoTotal - b.tempoTotal);
        const elapsed = Math.floor((Date.now() - state.questionStartedAt) / 1000);
        const secondsLeft = Math.max(0, state.timeLimit - elapsed);
        const statusText = state.submitted ? 'Resposta enviada. Aguardando o professor.' : (state.expired ? 'Tempo esgotado. Aguardando o professor.' : `Responda agora (${secondsLeft}s)`);
        content.innerHTML = `<div class="max-w-3xl mx-auto space-y-5"><div class="flex justify-between items-center"><span class="text-sm text-gray-500">Questão ${state.questionIndex + 1} de ${state.questions.length}</span><span class="font-bold ${state.expired ? 'text-red-600' : 'text-blue-600'}">${statusText}</span></div><div class="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow border dark:border-slate-700"><h2 class="text-xl font-bold dark:text-white mb-5">${app.escapeHtml(question.text)}</h2><div class="space-y-3">${optionsHtml}</div></div><div class="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow border dark:border-slate-700"><h3 class="font-bold dark:text-white mb-3"><i class="fas fa-ranking-star text-amber-500 mr-2"></i>Ranking da rodada</h3><div class="space-y-2">${rankingHtml}</div></div></div>`;
    };

    app.iniciarQuizAoVivoAluno = async function(provaId) {
        app.stopQuizAoVivo();
        const provaRef = getProvaDocRef(provaId);
        app._quizLiveState = { provaId, status: 'waiting', questions: [], questionIndex: 0, sessionId: null, questionStartedAt: Date.now(), timeLimit: 30, submitted: false, expired: false, answers: [], ranking: new Map(), names: new Map() };
        app.getUsersCache().then((users) => {
            if (!app._quizLiveState) return;
            app._quizLiveState.names = new Map(users.map((user) => [user.id, user.nome || user.id]));
            app.renderQuizAoVivoState();
        }).catch(() => {});
        app._quizLiveUnsubscribe = provaRef.onSnapshot((snapshot) => {
            if (!snapshot.exists) return;
            const prova = { id: snapshot.id, ...snapshot.data() };
            const state = app._quizLiveState;
            if (!state) return;
            const changedQuestion = state.sessionId !== prova.quizSessionId || state.questionIndex !== Number(prova.quizQuestionIndex || 0);
            state.status = prova.quizStatus || 'waiting';
            state.questions = Array.isArray(prova.questions) ? prova.questions : [];
            state.questionIndex = Number(prova.quizQuestionIndex || 0);
            state.sessionId = prova.quizSessionId || null;
            if (changedQuestion) {
                state.submitted = false;
                state.expired = false;
                state.questionStartedAt = prova.quizQuestionStartedAt?.toDate ? prova.quizQuestionStartedAt.toDate().getTime() : Date.now();
                state.timeLimit = Number(state.questions[state.questionIndex]?.timeLimit || prova.quizTempoQuestao || 30);
                if (app._quizLiveTimer) clearInterval(app._quizLiveTimer);
                app._quizLiveTimer = setInterval(() => {
                    if (!app._quizLiveState || app._quizLiveState !== state) return;
                    if (Date.now() - state.questionStartedAt >= state.timeLimit * 1000) state.expired = true;
                    app.renderQuizAoVivoState();
                }, 1000);
            }
            if (!app._quizLiveRankingUnsubscribe) {
                app._quizLiveRankingUnsubscribe = collection('provas_resultados').where('provaId', '==', provaId).onSnapshot((results) => {
                    const ranking = new Map();
                    results.docs.forEach((doc) => {
                        const result = doc.data();
                        if (result.quizResposta !== true || result.quizSessionId !== state.sessionId) return;
                        const current = ranking.get(result.alunoId) || { nome: state.names.get(result.alunoId) || result.alunoNome || result.alunoId, acertos: 0, tempoTotal: 0 };
                        const question = state.questions[result.questaoIndex];
                        const acertou = Number(result.resposta) === resolveQuestionCorrectIndex(question || {}, question?.options || []);
                        if (acertou) {
                            current.acertos += 1;
                            current.tempoTotal += Number(result.tempoResposta) || 0;
                        }
                        ranking.set(result.alunoId, current);
                    });
                    state.ranking = ranking;
                    app.renderQuizAoVivoState();
                });
            }
            app.renderQuizAoVivoState();
        });
    };

    app.renderPassoQuestao = function() {
        const q = app.activeExamData.questions[app.currentQuestionIndex];
        const hasTimeLimit = Number.isInteger(q.timeLimit) && q.timeLimit > 0;
        app.timeLeft = hasTimeLimit ? q.timeLimit : null;
        app.activeExamQuestionStartedAt = Date.now();
        app._selectedExamOption = null;
        const content = document.getElementById('content-area');
        const finalizarLabel = app.activeExamData?.tipo === 'atividade' ? 'Finalizar Simulado' : 'Finalizar Prova';
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        
        // DEBUG: Log detalhado das opções
        console.log(`🔍 Renderizando questão ${app.currentQuestionIndex + 1}:`, {
            text: q.text,
            optionsCount: (q.options || []).length,
            options: q.options,
            optionsEmpty: (q.options || []).every(o => !String(o || '').trim())
        });
        
        const optionsHtml = (q.options || []).map((opt, idx) => {
            const letter = letters[idx] || String.fromCharCode(65 + idx);
            const optText = String(opt || '').trim();
            const alreadyHasLetter = /^[A-Z]\)\s/.test(optText);
            const displayText = alreadyHasLetter ? optText : `${letter}) ${optText}`;
            return `<div class="exam-option p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition select-none" onclick="app.selectExamOption(${idx})"><div class="flex items-center gap-3"><div class="exam-option-circle w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 transition-all"><div class="exam-option-dot w-3 h-3 bg-blue-600 rounded-full hidden"></div></div><span class="text-gray-700 dark:text-gray-300 font-medium">${displayText}</span></div></div>`;
        }).join('');
        content.innerHTML = `<div class="max-w-2xl mx-auto min-h-[80vh] flex flex-col justify-center"><div class="mb-6 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400"><span>Questão ${app.currentQuestionIndex + 1} de ${app.activeExamData.questions.length}</span>${hasTimeLimit ? `<span class="font-mono font-bold text-xl text-blue-600 dark:text-blue-400" id="timer-display">${app.timeLeft}s</span>` : ''}</div>${hasTimeLimit ? `<div class="w-full bg-gray-200 rounded-full h-2 mb-6 dark:bg-slate-700 overflow-hidden"><div id="timer-bar" class="bg-blue-600 h-2 rounded-full timer-bar" style="width: 100%"></div></div>` : ''}<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border dark:border-slate-700 mb-6 fade-in"><h3 class="text-xl font-bold mb-6 dark:text-white leading-relaxed">${q.text}</h3><div class="space-y-3">${optionsHtml}</div></div><button id="btn-proxima" onclick="app.proximaQuestao()" class="w-full py-4 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 shadow-lg transition transform active:scale-95">${app.currentQuestionIndex === app.activeExamData.questions.length - 1 ? finalizarLabel : 'Próxima Questão'}</button></div>`;
        if(app.questionTimer) clearInterval(app.questionTimer);
        if (hasTimeLimit) {
            const timerDisplay = document.getElementById('timer-display'); const timerBar = document.getElementById('timer-bar'); const totalTime = app.timeLeft;
            app.questionTimer = setInterval(() => { app.timeLeft--; if (timerDisplay) timerDisplay.textContent = app.timeLeft + 's'; const pct = (app.timeLeft / totalTime) * 100; if (timerBar) timerBar.style.width = pct + '%'; if (pct < 30 && timerBar) timerBar.classList.replace('bg-blue-600', 'bg-red-500'); if (app.timeLeft <= 0) { app.proximaQuestao(true); } }, 1000);
        } else {
            app.questionTimer = null;
        }
    };

    app.proximaQuestao = function(forced = false) {
        clearInterval(app.questionTimer);
        const question = app.activeExamData?.questions?.[app.currentQuestionIndex];
        const elapsedSeconds = Math.max(0, Math.round((Date.now() - (app.activeExamQuestionStartedAt || Date.now())) / 1000));
        app.activeExamQuestionTimes = app.activeExamQuestionTimes || [];
        app.activeExamQuestionTimes[app.currentQuestionIndex] = Number.isInteger(question?.timeLimit) && question.timeLimit > 0
            ? Math.min(elapsedSeconds, question.timeLimit)
            : elapsedSeconds;
        const selectedIdx = (app._selectedExamOption !== null && app._selectedExamOption !== undefined) ? app._selectedExamOption : null;
        if (forced && selectedIdx === null) { app.activeExamAnswers[app.currentQuestionIndex] = -1; app.showToast('Tempo esgotado!', 'error'); }
        else if (selectedIdx === null) { if(!confirm('Tem certeza que deseja pular sem responder?')) { app.renderPassoQuestao(); return; } app.activeExamAnswers[app.currentQuestionIndex] = -1; }
        else { app.activeExamAnswers[app.currentQuestionIndex] = selectedIdx; }
        if (app.currentQuestionIndex < app.activeExamData.questions.length - 1) { app.currentQuestionIndex++; app.renderPassoQuestao(); } else { app.finalizarProva(); }
    };

    app.selectExamOption = function(idx) {
        app._selectedExamOption = idx;
        const options = document.querySelectorAll('.exam-option');
        options.forEach(function(el, i) {
            const circle = el.querySelector('.exam-option-circle');
            const dot = el.querySelector('.exam-option-dot');
            if (i === idx) {
                el.classList.add('border-blue-600', 'bg-blue-50');
                el.classList.remove('border-gray-200');
                if (circle) { circle.classList.add('border-blue-600', 'bg-blue-100'); circle.classList.remove('border-gray-300'); }
                if (dot) dot.classList.remove('hidden');
            } else {
                el.classList.remove('border-blue-600', 'bg-blue-50');
                el.classList.add('border-gray-200');
                if (circle) { circle.classList.remove('border-blue-600', 'bg-blue-100'); circle.classList.add('border-gray-300'); }
                if (dot) dot.classList.add('hidden');
            }
        });
    };

    app.finalizarProva = async function() {
        if (!app.activeExamData || !app.activeExamData.id) return;
        let acertos = 0;
        app.activeExamData.questions.forEach((q, i) => {
            const opts = Array.isArray(q.options) ? q.options : [];
            const correctIdx = resolveQuestionCorrectIndex(q, opts);
            if (app.activeExamAnswers[i] === correctIdx) acertos++;
        });
        const valorProva = parseFloat(app.activeExamData.valor) || 10;
        const notaBruta = (acertos / app.activeExamData.questions.length) * valorProva;
        const nota = app.activeExamData.provaRecuperacao ? Math.min(60, notaBruta) : notaBruta;
        const temposResposta = Array.isArray(app.activeExamQuestionTimes) ? app.activeExamQuestionTimes : [];
        const tempoTotal = temposResposta.reduce((total, tempo) => total + (Number(tempo) || 0), 0);
        const isQuiz = app.activeExamData.tipo === 'atividade';
        const pontosQuiz = isQuiz
            ? Math.round((acertos * 1000) + Math.max(0, app.activeExamData.questions.length * 30 - tempoTotal))
            : null;
        document.getElementById('content-area').innerHTML = `<div class="flex flex-col items-center justify-center h-[60vh]"><div class="loading border-blue-600 border-4 w-16 h-16 mb-4"></div><p>Enviando respostas...</p></div>`;
        try {
            const provaAtual = await getProvaById(app.activeExamData.id);
            if (!provaAtual) throw new Error('A prova não está mais disponível.');
            const resultados = (await app.getCollection('provas_resultados')).filter(r => r.provaId === app.activeExamData.id && r.alunoId === app.currentUserData.id);
            const disponibilidade = app.getAvaliacaoDisponibilidade(provaAtual, { resultados });

            if (!disponibilidade.available) {
                resetActiveExamState();
                alert(disponibilidade.message);
                app.renderContent();
                return;
            }

            await createProvaResultado({
                provaId: app.activeExamData.id,
                alunoId: app.currentUserData.id,
                nota: nota.toFixed(1),
                respostas: app.activeExamAnswers,
                temposResposta,
                acertos,
                pontosQuiz,
                tempoTotal
            });
            if (app.logAcesso) {
                const tipoBase = app.activeExamData.tipo === 'atividade' ? 'atividade' : 'prova';
                const detalhe = app.activeExamData.titulo ? `${tipoBase}:${app.activeExamData.titulo}` : `${tipoBase}:${app.activeExamData.id}`;
                app.logAcesso(`${tipoBase}_realizada`, detalhe);
            }
            const avaliacaoFinalizada = app.activeExamData?.tipo === 'atividade' ? 'Simulado' : 'Prova';
            resetActiveExamState();
            const rankingMessage = isQuiz ? `\nPontuação no Quiz: ${pontosQuiz} pontos.` : '';
            alert(`${avaliacaoFinalizada} Finalizada!\n\nVocê acertou ${acertos} de ${provaAtual.questions.length}.\nNota Final: ${nota.toFixed(1)}${rankingMessage}`);
            app.renderContent();
        } catch (error) {
            console.error('Erro ao finalizar prova:', error);
            resetActiveExamState();
            alert(`Erro ao finalizar prova: ${error.message || error}`);
            app.renderContent();
        }
    };

    // keep minimal placeholders for other features so callers don't fail
}