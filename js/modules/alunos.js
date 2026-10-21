import { storage, functions, auth } from '../services/init.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import {
    addAlunoToTurma,
    clearAlunoBlock,
    createAluno,
    getAlunoById,
    removeAlunoFromTurma,
    setAlunoBlockedUntil,
    updateAluno
} from '../services/alunosRepository.js';
import { store } from '../store.js';
import { getActiveSchoolId } from '../config/school.js';

export function extendAlunos(app) {
    app.renderAlunosPorTurma = async function(container) {
        if (!app.toggleTurmaSection) {
            app.toggleTurmaSection = function(contentId, buttonId) {
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

        const turmas = await app.getCollection('turmas');
        const todosAlunos = await app.getCollection('users');
        const componentes = await app.getComponentesCache();

        let alunos = todosAlunos.filter(u => u.tipo === 'aluno');

        let turmasPermitidasBase = turmas;
        if (app.perms && app.perms.hasRole('professor', 'secretaria')) {
            turmasPermitidasBase = app.filterTurmasByProfessor(turmas, componentes);
            alunos = alunos.filter(a => turmasPermitidasBase.some(t => (t.alunos || []).includes(a.id)));
        }
        const turmasPermitidas = turmasPermitidasBase.filter(t => !t.concluida);

        const alunosSemTurma = alunos.filter(a => !turmasPermitidasBase.some(t => (t.alunos || []).includes(a.id)));

        // Ordenar alunos sem turma alfabeticamente por nome
        alunosSemTurma.sort((a, b) => {
            const nomeA = (a.nome || '').toLowerCase();
            const nomeB = (b.nome || '').toLowerCase();
            return nomeA.localeCompare(nomeB, 'pt-BR');
        });

        const alunosPorTurma = {};
        turmasPermitidas.forEach(turma => {
            const alunosDaTurma = alunos.filter(a => (turma.alunos || []).includes(a.id));
            if (alunosDaTurma.length > 0) {
                // Ordenar alunos alfabeticamente por nome
                alunosDaTurma.sort((a, b) => {
                    const nomeA = (a.nome || '').toLowerCase();
                    const nomeB = (b.nome || '').toLowerCase();
                    return nomeA.localeCompare(nomeB, 'pt-BR');
                });
                alunosPorTurma[turma.id] = {
                    turma,
                    alunos: alunosDaTurma,
                    componentes: componentes.filter(c => c.turmaId === turma.id)
                };
            }
        });

        const turmasIds = Object.keys(alunosPorTurma);
        if (turmasIds.length === 0 && alunosSemTurma.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10">
                    <i class="fas fa-users-slash text-6xl text-gray-300 dark:text-gray-600 mb-4"></i>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300">Nenhum aluno encontrado</h3>
                    <p class="text-gray-500 dark:text-gray-400">Não há alunos matriculados em suas turmas.</p>
                </div>`;
            return;
        }

        if (!app.currentTurmaFilter) app.currentTurmaFilter = 'todas';

        let html = `
            <div class="mb-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <i class="fas fa-user-graduate text-blue-600"></i> Gerenciar Alunos
                    </h2>
                    <div class="flex flex-wrap gap-2">
                        ${app.perms && app.perms.canManageUsuarios() ? `
                            <button onclick="app.baixarModeloAluno()" class="px-3 py-2 text-blue-600 dark:text-blue-400 text-sm hover:underline">
                                Modelo Excel
                            </button>
                            <label class="cursor-pointer px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center shadow-sm text-sm">
                                <i class="fas fa-file-excel mr-2"></i> Importar
                                <input type="file" hidden accept=".xlsx, .xls" onchange="app.importarAlunosExcel(this)">
                            </label>
                            <button onclick="app.repararAcessoTurma()" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 shadow-sm text-sm">
                                <i class="fas fa-key mr-2"></i>Reparar acessos da turma
                            </button>
                        ` : ''}
                        <button onclick="app.modalAluno()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-sm text-sm">
                            <i class="fas fa-plus mr-2"></i>Novo Aluno
                        </button>
                    </div>
                </div>

                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
                    <div class="flex flex-wrap gap-2 items-center">
                        <span class="text-sm font-medium text-gray-600 dark:text-gray-400 mr-2">
                            <i class="fas fa-filter mr-1"></i>Filtrar por Turma:
                        </span>
                        <button onclick="app.filtrarTurma('todas')" 
                            class="px-3 py-1 rounded-full text-sm transition ${app.currentTurmaFilter === 'todas' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">
                            Todas
                        </button>
                        ${turmasIds.map(tid => {
                            const t = alunosPorTurma[tid].turma;
                            return `<button onclick="app.filtrarTurma('${tid}')" 
                                class="px-3 py-1 rounded-full text-sm transition ${app.currentTurmaFilter === tid ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">
                                ${app.formatTurmaLabelHtml(t)}
                            </button>`;
                        }).join('')}
                        ${alunosSemTurma.length > 0 ? `
                            <button onclick="app.filtrarTurma('sem-turma')" 
                                class="px-3 py-1 rounded-full text-sm transition ${app.currentTurmaFilter === 'sem-turma' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}">
                                Sem turma
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        const turmasParaRenderizar = app.currentTurmaFilter === 'todas'
            ? turmasIds
            : [app.currentTurmaFilter].filter(tid => alunosPorTurma[tid]);

        turmasParaRenderizar.forEach(turmaId => {
            const { turma, alunos: alunosDaTurma, componentes: compsDaTurma } = alunosPorTurma[turmaId];
            const turmaBodyId = `turma-alunos-${turmaId}`;
            const turmaToggleId = `turma-toggle-${turmaId}`;
            html += `
                <div class="mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-800 dark:to-blue-900 p-4">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-chalkboard text-white text-lg"></i>
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-white">${app.formatTurmaLabelHtml(turma)}</h3>
                                    <p class="text-blue-100 text-sm">${alunosDaTurma.length} aluno(s) matriculado(s)</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button id="${turmaToggleId}" onclick="app.toggleTurmaSection('${turmaBodyId}', '${turmaToggleId}')" class="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm transition" aria-expanded="false">
                                    <i class="fas fa-chevron-down mr-1"></i><span data-label>Expandir</span>
                                </button>
                                ${app.perms && app.perms.canManageComponentes() ? `
                                    <button onclick="app.modalComponentes('${turma.id}')" 
                                        class="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm transition">
                                        <i class="fas fa-book mr-1"></i> Componentes
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>

                    <div id="${turmaBodyId}" class="divide-y divide-gray-100 dark:divide-slate-700 hidden">
                        ${alunosDaTurma.map(aluno => {
                            return `
                                <div class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition group">
                                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                                                ${aluno.nome.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h4 class="font-semibold text-gray-800 dark:text-white">${aluno.nome}</h4>
                                                <p class="text-sm text-gray-500 dark:text-gray-400">${aluno.email}</p>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            ${app.perms && app.perms.canCreateAviso() ? `
                                                <button onclick="app.modalAvisoAluno('${aluno.id}', '${(aluno.nome || '').replace(/'/g, "\\'")}', '${turma.id}', '${(app.formatTurmaLabelText(turma) || '').replace(/'/g, "\\'")}')" 
                                                    class="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition">
                                                    <i class="fas fa-bullhorn mr-1"></i> Aviso
                                                </button>
                                            ` : ''}
                                            <button onclick="app.sendPasswordReset('${aluno.email}')" 
                                                class="p-2 text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 transition" 
                                                title="Redefinir Senha">
                                                <i class="fas fa-key"></i>
                                            </button>
                                            <button onclick="app.modalAluno('${aluno.id}')" 
                                                class="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 transition" 
                                                title="Editar">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            ${app.perms && app.perms.canManageUsuarios() ? `
                                                <button onclick="app.modalBloquearUsuario('${aluno.id}')" 
                                                    class="p-2 text-orange-500 dark:text-orange-400 hover:text-orange-600 transition" 
                                                    title="Bloquear/Desbloquear">
                                                    <i class="fas fa-user-lock"></i>
                                                </button>
                                                <button onclick="app.deleteUsuario('${aluno.id}')" 
                                                    class="p-2 text-red-500 dark:text-red-400 hover:text-red-700 transition" 
                                                    title="Excluir">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                    ${compsDaTurma.length > 0 && app.perms && app.perms.canManageComponentes() ? `
                                        <div class="mt-3 ml-13 pl-13 border-l-2 border-gray-200 dark:border-slate-600 ml-12">
                                            <div class="flex flex-wrap gap-2">
                                                ${compsDaTurma.map(comp => `
                                                    <span class="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs rounded border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-800/30 transition">
                                                        <i class="fas fa-book-open mr-1"></i>${comp.nome}
                                                    </span>
                                                `).join('')}
                                            </div>
                                        </div>
                                    ` : ''}
                                    ${aluno.blockedUntil ? `
                                        <div class="mt-3">
                                            <span class="text-xs text-red-600">Bloqueado até: ${ (aluno.blockedUntil && aluno.blockedUntil.toDate) ? aluno.blockedUntil.toDate().toLocaleString() : new Date(aluno.blockedUntil).toLocaleString() }</span>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        if (alunosSemTurma.length > 0 && (app.currentTurmaFilter === 'todas' || app.currentTurmaFilter === 'sem-turma')) {
            const semTurmaBodyId = 'turma-alunos-sem-turma';
            const semTurmaToggleId = 'turma-toggle-sem-turma';
            html += `
                <div class="mb-8 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="bg-gradient-to-r from-slate-600 to-slate-800 dark:from-slate-700 dark:to-slate-900 p-4">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-user-slash text-white text-lg"></i>
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-white">Sem turma</h3>
                                    <p class="text-slate-100 text-sm">${alunosSemTurma.length} aluno(s) sem matricula</p>
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button id="${semTurmaToggleId}" onclick="app.toggleTurmaSection('${semTurmaBodyId}', '${semTurmaToggleId}')" class="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded text-sm transition" aria-expanded="true">
                                    <i class="fas fa-chevron-up mr-1"></i><span data-label>Recolher</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="${semTurmaBodyId}" class="divide-y divide-gray-100 dark:divide-slate-700">
                        ${alunosSemTurma.map(aluno => `
                            <div class="p-4 hover:bg-gray-50 dark:hover:bg-slate-750 transition group">
                                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white font-bold">${aluno.nome.charAt(0).toUpperCase()}</div>
                                        <div>
                                            <h4 class="font-semibold text-gray-800 dark:text-white">${aluno.nome}</h4>
                                            <p class="text-sm text-gray-500 dark:text-gray-400">${aluno.email}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <button onclick="app.sendPasswordReset('${aluno.email}')" class="p-2 text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 transition" title="Redefinir Senha"><i class="fas fa-key"></i></button>
                                        <button onclick="app.modalAluno('${aluno.id}')" class="p-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 transition" title="Editar"><i class="fas fa-edit"></i></button>
                                        ${app.currentUserData && app.currentUserData.tipo === 'admin' ? `<button onclick="app.deleteUsuario('${aluno.id}')" class="p-2 text-red-500 dark:text-red-400 hover:text-red-700 transition" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    };

    app.filtrarTurma = function(turmaId) {
        app.currentTurmaFilter = turmaId;
        app.renderContent();
    };

    app.baixarModeloAluno = function() { const ws = XLSX.utils.json_to_sheet([{ Nome: "João Silva", Email: "joao@email.com" }]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Modelo_Alunos"); XLSX.writeFile(wb, "Modelo_Importacao_Alunos.xlsx"); };

    app.importarAlunosExcel = async function(input) {
        const file = input.files[0];
        if (!file) return;
        input.value = '';

        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        if (!turmasAtivas.length) return alert('Cadastre uma turma ativa antes de importar.');

        const options = turmasAtivas.map(t => `<option value="${t.id}">${app.formatTurmaLabelText(t)}</option>`).join('');
        const content = `
            <div class="space-y-3">
                <p class="text-sm">Selecione a turma para matricular os alunos importados.</p>
                <label class="block text-sm font-medium mb-1">Turma</label>
                <select id="import-alunos-turma" class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Selecione...</option>
                    ${options}
                </select>
            </div>`;

        app.showModal('Importar Alunos', content, async () => {
            const turmaId = document.getElementById('import-alunos-turma').value;
            if (!turmaId) return alert('Selecione uma turma.');

            app.showToast("Iniciando importação...", "info");
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
                    let success = 0; let errors = 0; const errorList = [];
                    const defaultPassword = "123456";
                    const getField = (row, key) => {
                        const k = Object.keys(row).find(c => c.trim().toLowerCase() === key);
                        return k ? String(row[k]).trim() : '';
                    };
                    const rows = jsonData
                        .map(r => ({ nome: getField(r, 'nome'), email: getField(r, 'email') }))
                        .filter(r => r.nome && r.email);
                    const turmaDestino = turmasAtivas.find(t => t.id === turmaId);
                    const turmaDestinoLabel = turmaDestino ? app.formatTurmaLabelText(turmaDestino) : turmaId;
                    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
                    overlay.innerHTML = `
                        <style>
                            @keyframes impStripes { from { background-position: 0 0; } to { background-position: 40px 0; } }
                            .imp-bar-fill { height:100%; width:0%; border-radius:9999px; transition:width .3s ease;
                                background-color:#16a34a;
                                background-image:linear-gradient(45deg,rgba(255,255,255,.3) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.3) 50%,rgba(255,255,255,.3) 75%,transparent 75%,transparent);
                                background-size:40px 40px; animation:impStripes 1s linear infinite; }
                        </style>
                        <div style="background:#fff;color:#111827;border-radius:12px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow:auto;box-shadow:0 20px 40px rgba(0,0,0,.3);">
                            <h3 style="font-weight:700;font-size:1.1rem;margin-bottom:4px;">Importando alunos</h3>
                            <p style="font-size:.85rem;color:#4b5563;margin-bottom:12px;">Turma: <b>${esc(turmaDestinoLabel)}</b></p>
                            <div style="background:#e5e7eb;border-radius:9999px;height:16px;overflow:hidden;"><div class="imp-bar-fill" id="imp-bar"></div></div>
                            <p id="imp-status" style="font-size:.85rem;margin-top:8px;">Preparando...</p>
                            <div id="imp-result"></div>
                        </div>`;
                    document.body.appendChild(overlay);
                    const bar = overlay.querySelector('#imp-bar');
                    const status = overlay.querySelector('#imp-status');
                    const updateProgress = (done, label) => {
                        const pct = rows.length ? Math.round((done / rows.length) * 100) : 100;
                        bar.style.width = pct + '%';
                        status.textContent = `${done} de ${rows.length} (${pct}%) - ${label}`;
                    };
                    const errorItems = [];

                    for (let i = 0; i < rows.length; i++) {
                        const { nome, email } = rows[i];
                        updateProgress(i, nome);
                        try {
                            let uid;
                            try {
                                uid = await app.createUserWithReclaim(email, defaultPassword);
                            } catch (createErr) {
                                // Conta criada em tentativa anterior que falhou antes de gravar o cadastro
                                try { uid = await app.obterUidPorLogin(email, defaultPassword); } catch (_) { throw createErr; }
                                const existing = await getAlunoById(uid);
                                if (existing) {
                                    await addAlunoToTurma(turmaId, uid);
                                    success++;
                                    continue;
                                }
                            }
                            await createAluno(uid, { nome, email, tipo: 'aluno', criado: firebase.firestore.FieldValue.serverTimestamp() });
                            await addAlunoToTurma(turmaId, uid);
                            success++;
                        } catch (err) {
                            console.error(err);
                            errors++;
                            errorItems.push({ nome, email, motivo: err.message || err.code || 'Erro desconhecido' });
                        }
                    }
                    updateProgress(rows.length, 'Concluído');
                    bar.style.animation = 'none';

                    // Descobre em quais turmas os alunos com erro já estão cadastrados
                    let turmasPorEmail = {};
                    if (errorItems.length) {
                        try {
                            const [todasTurmas, usuarios] = await Promise.all([app.getCollection('turmas'), app.getCollection('users')]);
                            const idPorEmail = {};
                            usuarios.forEach(u => { if (u.email) idPorEmail[String(u.email).trim().toLowerCase()] = u.id; });
                            errorItems.forEach(item => {
                                const id = idPorEmail[item.email.toLowerCase()];
                                if (!id) return;
                                turmasPorEmail[item.email] = todasTurmas
                                    .filter(t => (t.alunos || []).includes(id))
                                    .map(t => app.formatTurmaLabelText(t));
                            });
                        } catch (lookupErr) { console.warn('Falha ao buscar turmas dos alunos:', lookupErr); }
                    }

                    const errosHtml = errorItems.map(item => {
                        const turmasAluno = turmasPorEmail[item.email];
                        const turmaTxt = turmasAluno
                            ? (turmasAluno.length ? `Turma(s): ${turmasAluno.map(esc).join(', ')}` : 'Cadastrado, sem turma')
                            : 'Turma: nao localizada nesta escola';
                        return `<li style="margin-bottom:8px;"><b>${esc(item.nome)}</b> (${esc(item.email)})<br><span style="color:#b91c1c;">${esc(item.motivo)}</span><br><span style="color:#1d4ed8;">${turmaTxt}</span></li>`;
                    }).join('');
                    overlay.querySelector('#imp-result').innerHTML = `
                        <div style="margin-top:12px;font-size:.9rem;">
                            <p>Matriculados na turma <b>${esc(turmaDestinoLabel)}</b>: <b style="color:#15803d;">${success}</b></p>
                            <p>Erros: <b style="color:#b91c1c;">${errors}</b></p>
                            ${errosHtml ? `<ul style="margin-top:10px;font-size:.8rem;list-style:none;padding:0;">${errosHtml}</ul>` : ''}
                            <button id="imp-close" style="margin-top:12px;background:#2563eb;color:#fff;padding:8px 16px;border-radius:8px;font-weight:600;">Fechar</button>
                        </div>`;
                    overlay.querySelector('#imp-close').onclick = () => overlay.remove();
                    if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
                    app.renderContent();
                } catch (err) { document.querySelector('[id="imp-bar"]')?.closest('div[style*="fixed"]')?.remove(); alert("Erro arquivo: " + err.message); }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    app.repararAcessoTurma = async function() {
        const turmas = await app.getCollection('turmas');
        if (!turmas.length) return alert('Nenhuma turma encontrada.');
        const options = turmas.map(t => `<option value="${t.id}">${app.formatTurmaLabelText(t)}</option>`).join('');
        const content = `
            <div class="space-y-3">
                <p class="text-sm">Recria o login de alunos que nao conseguem entrar e redefine a senha de todos os alunos da turma para <b>123456</b>.</p>
                <select id="reparar-turma" class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Selecione...</option>${options}
                </select>
            </div>`;
        app.showModal('Reparar acessos da turma', content, async () => {
            const turmaId = document.getElementById('reparar-turma').value;
            if (!turmaId) return alert('Selecione uma turma.');
            app.showToast('Reparando acessos... aguarde.', 'info');
            try {
                const schoolId = store.activeSchoolId || getActiveSchoolId();
                const res = await firebase.functions().httpsCallable('repairTurmaStudentAccess')({ schoolId, turmaId });
                const r = res.data;
                const probs = (r.problemas || []).map(p => `- ${p.nome || p.uid}${p.email ? ' (' + p.email + ')' : ''}: ${p.motivo}`).join('\n');
                alert(`Concluido!\nAlunos na turma: ${r.total}\nSenhas redefinidas: ${r.senhaRedefinida}\nLogins recriados: ${r.contaCriada}\nAcessos (members) criados: ${r.membroCriado}\nProblemas: ${(r.problemas || []).length}${probs ? '\n\n' + probs : ''}`);
            } catch (err) {
                console.error(err);
                alert('Erro ao reparar acessos: ' + (err.message || err.code));
            }
        });
    };

    app.modalAluno = async function(id = null) {
        const turmas = await app.getCollection('turmas'); let aluno = null; let turmasDoAluno = [];
        if (id) { aluno = await getAlunoById(id); turmasDoAluno = turmas.filter(t => (t.alunos || []).includes(id)).map(t => t.id); }
        const turmasParaCadastro = id
            ? turmas.filter(t => !t.concluida || turmasDoAluno.includes(t.id))
            : turmas.filter(t => !t.concluida);
        const content = `<div class="space-y-3">${!id ? `<div><label class="block text-sm font-medium mb-1">Email</label><input type="email" id="alu-email" class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div>` : ''}<div><label class="block text-sm font-medium mb-1">Senha ${id ? '<span class="text-xs text-red-500">(Não editável)</span>' : ''}</label><input type="text" id="alu-pass-manual" class="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white" ${id ? 'disabled value="******" title="Para mudar, use o reset por email"' : 'placeholder="Mínimo 6 caracteres"'} >${id ? '<p class="text-xs text-gray-500 mt-1">Para mudar a senha, use o botão de chave na tabela.</p>' : ''}</div><div><label class="block text-sm font-medium mb-1">Nome</label><input type="text" id="alu-nome" value="${aluno ? aluno.nome : ''}" class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"></div><div><label class="block text-sm font-medium mb-1">Turmas</label><div class="max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50 dark:bg-slate-700 dark:border-slate-600">${turmasParaCadastro.map(t => `<label class="flex items-center space-x-2 p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded cursor-pointer"><input type="checkbox" class="turma-check" value="${t.id}" data-nome="${app.formatTurmaLabelText(t, 'Turma', true)}" ${turmasDoAluno.includes(t.id) ? 'checked' : ''}><span class="block leading-tight">${app.formatTurmaLabelHtml(t)}</span></label>`).join('')}</div></div></div>`;
        app.showModal(id ? 'Editar Aluno' : 'Novo Aluno', content, async () => {
            const nome = document.getElementById('alu-nome').value.trim(); const checkboxes = Array.from(document.querySelectorAll('.turma-check:checked')); const novasTurmasIds = checkboxes.map(c => c.value); const novasTurmasNomes = checkboxes.map(c => c.getAttribute('data-nome')); let uid = id; let isNewUser = false; let emailNovo = "";
            if (!id) {
                const email = document.getElementById('alu-email').value.trim(); const pass = document.getElementById('alu-pass-manual').value.trim(); if (!email || !pass || !nome) return alert('Preencha email, senha e nome.'); if (pass.length < 6) return alert('A senha deve ter pelo menos 6 caracteres.');
                try { uid = await app.createUserWithReclaim(email, pass); } catch (err) { alert("ERRO AO CRIAR LOGIN: " + err.message); return; }
                await createAluno(uid, { nome, email, tipo: 'aluno', criado: firebase.firestore.FieldValue.serverTimestamp() }); isNewUser = true; emailNovo = email; alert('Aluno criado com sucesso e senha definida!');
                if (app.logAcesso) app.logAcesso('aluno_cadastrado', `${nome} (${email})`);
            } else {
                await updateAluno(uid, { nome });
                if (app.logAcesso) app.logAcesso('aluno_editado', `${nome} (${uid})`);
            }
            if (typeof app.invalidateUsersCache === 'function') app.invalidateUsersCache();
            const todasTurmas = await app.getCollection('turmas'); for (const t of todasTurmas) { if ((t.alunos || []).includes(uid)) await removeAlunoFromTurma(t.id, uid); } for (const tid of novasTurmasIds) { await addAlunoToTurma(tid, uid); }
            if (isNewUser && novasTurmasNomes.length > 0) { app.sendWelcomeEmail(emailNovo, nome, novasTurmasNomes); } app.renderContent();
        });
    };

    // Bloqueio de usuário (aluno)
    app.modalBloquearUsuario = async function(id) {
        const usr = await getAlunoById(id); if (!usr) return alert('Aluno não encontrado');
        const existing = usr.blockedUntil ? ((usr.blockedUntil.toDate) ? usr.blockedUntil.toDate().toISOString().slice(0,16) : new Date(usr.blockedUntil).toISOString().slice(0,16)) : '';
        const defaultVal = existing || new Date(Date.now() + 24*3600*1000).toISOString().slice(0,16);
        const content = `
            <div class="space-y-3">
                <p class="text-sm">Bloquear acesso do aluno <strong>${usr.nome}</strong>. Defina data e hora para liberar.</p>
                <label class="block text-sm font-medium">Liberar em</label>
                <input type="datetime-local" id="block-until" class="w-full p-2 border rounded" value="${defaultVal}">
                <div class="flex items-center gap-2">
                    <button id="btn-unblock" type="button" class="text-sm text-blue-600">Desbloquear Agora</button>
                </div>
            </div>`;
        app.showModal('Bloquear/Desbloquear Aluno', content, async () => {
            const v = document.getElementById('block-until').value;
            if (!v) return alert('Escolha data/hora');
            const d = new Date(v);
            await setAlunoBlockedUntil(id, d);
            app.showToast('Aluno bloqueado até ' + d.toLocaleString(), 'success');
            app.renderContent();
        });
        // attach unblock button
        setTimeout(() => { const btn = document.getElementById('btn-unblock'); if (btn) btn.addEventListener('click', async () => { if (!confirm('Desbloquear agora?')) return; await clearAlunoBlock(id); document.querySelector('[id^="m-"]').remove(); app.showToast('Aluno desbloqueado', 'success'); app.renderContent(); }); }, 200);
    };

    app.unblockUsuario = async function(id) { if (!confirm('Desbloquear usuário?')) return; await clearAlunoBlock(id); app.showToast('Usuário desbloqueado', 'success'); app.renderContent(); };
}