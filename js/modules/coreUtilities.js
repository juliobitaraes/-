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
        const isSimulado = col === 'provas' && data?.tipo === 'atividade' && data?.quiz !== true && data?.avulsaPublica !== true;
        if (isRecuperacao && !(app.perms && app.perms.hasRole && app.perms.hasRole('admin', 'professor'))) {
            alert('Somente Administrador e Professor podem excluir prova de recuperacao.');
            return;
        }
        if (col === 'provas' && !isSimulado && data?.quiz !== true && !isRecuperacao && (data?.published === true || data?.wasPublished === true || data?.concluida === true)) {
            alert('Proibido excluir prova que já foi publicada. Você pode apenas editar.');
            return;
        }
        let confirmMessage = 'Excluir item?';
        if (col === 'provas') {
            const tipoAvaliacao = data?.quiz === true ? 'Quiz' : (data?.tipo === 'atividade' ? 'atividade' : 'prova');
            const titulo = data?.titulo ? ` "${data.titulo}"` : '';
            if (isRecuperacao) {
                confirmMessage = `Excluir ${tipoAvaliacao} de recuperacao${titulo}? As notas de recuperacao serao removidas e as notas anteriores serao restauradas.`;
            } else if (data?.quiz === true) {
                confirmMessage = `Excluir Quiz${titulo}? Os resultados deste Quiz também serão removidos.`;
            } else if (isSimulado) {
                confirmMessage = `Excluir simulado "${data?.titulo || ''}"? Os resultados também serão removidos.`;
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
                id: 'movimentacao-embalagem-sinalizacao',
                titulo: 'Movimentação, Embalagem e Sinalização',
                descricao: 'Treinamento sobre equipamentos de movimentacao, unitizacao de cargas e simbologias de manuseio e transporte.',
                arquivo: 'Movimentação, Embalagem e Sinalização.html',
                icone: 'fa-box-open',
                cor: 'from-blue-600 to-indigo-500'
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

    const TREINAMENTO_NOVO_DIAS = 14;

    app.isTreinamentosAdmin = function() {
        const tipo = store.currentUserData && store.currentUserData.tipo;
        return tipo === 'admin' || Boolean(app.isGlobalSuperAdmin && app.isGlobalSuperAdmin());
    };

    app.getTreinamentosCatalogoCompleto = async function() {
        const base = app.getTreinamentosCatalogo();
        if (!app.activeSchoolId) return base;
        try {
            const snap = await db.collection('schools').doc(app.activeSchoolId).collection('treinamentos_catalogo').get();
            const custom = snap.docs
                .map((doc) => ({ id: doc.id, ...doc.data() }))
                .filter((c) => c.ativo !== false && c.arquivo && !base.some((b) => b.id === c.id))
                .map((c) => ({
                    id: c.id,
                    titulo: c.titulo || c.id,
                    descricao: c.descricao || 'Curso adicionado pela escola.',
                    arquivo: c.arquivo,
                    icone: 'fa-graduation-cap',
                    cor: 'from-violet-600 to-fuchsia-500',
                    custom: true,
                    criadoEm: c.criadoEm || null
                }));
            return base.concat(custom);
        } catch (error) {
            console.warn('Falha ao carregar catalogo de treinamentos:', error);
            return base;
        }
    };

    app.buildTreinamentoTrackerSnippet = function(id, titulo) {
        const opts = (typeof firebase !== 'undefined' && firebase.app) ? firebase.app().options : {};
        const cfg = {
            apiKey: opts.apiKey, authDomain: opts.authDomain, projectId: opts.projectId,
            storageBucket: opts.storageBucket, messagingSenderId: opts.messagingSenderId, appId: opts.appId
        };
        const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
        return `
<!-- SENATEDU: registro de treinamento -->
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
<script>
(function(){
  var META=${json({ id, titulo })}, CFG=${json(cfg)};
  var q=new URLSearchParams(location.search), school=(q.get('escola')||'').trim();
  var nome=(q.get('nome')||'').trim(), uid=(q.get('uid')||'').trim()||null;
  if(!school||nome.length<3||typeof firebase==='undefined') return;
  if(!firebase.apps.length) firebase.initializeApp(CFG);
  var key='treinamento-session:'+META.id+':'+school, sid=sessionStorage.getItem(key);
  if(!sid){sid=Date.now()+'-'+Math.random().toString(36).slice(2,10);sessionStorage.setItem(key,sid);}
  var ref=firebase.firestore().collection('schools').doc(school).collection('treinamentos_registros').doc(sid);
  var T=firebase.firestore.Timestamp, done=false;
  var started=ref.set({treinamentoId:META.id,treinamentoTitulo:META.titulo,participanteNome:nome,sessionId:sid,entradaEm:T.now(),saidaEm:null,concluido:false,concluidoEm:null,origem:'treinamento-publico',alunoUid:uid},{merge:true}).catch(function(){});
  // Chame SENATEDU_TREINAMENTO.concluir(nota, notaMaxima) ao finalizar o curso; sem chamada, conclui ao chegar ao fim da pagina.
  function concluir(nota,max){
    if(done) return; done=true;
    started.then(function(){
      var d={concluido:true,concluidoEm:T.now(),saidaEm:T.now(),ultimaAtualizacaoEm:T.now()};
      if(typeof nota==='number'){d.nota=nota;d.notaMaxima=typeof max==='number'?max:10;}
      return ref.set(d,{merge:true});
    }).catch(function(){done=false;});
  }
  window.SENATEDU_TREINAMENTO={concluir:concluir};
  window.addEventListener('scroll',function(){if(innerHeight+scrollY>=document.documentElement.scrollHeight-40) concluir();});
})();
</script>
`;
    };

    app.modalAdicionarCurso = function() {
        if (!app.isTreinamentosAdmin()) {
            app.showToast('Apenas administradores podem adicionar cursos.', 'error');
            return;
        }
        const content = `
            <div class="space-y-3">
                <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200">
                    <i class="fas fa-triangle-exclamation mr-1"></i>
                    O arquivo HTML do curso deve ser armazenado dentro da pasta <strong>Treinamentos</strong>, na pasta do sistema, e tambem em <strong>web/Treinamentos</strong> (pasta publicada no hosting). Depois execute o deploy. O cadastro apenas vincula o curso; o arquivo preparado sera baixado para voce salvar nessa pasta.
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Arquivo HTML do curso</label>
                    <input id="novo-curso-arquivo" type="file" accept=".html,.htm,text/html" class="w-full text-sm text-slate-700 dark:text-slate-200">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Titulo</label>
                    <input id="novo-curso-titulo" type="text" maxlength="120" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Descricao</label>
                    <textarea id="novo-curso-descricao" rows="3" maxlength="400" class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"></textarea>
                </div>
            </div>
        `;

        const fileEl = () => document.getElementById('novo-curso-arquivo');
        setTimeout(() => {
            const f = fileEl();
            if (!f) return;
            f.addEventListener('change', () => {
                const titulo = document.getElementById('novo-curso-titulo');
                const file = f.files && f.files[0];
                if (file && titulo && !titulo.value) titulo.value = file.name.replace(/\.html?$/i, '').replace(/[_]+/g, ' ');
            });
        }, 50);

        app.showModal('Adicionar treinamento', content, async () => {
            const file = fileEl() && fileEl().files && fileEl().files[0];
            const titulo = String(document.getElementById('novo-curso-titulo').value || '').trim();
            const descricao = String(document.getElementById('novo-curso-descricao').value || '').trim();
            if (!file || !/\.html?$/i.test(file.name)) throw new Error('Selecione um arquivo .html.');
            if (file.size > 10 * 1024 * 1024) throw new Error('Arquivo maior que 10 MB.');
            if (titulo.length < 3) throw new Error('Informe um titulo com pelo menos 3 caracteres.');
            if (!app.activeSchoolId) throw new Error('Nenhuma escola ativa.');

            const slug = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
            if (!slug) throw new Error('Titulo invalido.');
            const existentes = await app.getTreinamentosCatalogoCompleto();
            if (existentes.some((c) => c.id === slug || String(c.arquivo).toLowerCase() === file.name.toLowerCase())) {
                throw new Error('Ja existe um curso com este titulo ou arquivo.');
            }

            const original = await file.text();
            const jaRastreia = original.includes('treinamentos_registros');
            let preparado = original;
            if (!jaRastreia) {
                const snippet = app.buildTreinamentoTrackerSnippet(slug, titulo);
                preparado = /<\/body>/i.test(original)
                    ? original.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${snippet}</body>`)
                    : original + snippet;
            }

            await db.collection('schools').doc(app.activeSchoolId).collection('treinamentos_catalogo').doc(slug).set({
                titulo,
                descricao,
                arquivo: file.name,
                ativo: true,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                criadoPor: (store.currentUser && store.currentUser.uid) || null,
                criadoPorNome: (store.currentUserData && store.currentUserData.nome) || null
            });

            if (!jaRastreia) {
                const blob = new Blob([preparado], { type: 'text/html;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            }
            alert(`Curso cadastrado.\n\nSalve o arquivo "${file.name}"${jaRastreia ? '' : ' (baixado com o registro de notas/datas ja incluido)'} dentro das pastas "Treinamentos" e "web/Treinamentos" da pasta do sistema e execute o deploy para os alunos acessarem.`);
            app.renderContent();
        }, { confirmLabel: 'Cadastrar curso', successToast: false });
    };

    app.modalNovoTreinamentoIA = function() {
        if (!app.isTreinamentosAdmin()) {
            app.showToast('Apenas administradores podem criar treinamentos.', 'error');
            return;
        }
        const inputCls = 'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';
        const content = `
            <div class="space-y-3">
                <div class="p-3 rounded-lg bg-violet-50 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700 text-xs text-violet-900 dark:text-violet-200">
                    <i class="fas fa-wand-magic-sparkles mr-1"></i>
                    A IA gera o treinamento gamificado no mesmo padrao dos existentes e ele entra automaticamente na lista. A geracao pode levar ate 2 minutos.
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Assunto / Titulo</label>
                    <input id="ia-curso-titulo" type="text" maxlength="120" class="${inputCls}">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Descricao curta (opcional)</label>
                    <textarea id="ia-curso-descricao" rows="2" maxlength="400" class="${inputCls}"></textarea>
                </div>
                <div>
                    <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Caracteristicas e instrucoes para a IA</label>
                    <textarea id="ia-curso-instrucoes" rows="7" maxlength="5000" placeholder="Ex.: publico-alvo, topicos obrigatorios, numero de modulos e perguntas, nivel de dificuldade, normas a citar..." class="${inputCls}"></textarea>
                </div>
            </div>
        `;

        app.showModal('Novo treinamento com IA', content, async () => {
            const titulo = String(document.getElementById('ia-curso-titulo').value || '').trim();
            const descricao = String(document.getElementById('ia-curso-descricao').value || '').trim() || `Treinamento sobre ${titulo}.`;
            const instrucoes = String(document.getElementById('ia-curso-instrucoes').value || '').trim();
            if (titulo.length < 3) throw new Error('Informe um titulo com pelo menos 3 caracteres.');
            if (instrucoes.length < 10) throw new Error('Descreva as caracteristicas desejadas (minimo 10 caracteres).');
            if (!app.activeSchoolId) throw new Error('Nenhuma escola ativa.');

            const slug = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
            if (!slug) throw new Error('Titulo invalido.');
            const existentes = await app.getTreinamentosCatalogoCompleto();
            if (existentes.some((c) => c.id === slug)) throw new Error('Ja existe um curso com este titulo.');

            app.showToast('Gerando treinamento com IA... aguarde.', 'info');
            const result = await firebase.app().functions('us-central1').httpsCallable('gerarTreinamentoIA', { timeout: 300000 })({
                schoolId: app.activeSchoolId, titulo, instrucoes
            });
            const original = String((result.data && result.data.html) || '');
            if (!original) throw new Error('A IA nao retornou conteudo.');

            const snippet = app.buildTreinamentoTrackerSnippet(slug, titulo);
            const html = /<\/body>/i.test(original)
                ? original.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${snippet}</body>`)
                : original + snippet;

            const schoolRef = db.collection('schools').doc(app.activeSchoolId);
            await schoolRef.collection('treinamentos_html').doc(slug).set({ html });
            await schoolRef.collection('treinamentos_catalogo').doc(slug).set({
                titulo,
                descricao,
                arquivo: `gerado-${slug}.html`,
                ativo: true,
                geradoPorIA: true,
                criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                criadoPor: (store.currentUser && store.currentUser.uid) || null,
                criadoPorNome: (store.currentUserData && store.currentUserData.nome) || null
            });
            app.showToast('Treinamento criado e adicionado a lista.', 'success');
            app.renderContent();
        }, { confirmLabel: 'Gerar treinamento', successToast: false });
    };

    app.removerCursoTreinamento = async function(cursoId) {
        if (!app.isTreinamentosAdmin() || !app.activeSchoolId) return;
        if (!confirm('Remover este curso da lista? Os registros ja gravados serao mantidos.')) return;
        try {
            await db.collection('schools').doc(app.activeSchoolId).collection('treinamentos_html').doc(cursoId).delete();
            await db.collection('schools').doc(app.activeSchoolId).collection('treinamentos_catalogo').doc(cursoId).delete();
            app.showToast('Curso removido.', 'success');
            app.renderContent();
        } catch (error) {
            app.showToast(error.message || 'Erro ao remover curso.', 'error');
        }
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
        if (options.alunoUid) url.searchParams.set('uid', String(options.alunoUid));
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
        const userData = store.currentUserData || {};
        const nomeAnterior = String(localStorage.getItem(storageKey) || (userData.tipo === 'aluno' ? userData.nome : '') || '').trim();
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
                treinamentoId,
                alunoUid: userData.tipo === 'aluno' && store.currentUser ? store.currentUser.uid : ''
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
        const catalogo = await app.getTreinamentosCatalogoCompleto();
        const userType = (store.currentUserData && store.currentUserData.tipo) ? store.currentUserData.tipo : '';
        const canViewRegistros = ['admin', 'professor'].includes(userType);
        const canManageCursos = app.isTreinamentosAdmin();
        const isAluno = userType === 'aluno';
        const alunoUid = store.currentUser && store.currentUser.uid;
        let registrosTreinamento = [];
        let registrosAluno = [];

        if (isAluno && alunoUid && app.activeSchoolId) {
            try {
                const snap = await db.collection('schools')
                    .doc(app.activeSchoolId)
                    .collection('treinamentos_registros')
                    .where('alunoUid', '==', alunoUid)
                    .limit(200)
                    .get();
                registrosAluno = snap.docs.map((doc) => doc.data());
            } catch (error) {
                console.warn('Falha ao carregar historico do aluno:', error);
            }
        }

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

        const statusPorCurso = {};
        registrosAluno.forEach((r) => {
            const id = String(r.treinamentoId || '');
            const atual = statusPorCurso[id] || { concluido: false, iniciado: true, data: null, nota: null, notaMaxima: null };
            if (r.concluido === true) {
                const d = toDate(r.concluidoEm);
                if (!atual.concluido || (d && (!atual.data || d > atual.data))) {
                    atual.concluido = true;
                    atual.data = d;
                    atual.nota = typeof r.nota === 'number' ? r.nota : atual.nota;
                    atual.notaMaxima = typeof r.notaMaxima === 'number' ? r.notaMaxima : atual.notaMaxima;
                }
            }
            statusPorCurso[id] = atual;
        });
        const isNovo = (item) => {
            if (!item.custom) return false;
            const d = toDate(item.criadoEm);
            return !d || (Date.now() - d.getTime()) < TREINAMENTO_NOVO_DIAS * 86400000;
        };
        const rankCurso = (item) => {
            const st = statusPorCurso[item.id];
            if (st && st.concluido) return 2;
            return isNovo(item) && !st ? 0 : 1;
        };
        const catalogoExibicao = isAluno
            ? catalogo.map((c, i) => ({ c, i })).sort((a, b) => (rankCurso(a.c) - rankCurso(b.c)) || (a.i - b.i)).map((x) => x.c)
            : catalogo;
        const totalRealizados = isAluno ? catalogo.filter((c) => statusPorCurso[c.id] && statusPorCurso[c.id].concluido).length : 0;
        const totalNovos = isAluno ? catalogo.filter((c) => rankCurso(c) === 0).length : 0;

        const cardsHtml = catalogoExibicao.map((item) => {
            const st = isAluno ? statusPorCurso[item.id] : null;
            const realizado = Boolean(st && st.concluido);
            const novo = isAluno && rankCurso(item) === 0;
            const cardBorda = realizado
                ? 'border-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/20'
                : (novo ? 'border-2 border-amber-400 ring-2 ring-amber-300/60' : 'border border-slate-200 dark:border-slate-700');
            const dataTxt = realizado && st.data ? st.data.toLocaleDateString('pt-BR') : '';
            const notaTxt = realizado && st.nota !== null ? ` - Nota ${st.nota}${st.notaMaxima ? '/' + st.notaMaxima : ''}` : '';
            const badgeHtml = realizado
                ? `<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-600 text-white text-xs font-semibold"><i class="fas fa-circle-check"></i>Realizado${dataTxt ? ' em ' + dataTxt : ''}${app.escapeHtml(notaTxt)}</span>`
                : (novo ? '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500 text-white text-xs font-bold animate-pulse"><i class="fas fa-star"></i>NOVO</span>' : '');
            const removerBtn = canManageCursos && item.custom
                ? `<button onclick="app.removerCursoTreinamento('${String(item.id).replace(/'/g, "\\'")}')" class="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"><i class="fas fa-trash mr-1"></i>Remover</button>`
                : '';
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
                <article class="bg-white dark:bg-slate-800 ${cardBorda} rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-lg transition">
                    ${badgeHtml ? `<div class="mb-3">${badgeHtml}</div>` : ''}
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
                        ${removerBtn}
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
            const notaTxt = typeof registro.nota === 'number' ? app.escapeHtml(`${registro.nota}${registro.notaMaxima ? '/' + registro.notaMaxima : ''}`) : '-';
            return `
                <tr class="border-b border-slate-200 dark:border-slate-700">
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${nome}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${treinamento}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${entrada}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${saida}</td>
                    <td class="px-3 py-2 text-sm ${concluido ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}">${concluido ? 'Sim' : 'Nao'}</td>
                    <td class="px-3 py-2 text-sm text-slate-700 dark:text-slate-200">${notaTxt}</td>
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
                                    <th class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Nota</th>
                                </tr>
                            </thead>
                            <tbody id="treinamentos-registros-body">
                                ${renderRegistrosRows(registrosNormalizados) || '<tr><td colspan="6" class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">Nenhum registro encontrado.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </section>
            `
            : '';

        const addBtnHtml = canManageCursos
            ? `<div class="flex justify-end gap-2"><button onclick="app.modalNovoTreinamentoIA()" class="px-4 py-2 bg-fuchsia-700 text-white rounded-lg text-sm hover:bg-fuchsia-800"><i class="fas fa-wand-magic-sparkles mr-2"></i>Novo treinamento (IA)</button><button onclick="app.modalAdicionarCurso()" class="px-4 py-2 bg-violet-700 text-white rounded-lg text-sm hover:bg-violet-800"><i class="fas fa-plus mr-2"></i>Adicionar Treinamento</button></div>`
            : '';
        const resumoAlunoHtml = isAluno
            ? `<div class="sticky top-0 z-10 flex gap-2 p-2 -mx-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700">
                    <div class="flex-1 text-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 py-2"><div class="text-xl font-bold">${totalRealizados}</div><div class="text-xs">Realizados</div></div>
                    <div class="flex-1 text-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 py-2"><div class="text-xl font-bold">${totalNovos}</div><div class="text-xs">Novos</div></div>
                    <div class="flex-1 text-center rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 py-2"><div class="text-xl font-bold">${catalogo.length - totalRealizados}</div><div class="text-xs">Pendentes</div></div>
                </div>`
            : '';

        content.innerHTML = `
            <div class="space-y-6">
                ${addBtnHtml}
                ${resumoAlunoHtml}
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
                        || '<tr><td colspan="6" class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">Nenhum registro encontrado para os filtros selecionados.</td></tr>';
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
