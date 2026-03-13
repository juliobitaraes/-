import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendProvas(app) {
    // ======= PROVAS / AVALIAÇÕES (migrated from app-full.js) =======
    app.renderAvaliacoes = async function(container, tipo, options = {}) {
        const turmas = await app.getCollection('turmas');
        const componentes = await app.getComponentesCache();
        let provas = (await app.getCollection('provas')).filter(p => p.tipo === tipo);
        const hasSalaFilter = Object.prototype.hasOwnProperty.call(options, 'salaId');
        const turmaFilter = options.turmaId || null;
        const salaFilter = hasSalaFilter ? options.salaId : null;

        if (app.currentUserData && app.perms && app.perms.isAluno()) {
            const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId) && p.published === true);
        } else if (app.currentUserData && app.perms && app.perms.isProfessor()) {
            const minhasTurmas = app.filterTurmasByProfessor(turmas, componentes).map(t => t.id);
            provas = provas.filter(p => minhasTurmas.includes(p.turmaId));
        }

        if (turmaFilter) {
            provas = provas.filter(p => p.turmaId === turmaFilter);
        }
        if (tipo === 'atividade' && hasSalaFilter) {
            if (salaFilter) provas = provas.filter(p => p.salaId === salaFilter);
            else provas = provas.filter(p => !p.salaId);
        }

        const titleLabel = options.title || `${app.capitalize(tipo)}s`;
        const backAction = options.backAction || '';

        container.innerHTML = `
            <div class="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
                <div class="flex items-center gap-3">
                    ${backAction ? `<button onclick="${backAction}" class="text-gray-500 hover:text-blue-600"><i class="fas fa-arrow-left"></i> Voltar</button>` : ''}
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white capitalize">${titleLabel}</h2>
                </div>
                ${app.perms && app.perms.canCreateAvaliacao() ? `
                <button onclick="app.modalCriarProva('${tipo}')" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-sm">
                    <i class="fas fa-plus mr-2"></i>Nova ${app.capitalize(tipo)}
                </button>` : ''}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${provas.map(p => {
                    const canEdit = app.perms && app.perms.canEditAvaliacao();
                    const isPublished = p.published === true;
                    const qtdQuestoes = (p.questions || []).length;
                    const compNome = componentes.find(c => c.id === p.componenteId)?.nome || 'Geral';
                    const salaBadge = tipo === 'atividade' && p.salaNome
                        ? `<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">${app.escapeHtml(p.salaNome)}</span>`
                        : '';
                    const dataFormatada = p.dataAgendada ? new Date(p.dataAgendada).toLocaleDateString() + ' ' + new Date(p.dataAgendada).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Data n/d';
                    const statusBadge = isPublished
                        ? '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">Publicado</span>'
                        : '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">Rascunho</span>';
                    
                    const turmaNomeHtml = app.formatTurmaTextToHtml(p.turmaNome || 'Turma');
                    return `
                        <div class="eval-card bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 relative group">
                            ${canEdit ? `
                            <div class="eval-card-actions absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition flex gap-2">
                                <button onclick="app.modalCriarProva('${tipo}', '${p.id}')" class="text-blue-500 hover:text-blue-700" aria-label="Editar ${app.escapeHtml(p.titulo)}" title="Editar ${app.escapeHtml(p.titulo)}"><i class="fas fa-edit"></i></button>
                                <button onclick="app.deleteItem('provas', '${p.id}')" class="text-red-500 hover:text-red-700" aria-label="Excluir ${app.escapeHtml(p.titulo)}" title="Excluir ${app.escapeHtml(p.titulo)}"><i class="fas fa-trash"></i></button>
                            </div>` : ''}
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-slate-700 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
                                    ${qtdQuestoes}
                                </div>
                                <div>
                                    <h3 class="font-bold text-gray-800 dark:text-white flex items-center">${p.titulo}${canEdit ? statusBadge : ''}</h3>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">${turmaNomeHtml} • <span class="font-bold text-purple-500">${compNome}</span>${salaBadge}</p>
                                </div>
                            </div>
                            <div class="mt-2 mb-3 bg-gray-50 dark:bg-slate-700 p-2 rounded text-xs flex items-center gap-2 dark:text-gray-300">
                                <i class="fas fa-calendar-alt"></i> ${dataFormatada}
                            </div>
                            ${app.perms && app.perms.isAluno() ? 
                            `<button onclick="app.iniciarProva('${p.id}')" class="w-full mt-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Iniciar Prova</button>` 
                            : `<div class="mt-2 flex flex-col gap-2">
                                <button onclick="app.downloadGabaritoPDF('${p.id}')" class="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
                                    <i class="fas fa-file-pdf mr-2"></i>Baixar gabarito (PDF)
                                </button>
                                <button onclick="app.downloadProvaImpressaPDF('${p.id}')" class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                                    <i class="fas fa-print mr-2"></i>Baixar prova impressa (PDF)
                                </button>
                                <p class="text-xs text-gray-400 text-center">${qtdQuestoes} Questões</p>
                            </div>`}
                        </div>
                    `;
                }).join('')}
            </div>
        `;
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
            const doc = await db.collection('provas').doc(provaId).get();
            if (!doc.exists) return alert('Prova não encontrada.');
            const prova = doc.data();
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
                const turmaDoc = await db.collection('turmas').doc(prova.turmaId).get();
                if (turmaDoc.exists) {
                    turmaLabelText = app.formatTurmaLabelText(turmaDoc.data(), prova.turmaNome || 'N/D', true);
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
                const correctIdx = Number.isInteger(q.correct) ? q.correct : 0;
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
            const doc = await db.collection('provas').doc(provaId).get();
            if (!doc.exists) return alert('Prova não encontrada.');
            const prova = doc.data();
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
                const turmaDoc = await db.collection('turmas').doc(prova.turmaId).get();
                if (turmaDoc.exists) {
                    turmaLabelText = app.formatTurmaLabelText(turmaDoc.data(), prova.turmaNome || 'N/D', true);
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

    app.modalCriarProva = async function(tipo, id = null) {
        const turmas = await app.getCollection('turmas');
        let turmasPermitidas = turmas;
        if (app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmas, componentes);
        }
        
        app.tempQuestoes = [];
        let provaEdit = null;
        const atividadeContext = tipo === 'atividade' && !id ? app._atividadeSalaContext : null;

        if(id) {
            const doc = await db.collection('provas').doc(id).get();
            if(doc.exists) {
                provaEdit = doc.data();
                app.tempQuestoes = provaEdit.questions || [];
            }
        }
        
        const content = `
            <div class="space-y-4">
                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Dados da ${tipo === 'atividade' ? 'atividade' : 'prova'}</summary>
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div><label class="block text-sm font-bold mb-1">Título</label><input id="prova-titulo" value="${provaEdit ? provaEdit.titulo : ''}" placeholder="Ex: Prova 1 - Matematica" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Turma</label>
                            <select id="prova-turma" onchange="app.handleProvaTurmaChange(this.value)" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione...</option>
                                ${turmasPermitidas.map(t => `<option value="${t.id}" data-nome="${app.formatTurmaLabelText(t, 'Turma', true)}" ${provaEdit && provaEdit.turmaId === t.id ? 'selected' : (atividadeContext && atividadeContext.turmaId === t.id ? 'selected' : '')}>${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Componente Curricular</label>
                            <select id="prova-comp" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Selecione a turma primeiro...</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Data Realização/Entrega</label>
                            <input type="datetime-local" id="prova-data" value="${provaEdit ? provaEdit.dataAgendada : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Tentativas (0 = ilimitado)</label>
                            <input type="number" id="prova-attempts" min="0" value="${provaEdit ? (typeof provaEdit.attempts !== 'undefined' ? provaEdit.attempts : 1) : 1}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Horário de Início <span class="text-xs font-normal text-gray-400">(opcional)</span></label>
                            <input type="time" id="prova-hora-inicio" value="${provaEdit && provaEdit.horaInicio ? provaEdit.horaInicio : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Horário de Fim <span class="text-xs font-normal text-gray-400">(opcional)</span></label>
                            <input type="time" id="prova-hora-fim" value="${provaEdit && provaEdit.horaFim ? provaEdit.horaFim : ''}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                        <div>
                            <label class="block text-sm font-bold mb-1">Valor da Prova <span class="text-xs font-normal text-gray-400">(máx. 60 pts)</span></label>
                            <input type="number" id="prova-valor" min="0" max="60" step="0.5" value="${provaEdit && provaEdit.valor != null ? provaEdit.valor : 10}" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        </div>
                    </div>
                    ${tipo === 'atividade' ? `
                    <div class="grid grid-cols-2 gap-4 mt-3">
                        <div>
                            <label class="block text-sm font-bold mb-1">Sala</label>
                            <select id="atividade-sala" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                                <option value="">Sala Principal</option>
                            </select>
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-end">
                            Selecione a sala da turma para organizar as atividades.
                        </div>
                    </div>
                    ` : ''}
                </details>

                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Gerar com IA (local)</summary>
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                            Requer servidor local em http://localhost:11435 (proxy para Ollama).
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <button onclick="app.gerarQuestoesIA()" class="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">
                                <i class="fas fa-wand-magic-sparkles mr-1"></i>Gerar questoes
                            </button>
                            <button onclick="app.gerarQuestoesIAComPDF()" class="px-3 py-1.5 bg-amber-600 text-white rounded text-xs hover:bg-amber-700">
                                <i class="fas fa-file-pdf mr-1"></i>Gerar do PDF
                            </button>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input id="ai-tema" placeholder="Tema/assunto (ex: Funcoes do 1o grau)" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <select id="ai-quantidade" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="10" selected>10 questões</option>
                            <option value="20">20 questões</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <select id="ai-dificuldade" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="facil">Facil</option>
                            <option value="media" selected>Media</option>
                            <option value="dificil">Dificil</option>
                        </select>
                        <input id="ai-modelo" placeholder="Modelo (IA)" value="llama-3.1-8b-instant" class="border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    </div>
                    <div class="flex items-center gap-2">
                        <input id="ai-pdf-file" type="file" accept=".pdf" class="block w-full text-xs text-gray-700 dark:text-gray-200 file:mr-2 file:py-1 file:px-3 file:border-0 file:text-xs file:font-semibold file:rounded file:bg-gray-100 dark:file:bg-slate-600 dark:file:text-white">
                    </div>
                </details>

                <details class="border rounded-lg p-3 dark:border-slate-600" open>
                    <summary class="font-bold cursor-pointer dark:text-white">Questoes</summary>
                    <div class="flex justify-between items-center mt-3 mb-2">
                        <div class="text-xs text-gray-500 dark:text-gray-400">Edite inline e defina a correta.</div>
                        <div class="flex gap-2">
                            <button onclick="app.baixarModeloQuestoes()" class="text-xs text-blue-600 underline">Baixar Modelo Excel</button>
                            <label class="cursor-pointer bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">
                                <i class="fas fa-file-excel mr-1"></i> Importar Excel
                                <input type="file" hidden accept=".xlsx, .xls" onchange="app.importarQuestoesExcel(this)">
                            </label>
                        </div>
                    </div>

                    <div id="lista-questoes" class="space-y-2 mb-4 max-h-64 overflow-y-auto"></div>

                    <div class="bg-gray-50 dark:bg-slate-700 p-3 rounded-lg border dark:border-slate-600">
                        <div class="flex gap-2 mb-2">
                            <input id="q-enunciado" placeholder="Enunciado da questao..." class="flex-1 border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <div class="grid grid-cols-2 gap-2 mb-2">
                            <input id="q-op1" placeholder="Opcao A (Correta)" class="border p-2 rounded border-green-300 dark:bg-slate-600 dark:border-green-800 dark:text-white">
                            <input id="q-op2" placeholder="Opcao B" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op3" placeholder="Opcao C" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                            <input id="q-op4" placeholder="Opcao D" class="border p-2 rounded dark:bg-slate-600 dark:border-slate-500 dark:text-white">
                        </div>
                        <button onclick="app.addQuestao()" class="w-full py-1 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-slate-500">+ Adicionar Manualmente</button>
                    </div>
                </details>
            </div>
        `;

        const resolvePublished = (override) => {
            if (typeof override === 'boolean') return override;
            if (provaEdit && typeof provaEdit.published === 'boolean') return provaEdit.published;
            return false;
        };

        const saveProva = async (publishOverride = null) => {
            const titulo = document.getElementById('prova-titulo').value;
            const select = document.getElementById('prova-turma');
            const turmaId = select.value;
            const turmaNome = select.options[select.selectedIndex]?.dataset.nome;
            const componenteId = document.getElementById('prova-comp').value;
            const compSelect = document.getElementById('prova-comp');
            const componenteNome = compSelect?.options[compSelect.selectedIndex]?.textContent?.trim() || 'Componente';
            const dataAgendada = document.getElementById('prova-data').value;
            const attemptsVal = parseInt(document.getElementById('prova-attempts').value, 10);
            const attempts = Number.isInteger(attemptsVal) && attemptsVal >= 0 ? attemptsVal : 1;
            const valorRaw = parseFloat(document.getElementById('prova-valor')?.value);
            const valorProva = (!isNaN(valorRaw) && valorRaw >= 0 && valorRaw <= 60) ? valorRaw : 10;
            const horaInicioEl = document.getElementById('prova-hora-inicio');
            const horaFimEl = document.getElementById('prova-hora-fim');
            const horaInicio = horaInicioEl ? (horaInicioEl.value || null) : null;
            const horaFim = horaFimEl ? (horaFimEl.value || null) : null;
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

            if(!titulo || !turmaId || !componenteId || !dataAgendada || app.tempQuestoes.length === 0) throw new Error("Preencha todos os dados e adicione questões.");

            const payload = {
                titulo, turmaId, turmaNome, componenteId, tipo, dataAgendada,
                horaInicio,
                horaFim,
                valor: valorProva,
                questions: app.tempQuestoes,
                attempts,
                published: resolvePublished(publishOverride)
            };
            if (tipo === 'atividade') {
                payload.salaId = salaId;
                payload.salaNome = salaNome;
            }

            const tipoBase = tipo === 'atividade' ? 'atividade' : 'prova';
            if(id) {
                await db.collection('provas').doc(id).update(payload);
                if (app.logAcesso) app.logAcesso(`${tipoBase}_editada`, `${tipoBase}:${titulo}`);
            } else {
                await db.collection('provas').add({
                    ...payload,
                    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (app.logAcesso) app.logAcesso(`${tipoBase}_criada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true && app.logAcesso) {
                app.logAcesso(`${tipoBase}_publicada`, `${tipoBase}:${titulo}`);
            }
            if (publishOverride === true) {
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
                const assunto = `${app.capitalize(tipoBase)} publicada: ${titulo}`;
                const mensagem = `Curso: ${turmaLabel}\nComponente: ${componenteNome}\nData: ${dataFormatada}`;
                
                // Enviar notificações (email + push para celular)
                app.notifyAlunosTurma(turmaId, assunto, mensagem, { 
                    turmaNome: turmaLabel,
                    link: `${window.location.origin}/#${tipo === 'atividade' ? 'atividades' : 'provas'}`,
                    notificationType: tipo === 'atividade' ? 'atividade' : 'prova'
                });
            }
            app.renderContent();
        };

        app.showModal(id ? `Editar ${app.capitalize(tipo)}` : `Nova ${app.capitalize(tipo)}`, content, async () => {
            await saveProva(null);
        }, {
            secondaryLabel: 'Publicar',
            secondaryClass: 'px-4 py-2 bg-emerald-600 text-white rounded-lg',
            onSecondary: async () => {
                await saveProva(true);
            }
        });

        app.renderListaQuestoes();
        setTimeout(() => {
            const tituloInput = document.getElementById('prova-titulo');
            if (tituloInput) {
                tituloInput.focus();
                tituloInput.setSelectionRange(tituloInput.value.length, tituloInput.value.length);
            }
        }, 50);
        const initialTurmaId = provaEdit ? provaEdit.turmaId : (atividadeContext ? atividadeContext.turmaId : null);
        const initialSalaId = provaEdit ? (provaEdit.salaId || null) : (atividadeContext ? atividadeContext.salaId || null : null);
        if (initialTurmaId) {
            app.handleProvaTurmaChange(initialTurmaId, provaEdit ? provaEdit.componenteId : null, initialSalaId);
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
                        app.tempQuestoes.push({ id: Date.now() + Math.random(), text: row.Enunciado, options: [row.OpcaoA, row.OpcaoB, row.OpcaoC, row.OpcaoD], correct: correctIdx, timeLimit: null });
                        imported++;
                    }
                });
                app.renderListaQuestoes(); alert(`${imported} questões importadas!`); input.value = '';
            } catch(err) { alert("Erro na importação: " + err.message); }
        }; reader.readAsArrayBuffer(file);
    };

    app.completarQuantidadeQuestoesIA = async function(questions, quantidade, gerarLote) {
        const merged = Array.isArray(questions) ? [...questions] : [];
        let attempt = 0;
        const maxAttempts = 4;
        const minBatchSize = 3;

        while (merged.length < quantidade && attempt < maxAttempts) {
            const faltantes = quantidade - merged.length;
            attempt += 1;
            try {
                const loteSolicitado = Math.max(faltantes, minBatchSize);
                const extra = await gerarLote(loteSolicitado);
                if (!Array.isArray(extra) || extra.length === 0) break;
                extra.forEach(q => merged.push(q));
            } catch (err) {
                console.warn('⚠�? Falha ao complementar questões da IA:', err);
                break;
            }
        }

        return merged.slice(0, quantidade);
    };

    app.gerarQuestoesIA = async function() {
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeRaw = parseInt(document.getElementById('ai-quantidade')?.value || '10', 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'llama-3.1-8b-instant').trim();
        const quantidade = quantidadeRaw === 20 ? 20 : 10;
        const tempo = 60;

        if (!tema) return alert('Informe o tema/assunto para gerar as questoes.');
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions';

        try {
            console.log('🚀 Gerando questões com IA:', { tema, quantidade, dificuldade, tempo, modelo, endpoint });
            if (app.showToast) app.showToast('Gerando questoes com IA local...', 'info');
            const gerarLote = async (quantidadeLote) => {
                const payload = JSON.stringify({ tema, quantidade: quantidadeLote, dificuldade, tempo, modelo });
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
                        console.error('�?� Resposta não OK:', res.status, res.statusText);
                        try {
                            const errPayload = await res.json();
                            console.error('�?� Erro da API:', errPayload);
                            detail = errPayload && errPayload.error ? `: ${errPayload.error}` : '';
                        } catch {
                            try {
                                const textError = await res.text();
                                console.error('�?� Erro (texto):', textError);
                                detail = `: ${textError}`;
                            } catch { detail = ''; }
                        }
                        throw new Error(`Falha no servidor IA (${res.status})${detail}`);
                    }
                    console.error('�?� Sem resposta do servidor:', lastError);
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
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, gerarLote);
            }

            console.log('✅ Questões normalizadas:', questions.length, questions);

            if (questions.length === 0) {
                console.error('�?� Nenhuma questão válida retornada pela IA.');
                throw new Error('Nenhuma questao valida retornada. Verifique o console para detalhes.');
            }
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas.`, 'success');
        } catch (err) {
            console.error('Erro IA:', err);
            alert('Erro ao gerar questoes: ' + (err && err.message ? err.message : err));
        }
    };

    app.gerarQuestoesIAComPDF = async function() {
        const fileInput = document.getElementById('ai-pdf-file');
        const file = fileInput && fileInput.files ? fileInput.files[0] : null;
        const temaInput = (document.getElementById('ai-tema')?.value || '').trim();
        const tituloFallback = (document.getElementById('prova-titulo')?.value || '').trim();
        const tema = temaInput || tituloFallback;
        const quantidadeRaw = parseInt(document.getElementById('ai-quantidade')?.value || '10', 10);
        const dificuldade = (document.getElementById('ai-dificuldade')?.value || 'media').trim();
        const modelo = (document.getElementById('ai-modelo')?.value || 'llama-3.1-8b-instant').trim();
        const quantidade = quantidadeRaw === 20 ? 20 : 10;
        const tempo = 60;

        if (!file) return alert('Selecione um PDF para gerar as questoes.');
        const endpoint = localStorage.getItem('aiPdfEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions-from-pdf';

        try {
            if (app.showToast) app.showToast('Lendo PDF e gerando questoes...', 'info');
            const gerarLote = async (quantidadeLote) => {
                const form = new FormData();
                form.append('file', file);
                form.append('tema', tema);
                form.append('quantidade', String(quantidadeLote));
                form.append('dificuldade', dificuldade);
                form.append('tempo', String(tempo));
                form.append('modelo', modelo);

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
            if (questions.length > 0 && questions.length < quantidade) {
                if (app.showToast) app.showToast(`IA retornou ${questions.length}/${quantidade}. Completando...`, 'info');
                questions = await app.completarQuantidadeQuestoesIA(questions, quantidade, async (faltantes) => {
                    const complementoPayload = await gerarLote(faltantes);
                    return app.normalizeQuestoesIA(complementoPayload);
                });
            }
            if (questions.length === 0) throw new Error('Nenhuma questao valida retornada.');
            questions.forEach(q => app.tempQuestoes.push(q));
            app.renderListaQuestoes();
            if (payload && payload.warning) {
                if (app.showToast) app.showToast(payload.warning, 'info');
                else alert(payload.warning);
            }
            if (app.showToast) app.showToast(`${questions.length} questoes adicionadas do PDF.`, 'success');
        } catch (err) {
            console.error('Erro IA PDF:', err);
            alert('Erro ao gerar questoes do PDF: ' + (err && err.message ? err.message : err));
        }
    };

    app.testarIA = async function() {
        if (!app.currentUserData || !(app.perms && app.perms.canManageSistema())) {
            return alert('Acesso restrito.');
        }
        const endpoint = localStorage.getItem('aiEndpoint') || 'https://senatedu-proxy-279645366191.us-central1.run.app/api/generate-questions';
        const tempo = 60;
        const payload = JSON.stringify({
            tema: 'Teste rapido do sistema',
            quantidade: 1,
            dificuldade: 'media',
            tempo,
            modelo: 'llama-3.1-8b-instant'
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

    app.normalizeQuestoesIA = function(payload) {
        console.log('🔄 Normalizando questões IA. Payload:', payload);
        
        let data = payload;
        if (data && typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = { questions: [] }; }
        }
        const raw = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : []);
        console.log('📋 Questões raw extraídas:', raw.length, raw);
        
        const normalized = [];
        raw.forEach((q, index) => {
            console.log(`�? Processando questão ${index + 1}:`, q);
            
            const text = (q.text || q.enunciado || '').trim();
            if (!text) {
                console.warn(`⚠�? Questão ${index + 1} sem texto/enunciado`);
                return;
            }
            
            let options = q.options || q.alternativas || q.opcoes || q.opcoesAlternativas;
            console.log(`�? Opções encontradas para questão ${index + 1}:`, options);
            
            if (options && !Array.isArray(options) && typeof options === 'object') {
                options = Object.values(options);
                console.log(`🔄 Opções convertidas de objeto para array:`, options);
            }
            if (!Array.isArray(options)) {
                console.warn(`⚠�? Questão ${index + 1} sem opções em formato de array`);
                return;
            }
            
            options = options.map(o => String(o || '').trim()).filter(Boolean);
            if (options.length < 4) {
                console.warn(`⚠�? Questão ${index + 1} tem apenas ${options.length} opções (mínimo: 4)`);
                return;
            }
            if (options.length > 4) options = options.slice(0, 4);

            let correct = q.correctIndex;
            if (!Number.isInteger(correct)) {
                const c = (q.correct || q.correta || q.answer || '').toString().trim().toUpperCase();
                const idx = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(c);
                correct = idx >= 0 ? idx : 0;
            }
            if (correct < 0 || correct >= options.length) correct = 0;

            const normalizedQuestion = {
                id: Date.now() + Math.random(),
                text,
                options,
                correct,
                timeLimit: null
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
        const comps = await db.collection('componentes').where('turmaId', '==', turmaId).get();
        if(comps.empty) { target.innerHTML = '<option value="">Nenhum componente nesta turma</option>'; return; }
        const userId = app.currentUserData?.id;
        const isProf = app.perms && app.perms.hasRole('professor', 'secretaria');
        const filtered = comps.docs.map(d => ({ id: d.id, ...d.data() })).filter(comp => {
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

    app.handleProvaTurmaChange = function(turmaId, selectedComponenteId = null, selectedSalaId = null) {
        app.carregarComponentesSelect(turmaId, 'prova-comp', selectedComponenteId);
        if (document.getElementById('atividade-sala')) {
            app.carregarSalasAtividadeSelect(turmaId, 'atividade-sala', selectedSalaId);
        }
    };

    app.addQuestao = function() {
        const enun = document.getElementById('q-enunciado').value; const op1 = document.getElementById('q-op1').value; const op2 = document.getElementById('q-op2').value; const op3 = document.getElementById('q-op3').value; const op4 = document.getElementById('q-op4').value;
        if(!enun || !op1 || !op2) return alert("Preencha enunciado e pelo menos 2 opções.");
        app.tempQuestoes.push({ id: Date.now(), text: enun, options: [op1, op2, op3, op4].filter(o => o), correct: 0, timeLimit: null });
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
            if (isEditing) {
                const o1 = opts[0] || '';
                const o2 = opts[1] || '';
                const o3 = opts[2] || '';
                const o4 = opts[3] || '';
                return `
                    <div class="text-sm bg-white dark:bg-slate-800 p-3 rounded border dark:border-slate-600">
                        <div class="flex items-center justify-between mb-2">
                            <div class="font-bold">Editando ${i + 1}</div>
                            <div class="flex gap-2 text-xs">
                                <button onclick="app.saveEditQuestao(${i})" class="px-2 py-1 bg-emerald-600 text-white rounded">Salvar</button>
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
                    </div>
                `;
            }
            return `
                <div class="text-sm bg-white dark:bg-slate-800 p-2 rounded border dark:border-slate-600 flex justify-between items-center">
                    <div class="truncate flex-1">
                        <span class="font-bold mr-2">${i+1}.</span>
                        <span>${safe(q.text || '')}</span>
                    </div>
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                        <button onclick="app.startEditQuestao(${i})" class="text-blue-500"><i class="fas fa-pen"></i></button>
                        <button onclick="app.removeQuestao(${i})" class="text-red-500"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
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
        if (!text || !op1 || !op2 || !op3 || !op4) return alert('Preencha enunciado e 4 opcoes.');
        if (!app.tempQuestoes[index]) return;
        app.tempQuestoes[index] = {
            ...app.tempQuestoes[index],
            text,
            options: [op1, op2, op3, op4],
            correct: Number.isInteger(correct) ? correct : 0,
            timeLimit: null
        };
        app._editingQuestaoIndex = -1;
        app.renderListaQuestoes();
    };

    app.iniciarProva = async function(provaId) {
        const resultados = (await app.getCollection('provas_resultados')).filter(r => r.provaId === provaId && r.alunoId === app.currentUserData.id);
        const attemptsDone = resultados.length;
        const doc = await db.collection('provas').doc(provaId).get(); const prova = doc.data();
        if(!prova) return alert('Prova não encontrada.');
        if (app.perms && app.perms.isAluno() && prova.published !== true) return alert('Prova ainda não publicada.');
        const allowed = (typeof prova.attempts === 'number') ? prova.attempts : 1; // 0 = ilimitado
        if (allowed > 0 && attemptsDone >= allowed) {
            const last = resultados[resultados.length - 1];
            const notaMsg = last ? `\nÚltima nota: ${last.nota}` : '';
            return alert(`Você atingiu o número máximo de tentativas (${allowed}).${notaMsg}`);
        }
        if (!prova.questions || prova.questions.length === 0) return alert("Prova sem questões.");
        // Validar janela de horário de realização da prova
        if (prova.horaInicio || prova.horaFim) {
            const agora = new Date();
            const hojeStr = agora.toISOString().substring(0, 10);
            if (prova.horaInicio) {
                const inicio = new Date(hojeStr + 'T' + prova.horaInicio);
                if (agora < inicio) {
                    return alert('A prova ainda não está disponível. Horário de início: ' + prova.horaInicio + '.');
                }
            }
            if (prova.horaFim) {
                const fim = new Date(hojeStr + 'T' + prova.horaFim);
                if (agora > fim) {
                    return alert('O prazo para realizar esta prova já encerrou. Horário de fim: ' + prova.horaFim + '.');
                }
            }
        }
        app.activeExamData = prova; app.activeExamData.id = provaId; app.activeExamAnswers = new Array(prova.questions.length).fill(null); app.currentQuestionIndex = 0;
        app.renderPassoQuestao();
    };

    app.renderPassoQuestao = function() {
        const q = app.activeExamData.questions[app.currentQuestionIndex];
        const hasTimeLimit = Number.isInteger(q.timeLimit) && q.timeLimit > 0;
        app.timeLeft = hasTimeLimit ? q.timeLimit : null;
        app._selectedExamOption = null;
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="max-w-2xl mx-auto min-h-[80vh] flex flex-col justify-center"><div class="mb-6 flex justify-between items-center text-sm text-gray-500 dark:text-gray-400"><span>Questão ${app.currentQuestionIndex + 1} de ${app.activeExamData.questions.length}</span>${hasTimeLimit ? `<span class="font-mono font-bold text-xl text-blue-600 dark:text-blue-400" id="timer-display">${app.timeLeft}s</span>` : ''}</div>${hasTimeLimit ? `<div class="w-full bg-gray-200 rounded-full h-2 mb-6 dark:bg-slate-700 overflow-hidden"><div id="timer-bar" class="bg-blue-600 h-2 rounded-full timer-bar" style="width: 100%"></div></div>` : ''}<div class="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl border dark:border-slate-700 mb-6 fade-in"><h3 class="text-xl font-bold mb-6 dark:text-white leading-relaxed">${q.text}</h3><div class="space-y-3">${q.options.map((opt, idx) => `<div class="exam-option p-4 rounded-xl border-2 border-gray-200 dark:border-slate-600 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 transition select-none" onclick="app.selectExamOption(${idx})"><div class="flex items-center gap-3"><div class="exam-option-circle w-7 h-7 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 transition-all"><div class="exam-option-dot w-3 h-3 bg-blue-600 rounded-full hidden"></div></div><span class="text-gray-700 dark:text-gray-300 font-medium">${opt}</span></div></div>`).join('')}</div></div><button id="btn-proxima" onclick="app.proximaQuestao()" class="w-full py-4 bg-blue-700 text-white font-bold rounded-xl hover:bg-blue-800 shadow-lg transition transform active:scale-95">${app.currentQuestionIndex === app.activeExamData.questions.length - 1 ? 'Finalizar Prova' : 'Próxima Questão'}</button></div>`;
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
        let acertos = 0; app.activeExamData.questions.forEach((q, i) => { if (app.activeExamAnswers[i] === q.correct) acertos++; }); const valorProva = parseFloat(app.activeExamData.valor) || 10; const nota = (acertos / app.activeExamData.questions.length) * valorProva;
        document.getElementById('content-area').innerHTML = `<div class="flex flex-col items-center justify-center h-[60vh]"><div class="loading border-blue-600 border-4 w-16 h-16 mb-4"></div><p>Enviando respostas...</p></div>`;
        await db.collection('provas_resultados').add({ provaId: app.activeExamData.id, alunoId: app.currentUserData.id, nota: nota.toFixed(1), respostas: app.activeExamAnswers, data: firebase.firestore.FieldValue.serverTimestamp() });
        if (app.logAcesso) {
            const tipoBase = app.activeExamData.tipo === 'atividade' ? 'atividade' : 'prova';
            const detalhe = app.activeExamData.titulo ? `${tipoBase}:${app.activeExamData.titulo}` : `${tipoBase}:${app.activeExamData.id}`;
            app.logAcesso(`${tipoBase}_realizada`, detalhe);
        }
        alert(`Prova Finalizada!\n\nVocê acertou ${acertos} de ${app.activeExamData.questions.length}.\nNota Final: ${nota.toFixed(1)}`);
        app.renderContent();
    };

    // keep minimal placeholders for other features so callers don't fail
}