import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendMateriais(app) {
    app.renderMateriaisOrganizado = async function(container) {
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

        const estrutura = {};

        materiais.forEach(mat => {
            const turma = turmas.find(t => t.id === mat.turmaId);
            const turmaNome = turma ? app.formatTurmaLabelText(turma, 'Sem Turma', true) : 'Sem Turma';
            const turmaId = mat.turmaId || 'sem-turma';

            const comp = componentes.find(c => c.id === mat.componenteId);
            const compNome = comp ? comp.nome : 'Geral';
            const compId = mat.componenteId || 'geral';

            const tipoCat = categorizarTipo(mat.tipo);

            if (!estrutura[turmaId]) estrutura[turmaId] = { nome: turmaNome, componentes: {} };
            if (!estrutura[turmaId].componentes[compId]) estrutura[turmaId].componentes[compId] = { nome: compNome, tipos: {} };
            if (!estrutura[turmaId].componentes[compId].tipos[tipoCat]) estrutura[turmaId].componentes[compId].tipos[tipoCat] = [];

            estrutura[turmaId].componentes[compId].tipos[tipoCat].push({ ...mat, categoria: tipoCat });
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

                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 mb-6">
                    <h4 class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Tipos de Arquivo:</h4>
                    <div class="flex flex-wrap gap-2">
                        ${Object.entries(labelsTipo).map(([key, label]) => `
                            <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${coresTipo[key]} text-xs font-medium">
                                <i class="fas ${iconesTipo[key]}"></i>
                                ${label}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="space-y-6">
        `;

        Object.entries(estrutura).forEach(([turmaId, turmaData]) => {
            html += `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <div class="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800 p-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <i class="fas fa-chalkboard text-white text-lg"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-white">${turmaData.nome}</h3>
                                <p class="text-indigo-100 text-sm">${Object.keys(turmaData.componentes).length} componente(s) curricular(es)</p>
                            </div>
                        </div>
                    </div>

                    <div class="divide-y divide-gray-100 dark:divide-slate-700">
            `;

            Object.entries(turmaData.componentes).forEach(([compId, compData]) => {
                const ordemTipos = ['excel', 'word', 'ppt', 'pdf', 'youtube', 'link'];
                const totalMateriais = Object.keys(compData.tipos).reduce((sum, tipo) => sum + compData.tipos[tipo].length, 0);

                html += `
                    <div class="p-4">
                        <div class="flex items-center gap-2 mb-4">
                            <i class="fas fa-book-open text-purple-600 dark:text-purple-400"></i>
                            <h4 class="font-bold text-gray-800 dark:text-white text-lg">${compData.nome}</h4>
                            <span class="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs rounded-full">${totalMateriais} arquivo(s)</span>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                `;

                ordemTipos.forEach(tipo => {
                    const mats = compData.tipos[tipo];
                    if (!mats || mats.length === 0) return;

                    html += `
                        <div class="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                            <div class="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-slate-600">
                                <div class="w-8 h-8 rounded-lg ${coresTipo[tipo]} flex items-center justify-center">
                                    <i class="fas ${iconesTipo[tipo]}"></i>
                                </div>
                                <div>
                                    <h5 class="font-semibold text-gray-800 dark:text-white text-sm">${labelsTipo[tipo]}</h5>
                                    <span class="text-xs text-gray-500 dark:text-gray-400">${mats.length} arquivo(s)</span>
                                </div>
                            </div>
                            <div class="space-y-2">
                                ${mats.map(mat => {
                                    const canEdit = app.currentUserData && app.perms && app.perms.canEditMaterial(mat);
                                    return `
                                        <div class="group relative bg-white dark:bg-slate-800 p-3 rounded border border-gray-200 dark:border-slate-600 hover:shadow-md transition">
                                            ${canEdit ? `
                                                <button onclick="app.deleteItem('materiais', '${mat.id}')" class="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                                                    <i class="fas fa-trash text-xs"></i>
                                                </button>
                                            ` : ''}
                                            <div class="flex items-start gap-2 pr-6">
                                                <i class="fas ${iconesTipo[tipo]} mt-0.5 flex-shrink-0"></i>
                                                <div class="min-w-0 flex-1">
                                                    <p class="text-sm font-medium text-gray-800 dark:text-white truncate" title="${mat.titulo}">${mat.titulo}</p>
                                                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${mat.professorNome || 'Professor'}</p>
                                                </div>
                                            </div>
                                            <a href="${mat.url}" target="_blank" class="mt-2 block w-full py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-center rounded text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition">
                                                <i class="fas fa-external-link-alt mr-1"></i> Acessar
                                            </a>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                });

                html += `</div></div>`;
            });

            html += `</div></div>`;
        });

        html += `</div>`;

        if (materiais.length === 0) {
            html = `
                <div class="text-center py-16">
                    <div class="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-book-open text-4xl text-gray-400 dark:text-gray-600"></i>
                    </div>
                    <h3 class="text-xl font-bold text-gray-700 dark:text-gray-300 mb-2">Nenhum material disponível</h3>
                    <p class="text-gray-500 dark:text-gray-400">Os materiais didáticos aparecerão aqui quando forem adicionados.</p>
                    ${app.currentUserData && app.perms && app.perms.canCreateMaterial() ? `
                        <button onclick="app.showAddMaterialModal()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            <i class="fas fa-plus mr-2"></i>Adicionar Primeiro Material
                        </button>
                    ` : ''}
                </div>
            `;
        }

        container.innerHTML = html;
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

}