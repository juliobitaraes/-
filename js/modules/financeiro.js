export function extendFinanceiro(app) {
app._financeFilters = app._financeFilters || {};

app.financeTypeByCollection = function(collectionKey) {
    if (collectionKey === 'receitas') return 'receita';
    if (collectionKey === 'despesas') return 'despesa';
    if (collectionKey === 'movimentacoes_financeiras') return 'movimentacao';
    return '';
};

app.financeCollectionByType = function(type) {
    if (type === 'receita') return 'receitas';
    if (type === 'despesa') return 'despesas';
    if (type === 'movimentacao') return 'movimentacoes_financeiras';
    return 'receitas';
};

app.getFinanceCategoryCollectionRef = function() {
    return app.getSchoolCollectionRef('financeiro_categorias');
};

app.getFinanceCategoriesByType = async function(type) {
    const snapshot = await app.getFinanceCategoryCollectionRef().get();
    return snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((item) => item && item.tipo === type)
        .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
};

app.getFinanceAccountCollectionRef = function() {
    return app.getSchoolCollectionRef('contas_financeiras');
};

app.getFinanceMovementCollectionRef = function() {
    return app.getSchoolCollectionRef('movimentacoes_financeiras');
};

app.getFinanceAccounts = async function() {
    const snapshot = await app.getFinanceAccountCollectionRef().orderBy('nome').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

app.getFinanceAccountNameById = function(accounts, id, fallbackName = '') {
    if (!id) return fallbackName || '';
    const found = (accounts || []).find((item) => item.id === id);
    return found ? (found.nome || fallbackName || '') : (fallbackName || '');
};

app.getFinanceMetaCollectionRef = function() {
    return app.getSchoolCollectionRef('metas_financeiras');
};

app.getFinanceBudgetCollectionRef = function() {
    return app.getSchoolCollectionRef('orcamentos_financeiros');
};

app.getFornecedorCollectionRef = function() {
    return app.getSchoolCollectionRef('fornecedores');
};

app.getProdutoCollectionRef = function() {
    return app.getSchoolCollectionRef('produtos');
};

app.getMonthLabel = function(monthKey) {
    if (!monthKey) return '-';
    const date = new Date(`${monthKey}-01T12:00:00`);
    if (Number.isNaN(date.getTime())) return monthKey;
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

app.calculateFinanceMetaProgress = function(meta) {
    const target = Number(meta && meta.valorMeta) || 0;
    const baseValue = Number(meta && meta.valorInicial) || 0;
    const aportes = Array.isArray(meta && meta.aportes) ? meta.aportes : [];
    const aportesTotal = aportes.reduce((acc, item) => acc + (Number(item && item.valor) || 0), 0);
    const valorAtual = baseValue + aportesTotal;
    const percentual = target > 0 ? (valorAtual / target) * 100 : 0;
    const faltam = Math.max(target - valorAtual, 0);
    const prazo = app.normalizeDateInput(meta && meta.prazo);
    let diasRestantes = null;
    if (prazo) {
        const prazoDate = new Date(`${prazo}T00:00:00`);
        if (!Number.isNaN(prazoDate.getTime())) {
            const diffMs = prazoDate.getTime() - Date.now();
            diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        }
    }
    return {
        valorAtual,
        percentual,
        faltam,
        diasRestantes,
        target
    };
};

app.getFinanceMonthlyTotals = async function(monthKey) {
    if (!monthKey) return { receitas: 0, despesas: 0 };
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;
    const [receitasSnap, despesasSnap] = await Promise.all([
        app.getSchoolCollectionRef('receitas').where('data', '>=', start).where('data', '<=', end).get(),
        app.getSchoolCollectionRef('despesas').where('data', '>=', start).where('data', '<=', end).get()
    ]);

    const receitas = receitasSnap.docs.reduce((acc, doc) => acc + (Number(doc.data().valor) || 0), 0);
    const despesas = despesasSnap.docs.reduce((acc, doc) => acc + (Number(doc.data().valor) || 0), 0);
    return { receitas, despesas };
};

app.setFinanceFilter = function(key) {
    const current = app._financeFilters[key] || {};
    const mes = document.getElementById(`filter-mes-${key}`)?.value || '';
    const cat = document.getElementById(`filter-cat-${key}`)?.value || '';
    const conta = document.getElementById(`filter-conta-${key}`)?.value || '';
    const busca = document.getElementById(`filter-busca-${key}`)?.value || '';
    const formaPagamento = document.getElementById(`filter-fp-${key}`)?.value || '';
    app._financeFilters[key] = {
        ...current,
        mes,
        cat,
        conta,
        busca,
        formaPagamento
    };
    app.renderContent();
};

app.setFinanceSort = function(key, field) {
    if (!key || !field) return;
    const current = app._financeFilters[key] || {};
    let direction = 'asc';
    if (current.ordemCampo === field) {
        direction = current.ordemDirecao === 'asc' ? 'desc' : 'asc';
    }
    app._financeFilters[key] = {
        ...current,
        ordemCampo: field,
        ordemDirecao: direction
    };
    app.renderContent();
};

app.getFinanceBadgeClass = function(text) {
    const palettes = [
        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
        'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300'
    ];
    const raw = String(text || 'badge');
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
        hash = ((hash << 5) - hash) + raw.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % palettes.length;
    return palettes[idx];
};

app.getFinanceSortButtonHtml = function(key, label, field, activeField, activeDirection) {
    const isActive = field === activeField;
    const iconClass = isActive
        ? (activeDirection === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down')
        : 'fa-sort';
    const toneClass = isActive
        ? 'text-blue-600 dark:text-blue-300'
        : 'text-slate-500 dark:text-slate-300';
    return `<button onclick="app.setFinanceSort('${key}', '${field}')" class="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-300 transition ${toneClass}">${label}<i class="fas ${iconClass} text-[10px]"></i></button>`;
};

app.getCurrentMonthKey = function() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
};

app.getFinanceCategoryVisual = function(categoryName) {
    const normalized = String(categoryName || '').trim().toLowerCase();
    const defs = [
        { terms: ['internet', 'github', 'nuvem', 'software', 'sistema'], icon: 'fa-wifi', tone: 'bg-blue-100 text-blue-600 dark:bg-blue-900/35 dark:text-blue-300' },
        { terms: ['agua', 'luz', 'energia', 'cemig', 'copasa'], icon: 'fa-bolt', tone: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/35 dark:text-cyan-300' },
        { terms: ['celular', 'telefone', 'chip'], icon: 'fa-mobile-screen-button', tone: 'bg-rose-100 text-rose-600 dark:bg-rose-900/35 dark:text-rose-300' },
        { terms: ['cartao', 'credito', 'compra', 'mercado'], icon: 'fa-credit-card', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300' },
        { terms: ['salario', 'mensalidade', 'receita', 'entrada'], icon: 'fa-arrow-trend-up', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300' },
        { terms: ['investimento', 'meta', 'aporte'], icon: 'fa-chart-line', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300' }
    ];
    const found = defs.find((d) => d.terms.some((term) => normalized.includes(term)));
    if (found) return found;
    return { icon: 'fa-receipt', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' };
};

app.exportFinanceTableToExcel = function(key) {
    try {
        if (typeof XLSX === 'undefined') {
            app.showToast('Biblioteca de exportacao indisponivel no momento.', 'warning');
            return;
        }

        const recordsByKey = app._financeRenderedRecordsByKey || {};
        const records = Array.isArray(recordsByKey[key]) ? recordsByKey[key] : [];
        if (records.length === 0) {
            app.showToast('Nao ha registros para exportar.', 'warning');
            return;
        }

        const rows = records.map((item) => ({
            Data: app.normalizeDateInput(item.data) || '',
            Tipo: item.tipo || app.financeTypeByCollection(key) || '',
            Categoria: item.categoria || '',
            Conta: item.contaNome || '',
            ContaDestino: item.contaDestinoNome || '',
            Descricao: item.descricao || '',
            FormaPagamento: app.getFinancePaymentLabel(item.formaPagamento),
            Valor: Number(item.valor) || 0,
            Quitada: item.quitada ? 'Sim' : 'Nao',
            Observacao: item.observacao || ''
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transacoes');
        const stamp = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `financeiro-${key}-${stamp}.xlsx`);
        app.showToast('Planilha exportada com sucesso!', 'success');
    } catch (error) {
        console.error('Falha ao exportar financeiro:', error);
        app.showToast('Falha ao exportar planilha.', 'error');
    }
};

app.getFinancePaymentLabel = function(code) {
    const map = {
        credito: 'Credito',
        debito: 'Debito',
        pix: 'PIX',
        dinheiro: 'Dinheiro',
        transferencia: 'Transferencia'
    };
    return map[String(code || '').trim()] || 'Nao especificado';
};

app.renderFinanceSection = async function(content, options) {
    const config = {
        key: options.key,
        title: options.title,
        icon: options.icon,
        buttonClass: options.buttonClass,
        emptyText: options.emptyText
    };
    const filters = app._financeFilters[config.key] || {};
    const filterMes = filters.mes || '';
    const filterCat = filters.cat || '';
    const filterConta = filters.conta || '';
    const filterBusca = String(filters.busca || '').trim().toLowerCase();
    const filterFormaPagamento = filters.formaPagamento || '';
    const sortField = filters.ordemCampo || 'data';
    const sortDirection = filters.ordemDirecao || 'desc';
    const isMovement = config.key === 'movimentacoes_financeiras';

    const snapshot = await app.getSchoolCollectionRef(config.key).orderBy('data', 'desc').get();
    let records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const financeType = app.financeTypeByCollection(config.key);
    const categoriesConfig = await app.getFinanceCategoriesByType(financeType);
    const accounts = await app.getFinanceAccounts();
    const allCategorias = isMovement
        ? []
        : [...new Set([
            ...categoriesConfig.map((item) => item.nome || '').filter(Boolean),
            ...records.map((r) => r.categoria || 'Sem categoria').filter(Boolean)
        ])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const allContas = [...new Set([
        ...accounts.map((item) => item.nome || '').filter(Boolean),
        ...records.map((r) => r.contaNome || '').filter(Boolean),
        ...records.map((r) => r.contaDestinoNome || '').filter(Boolean)
    ])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const allFormas = [...new Set(records.map((r) => String(r.formaPagamento || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (filterMes) records = records.filter(r => String(r.data || '').startsWith(filterMes));
    if (filterCat && !isMovement) records = records.filter(r => (r.categoria || 'Sem categoria') === filterCat);
    if (filterConta) {
        records = records.filter(r => {
            const contaNome = r.contaNome || app.getFinanceAccountNameById(accounts, r.contaId, 'Sem conta');
            const contaDestinoNome = r.contaDestinoNome || app.getFinanceAccountNameById(accounts, r.contaDestinoId, 'Sem conta');
            return contaNome === filterConta || contaDestinoNome === filterConta;
        });
    }
    if (filterBusca) records = records.filter((r) => String(r.descricao || '').toLowerCase().includes(filterBusca));
    if (filterFormaPagamento) records = records.filter((r) => String(r.formaPagamento || '') === filterFormaPagamento);

    const sortValue = (item, field) => {
        const contaNome = item.contaNome || app.getFinanceAccountNameById(accounts, item.contaId, 'Sem conta');
        const contaDestinoNome = item.contaDestinoNome || app.getFinanceAccountNameById(accounts, item.contaDestinoId, 'Sem conta');
        if (field === 'data') return String(item.data || '');
        if (field === 'categoria') return String(item.categoria || 'Sem categoria');
        if (field === 'conta') return String(contaNome || 'Sem conta');
        if (field === 'contaDestino') return String(contaDestinoNome || 'Sem conta');
        if (field === 'descricao') return String(item.descricao || '');
        if (field === 'formaPagamento') return String(app.getFinancePaymentLabel(item.formaPagamento));
        if (field === 'valor') return Number(item.valor) || 0;
        if (field === 'quitada') return item.quitada ? 1 : 0;
        return String(item.data || '');
    };

    records = [...records].sort((a, b) => {
        const av = sortValue(a, sortField);
        const bv = sortValue(b, sortField);
        let cmp = 0;
        if (typeof av === 'number' && typeof bv === 'number') {
            cmp = av - bv;
        } else {
            cmp = String(av).localeCompare(String(bv), 'pt-BR', { sensitivity: 'base' });
        }
        if (cmp === 0) {
            cmp = String(a.id || '').localeCompare(String(b.id || ''), 'pt-BR', { sensitivity: 'base' });
        }
        return sortDirection === 'asc' ? cmp : -cmp;
    });

    const monthKey = filterMes || app.getCurrentMonthKey();
    const monthStart = `${monthKey}-01`;
    const monthEnd = `${monthKey}-31`;
    const [monthReceitasSnap, monthDespesasSnap] = await Promise.all([
        app.getSchoolCollectionRef('receitas').where('data', '>=', monthStart).where('data', '<=', monthEnd).get(),
        app.getSchoolCollectionRef('despesas').where('data', '>=', monthStart).where('data', '<=', monthEnd).get()
    ]);
    const monthReceitas = monthReceitasSnap.docs.reduce((acc, doc) => acc + (Number(doc.data().valor) || 0), 0);
    const monthDespesas = monthDespesasSnap.docs.reduce((acc, doc) => acc + (Number(doc.data().valor) || 0), 0);
    const monthSaldo = monthReceitas - monthDespesas;
    const monthMovimentado = isMovement
        ? records.reduce((acc, item) => acc + (Number(item.valor) || 0), 0)
        : 0;

    app._financeRenderedRecordsByKey = app._financeRenderedRecordsByKey || {};
    app._financeRenderedRecordsByKey[config.key] = records;

    const total = records.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);
    const isFiltered = filterMes || filterCat || filterConta || filterBusca || filterFormaPagamento;

    const rows = records.map((item) => {
        const data = app.normalizeDateInput(item.data) || '-';
        const categoria = app.escapeHtml(item.categoria || 'Sem categoria');
        const contaNome = app.escapeHtml(item.contaNome || app.getFinanceAccountNameById(accounts, item.contaId, 'Sem conta') || 'Sem conta');
        const contaDestinoNome = app.escapeHtml(item.contaDestinoNome || app.getFinanceAccountNameById(accounts, item.contaDestinoId, 'Sem conta') || 'Sem conta');
        const descricao = app.escapeHtml(item.descricao || '-');
        const valor = app.formatCurrencyBRL(item.valor || 0);
        const formaPagamentoLabel = app.getFinancePaymentLabel(item.formaPagamento);
        const formaPagamento = app.escapeHtml(formaPagamentoLabel);
        const formaPagamentoBadge = app.getFinanceBadgeClass(`fp:${formaPagamentoLabel}`);
        const categoriaBadge = app.getFinanceBadgeClass(item.categoria || 'Sem categoria');
        const categoryVisual = app.getFinanceCategoryVisual(item.categoria || '');
        const showQuitada = config.key === 'despesas';
        const quitada = !!item.quitada;
        const deleteLoadingKey = `${config.key}:${item.id}`;
        const deleteLoading = !!(app._financeDeleteLoading && app._financeDeleteLoading[deleteLoadingKey]);
        const quitadaLoadingKey = `${config.key}:${item.id}`;
        const quitadaLoading = !!(app._financeQuitadaLoading && app._financeQuitadaLoading[quitadaLoadingKey]);
        const quitadaBadgeClass = quitada
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300';

        if (isMovement) {
            return `
                <tr class="border-b border-slate-100 dark:border-slate-700">
                    <td class="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${data}</td>
                    <td class="px-3 py-1.5 text-sm dark:text-slate-200">
                        <div class="flex items-center gap-2">
                            <span class="w-7 h-7 rounded-full inline-flex items-center justify-center bg-blue-100 text-blue-600 dark:bg-blue-900/35 dark:text-blue-300"><i class="fas fa-right-left text-xs"></i></span>
                            <span>${descricao}</span>
                        </div>
                    </td>
                    <td class="px-3 py-1.5 text-sm dark:text-slate-200 whitespace-nowrap">${contaNome}</td>
                    <td class="px-3 py-1.5 text-sm dark:text-slate-200 whitespace-nowrap">${contaDestinoNome}</td>
                    <td class="px-3 py-1.5 text-sm dark:text-slate-200"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${formaPagamentoBadge}">${formaPagamento}</span></td>
                    <td class="px-3 py-1.5 text-sm font-semibold dark:text-slate-100 whitespace-nowrap">${valor}</td>
                    <td class="px-3 py-1.5">
                        <div class="flex items-center gap-1">
                            <button title="Editar" aria-label="Editar" onclick="app.openFinanceEntryModal('${config.key}', '${item.id}')" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"><i class="fas fa-pen text-xs"></i></button>
                            <button title="Excluir" aria-label="Excluir" ${deleteLoading ? 'disabled' : ''} onclick="app.deleteFinanceEntry('${config.key}', '${item.id}')" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 ${deleteLoading ? 'opacity-70 cursor-wait' : ''}"><i class="fas ${deleteLoading ? 'fa-spinner fa-spin' : 'fa-trash'} text-xs"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }

        return `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">${data}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">
                    <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-full inline-flex items-center justify-center ${categoryVisual.tone}"><i class="fas ${categoryVisual.icon} text-xs"></i></span>
                        <span>${descricao}</span>
                    </div>
                </td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${categoriaBadge}">${categoria}</span></td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200 whitespace-nowrap">${contaNome}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${formaPagamentoBadge}">${formaPagamento}</span></td>
                <td class="px-3 py-1.5 text-sm font-semibold dark:text-slate-100 whitespace-nowrap">${valor}</td>
                ${showQuitada ? `<td class="px-3 py-1.5 text-sm dark:text-slate-200"><button type="button" ${quitadaLoading ? 'disabled' : ''} onclick="app.toggleFinanceQuitadaWithFeedback('${config.key}', '${item.id}', ${quitada ? 'false' : 'true'})" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${quitadaBadgeClass} ${quitadaLoading ? 'opacity-70 cursor-wait' : ''}" title="Alternar status de quitacao"><i class="fas ${quitadaLoading ? 'fa-spinner fa-spin' : (quitada ? 'fa-circle-check' : 'fa-clock')}"></i>${quitadaLoading ? 'Salvando...' : (quitada ? 'Quitada' : 'Aberta')}</button></td>` : ''}
                <td class="px-3 py-1.5">
                    <div class="flex items-center gap-1">
                        <button title="Editar" aria-label="Editar" onclick="app.openFinanceEntryModal('${config.key}', '${item.id}')" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"><i class="fas fa-pen text-xs"></i></button>
                        <button title="Excluir" aria-label="Excluir" ${deleteLoading ? 'disabled' : ''} onclick="app.deleteFinanceEntry('${config.key}', '${item.id}')" class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 ${deleteLoading ? 'opacity-70 cursor-wait' : ''}"><i class="fas ${deleteLoading ? 'fa-spinner fa-spin' : 'fa-trash'} text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const catOptions = allCategorias.map(c => `<option value="${app.escapeHtml(c)}"${filterCat === c ? ' selected' : ''}>${app.escapeHtml(c)}</option>`).join('');
    const contaOptions = allContas.map(c => `<option value="${app.escapeHtml(c)}"${filterConta === c ? ' selected' : ''}>${app.escapeHtml(c)}</option>`).join('');
    const formaOptions = allFormas.map(c => `<option value="${app.escapeHtml(c)}"${filterFormaPagamento === c ? ' selected' : ''}>${app.escapeHtml(app.getFinancePaymentLabel(c))}</option>`).join('');
    const clearBtn = isFiltered ? `<button onclick="app._financeFilters['${config.key}']={};app.renderContent();" class="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap">Limpar filtros</button>` : '';
    const tableCols = isMovement ? 7 : (config.key === 'despesas' ? 8 : 7);

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas ${config.icon}"></i> ${config.title}</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${isFiltered ? 'Total filtrado:' : 'Total acumulado:'} <span class="font-semibold">${app.formatCurrencyBRL(total)}</span></p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="app.exportFinanceTableToExcel('${config.key}')" class="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 dark:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/25 font-semibold">Exportar Excel</button>
                    <button onclick="app.openFinanceEntryModal('${config.key}')" class="px-4 py-2 ${config.buttonClass} text-white rounded-lg">Nova transacao</button>
                </div>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-wrap gap-2 items-center">
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"><i class="fas fa-list"></i>${records.length} transacao(oes)</span>
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300"><i class="fas fa-arrow-up"></i>Receitas: ${app.formatCurrencyBRL(monthReceitas)}</span>
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300"><i class="fas fa-arrow-down"></i>Despesas: ${app.formatCurrencyBRL(monthDespesas)}</span>
                <span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold ${monthSaldo >= 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300'}"><i class="fas fa-scale-balanced"></i>Saldo: ${app.formatCurrencyBRL(monthSaldo)}</span>
                ${isMovement ? `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/35 dark:text-indigo-300"><i class="fas fa-right-left"></i>Movimentado: ${app.formatCurrencyBRL(monthMovimentado)}</span>` : ''}
                <span class="text-[11px] text-slate-500 dark:text-slate-400 ml-auto">Referência: ${app.getMonthLabel(monthKey)}</span>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div class="flex-1">
                    <label class="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">Filtrar por mês</label>
                    <input type="month" id="filter-mes-${config.key}" value="${filterMes}" onchange="app.setFinanceFilter('${config.key}')" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                </div>
                <div class="flex-1 ${isMovement ? 'hidden' : ''}">
                    <label class="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">Filtrar por categoria</label>
                    <select id="filter-cat-${config.key}" onchange="app.setFinanceFilter('${config.key}')" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Todas as categorias</option>
                        ${catOptions}
                    </select>
                </div>
                <div class="flex-1">
                    <label class="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">Filtrar por conta</label>
                    <select id="filter-conta-${config.key}" onchange="app.setFinanceFilter('${config.key}')" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Todas as contas</option>
                        ${contaOptions}
                    </select>
                </div>
                <div class="flex-1">
                    <label class="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">Forma de pagamento</label>
                    <select id="filter-fp-${config.key}" onchange="app.setFinanceFilter('${config.key}')" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Todas</option>
                        ${formaOptions}
                    </select>
                </div>
                <div class="flex-1">
                    <label class="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">Buscar</label>
                    <input id="filter-busca-${config.key}" value="${app.escapeHtml(filters.busca || '')}" oninput="app.setFinanceFilter('${config.key}')" placeholder="Descricao..." class="w-full border rounded px-3 py-1.5 text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                </div>
                ${clearBtn}
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        ${isMovement ? `
                            <tr>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Data', 'data', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Descricao', 'descricao', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Conta Origem', 'conta', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Conta Destino', 'contaDestino', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Forma Pagamento', 'formaPagamento', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Valor', 'valor', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5 w-20 text-center">Acoes</th>
                            </tr>
                        ` : `
                            <tr>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Data', 'data', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Descricao', 'descricao', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Categoria', 'categoria', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Conta', 'conta', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Forma Pagamento', 'formaPagamento', sortField, sortDirection)}</th>
                                <th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Valor', 'valor', sortField, sortDirection)}</th>
                                ${config.key === 'despesas' ? `<th class="px-3 py-1.5">${app.getFinanceSortButtonHtml(config.key, 'Quitada', 'quitada', sortField, sortDirection)}</th>` : ''}
                                <th class="px-3 py-1.5 w-20 text-center">Acoes</th>
                            </tr>
                        `}
                    </thead>
                    <tbody>
                        ${rows || `<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="${tableCols}">${isFiltered ? 'Nenhum resultado para os filtros selecionados.' : config.emptyText}</td></tr>`}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

app.toggleFinanceQuitada = async function(collectionKey, id, quitada) {
    if (collectionKey !== 'despesas') return;
    await app.getSchoolCollectionRef(collectionKey).doc(id).update({
        quitada: !!quitada,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: app.currentUserData ? app.currentUserData.id : null
    });
};

app.toggleFinanceQuitadaWithFeedback = async function(collectionKey, id, quitada) {
    if (collectionKey !== 'despesas') return;
    app._financeQuitadaLoading = app._financeQuitadaLoading || {};
    const loadingKey = `${collectionKey}:${id}`;
    if (app._financeQuitadaLoading[loadingKey]) return;

    app._financeQuitadaLoading[loadingKey] = true;
    app.renderContent();

    try {
        await app.toggleFinanceQuitada(collectionKey, id, quitada);
    } catch (error) {
        app.showToast(error?.message || 'Erro ao atualizar status da despesa.', 'error');
    } finally {
        delete app._financeQuitadaLoading[loadingKey];
        app.renderContent();
    }
};

app.openFinanceEntryModal = async function(collectionKey, id = null) {
    let current = null;
    if (id) {
        const doc = await app.getSchoolCollectionRef(collectionKey).doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const [categoriesReceita, categoriesDespesa, accounts] = await Promise.all([
        app.getFinanceCategoriesByType('receita'),
        app.getFinanceCategoriesByType('despesa'),
        app.getFinanceAccounts()
    ]);
    window._financeModalData = { categoriesReceita, categoriesDespesa, accounts };

    const initialType = (current && current.tipo) || app.financeTypeByCollection(collectionKey) || 'receita';
    const dataPadrao = app.normalizeDateInput(current && current.data) || app.normalizeDateInput(new Date());
    const btnClass = (active, kind) => {
        if (!active) return 'px-2 sm:px-4 py-2 sm:py-3 border-2 rounded-lg transition font-medium text-xs sm:text-sm border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400';
        if (kind === 'receita') return 'px-2 sm:px-4 py-2 sm:py-3 border-2 rounded-lg transition font-medium text-xs sm:text-sm border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400';
        if (kind === 'despesa') return 'px-2 sm:px-4 py-2 sm:py-3 border-2 rounded-lg transition font-medium text-xs sm:text-sm border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400';
        return 'px-2 sm:px-4 py-2 sm:py-3 border-2 rounded-lg transition font-medium text-xs sm:text-sm border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    };

    const modalHTML = `
        <div id="modal-finance-transacao" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 fade-in backdrop-blur-sm">
            <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700">
                <div class="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-700 rounded-t-xl">
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white">${id ? 'Editar' : 'Nova'} Transacao</h3>
                    <button onclick="document.getElementById('modal-finance-transacao').remove()" class="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"><i class="fas fa-times text-xl"></i></button>
                </div>
                <div class="p-6">
                    <form id="form-finance-transacao" class="space-y-4">
                        <input type="hidden" id="finance-modal-id" value="${app.escapeHtml(id || '')}">
                        <input type="hidden" id="finance-modal-current-collection" value="${app.escapeHtml(collectionKey || '')}">
                        <input type="hidden" id="finance-modal-quitada" value="${current && current.quitada ? '1' : '0'}">
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Tipo de Transacao *</label>
                            <div class="grid grid-cols-3 gap-2">
                                <button type="button" id="btn-ft-receita" onclick="app.selectFinanceTransactionType('receita')" class="${btnClass(initialType === 'receita', 'receita')}"><i class="fas fa-arrow-up mr-1 sm:mr-2"></i>Receita</button>
                                <button type="button" id="btn-ft-despesa" onclick="app.selectFinanceTransactionType('despesa')" class="${btnClass(initialType === 'despesa', 'despesa')}"><i class="fas fa-arrow-down mr-1 sm:mr-2"></i>Despesa</button>
                                <button type="button" id="btn-ft-movimentacao" onclick="app.selectFinanceTransactionType('movimentacao')" class="${btnClass(initialType === 'movimentacao', 'movimentacao')}"><i class="fas fa-right-left mr-1 sm:mr-2"></i>Moviment.</button>
                            </div>
                            <input type="hidden" id="finance-tipo" value="${app.escapeHtml(initialType)}">
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Descricao *</label>
                                <input type="text" id="finance-descricao" value="${current ? app.escapeHtml(current.descricao || '') : ''}" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium" placeholder="Ex: Salario, Mercado, etc.">
                            </div>
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Valor (R$) *</label>
                                <input type="number" id="finance-valor" value="${current ? Number(current.valor || 0) : ''}" step="0.01" min="0" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium" placeholder="0,00">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Categoria *</label>
                                <select id="finance-categoria-id" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium"></select>
                            </div>
                            <div>
                                <label id="finance-conta-label" class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Conta *</label>
                                <select id="finance-conta" onchange="app.onFinanceModalContaChange()" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium"></select>
                            </div>
                        </div>
                        <div id="finance-campo-conta-destino" class="hidden">
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Conta de Destino *</label>
                            <select id="finance-conta-destino" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium"></select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Forma de Pagamento</label>
                            <select id="finance-forma-pagamento" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium">
                                <option value="" ${!current || !current.formaPagamento ? 'selected' : ''}>Nao especificado</option>
                                <option value="credito" ${current && current.formaPagamento === 'credito' ? 'selected' : ''}>Credito</option>
                                <option value="debito" ${current && current.formaPagamento === 'debito' ? 'selected' : ''}>Debito</option>
                                <option value="pix" ${current && current.formaPagamento === 'pix' ? 'selected' : ''}>PIX</option>
                                <option value="dinheiro" ${current && current.formaPagamento === 'dinheiro' ? 'selected' : ''}>Dinheiro</option>
                                <option value="transferencia" ${current && current.formaPagamento === 'transferencia' ? 'selected' : ''}>Transferencia</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Data *</label>
                            <input type="date" id="finance-data" value="${dataPadrao}" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium">
                        </div>
                        <div class="border-t border-gray-200 dark:border-slate-600 pt-3">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" id="finance-gasto-fixo" class="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 border-gray-300" ${current && current.gastoFixo ? 'checked' : ''}>
                                <span class="text-sm font-bold text-gray-700 dark:text-gray-300">Gasto Fixo</span>
                                <span class="text-xs text-gray-400 dark:text-gray-500">(permanente, sem data de fim)</span>
                            </label>
                        </div>
                        <div>
                            <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Observacoes</label>
                            <textarea id="finance-observacao" rows="2" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium resize-none" placeholder="Observacoes adicionais...">${current ? app.escapeHtml(current.observacao || '') : ''}</textarea>
                        </div>
                        ${!id ? `
                            <div class="border-t border-gray-200 dark:border-slate-600 pt-4 mt-4 bg-gray-50 dark:bg-slate-700/50 p-4 rounded-lg">
                                <label class="flex items-center gap-2 mb-3 cursor-pointer">
                                    <input type="checkbox" id="finance-eh-recorrente" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" onchange="app.toggleFinanceRecurrence()">
                                    <span class="text-sm font-bold text-gray-700 dark:text-gray-300">Transacao Recorrente (mensal)</span>
                                </label>
                                <div id="finance-campos-recorrencia" class="hidden space-y-3 pl-6 border-l-2 border-blue-300 dark:border-blue-700">
                                    <div>
                                        <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Repetir por quantos meses?</label>
                                        <input type="number" id="finance-meses-recorrencia" value="12" min="1" max="360" step="1" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:border-slate-600 dark:text-white bg-gray-50 text-gray-800 font-medium">
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </form>
                </div>
                <div class="p-6 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3 bg-gray-50 dark:bg-slate-700 rounded-b-xl">
                    <button onclick="document.getElementById('modal-finance-transacao').remove()" class="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition font-medium border border-gray-300 dark:border-slate-600">Cancelar</button>
                    <button onclick="app.saveFinanceEntryModal()" data-loading-label="${id ? 'Atualizando transacao...' : 'Salvando transacao...'}" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold shadow-lg">${id ? 'Atualizar' : 'Salvar'}</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    app.selectFinanceTransactionType(initialType);

    let selectedCategory = current ? (current.categoriaId || '') : '';
    if (!selectedCategory && current && current.categoria) {
        const list = initialType === 'despesa' ? categoriesDespesa : categoriesReceita;
        const found = list.find((item) => String(item.nome || '') === String(current.categoria || ''));
        selectedCategory = found ? (found.id || '') : '';
    }
    const selectedAccount = current ? (current.contaId || '') : '';
    const selectedDestination = current ? (current.contaDestinoId || '') : '';
    const catEl = document.getElementById('finance-categoria-id');
    const contaEl = document.getElementById('finance-conta');
    const destinoEl = document.getElementById('finance-conta-destino');
    if (catEl && selectedCategory) catEl.value = selectedCategory;
    if (contaEl && selectedAccount) contaEl.value = selectedAccount;
    app.onFinanceModalContaChange();
    if (destinoEl && selectedDestination) destinoEl.value = selectedDestination;
};

app.toggleFinanceRecurrence = function() {
    const checkbox = document.getElementById('finance-eh-recorrente');
    const campos = document.getElementById('finance-campos-recorrencia');
    if (!checkbox || !campos) return;
    campos.classList.toggle('hidden', !checkbox.checked);
};

app.selectFinanceTransactionType = function(type) {
    const data = window._financeModalData || { categoriesReceita: [], categoriesDespesa: [], accounts: [] };
    const btnReceita = document.getElementById('btn-ft-receita');
    const btnDespesa = document.getElementById('btn-ft-despesa');
    const btnMov = document.getElementById('btn-ft-movimentacao');
    const tipoEl = document.getElementById('finance-tipo');
    const categoriaEl = document.getElementById('finance-categoria-id');
    const contaEl = document.getElementById('finance-conta');
    const destinoWrap = document.getElementById('finance-campo-conta-destino');
    const contaLabel = document.getElementById('finance-conta-label');
    if (!tipoEl || !categoriaEl || !contaEl || !destinoWrap || !contaLabel) return;

    tipoEl.value = type;
    const baseClass = 'px-2 sm:px-4 py-2 sm:py-3 border-2 rounded-lg transition font-medium text-xs sm:text-sm';
    if (btnReceita) btnReceita.className = `${baseClass} ${type === 'receita' ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400'}`;
    if (btnDespesa) btnDespesa.className = `${baseClass} ${type === 'despesa' ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400'}`;
    if (btnMov) btnMov.className = `${baseClass} ${type === 'movimentacao' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400'}`;

    const prevCategory = categoriaEl.value;
    const prevAccount = contaEl.value;

    if (type === 'movimentacao') {
        categoriaEl.required = false;
        categoriaEl.disabled = true;
        categoriaEl.innerHTML = '<option value="">Movimentacao entre contas</option>';
        contaLabel.textContent = 'Conta de Origem *';
        destinoWrap.classList.remove('hidden');
    } else {
        categoriaEl.required = true;
        categoriaEl.disabled = false;
        const categories = type === 'despesa' ? data.categoriesDespesa : data.categoriesReceita;
        categoriaEl.innerHTML = '<option value="">Selecione...</option>' + categories
            .map((cat) => `<option value="${app.escapeHtml(cat.id || '')}">${app.escapeHtml(cat.nome || '-')}</option>`)
            .join('');
        if (prevCategory) categoriaEl.value = prevCategory;
        contaLabel.textContent = 'Conta *';
        destinoWrap.classList.add('hidden');
    }

    contaEl.innerHTML = '<option value="">Selecione...</option>' + data.accounts
        .filter((conta) => {
            if (type === 'despesa' && conta.tipo === 'investimento') return false;
            return true;
        })
        .map((conta) => `<option value="${app.escapeHtml(conta.id || '')}">${app.escapeHtml(conta.nome || '-')}</option>`)
        .join('');
    if (prevAccount) contaEl.value = prevAccount;

    app.onFinanceModalContaChange();
};

app.onFinanceModalContaChange = function() {
    const data = window._financeModalData || { accounts: [] };
    const tipo = document.getElementById('finance-tipo')?.value || 'receita';
    const origemId = document.getElementById('finance-conta')?.value || '';
    const destinoEl = document.getElementById('finance-conta-destino');
    if (!destinoEl) return;

    if (tipo !== 'movimentacao') {
        destinoEl.innerHTML = '<option value="">Selecione...</option>';
        return;
    }

    const currentDest = destinoEl.value;
    destinoEl.innerHTML = '<option value="">Selecione...</option>' + data.accounts
        .filter((conta) => conta.id !== origemId)
        .map((conta) => `<option value="${app.escapeHtml(conta.id || '')}">${app.escapeHtml(conta.nome || '-')}</option>`)
        .join('');
    if (currentDest) destinoEl.value = currentDest;
};

app.saveFinanceEntryModal = async function() {
    try {
        const form = document.getElementById('form-finance-transacao');
        if (!form || !form.checkValidity()) {
            form && form.reportValidity();
            return;
        }

        const data = window._financeModalData || { categoriesReceita: [], categoriesDespesa: [], accounts: [] };
        const id = (document.getElementById('finance-modal-id')?.value || '').trim();
        const oldCollection = (document.getElementById('finance-modal-current-collection')?.value || '').trim() || 'receitas';
        const tipo = (document.getElementById('finance-tipo')?.value || 'receita').trim();
        const targetCollection = app.financeCollectionByType(tipo);
        const descricao = (document.getElementById('finance-descricao')?.value || '').trim();
        const valor = Number(document.getElementById('finance-valor')?.value || 0);
        const dataLanc = document.getElementById('finance-data')?.value || '';
        const categoriaId = (document.getElementById('finance-categoria-id')?.value || '').trim();
        const contaId = (document.getElementById('finance-conta')?.value || '').trim();
        const contaDestinoId = (document.getElementById('finance-conta-destino')?.value || '').trim();
        const formaPagamento = (document.getElementById('finance-forma-pagamento')?.value || '').trim();
        const gastoFixo = !!document.getElementById('finance-gasto-fixo')?.checked;
        const observacao = (document.getElementById('finance-observacao')?.value || '').trim();
        const recorrente = !!document.getElementById('finance-eh-recorrente')?.checked;
        const mesesRecorrencia = Number(document.getElementById('finance-meses-recorrencia')?.value || 12);

        if (!descricao || !dataLanc || !contaId || !Number.isFinite(valor) || valor <= 0) {
            throw new Error('Preencha descricao, data, conta e valor valido.');
        }

        const contaNome = app.getFinanceAccountNameById(data.accounts, contaId, '');
        if (!contaNome) throw new Error('Conta de origem invalida.');

        let categoriaNome = '';
        let resolvedCategoriaId = null;
        let resolvedContaDestinoId = null;
        let contaDestinoNome = '';

        if (tipo === 'movimentacao') {
            if (!contaDestinoId) throw new Error('Selecione a conta de destino.');
            if (contaDestinoId === contaId) throw new Error('Conta de origem e destino devem ser diferentes.');
            resolvedContaDestinoId = contaDestinoId;
            contaDestinoNome = app.getFinanceAccountNameById(data.accounts, contaDestinoId, '');
        } else {
            if (!categoriaId) throw new Error('Selecione a categoria.');
            const categories = tipo === 'despesa' ? data.categoriesDespesa : data.categoriesReceita;
            const foundCategory = categories.find((item) => item.id === categoriaId)
                || categories.find((item) => String(item.nome || '') === String(categoriaId || ''));
            if (!foundCategory) throw new Error('Categoria invalida para o tipo selecionado.');
            resolvedCategoriaId = foundCategory.id || categoriaId;
            categoriaNome = foundCategory.nome || '';
        }

        if (recorrente && (!Number.isInteger(mesesRecorrencia) || mesesRecorrencia < 1 || mesesRecorrencia > 360)) {
            throw new Error('Informe meses de recorrencia entre 1 e 360.');
        }

        const quitadaAnterior = document.getElementById('finance-modal-quitada')?.value === '1';
        const quitada = tipo === 'despesa'
            ? (['debito', 'pix'].includes(formaPagamento) ? true : quitadaAnterior)
            : false;

        const payloadBase = {
            tipo,
            data: dataLanc,
            descricao,
            valor,
            categoriaId: resolvedCategoriaId,
            categoria: categoriaNome,
            contaId,
            contaNome,
            contaDestinoId: resolvedContaDestinoId,
            contaDestinoNome,
            formaPagamento,
            gastoFixo,
            recorrente: !id && recorrente,
            quitada,
            observacao,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const targetRef = app.getSchoolCollectionRef(targetCollection);

        if (id) {
            if (targetCollection === oldCollection) {
                await targetRef.doc(id).update(payloadBase);
            } else {
                await targetRef.doc(id).set({
                    ...payloadBase,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: app.currentUserData ? app.currentUserData.id : null
                }, { merge: true });
                await app.getSchoolCollectionRef(oldCollection).doc(id).delete();
            }
        } else {
            await targetRef.add({
                ...payloadBase,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: app.currentUserData ? app.currentUserData.id : null
            });

            if (recorrente) {
                const baseDate = new Date(`${dataLanc}T12:00:00`);
                for (let i = 1; i < mesesRecorrencia; i += 1) {
                    const d = new Date(baseDate);
                    d.setMonth(d.getMonth() + i);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    await targetRef.add({
                        ...payloadBase,
                        data: `${year}-${month}-${day}`,
                        descricao: `${descricao} (Recorrente)`,
                        recorrente: true,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdBy: app.currentUserData ? app.currentUserData.id : null
                    });
                }
            }
        }

        document.getElementById('modal-finance-transacao')?.remove();
        app.renderContent();
    } catch (error) {
        app.showToast(error && error.message ? error.message : 'Nao foi possivel salvar a transacao.', 'error');
    }
};

app.deleteFinanceEntry = async function(collectionKey, id) {
    const loadingKey = `${collectionKey}:${id}`;
    app._financeDeleteLoading = app._financeDeleteLoading || {};
    if (app._financeDeleteLoading[loadingKey]) return;
    if (!confirm('Excluir este lançamento?')) return;

    app._financeDeleteLoading[loadingKey] = true;
    app.renderContent();

    try {
        await app.getSchoolCollectionRef(collectionKey).doc(id).delete();
    } catch (error) {
        app.showToast(error && error.message ? error.message : 'Nao foi possivel excluir a transacao.', 'error');
    } finally {
        delete app._financeDeleteLoading[loadingKey];
        app.renderContent();
    }
};

app.renderReceitasEscolares = async function(content) {
    await app.renderFinanceSection(content, {
        key: 'receitas',
        title: 'Receitas',
        icon: 'fa-coins text-emerald-600',
        buttonClass: 'bg-emerald-700 hover:bg-emerald-800',
        emptyText: 'Nenhuma receita registrada.'
    });
};

app.renderDespesasEscolares = async function(content) {
    await app.renderFinanceSection(content, {
        key: 'despesas',
        title: 'Despesas',
        icon: 'fa-file-invoice-dollar text-rose-600',
        buttonClass: 'bg-rose-700 hover:bg-rose-800',
        emptyText: 'Nenhuma despesa registrada.'
    });
};

app.renderMovimentacoesFinanceiras = async function(content) {
    await app.renderFinanceSection(content, {
        key: 'movimentacoes_financeiras',
        title: 'Movimentacao entre Contas',
        icon: 'fa-right-left text-blue-600',
        buttonClass: 'bg-blue-700 hover:bg-blue-800',
        emptyText: 'Nenhuma movimentacao registrada.'
    });
};

app.calculateFinanceAccountBalance = function(account, receitas, despesas, movimentacoes) {
    const saldoInicial = Number(account && account.saldoInicial) || 0;
    const totalReceitas = (receitas || []).reduce((acc, item) => {
        if (!item || item.contaId !== account.id) return acc;
        return acc + (Number(item.valor) || 0);
    }, 0);
    const totalDespesas = (despesas || []).reduce((acc, item) => {
        if (!item || item.contaId !== account.id) return acc;
        return acc + (Number(item.valor) || 0);
    }, 0);
    const saidasMov = (movimentacoes || []).reduce((acc, item) => {
        if (!item || item.contaId !== account.id) return acc;
        return acc + (Number(item.valor) || 0);
    }, 0);
    const entradasMov = (movimentacoes || []).reduce((acc, item) => {
        if (!item || item.contaDestinoId !== account.id) return acc;
        return acc + (Number(item.valor) || 0);
    }, 0);
    return saldoInicial + totalReceitas - totalDespesas - saidasMov + entradasMov;
};

app.openFinanceAccountModal = async function(id = null) {
    let current = null;
    if (id) {
        const doc = await app.getFinanceAccountCollectionRef().doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const content = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-semibold mb-1">Nome da conta</label>
                <input id="finance-account-nome" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.nome || '') : ''}" placeholder="Ex: Caixa Escola, Banco Principal">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold mb-1">Tipo</label>
                    <select id="finance-account-tipo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="caixa"${current && current.tipo === 'caixa' ? ' selected' : ''}>Caixa</option>
                        <option value="banco"${current && current.tipo === 'banco' ? ' selected' : ''}>Banco</option>
                        <option value="carteira"${current && current.tipo === 'carteira' ? ' selected' : ''}>Carteira</option>
                        <option value="investimento"${current && current.tipo === 'investimento' ? ' selected' : ''}>Investimento</option>
                        <option value="outro"${current && current.tipo === 'outro' ? ' selected' : ''}>Outro</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Saldo inicial (R$)</label>
                    <input id="finance-account-saldo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.numberToMoneyInput(current.saldoInicial) : ''}" placeholder="0,00">
                </div>
            </div>
        </div>
    `;

    app.showModal(id ? 'Editar conta' : 'Nova conta', content, async () => {
        const nome = (document.getElementById('finance-account-nome')?.value || '').trim();
        const tipo = (document.getElementById('finance-account-tipo')?.value || '').trim();
        const saldoInicial = app.moneyInputToNumber(document.getElementById('finance-account-saldo')?.value || '0');

        if (!nome) throw new Error('Informe o nome da conta.');
        if (!tipo) throw new Error('Informe o tipo da conta.');

        const normalizedName = nome.replace(/\s+/g, ' ').trim();
        const accounts = await app.getFinanceAccounts();
        const duplicate = accounts.some((item) => {
            if (id && item.id === id) return false;
            return String(item.nome || '').trim().toLowerCase() === normalizedName.toLowerCase();
        });
        if (duplicate) throw new Error('Já existe uma conta com este nome.');

        const payload = {
            nome: normalizedName,
            tipo,
            saldoInicial,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const ref = app.getFinanceAccountCollectionRef();
        if (id) {
            await ref.doc(id).update(payload);
        } else {
            await ref.add({
                ...payload,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: app.currentUserData ? app.currentUserData.id : null
            });
        }
        app.renderContent();
    });
};

app.deleteFinanceAccount = async function(id) {
    if (!confirm('Excluir esta conta?')) return;
    const [receitasSnap, despesasSnap, movOrigemSnap, movDestinoSnap] = await Promise.all([
        app.getSchoolCollectionRef('receitas').where('contaId', '==', id).limit(1).get(),
        app.getSchoolCollectionRef('despesas').where('contaId', '==', id).limit(1).get(),
        app.getFinanceMovementCollectionRef().where('contaId', '==', id).limit(1).get(),
        app.getFinanceMovementCollectionRef().where('contaDestinoId', '==', id).limit(1).get()
    ]);
    if (!receitasSnap.empty || !despesasSnap.empty || !movOrigemSnap.empty || !movDestinoSnap.empty) {
        app.showToast('Não é possível excluir conta com lançamentos vinculados.', 'warning');
        return;
    }
    await app.getFinanceAccountCollectionRef().doc(id).delete();
    app.renderContent();
};

app.renderContasFinanceiras = async function(content) {
    const [accounts, receitasSnap, despesasSnap, movimentacoesSnap] = await Promise.all([
        app.getFinanceAccounts(),
        app.getSchoolCollectionRef('receitas').get(),
        app.getSchoolCollectionRef('despesas').get(),
        app.getFinanceMovementCollectionRef().get()
    ]);

    const receitas = receitasSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const despesas = despesasSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const movimentacoes = movimentacoesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const rows = accounts.map((account) => {
        const saldoAtual = app.calculateFinanceAccountBalance(account, receitas, despesas, movimentacoes);
        const saldoClass = saldoAtual >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
        return `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="px-3 py-2 text-sm font-medium dark:text-slate-100">${app.escapeHtml(account.nome || '-')}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(app.capitalize(account.tipo || 'outro'))}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.formatCurrencyBRL(account.saldoInicial || 0)}</td>
                <td class="px-3 py-2 text-sm font-semibold ${saldoClass}">${app.formatCurrencyBRL(saldoAtual)}</td>
                <td class="px-3 py-2">
                    <div class="flex gap-2">
                        <button onclick="app.openFinanceAccountModal('${account.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Editar</button>
                        <button onclick="app.deleteFinanceAccount('${account.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const saldoTotalAtual = accounts.reduce((acc, account) => acc + app.calculateFinanceAccountBalance(account, receitas, despesas, movimentacoes), 0);

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-wallet text-blue-600"></i> Contas</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Total de contas: <span class="font-semibold">${accounts.length}</span> • Saldo consolidado: <span class="font-semibold">${app.formatCurrencyBRL(saldoTotalAtual)}</span></p>
                </div>
                <button onclick="app.openFinanceAccountModal()" class="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg">Nova conta</button>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                            <th class="px-3 py-2">Conta</th>
                            <th class="px-3 py-2">Tipo</th>
                            <th class="px-3 py-2">Saldo Inicial</th>
                            <th class="px-3 py-2">Saldo Atual</th>
                            <th class="px-3 py-2">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="5">Nenhuma conta cadastrada.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

app.openFinanceCategoryModal = async function(id = null) {
    let current = null;
    if (id) {
        const doc = await app.getFinanceCategoryCollectionRef().doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const content = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-semibold mb-1">Tipo</label>
                <select id="finance-category-tipo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="receita"${current && current.tipo === 'receita' ? ' selected' : ''}>Receita</option>
                    <option value="despesa"${current && current.tipo === 'despesa' ? ' selected' : ''}>Despesa</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Nome da categoria</label>
                <input id="finance-category-nome" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.nome || '') : ''}" placeholder="Ex: Mensalidade, Transporte, Fornecedores">
            </div>
        </div>
    `;

    app.showModal(id ? 'Editar categoria' : 'Nova categoria', content, async () => {
        const tipo = (document.getElementById('finance-category-tipo')?.value || '').trim();
        const nome = (document.getElementById('finance-category-nome')?.value || '').trim();
        if (!tipo || !['receita', 'despesa'].includes(tipo)) throw new Error('Tipo de categoria inválido.');
        if (!nome) throw new Error('Informe o nome da categoria.');

        const normalizedName = nome.replace(/\s+/g, ' ').trim();
        const existing = await app.getFinanceCategoriesByType(tipo);
        const duplicated = existing.some((item) => {
            if (id && item.id === id) return false;
            return String(item.nome || '').trim().toLowerCase() === normalizedName.toLowerCase();
        });
        if (duplicated) throw new Error('Ja existe uma categoria com este nome para este tipo.');

        const payload = {
            tipo,
            nome: normalizedName,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const ref = app.getFinanceCategoryCollectionRef();
        if (id) {
            await ref.doc(id).update(payload);
        } else {
            await ref.add({
                ...payload,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: app.currentUserData ? app.currentUserData.id : null
            });
        }
        app.renderContent();
    });
};

app.deleteFinanceCategory = async function(id) {
    if (!confirm('Excluir esta categoria?')) return;
    await app.getFinanceCategoryCollectionRef().doc(id).delete();
    app.renderContent();
};

app.renderCategoriasFinanceiras = async function(content) {
    const [receitas, despesas] = await Promise.all([
        app.getFinanceCategoriesByType('receita'),
        app.getFinanceCategoriesByType('despesa')
    ]);

    const renderRows = (items) => items.map((item) => `
        <tr class="border-b border-slate-100 dark:border-slate-700">
            <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(item.nome || '-')}</td>
            <td class="px-3 py-2">
                <div class="flex gap-2">
                    <button onclick="app.openFinanceCategoryModal('${item.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Editar</button>
                    <button onclick="app.deleteFinanceCategory('${item.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Excluir</button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="2">Nenhuma categoria cadastrada.</td></tr>';

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-tags text-indigo-600"></i> Categorias</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Gerencie categorias para lancamentos de receitas e despesas.</p>
                </div>
                <button onclick="app.openFinanceCategoryModal()" class="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg">Nova categoria</button>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 class="font-semibold text-emerald-700 dark:text-emerald-300">Categorias de Receitas</h3></div>
                    <table class="min-w-full">
                        <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300"><tr><th class="px-3 py-2">Nome</th><th class="px-3 py-2">Ações</th></tr></thead>
                        <tbody>${renderRows(receitas)}</tbody>
                    </table>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                    <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-700"><h3 class="font-semibold text-rose-700 dark:text-rose-300">Categorias de Despesas</h3></div>
                    <table class="min-w-full">
                        <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300"><tr><th class="px-3 py-2">Nome</th><th class="px-3 py-2">Ações</th></tr></thead>
                        <tbody>${renderRows(despesas)}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
};

app.openFinanceMetaModal = async function(id = null) {
    let current = null;
    if (id) {
        const doc = await app.getFinanceMetaCollectionRef().doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const content = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-semibold mb-1">Nome da meta</label>
                <input id="finance-meta-nome" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.nome || '') : ''}" placeholder="Ex: Reserva de emergencia escolar">
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Descricao</label>
                <input id="finance-meta-descricao" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.descricao || '') : ''}" placeholder="Opcional">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold mb-1">Valor alvo (R$)</label>
                    <input id="finance-meta-valor" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.numberToMoneyInput(current.valorMeta) : ''}" placeholder="0,00">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Valor inicial (R$)</label>
                    <input id="finance-meta-inicial" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.numberToMoneyInput(current.valorInicial) : ''}" placeholder="0,00">
                </div>
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Prazo</label>
                <input id="finance-meta-prazo" type="date" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${app.normalizeDateInput(current && current.prazo) || ''}">
            </div>
        </div>
    `;

    app.showModal(id ? 'Editar meta' : 'Nova meta', content, async () => {
        const nome = (document.getElementById('finance-meta-nome')?.value || '').trim();
        const descricao = (document.getElementById('finance-meta-descricao')?.value || '').trim();
        const valorMeta = app.moneyInputToNumber(document.getElementById('finance-meta-valor')?.value || '0');
        const valorInicial = app.moneyInputToNumber(document.getElementById('finance-meta-inicial')?.value || '0');
        const prazo = document.getElementById('finance-meta-prazo')?.value || '';

        if (!nome) throw new Error('Informe o nome da meta.');
        if (!Number.isFinite(valorMeta) || valorMeta <= 0) throw new Error('Informe um valor alvo maior que zero.');

        const payload = {
            nome,
            descricao,
            valorMeta,
            valorInicial: Number.isFinite(valorInicial) ? valorInicial : 0,
            prazo,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const ref = app.getFinanceMetaCollectionRef();
        if (id) {
            await ref.doc(id).update(payload);
        } else {
            await ref.add({
                ...payload,
                aportes: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: app.currentUserData ? app.currentUserData.id : null
            });
        }

        app.renderContent();
    });
};

app.openFinanceMetaAporteModal = async function(id) {
    if (!id) return;
    const doc = await app.getFinanceMetaCollectionRef().doc(id).get();
    if (!doc.exists) return;
    const meta = { id: doc.id, ...doc.data() };

    const content = `
        <div class="space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-400">Meta: <strong>${app.escapeHtml(meta.nome || '-')}</strong></p>
            <div>
                <label class="block text-sm font-semibold mb-1">Data do aporte</label>
                <input id="finance-meta-aporte-data" type="date" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${app.normalizeDateInput(new Date())}">
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Valor do aporte (R$)</label>
                <input id="finance-meta-aporte-valor" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="0,00">
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Descricao</label>
                <input id="finance-meta-aporte-descricao" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: Transferencia para reserva">
            </div>
        </div>
    `;

    app.showModal('Registrar aporte', content, async () => {
        const data = document.getElementById('finance-meta-aporte-data')?.value || '';
        const valor = app.moneyInputToNumber(document.getElementById('finance-meta-aporte-valor')?.value || '0');
        const descricao = (document.getElementById('finance-meta-aporte-descricao')?.value || '').trim();
        if (!data) throw new Error('Informe a data do aporte.');
        if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor de aporte maior que zero.');

        const aportes = Array.isArray(meta.aportes) ? meta.aportes.slice() : [];
        aportes.push({
            data,
            valor,
            descricao,
            createdAt: new Date().toISOString()
        });

        await app.getFinanceMetaCollectionRef().doc(id).update({
            aportes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        });
        app.renderContent();
    });
};

app.deleteFinanceMeta = async function(id) {
    if (!confirm('Excluir esta meta financeira?')) return;
    await app.getFinanceMetaCollectionRef().doc(id).delete();
    app.renderContent();
};

app.renderMetasFinanceiras = async function(content) {
    const snapshot = await app.getFinanceMetaCollectionRef().orderBy('createdAt', 'desc').get();
    const metas = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const cards = metas.map((meta) => {
        const calc = app.calculateFinanceMetaProgress(meta);
        const pct = Math.max(0, Math.min(calc.percentual, 100));
        const progressClass = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-blue-500';
        const statusText = calc.percentual >= 100
            ? 'Meta atingida'
            : `Faltam ${app.formatCurrencyBRL(calc.faltam)}`;
        const prazoText = calc.diasRestantes === null
            ? 'Sem prazo definido'
            : (calc.diasRestantes >= 0 ? `${calc.diasRestantes} dia(s) restantes` : 'Prazo vencido');
        const totalAportes = Array.isArray(meta.aportes) ? meta.aportes.length : 0;

        return `
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100">${app.escapeHtml(meta.nome || '-')}</h3>
                        ${meta.descricao ? `<p class="text-sm text-slate-500 dark:text-slate-400">${app.escapeHtml(meta.descricao)}</p>` : ''}
                    </div>
                    <div class="flex gap-2">
                        <button onclick="app.openFinanceMetaAporteModal('${meta.id}')" class="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200">Aporte</button>
                        <button onclick="app.openFinanceMetaModal('${meta.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Editar</button>
                        <button onclick="app.deleteFinanceMeta('${meta.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Excluir</button>
                    </div>
                </div>
                <div>
                    <div class="flex justify-between items-center mb-1 text-sm">
                        <span class="font-semibold text-slate-700 dark:text-slate-200">${app.formatCurrencyBRL(calc.valorAtual)} / ${app.formatCurrencyBRL(calc.target)}</span>
                        <span class="font-bold text-slate-700 dark:text-slate-200">${calc.percentual.toFixed(1)}%</span>
                    </div>
                    <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                        <div class="h-2.5 ${progressClass}" style="width:${pct}%;"></div>
                    </div>
                </div>
                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>${statusText}</span>
                    <span>${prazoText}</span>
                    <span>${totalAportes} aporte(s)</span>
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-bullseye text-blue-600"></i> Metas Financeiras</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Acompanhe objetivos de reserva e investimentos da escola.</p>
                </div>
                <button onclick="app.openFinanceMetaModal()" class="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg">Nova meta</button>
            </div>
            ${cards || '<div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">Nenhuma meta cadastrada.</div>'}
        </div>
    `;
};

app.openFinanceBudgetModal = async function(id = null) {
    let current = null;
    if (id) {
        const doc = await app.getFinanceBudgetCollectionRef().doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const monthKey = current && current.mes ? current.mes : new Date().toISOString().slice(0, 7);
    const categories = await app.getFinanceCategoriesByType('despesa');
    const categoryOptions = categories.map((item) => {
        const selected = current && current.categoriaId === item.id ? ' selected' : '';
        return `<option value="${app.escapeHtml(item.id || '')}"${selected}>${app.escapeHtml(item.nome || '-')}</option>`;
    }).join('');

    const monthly = await app.getFinanceMonthlyTotals(monthKey);
    const budgetsSnapshot = await app.getFinanceBudgetCollectionRef().where('mes', '==', monthKey).get();
    const totalBudgeted = budgetsSnapshot.docs.reduce((acc, doc) => {
        if (id && doc.id === id) return acc;
        return acc + (Number(doc.data().valor) || 0);
    }, 0);

    const content = `
        <div class="space-y-4">
            <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>Mes: <strong>${app.escapeHtml(app.getMonthLabel(monthKey))}</strong></p>
                <p>Receitas: <strong class="text-emerald-600 dark:text-emerald-400">${app.formatCurrencyBRL(monthly.receitas)}</strong></p>
                <p>Ja orcado: <strong>${app.formatCurrencyBRL(totalBudgeted)}</strong></p>
                <p>Disponivel: <strong class="${(monthly.receitas - totalBudgeted) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}">${app.formatCurrencyBRL(monthly.receitas - totalBudgeted)}</strong></p>
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Categoria de despesa</label>
                <select id="finance-budget-categoria" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="">Selecione uma categoria</option>
                    ${categoryOptions}
                </select>
                ${categories.length === 0 ? '<p class="mt-1 text-xs text-amber-600 dark:text-amber-400">Nenhuma categoria de despesa cadastrada.</p>' : ''}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold mb-1">Mes/Ano</label>
                    <input id="finance-budget-mes" type="month" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${app.escapeHtml(monthKey)}">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Valor orcado (R$)</label>
                    <input id="finance-budget-valor" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.numberToMoneyInput(current.valor) : ''}" placeholder="0,00">
                </div>
            </div>
        </div>
    `;

    app.showModal(id ? 'Editar orcamento' : 'Novo orcamento', content, async () => {
        const categoriaId = (document.getElementById('finance-budget-categoria')?.value || '').trim();
        const mes = (document.getElementById('finance-budget-mes')?.value || '').trim();
        const valor = app.moneyInputToNumber(document.getElementById('finance-budget-valor')?.value || '0');

        if (!categoriaId) throw new Error('Selecione uma categoria.');
        if (!mes) throw new Error('Informe o mes do orcamento.');
        if (!Number.isFinite(valor) || valor <= 0) throw new Error('Informe um valor de orcamento maior que zero.');

        const categoria = categories.find((item) => item.id === categoriaId);
        if (!categoria) throw new Error('Categoria invalida.');

        const duplicatedSnap = await app.getFinanceBudgetCollectionRef()
            .where('mes', '==', mes)
            .where('categoriaId', '==', categoriaId)
            .get();
        const duplicated = duplicatedSnap.docs.some((doc) => !(id && doc.id === id));
        if (duplicated) throw new Error('Ja existe orcamento para essa categoria neste mes.');

        const payload = {
            mes,
            categoriaId,
            categoriaNome: categoria.nome || '',
            valor,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const ref = app.getFinanceBudgetCollectionRef();
        if (id) {
            await ref.doc(id).update(payload);
        } else {
            await ref.add({
                ...payload,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: app.currentUserData ? app.currentUserData.id : null
            });
        }

        app.renderContent();
    });
};

app.deleteFinanceBudget = async function(id) {
    if (!confirm('Excluir este orcamento?')) return;
    await app.getFinanceBudgetCollectionRef().doc(id).delete();
    app.renderContent();
};

app.renderOrcamentosFinanceiros = async function(content) {
    const snapshot = await app.getFinanceBudgetCollectionRef().orderBy('mes', 'desc').get();
    const budgets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const despesasSnapshot = await app.getSchoolCollectionRef('despesas').get();
    const despesas = despesasSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const rows = budgets.map((budget) => {
        const monthKey = String(budget.mes || '');
        const gastos = despesas.reduce((acc, item) => {
            if (!String(item.data || '').startsWith(monthKey)) return acc;
            if ((item.categoria || '') !== (budget.categoriaNome || '')) return acc;
            return acc + (Number(item.valor) || 0);
        }, 0);
        const limit = Number(budget.valor) || 0;
        const usage = limit > 0 ? (gastos / limit) * 100 : 0;
        const usageSafe = Math.min(Math.max(usage, 0), 100);
        const statusClass = usage >= 100
            ? 'text-red-600 dark:text-red-400'
            : usage >= 80
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400';
        const barClass = usage >= 100 ? 'bg-red-500' : usage >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

        return `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(app.getMonthLabel(monthKey))}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(budget.categoriaNome || '-')}</td>
                <td class="px-3 py-2 text-sm font-semibold dark:text-slate-100">${app.formatCurrencyBRL(limit)}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.formatCurrencyBRL(gastos)}</td>
                <td class="px-3 py-2">
                    <div class="w-36">
                        <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div class="h-2 ${barClass}" style="width:${usageSafe}%;"></div>
                        </div>
                        <p class="text-xs mt-1 font-semibold ${statusClass}">${usage.toFixed(1)}%</p>
                    </div>
                </td>
                <td class="px-3 py-2">
                    <div class="flex gap-2">
                        <button onclick="app.openFinanceBudgetModal('${budget.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Editar</button>
                        <button onclick="app.deleteFinanceBudget('${budget.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-clipboard-list text-indigo-600"></i> Orcamentos</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Controle de limite mensal por categoria de despesa.</p>
                </div>
                <button onclick="app.openFinanceBudgetModal()" class="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg">Novo orcamento</button>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                            <th class="px-3 py-2">Mes</th>
                            <th class="px-3 py-2">Categoria</th>
                            <th class="px-3 py-2">Orcado</th>
                            <th class="px-3 py-2">Gasto</th>
                            <th class="px-3 py-2">Uso</th>
                            <th class="px-3 py-2">Acoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="6">Nenhum orcamento cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

}
