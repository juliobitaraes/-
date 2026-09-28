import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendMateriais(app) {
    app.renderMateriaisOrganizado = async function(container) {
        const prefKey = 'senatedu:materiais:mostrarConcluidas';
        if (typeof app.materiaisMostrarConcluidas !== 'boolean') {
            try {
                const savedPreference = localStorage.getItem(prefKey);
                app.materiaisMostrarConcluidas = savedPreference === null || savedPreference === '1';
            } catch (error) {
                app.materiaisMostrarConcluidas = true;
            }
        }
        const exibirConcluidas = app.materiaisMostrarConcluidas === true;
        const turmas = await app.getCollection('turmas');
        const componentes = await app.getCollection('componentes');
        let materiais = await app.getCollection('materiais');

        if (app.currentUserData && app.perms && app.perms.isAluno()) {
            const minhasTurmas = turmas.filter(t => (t.alunos || []).includes(app.currentUserData.id)).map(t => t.id);
            materiais = materiais.filter(m => minhasTurmas.includes(m.turmaId));
        }

        const categorizarTipo = (tipo) => {
            const t = (tipo || '').toLowerCase();
            if (['xlsx', 'xls', 'excel'].some(e => t.includes(e))) return 'excel';
            if (['docx', 'doc', 'word'].some(e => t.includes(e))) return 'word';
            if (['pptx', 'ppt', 'powerpoint'].some(e => t.includes(e))) return 'ppt';
            if (t === 'pdf') return 'pdf';
            if (t === 'youtube') return 'youtube';
            return 'link';
        };

        const iconesTipo = {
            excel: 'fa-file-excel text-green-600',
            word: 'fa-file-word text-blue-600',
            ppt: 'fa-file-powerpoint text-orange-600',
            pdf: 'fa-file-pdf text-red-600',
            youtube: 'fa-youtube text-red-600',
            link: 'fa-link text-purple-600'
        };

        const labelsTipo = {
            excel: 'Excel',
            word: 'Word',
            ppt: 'PowerPoint',
            pdf: 'PDF',
            youtube: 'YouTube',
            link: 'Link da Internet'
        };

        const coresTipo = {
            excel: 'type-excel',
            word: 'type-word',
            ppt: 'type-ppt',
            pdf: 'type-pdf',
            youtube: 'type-youtube',
            link: 'type-link'
        };

        const parseCompDate = (value) => {
            if (!value) return null;
            const parsed = app.parseDateOnly ? app.parseDateOnly(value) : new Date(value);
            if (!parsed || Number.isNaN(parsed.getTime())) return null;
            return parsed;
        };
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const componenteStatusById = new Map();
        componentes.forEach((comp) => {
            const inicio = parseCompDate(comp.dataInicio);
            const fim = parseCompDate(comp.dataFim);
            let emAndamento = false;
            let concluida = false;
            if (inicio && inicio.getTime() <= hoje.getTime()) {
                emAndamento = !fim || fim.getTime() >= hoje.getTime();
                concluida = !!fim && fim.getTime() < hoje.getTime();
            }
            componenteStatusById.set(comp.id, { emAndamento, concluida });
        });

        const estrutura = {};
        let materiaisVisiveis = 0;

        materiais.forEach(mat => {
            const turma = turmas.find(t => t.id === mat.turmaId);
            const turmaNome = turma ? app.formatTurmaLabelText(turma, 'Sem Turma', true) : 'Sem Turma';
            const turmaId = mat.turmaId || 'sem-turma';

            const comp = componentes.find(c => c.id === mat.componenteId);
            const compNome = comp ? comp.nome : 'Geral';
            const compId = mat.componenteId || 'geral';
            const compStatus = componenteStatusById.get(compId);
            if (!exibirConcluidas && compStatus && compStatus.concluida) return;

            const tipoCat = categorizarTipo(mat.tipo);

            if (!estrutura[turmaId]) estrutura[turmaId] = { nome: turmaNome, componentes: {} };
            if (!estrutura[turmaId].componentes[compId]) estrutura[turmaId].componentes[compId] = { nome: compNome, tipos: {} };
            if (!estrutura[turmaId].componentes[compId].tipos[tipoCat]) estrutura[turmaId].componentes[compId].tipos[tipoCat] = [];

            estrutura[turmaId].componentes[compId].tipos[tipoCat].push({ ...mat, categoria: tipoCat });
            materiaisVisiveis += 1;
        });

        let html = `
            <div class="mb-6">
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <i class="fas fa-book text-blue-600"></i> Materiais Didáticos
                    </h2>
                    ${app.currentUserData && app.perms && app.perms.canCreateMaterial() ? `
                        <button onclick="app.showAddMaterialModal()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 shadow-sm">
                            <i class="fas fa-plus mr-2"></i>Adicionar Material
                        </button>
                    ` : ''}
                </div>

                <div class="mb-4">
                    <button onclick="app.toggleMateriaisConcluidas()" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition">
                        <i class="fas fa-layer-group mr-1.5"></i>${exibirConcluidas ? 'Ocultar componentes concluídas' : 'Reexibir componentes concluídas'}
                    </button>
                </div>

                <div class="flex flex-wrap items-center gap-3 mb-4 text-xs text-gray-600 dark:text-gray-300">
                    <span class="inline-flex items-center gap-2">
                        <span class="w-3 h-3 rounded-sm bg-emerald-500"></span>
                        Materiais da componente em andamento
                    </span>
                    ${exibirConcluidas
                        ? `<span class="inline-flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-gray-300 dark:bg-slate-500"></span>Componentes concluídas visíveis</span>`
                        : `<span class="inline-flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-gray-300 dark:bg-slate-500"></span>Componentes já finalizadas ocultas</span>`}
                </div>
            </div>

            <div class="space-y-4">
        `;

        const ordemTipos = ['excel', 'word', 'ppt', 'pdf', 'youtube', 'link'];
        const ordenarComponentes = (turmaData) => Object.entries(turmaData.componentes)
            .sort(([compAId], [compBId]) => {
                const aEmAndamento = componenteStatusById.get(compAId)?.emAndamento === true;
                const bEmAndamento = componenteStatusById.get(compBId)?.emAndamento === true;
                if (aEmAndamento === bEmAndamento) return 0;
                return aEmAndamento ? -1 : 1;
            });
        let caminho = Array.isArray(app.materiaisPastaPath) ? app.materiaisPastaPath.slice(0, 3) : [];
        let turmaAtual = caminho[0] ? estrutura[caminho[0]] : null;
        if (caminho.length && !turmaAtual) caminho = [];

        let componentesAtuais = turmaAtual ? ordenarComponentes(turmaAtual) : [];
        let componenteAtual = caminho[1] ? turmaAtual?.componentes[caminho[1]] : null;
        if (caminho.length > 1 && !componenteAtual) caminho = caminho.slice(0, 1);

        let tiposAtuais = componenteAtual
            ? ordemTipos.filter(tipo => componenteAtual.tipos[tipo]?.length)
            : [];
        if (caminho.length > 2 && !tiposAtuais.includes(caminho[2])) caminho = caminho.slice(0, 2);
        app.materiaisPastaPath = caminho;

        turmaAtual = caminho[0] ? estrutura[caminho[0]] : null;
        componentesAtuais = turmaAtual ? ordenarComponentes(turmaAtual) : [];
        componenteAtual = caminho[1] ? turmaAtual?.componentes[caminho[1]] : null;
        tiposAtuais = componenteAtual ? ordemTipos.filter(tipo => componenteAtual.tipos[tipo]?.length) : [];

        const breadcrumbs = [{ nome: 'Materiais', nivel: 0 }];
        if (turmaAtual) breadcrumbs.push({ nome: turmaAtual.nome, nivel: 1 });
        if (componenteAtual) breadcrumbs.push({ nome: componenteAtual.nome, nivel: 2 });
        if (caminho.length === 3) breadcrumbs.push({ nome: labelsTipo[caminho[2]], nivel: 3 });

        let pastas = [];
        if (!caminho.length) {
            pastas = Object.entries(estrutura).map(([id, turmaData]) => ({
                id,
                nivel: 1,
                nome: turmaData.nome,
                detalhe: `${Object.keys(turmaData.componentes).length} componente(s)`
            }));
        } else if (caminho.length === 1) {
            pastas = componentesAtuais.map(([id, compData]) => {
                const total = Object.values(compData.tipos).reduce((sum, mats) => sum + mats.length, 0);
                return {
                    id,
                    nivel: 2,
                    nome: compData.nome,
                    detalhe: `${total} arquivo(s)`,
                    emAndamento: componenteStatusById.get(id)?.emAndamento === true
                };
            });
        } else if (caminho.length === 2) {
            pastas = tiposAtuais.map(tipo => ({
                id: tipo,
                nivel: 3,
                nome: labelsTipo[tipo],
                detalhe: `${componenteAtual.tipos[tipo].length} arquivo(s)`
            }));
        }

        html += `
            <nav aria-label="Caminho dos materiais" class="flex flex-wrap items-center gap-2 rounded-lg bg-gray-100 dark:bg-slate-800 px-4 py-3 text-sm">
                ${breadcrumbs.map((item, index) => `
                    ${index ? '<i class="fas fa-chevron-right text-xs text-gray-400"></i>' : ''}
                    <button type="button" data-materiais-breadcrumb="${item.nivel}" class="font-medium ${index === breadcrumbs.length - 1 ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:text-blue-700 dark:hover:text-blue-400'}">${item.nome}</button>
                `).join('')}
            </nav>
        `;

        if (caminho.length < 3) {
            html += `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">`;
            html += pastas.map(pasta => `
                <button type="button" data-materiais-pasta="${encodeURIComponent(pasta.id)}" data-materiais-nivel="${pasta.nivel}" class="flex min-w-0 items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 px-4 py-3 text-left transition hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-slate-700 dark:hover:border-blue-500">
                    <i class="fas fa-folder text-2xl text-blue-600 dark:text-blue-400"></i>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium text-gray-800 dark:text-white">${pasta.nome}</span>
                        <span class="block text-xs text-gray-500 dark:text-gray-400">${pasta.detalhe}</span>
                    </span>
                    ${pasta.emAndamento ? '<span class="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white">Em andamento</span>' : ''}
                </button>
            `).join('');
            html += `</div>`;
        } else {
            const tipoAtual = caminho[2];
            const mats = componenteAtual.tipos[tipoAtual];
            html += `<div class="divide-y divide-gray-200 dark:divide-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">`;
            html += mats.map(mat => {
                const canEdit = app.currentUserData && app.perms && app.perms.canEditMaterial(mat);
                return `
                    <div class="group flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800 px-4 py-3 first:rounded-t-lg last:rounded-b-lg">
                        <i class="fas ${iconesTipo[tipoAtual]} text-xl"></i>
                        <div class="min-w-0 flex-1">
                            <p class="truncate font-medium text-gray-800 dark:text-white" title="${mat.titulo}">${mat.titulo}</p>
                            <p class="text-xs text-gray-500 dark:text-gray-400">${mat.professorNome || 'Professor'}</p>
                        </div>
                        ${canEdit ? `<button onclick="app.deleteItem('materiais', '${mat.id}')" class="p-2 text-gray-500 hover:text-red-600" title="Excluir material"><i class="fas fa-trash"></i></button>` : ''}
                        <a href="${mat.url}" target="_blank" rel="noopener noreferrer" class="rounded px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-700">
                            <i class="fas fa-external-link-alt mr-1"></i>Acessar
                        </a>
                    </div>
                `;
            }).join('');
            html += `</div>`;
        }

        html += `</div>`;

        if (materiaisVisiveis === 0) {
            html = `
                <div class="text-center py-16">
                    <div class="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-book-open text-4xl text-gray-400 dark:text-gray-600"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Nenhum material disponível</h3>
                    <p class="text-gray-500 dark:text-gray-400">${exibirConcluidas ? 'Os materiais didáticos aparecerão aqui quando forem adicionados.' : 'Não há materiais em componentes ativas no momento. Use "Reexibir componentes concluídas" para visualizar o histórico.'}</p>
                    ${app.currentUserData && app.perms && app.perms.canCreateMaterial() ? `
                        <button onclick="app.showAddMaterialModal()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <i class="fas fa-plus mr-2"></i>Adicionar Primeiro Material
                        </button>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = html;
        container.querySelectorAll('[data-materiais-pasta]').forEach((button) => {
            button.addEventListener('click', () => {
                const nivel = Number(button.dataset.materiaisNivel);
                app.materiaisPastaPath = app.materiaisPastaPath.slice(0, nivel - 1);
                app.materiaisPastaPath.push(decodeURIComponent(button.dataset.materiaisPasta));
                app.renderContent();
            });
        });
        container.querySelectorAll('[data-materiais-breadcrumb]').forEach((button) => {
            button.addEventListener('click', () => {
                app.materiaisPastaPath = app.materiaisPastaPath.slice(0, Number(button.dataset.materiaisBreadcrumb));
                app.renderContent();
            });
        });
    };

    app.showAddMaterialModal = async function(editId = null) {
        const turmas = await app.getCollection('turmas');
        const turmasAtivas = turmas.filter(t => !t.concluida);
        let turmasPermitidas = turmasAtivas;
        if (app.perms && app.perms.isProfessor()) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmasAtivas, componentes);
        }
        if (!turmasPermitidas.length) {
            alert('Não há turmas ativas disponíveis para cadastrar material.');
            return;
        }
        const options = turmasPermitidas.map(t => `<option value="${t.id}">${app.formatTurmaLabelText(t, 'Turma', true)}</option>`).join('');
        app.currentMaterialType = 'arquivo';

        const content = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Título</label>
                        <input id="mat-titulo" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Turma</label>
                        <select id="mat-turma" onchange="app.carregarComponentesSelect(this.value, 'mat-comp')" class="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Selecione...</option>${options}</select>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Componente Curricular</label>
                        <select id="mat-comp" class="w-full px-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Selecione a turma primeiro...</option></select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Tipo de Material</label>
                        <div class="flex gap-2 mb-2">
                            <button type="button" onclick="app.toggleMatType('arquivo')" id="btn-arquivo" class="flex-1 py-2 border-2 border-blue-500 bg-blue-50 text-blue-700 rounded-lg text-sm font-bold dark:bg-slate-700 dark:text-white">Arquivo (PDF, PPT, XLS)</button>
                            <button type="button" onclick="app.toggleMatType('link')" id="btn-link" class="flex-1 py-2 border-2 border-gray-200 text-gray-600 rounded-lg text-sm dark:border-slate-600 dark:text-gray-400">Link / Youtube</button>
                        </div>
                    </div>
                </div>
                <div id="area-arquivo" class="p-4 border-2 border-dashed border-gray-300 rounded-lg dark:border-slate-600">
                    <input type="file" id="mat-file" accept=".pdf, .pptx, .ppt, .xlsx, .xls, .docx, .doc" class="w-full text-sm text-gray-500 dark:text-gray-400">
                    <p class="text-xs text-gray-400 mt-2">Suporta: PDF, Excel, PowerPoint, Word. Máx 30MB.</p>
                </div>
                <div id="area-link" class="hidden">
                    <label class="block text-sm font-medium mb-1">URL</label>
                    <input id="mat-url" class="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="https://...">
                </div>
            </div>
        `;

        app.showModal(editId ? 'Editar Material' : 'Novo Material', content, async () => {
            const titulo = document.getElementById('mat-titulo').value.trim();
            const turmaId = document.getElementById('mat-turma').value;
            const compId = document.getElementById('mat-comp').value;
            let url = '';
            const tipo = app.currentMaterialType;
            if (!titulo || !turmaId) return alert('Preencha título e turma.');

            if (tipo === 'arquivo') {
                const file = document.getElementById('mat-file').files[0];
                if (!file) return alert('Selecione um arquivo.');
                const ref = storage.ref().child(`schools/${store.activeSchoolId}/materiais/${Date.now()}_${file.name}`);
                await ref.put(file);
                url = await ref.getDownloadURL();
            } else {
                url = document.getElementById('mat-url').value.trim();
                if (!url) return alert('Insira a URL.');
            }

            await db.collection('materiais').add({ titulo, turmaId, componenteId: compId, url, tipo, professorId: app.currentUserData.id, professorNome: app.currentUserData.nome, criado: firebase.firestore.FieldValue.serverTimestamp() });
            if (!editId) {
                const turmas = await app.getCollection('turmas');
                const turmaObj = turmas.find(t => t.id === turmaId);
                const turmaNome = turmaObj ? app.formatTurmaLabelText(turmaObj, 'Turma', true) : turmaId;
                app.notifyAlunosTurma(turmaId, `Novo material disponível: ${titulo}`, `Um novo material foi adicionado à sua turma.\n\nTítulo: ${titulo}\nAdicionado por: ${app.currentUserData.nome || 'Professor'}`, { turmaNome, notificationType: 'material' });
            }
            app.renderContent();
        });
    };

    app.toggleMatType = function(type) {
        app.currentMaterialType = type;
        const btnArq = document.getElementById('btn-arquivo');
        const btnLink = document.getElementById('btn-link');
        const areaArq = document.getElementById('area-arquivo');
        const areaLink = document.getElementById('area-link');
        if (!btnArq || !btnLink) return;
        if (type === 'arquivo') {
            btnArq.classList.add('bg-blue-50'); btnArq.classList.remove('bg-white');
            btnLink.classList.remove('bg-blue-50');
            areaArq.classList.remove('hidden'); areaLink.classList.add('hidden');
        } else {
            btnLink.classList.add('bg-blue-50'); btnArq.classList.remove('bg-blue-50');
            areaLink.classList.remove('hidden'); areaArq.classList.add('hidden');
        }
    };

    app.toggleMateriaisConcluidas = function() {
        app.materiaisMostrarConcluidas = !(app.materiaisMostrarConcluidas === true);
        try {
            localStorage.setItem('senatedu:materiais:mostrarConcluidas', app.materiaisMostrarConcluidas ? '1' : '0');
        } catch (error) {
            // Silently ignore persistence failures (private mode or blocked storage).
        }
        app.renderContent();
    };

}