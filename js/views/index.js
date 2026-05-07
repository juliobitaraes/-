/**
 * Views - funções de renderização das telas
 * Cada função usa this (app) como contexto
 */
import { db, storage } from '../services/init.js';
import { getCollection } from '../services/db.js';
import { store } from '../store.js';
import { generateCalendarHTML } from '../components/calendar.js';
import { capitalize, escapeHtml } from '../utils/helpers.js';

export function createViews(app) {
    const showModal = app.showModal.bind(app);
    const showToast = app.showToast.bind(app);

    return {
        async renderAlunosPorTurma(container) {
            const turmas = await getCollection('turmas');
            let alunos = (await getCollection('users')).filter(u => u.tipo === 'aluno');
            const componentes = await getCollection('componentes');
            let turmasPermitidas = turmas;
            if (store.currentUserData.tipo === 'professor') {
                const minhasTurmasIds = turmas.filter(t => (t.professores || []).includes(store.currentUserData.id)).map(t => t.id);
                turmasPermitidas = turmas.filter(t => minhasTurmasIds.includes(t.id));
                alunos = alunos.filter(a => turmasPermitidas.some(t => (t.alunos || []).includes(a.id)));
            }
            const alunosPorTurma = {};
            turmasPermitidas.forEach(turma => {
                const alunosDaTurma = alunos
                    .filter(a => (turma.alunos || []).includes(a.id))
                    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
                if (alunosDaTurma.length > 0) {
                    alunosPorTurma[turma.id] = { turma, alunos: alunosDaTurma, componentes: componentes.filter(c => c.turmaId === turma.id) };
                }
            });
            const turmasIds = Object.keys(alunosPorTurma);
            if (turmasIds.length === 0) {
                container.innerHTML = `<div class="text-center py-10"><i class="fas fa-users-slash text-6xl text-gray-300 dark:text-gray-600 mb-4"></i><h3 class="text-xl font-bold text-gray-700 dark:text-gray-300">Nenhum aluno encontrado</h3><p class="text-gray-500 dark:text-gray-400">Não há alunos matriculados em suas turmas.</p></div>`;
                return;
            }
            if (!store.currentTurmaFilter) store.currentTurmaFilter = 'todas';
            let html = `
                <div class="mb-6">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-user-graduate text-blue-600"></i> Gerenciar Alunos</h2>
                        <div class="flex flex-wrap gap-2">
                            ${store.currentUserData.tipo === 'admin' ? `<button onclick="app.baixarModeloAluno()" class="px-3 py-2 text-blue-600 dark:text-blue-400 text-sm hover:underline">Modelo Excel</button>
                                <label class="cursor-pointer px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center shadow-sm text-sm"><i class="fas fa-file-excel mr-2"></i> Importar<input type="file" hidden accept=".xlsx, .xls" onchange="app.importarAlunosExcel(this)"></label>` : ''}
                            <button onclick="app.modalAluno()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-sm text-sm"><i class="fas fa-plus mr-2"></i>Novo Aluno</button>
                        </div>
                    </div>
                    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
                        <div class="flex flex-wrap gap-2 items-center">
                            <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mr-2"><i class="fas fa-filter mr-1"></i>Filtrar por Turma:</span>
                            <button onclick="app.filtrarTurma('todas')" class="px-3 py-1 rounded-full text-sm transition ${store.currentTurmaFilter === 'todas' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">Todas</button>
                            ${turmasIds.map(tid => {
                                const t = alunosPorTurma[tid].turma;
                                return `<button onclick="app.filtrarTurma('${tid}')" class="px-3 py-1 rounded-full text-sm transition ${store.currentTurmaFilter === tid ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">${t.nome}</button>`;
                            }).join('')}
                        </div>
                    </div>
                </div>`;
            const turmasParaRenderizar = store.currentTurmaFilter === 'todas' ? turmasIds : [store.currentTurmaFilter].filter(tid => alunosPorTurma[tid]);
            turmasParaRenderizar.forEach(turmaId => {
                const { turma, alunos: alunosDaTurma, componentes: compsDaTurma } = alunosPorTurma[turmaId];
                html += `
                    <div class="mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                        <div class="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 p-4">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><i class="fas fa-chalkboard text-white text-lg"></i></div>
                                    <div><h3 class="text-lg font-bold text-white">${turma.nome}</h3><p class="text-blue-100 text-sm">${alunosDaTurma.length} aluno(s) matriculado(s)</p></div>
                                </div>
                                ${store.currentUserData.tipo !== 'aluno' ? `<button onclick="app.modalComponentes('${turma.id}')" class="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm transition"><i class="fas fa-book mr-1"></i> Componentes</button>` : ''}
                            </div>
                        </div>
                        <div class="divide-y divide-gray-100 dark:divide-slate-700">
                            ${alunosDaTurma.map(aluno => `
                                <div class="p-4 hover:bg-gray-50 dark:hover:bg-slate-750 transition group">
                                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">${aluno.nome.charAt(0).toUpperCase()}</div>
                                            <div><h4 class="font-semibold text-gray-800 dark:text-white">${aluno.nome}</h4><p class="text-sm text-gray-500 dark:text-gray-400">${aluno.email}</p></div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${store.currentUserData.tipo !== 'aluno' ? `<button onclick="app.modalNotasAluno('${aluno.id}')" class="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition"><i class="fas fa-star mr-1"></i> Notas</button>` : ''}
                                            <button onclick="app.sendPasswordReset('${aluno.email}')" class="p-2 text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 transition" title="Redefinir Senha"><i class="fas fa-key"></i></button>
                                            <button onclick="app.modalAluno('${aluno.id}')" class="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 transition" title="Editar"><i class="fas fa-edit"></i></button>
                                            ${store.currentUserData.tipo === 'admin' ? `<button onclick="app.deleteUsuario('${aluno.id}')" class="p-2 text-red-500 dark:text-red-400 hover:text-red-700 transition" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
                                        </div>
                                    </div>
                                    ${compsDaTurma.length > 0 && store.currentUserData.tipo !== 'aluno' ? `<div class="mt-3 ml-13 pl-13 border-l-2 border-gray-200 dark:border-slate-600 ml-12"><div class="flex flex-wrap gap-2">${compsDaTurma.map(comp => `<span class="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs rounded border border-purple-200 dark:border-purple-800"><i class="fas fa-book-open mr-1"></i>${comp.nome}</span>`).join('')}</div></div>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>`;
            });
            container.innerHTML = html;
        },

        filtrarTurma(turmaId) {
            store.currentTurmaFilter = turmaId;
            app.renderContent();
        }
    };
}
