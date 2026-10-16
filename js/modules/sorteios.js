import { store } from '../store.js';

const STORAGE_PREFIX = 'senatedu_sorteio_';

export function extendSorteios(app) {
    const esc = (v) => app.escapeHtml(String(v ?? ''));
    const storageKey = () => `${STORAGE_PREFIX}${store.activeSchoolId || 'default'}`;
    let popup = null;
    let sorteando = false;
    let alunosCache = null;
    let ultimoPremio = '';

    const novoId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
    const chave = (s) => norm(s).toLocaleLowerCase('pt-BR');

    function estado() {
        if (app._sorteio) return app._sorteio;
        let salvo = null;
        try { salvo = JSON.parse(localStorage.getItem(storageKey()) || 'null'); } catch (e) { salvo = null; }
        app._sorteio = {
            titulo: salvo?.titulo || '',
            premiosNomes: Array.isArray(salvo?.premiosNomes) ? salvo.premiosNomes : [],
            premios: Number(salvo?.premios) > 0 ? Number(salvo.premios) : 1,
            participantes: Array.isArray(salvo?.participantes) ? salvo.participantes : [],
            ganhadores: Array.isArray(salvo?.ganhadores) ? salvo.ganhadores : []
        };
        return app._sorteio;
    }

    function salvar() {
        try { localStorage.setItem(storageKey(), JSON.stringify(estado())); } catch (e) { /* armazenamento indisponivel */ }
    }

    function elegiveis() {
        return estado().participantes.filter(p => p.ativo);
    }

    function nomePremio(i) {
        return estado().premiosNomes[i] || `Prêmio ${i + 1}`;
    }

    function sorteioConcluido() {
        const s = estado();
        return s.ganhadores.length >= s.premios;
    }

    function randomInt(max) {
        const buf = new Uint32Array(1);
        const limite = Math.floor(0x100000000 / max) * max;
        do { crypto.getRandomValues(buf); } while (buf[0] >= limite);
        return buf[0] % max;
    }

    function adicionarNomes(nomes, origem) {
        const s = estado();
        const existentes = new Set([...s.participantes, ...s.ganhadores].map(p => chave(p.nome)));
        let adicionados = 0;
        nomes.forEach(n => {
            const nome = norm(n);
            if (!nome || existentes.has(chave(nome))) return;
            existentes.add(chave(nome));
            s.participantes.push({ id: novoId(), nome, ativo: true, origem });
            adicionados++;
        });
        salvar();
        return adicionados;
    }

    async function carregarAlunos() {
        if (alunosCache) return alunosCache;
        const turmas = await app.getCollection('turmas');
        const users = await app.getCollection('users');
        let alunos = users.filter(u => u.tipo === 'aluno');
        let turmasPermitidas = turmas;
        if (app.perms && app.perms.hasRole('professor', 'secretaria')) {
            const componentes = await app.getComponentesCache();
            turmasPermitidas = app.filterTurmasByProfessor(turmas, componentes);
            alunos = alunos.filter(a => turmasPermitidas.some(t => (t.alunos || []).includes(a.id)));
        }
        alunosCache = { turmas: turmasPermitidas.filter(t => !t.concluida), alunos };
        return alunosCache;
    }

    function listaParticipantesHtml() {
        const s = estado();
        if (!s.participantes.length) {
            return '<p class="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Nenhum participante adicionado.</p>';
        }
        return s.participantes.map(p => `
            <label class="flex items-center gap-2 px-3 py-2 border-b dark:border-slate-700 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer">
                <input type="checkbox" ${p.ativo ? 'checked' : ''} onchange="app.sorteioAlternar('${p.id}', this.checked)">
                <span class="flex-1 text-sm text-gray-800 dark:text-gray-200 ${p.ativo ? '' : 'line-through opacity-60'}">${esc(p.nome)}</span>
                <button type="button" onclick="event.preventDefault(); app.sorteioRemover('${p.id}')" class="text-red-500 hover:text-red-700" title="Remover"><i class="fas fa-times"></i></button>
            </label>`).join('');
    }

    function ganhadoresHtml() {
        const s = estado();
        if (!s.ganhadores.length) return '<p class="text-sm text-gray-500 dark:text-gray-400">Nenhum sorteado ainda.</p>';
        return `<ol class="space-y-1">${s.ganhadores.map((g, i) => `
            <li class="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><span class="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">${i + 1}</span><span><strong>${esc(g.premio || nomePremio(i))}:</strong> ${esc(g.nome)}</span></li>`).join('')}</ol>`;
    }

    function atualizarPainel() {
        atualizarPopup();
        const lista = document.getElementById('sorteio-lista');
        if (!lista) return;
        const s = estado();
        lista.innerHTML = listaParticipantesHtml();
        document.getElementById('sorteio-ganhadores').innerHTML = ganhadoresHtml();
        const ativos = elegiveis().length;
        document.getElementById('sorteio-contagem').textContent = `${ativos} participando de ${s.participantes.length}`;
        document.getElementById('sorteio-restantes').textContent = `${Math.min(s.ganhadores.length, s.premios)} de ${s.premios} prêmio(s) sorteado(s)`;
    }

           app.renderSorteios = async function(container) {
        const s = estado();
        container.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h2 class="text-2xl font-bold text-gray-800 dark:text-white"><i class="fas fa-dice mr-2 text-amber-500"></i>Sorteios</h2>
            <div class="flex gap-2">
                <button onclick="app.sorteioNovo()" class="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"><i class="fas fa-rotate-right mr-2"></i>Novo sorteio</button>
                <button onclick="app.sorteioAbrirJanela()" class="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"><i class="fas fa-up-right-from-square mr-2"></i>Abrir janela do sorteio</button>
            </div>
        </div>
        <div class="grid lg:grid-cols-2 gap-6">
            <div class="space-y-6">
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
                    <h3 class="font-bold text-gray-800 dark:text-white">Configuração</h3>
                    <div>
                        <label class="text-sm text-gray-600 dark:text-gray-300">Título do sorteio</label>
                        <input id="sorteio-titulo" type="text" value="${esc(s.titulo)}" placeholder="Ex.: Sorteio de brindes" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" oninput="app.sorteioConfig()">
                    </div>
                    <div>
                        <label class="text-sm text-gray-600 dark:text-gray-300">Prêmios (um por linha, na ordem do sorteio)</label>
                        <textarea id="sorteio-premios" rows="4" placeholder="Ex.:&#10;Fone de ouvido&#10;Caixa de som&#10;Vale-presente" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white" oninput="app.sorteioConfig()">${esc(s.premiosNomes.join('\n'))}</textarea>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400">Cada pessoa sorteada é retirada da lista e não concorre aos prêmios seguintes. O 1º sorteado leva o 1º prêmio, e assim por diante.</p>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
                    <h3 class="font-bold text-gray-800 dark:text-white">Colar lista de nomes</h3>
                    <textarea id="sorteio-colar" rows="5" placeholder="Um nome por linha (ou separados por vírgula/ponto e vírgula)" class="w-full border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"></textarea>
                    <button onclick="app.sorteioAdicionarColados()" class="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800"><i class="fas fa-plus mr-2"></i>Adicionar à lista</button>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-3">
                    <h3 class="font-bold text-gray-800 dark:text-white">Importar alunos</h3>
                    <div class="flex flex-wrap gap-2">
                        <select id="sorteio-origem" class="flex-1 min-w-[12rem] border p-2 rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"><option value="">Carregando...</option></select>
                        <button onclick="app.sorteioImportarAlunos()" class="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800"><i class="fas fa-user-graduate mr-2"></i>Importar</button>
                    </div>
                </div>
            </div>
            <div class="space-y-6">
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow">
                    <div class="flex flex-wrap items-center justify-between gap-2 p-4 border-b dark:border-slate-700">
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-white">Participantes</h3>
                            <p id="sorteio-contagem" class="text-xs text-gray-500 dark:text-gray-400"></p>
                        </div>
                        <div class="flex gap-2 text-xs">
                            <button onclick="app.sorteioMarcarTodos(true)" class="px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 dark:text-gray-200 hover:bg-gray-200">Marcar todos</button>
                            <button onclick="app.sorteioMarcarTodos(false)" class="px-2 py-1 rounded bg-gray-100 dark:bg-slate-700 dark:text-gray-200 hover:bg-gray-200">Desmarcar todos</button>
                            <button onclick="app.sorteioLimparLista()" class="px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Limpar lista</button>
                        </div>
                    </div>
                    <div id="sorteio-lista" class="max-h-96 overflow-y-auto"></div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-lg shadow p-4 space-y-2">
                    <div class="flex items-center justify-between">
                        <h3 class="font-bold text-gray-800 dark:text-white"><i class="fas fa-trophy text-amber-500 mr-2"></i>Sorteados</h3>
                        <button onclick="app.sorteioReiniciar()" class="px-2 py-1 text-xs rounded bg-amber-100 text-amber-700 hover:bg-amber-200">Devolver sorteados à lista</button>
                    </div>
                    <p id="sorteio-restantes" class="text-xs text-gray-500 dark:text-gray-400"></p>
                    <div id="sorteio-ganhadores"></div>
                </div>
            </div>
        </div>`;
        atualizarPainel();

        try {
            const { turmas, alunos } = await carregarAlunos();
            const sel = document.getElementById('sorteio-origem');
            if (!sel) return;
            const opcoes = [`<option value="__todos__">Escola toda (${alunos.length} alunos)</option>`]
                .concat(turmas.map(t => `<option value="${esc(t.id)}">${esc(app.formatTurmaLabelText ? app.formatTurmaLabelText(t, 'Turma', true) : t.nome)}</option>`));
            sel.innerHTML = opcoes.join('');
        } catch (err) {
            console.error('Erro ao carregar alunos para sorteio:', err);
            const sel = document.getElementById('sorteio-origem');
            if (sel) sel.innerHTML = '<option value="">Não foi possível carregar os alunos</option>';
        }
    };

    app.sorteioConfig = function() {
        const s = estado();
        s.titulo = document.getElementById('sorteio-titulo')?.value || '';
        s.premiosNomes = String(document.getElementById('sorteio-premios')?.value || '').split(/\r?\n/).map(norm).filter(Boolean);
        s.premios = Math.max(1, s.premiosNomes.length);
        salvar();
        const rest = document.getElementById('sorteio-restantes');
        if (rest) rest.textContent = `${Math.min(s.ganhadores.length, s.premios)} de ${s.premios} prêmio(s) sorteado(s)`;
        atualizarPopup();
    };

    app.sorteioAdicionarColados = function() {
        const ta = document.getElementById('sorteio-colar');
        const nomes = String(ta?.value || '').split(/[\r\n;,\t]+/);
        const qtd = adicionarNomes(nomes, 'manual');
        if (ta) ta.value = '';
        atualizarPainel();
        if (!qtd) alert('Nenhum nome novo para adicionar (vazios ou já existentes).');
    };

    app.sorteioImportarAlunos = async function() {
        const origem = document.getElementById('sorteio-origem')?.value;
        if (!origem) return alert('Selecione uma turma ou a escola toda.');
        const { turmas, alunos } = await carregarAlunos();
        let selecionados = alunos;
        if (origem !== '__todos__') {
            const turma = turmas.find(t => t.id === origem);
            selecionados = alunos.filter(a => (turma?.alunos || []).includes(a.id));
        }
        selecionados = [...selecionados].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        const qtd = adicionarNomes(selecionados.map(a => a.nome), 'aluno');
        atualizarPainel();
        alert(`${qtd} aluno(s) adicionado(s) à lista.`);
    };

    app.sorteioAlternar = function(id, ativo) {
        const p = estado().participantes.find(x => x.id === id);
        if (p) p.ativo = !!ativo;
        salvar();
        atualizarPainel();
    };

    app.sorteioRemover = function(id) {
        const s = estado();
        s.participantes = s.participantes.filter(p => p.id !== id);
        salvar();
        atualizarPainel();
    };

    app.sorteioMarcarTodos = function(ativo) {
        estado().participantes.forEach(p => { p.ativo = ativo; });
        salvar();
        atualizarPainel();
    };

    app.sorteioLimparLista = function() {
        if (!confirm('Remover todos os participantes da lista?')) return;
        estado().participantes = [];
        salvar();
        atualizarPainel();
    };

    app.sorteioReiniciar = function() {
        const s = estado();
        if (!s.ganhadores.length) return;
        if (!confirm('Devolver os sorteados à lista e reiniciar o sorteio?')) return;
        s.ganhadores.forEach(g => s.participantes.push({ id: novoId(), nome: g.nome, ativo: true, origem: 'retorno' }));
        s.ganhadores = [];
        ultimoPremio = '';
        salvar();
        atualizarPainel();
    };

    app.sorteioNovo = function() {
        if (sorteando) return;
        if (!confirm('Iniciar um novo sorteio? Título, lista de participantes e sorteados serão apagados.')) return;
        app._sorteio = { titulo: '', premiosNomes: [], premios: 1, participantes: [], ganhadores: [] };
        ultimoPremio = '';
        salvar();
        const content = document.getElementById('content-area');
        if (content) app.renderSorteios(content);
        else atualizarPainel();
        if (popup && !popup.closed) {
            const caixa = popup.document.getElementById('caixa');
            if (caixa) { caixa.textContent = '?'; caixa.classList.remove('vencedor'); }
        }
        atualizarPopup();
    };

    // Janela de exibição do sorteio
    app.sorteioAbrirJanela = function() {
        if (popup && !popup.closed) { popup.focus(); atualizarPopup(); return; }
        popup = window.open('', 'senatedu_sorteio', 'width=1000,height=700');
        if (!popup) return alert('O navegador bloqueou a janela. Permita pop-ups para este site.');
        popup.document.open();
        popup.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Sorteio</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:24px;font-family:Segoe UI,Arial,sans-serif;background:linear-gradient(135deg,#1e1b4b,#4c1d95);color:#fff;text-align:center}
h1{margin:0;font-size:2.2rem}#info{opacity:.8;font-size:1.1rem}
#premio{font-size:clamp(1.4rem,3.5vw,2.4rem);font-weight:700;color:#fbbf24}
#caixa{min-width:60%;max-width:90%;padding:40px 24px;border-radius:24px;background:rgba(255,255,255,.12);font-size:clamp(2rem,6vw,4.5rem);font-weight:700;min-height:170px;display:flex;align-items:center;justify-content:center;word-break:break-word}
#caixa.vencedor{background:#f59e0b;color:#1e1b4b;box-shadow:0 0 60px rgba(245,158,11,.7)}
button{font-size:1.4rem;padding:14px 40px;border:0;border-radius:12px;background:#f59e0b;color:#1e1b4b;font-weight:700;cursor:pointer}button:disabled{opacity:.5;cursor:default}
#lista{max-width:90%;display:flex;flex-wrap:wrap;gap:8px;justify-content:center}#lista span{background:rgba(255,255,255,.15);padding:4px 12px;border-radius:999px}
</style></head><body>
<h1 id="titulo"></h1><div id="info"></div><div id="premio"></div><div id="caixa">?</div>
<button id="btn">Sortear</button><div id="lista"></div></body></html>`);
        popup.document.close();
        popup.document.getElementById('btn').addEventListener('click', app.sorteioSortear);
        popup.document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); app.sorteioSortear(); }
        });
        atualizarPopup();
    };

    function atualizarPopup() {
        if (!popup || popup.closed) return;
        const d = popup.document;
        const s = estado();
        const btn = d.getElementById('btn');
        if (!btn) return;
        d.getElementById('titulo').textContent = s.titulo || 'Sorteio';
        const restantes = Math.max(0, s.premios - s.ganhadores.length);
        d.getElementById('info').textContent = `${elegiveis().length} participante(s) • ${restantes} prêmio(s) restante(s)`;
        d.getElementById('premio').textContent = ultimoPremio
            ? `🎁 ${ultimoPremio}`
            : (sorteioConcluido() ? 'Todos os prêmios foram sorteados' : `🎁 ${nomePremio(s.ganhadores.length)}`);
        const lista = d.getElementById('lista');
        lista.textContent = '';
        s.ganhadores.forEach((g, i) => {
            const span = d.createElement('span');
            span.textContent = `🏆 ${g.premio || nomePremio(i)}: ${g.nome}`;
            lista.appendChild(span);
        });
        btn.disabled = sorteando || sorteioConcluido() || elegiveis().length === 0;
        btn.textContent = sorteioConcluido() ? 'Sorteio encerrado' : 'Sortear';
    }

    app.sorteioSortear = async function() {
        if (sorteando || !popup || popup.closed || sorteioConcluido()) return;
        const pool = elegiveis();
        if (!pool.length) return alert('Não há participantes marcados para o sorteio.');
        const s = estado();
        const d = popup.document;
        const caixa = d.getElementById('caixa');
        sorteando = true;
        ultimoPremio = '';
        atualizarPopup();
        caixa.classList.remove('vencedor');
        const vencedor = pool[randomInt(pool.length)];
        const premio = nomePremio(s.ganhadores.length);
        const fim = Date.now() + 3000;
        while (Date.now() < fim && !popup.closed) {
            caixa.textContent = pool[randomInt(pool.length)].nome;
            await new Promise(r => setTimeout(r, 70));
        }
        sorteando = false;
        ultimoPremio = premio;
        // Registra o resultado mesmo se a janela foi fechada durante a animacao
        s.participantes = s.participantes.filter(p => p.id !== vencedor.id);
        s.ganhadores.push({ nome: vencedor.nome, premio, data: new Date().toISOString() });
        salvar();
        if (!popup.closed) {
            caixa.textContent = vencedor.nome;
            caixa.classList.add('vencedor');
        }
        atualizarPainel();
    };
}
