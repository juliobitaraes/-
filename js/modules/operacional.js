export function extendOperacional(app) {
app.openEstoqueItemModal = async function(id = null) {
    let current = null;
    if (id) {
        const doc = await app.getSchoolCollectionRef('estoque').doc(id).get();
        if (doc.exists) current = { id: doc.id, ...doc.data() };
    }

    const content = `
        <div class="space-y-4">
            <div>
                <label class="block text-sm font-semibold mb-1">Item</label>
                <input id="estoque-nome" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.nome || '') : ''}" placeholder="Nome do item">
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label class="block text-sm font-semibold mb-1">Categoria</label>
                    <input id="estoque-categoria" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.categoria || '') : ''}" placeholder="Ex: Limpeza, Escritório">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Unidade</label>
                    <input id="estoque-unidade" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.escapeHtml(current.unidade || 'un') : 'un'}" placeholder="un, cx, pct">
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                    <label class="block text-sm font-semibold mb-1">Quantidade</label>
                    <input id="estoque-quantidade" type="number" min="0" step="1" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current && Number.isFinite(Number(current.quantidade)) ? Number(current.quantidade) : 0}">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Estoque mínimo</label>
                    <input id="estoque-minimo" type="number" min="0" step="1" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current && Number.isFinite(Number(current.estoqueMinimo)) ? Number(current.estoqueMinimo) : 0}">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Custo unitário (R$)</label>
                    <input id="estoque-custo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" value="${current ? app.numberToMoneyInput(current.custoUnitario) : ''}" placeholder="0,00">
                </div>
            </div>
        </div>
    `;

    app.showModal(id ? 'Editar item de estoque' : 'Novo item de estoque', content, async () => {
        const nome = document.getElementById('estoque-nome').value.trim();
        const categoria = document.getElementById('estoque-categoria').value.trim();
        const unidade = document.getElementById('estoque-unidade').value.trim() || 'un';
        const quantidade = Number(document.getElementById('estoque-quantidade').value);
        const estoqueMinimo = Number(document.getElementById('estoque-minimo').value);
        const custoUnitario = app.moneyInputToNumber(document.getElementById('estoque-custo').value);

        if (!nome) throw new Error('Informe o nome do item.');
        if (!Number.isFinite(quantidade) || quantidade < 0) throw new Error('Quantidade inválida.');
        if (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0) throw new Error('Estoque mínimo inválido.');

        const payload = {
            nome,
            categoria,
            unidade,
            quantidade,
            estoqueMinimo,
            custoUnitario,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: app.currentUserData ? app.currentUserData.id : null
        };

        const ref = app.getSchoolCollectionRef('estoque');
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

app.deleteEstoqueItem = async function(id) {
    if (!confirm('Excluir este item de estoque?')) return;
    await app.getSchoolCollectionRef('estoque').doc(id).delete();
    app.renderContent();
};

app.openEstoqueMovimentoModal = async function(itemId) {
    const docSnap = await app.getSchoolCollectionRef('estoque').doc(itemId).get();
    if (!docSnap.exists) return;
    const item = docSnap.data();
    const currentQty = Number(item.quantidade) || 0;
    const itemNome = app.escapeHtml(item.nome || 'Item');

    const content = `
        <div class="space-y-4">
            <p class="text-sm text-slate-600 dark:text-slate-400">Item: <strong>${itemNome}</strong> — Estoque atual: <strong>${currentQty} ${app.escapeHtml(item.unidade || 'un')}</strong></p>
            <div>
                <label class="block text-sm font-semibold mb-1">Tipo</label>
                <select id="mov-tipo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Quantidade</label>
                <input id="mov-quantidade" type="number" min="1" step="1" value="1" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Data</label>
                <input id="mov-data" type="date" value="${new Date().toISOString().slice(0, 10)}" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white">
            </div>
            <div>
                <label class="block text-sm font-semibold mb-1">Motivo / Observação</label>
                <input id="mov-motivo" class="w-full border rounded px-3 py-2 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: Compra, Uso em aula, Perda">
            </div>
        </div>
    `;

    app.showModal('Registrar movimentação', content, async () => {
        const tipo = document.getElementById('mov-tipo').value;
        const quantidade = Number(document.getElementById('mov-quantidade').value);
        const data = document.getElementById('mov-data').value;
        const motivo = document.getElementById('mov-motivo').value.trim();

        if (!data) throw new Error('Informe a data.');
        if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida.');

        const novaQty = tipo === 'entrada' ? currentQty + quantidade : currentQty - quantidade;
        if (novaQty < 0) throw new Error('Quantidade insuficiente em estoque para saída.');

        const schoolId = app.activeSchoolId;
        const batch = firebase.firestore().batch();

        const movRef = app.getSchoolCollectionRef('estoque_movimentos').doc();
        batch.set(movRef, {
            itemId,
            tipo,
            quantidade,
            data,
            motivo,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: app.currentUserData ? app.currentUserData.id : null
        });

        const itemRef = app.getSchoolCollectionRef('estoque').doc(itemId);
        batch.update(itemRef, {
            quantidade: novaQty,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();
        app.renderContent();
    });
};

app.verMovimentosEstoque = async function(itemId) {
    const [docSnap, snapshot] = await Promise.all([
        app.getSchoolCollectionRef('estoque').doc(itemId).get(),
        app.getSchoolCollectionRef('estoque_movimentos').where('itemId', '==', itemId).orderBy('data', 'desc').get()
    ]);
    const itemNome = docSnap.exists ? app.escapeHtml(docSnap.data().nome || 'Item') : 'Item';
    const movimentos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const rows = movimentos.map(mov => {
        const cor = mov.tipo === 'entrada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
        const sinal = mov.tipo === 'entrada' ? '+' : '−';
        const tipoLabel = mov.tipo === 'entrada' ? 'Entrada' : 'Saída';
        return `<tr class="border-b border-slate-100 dark:border-slate-700">
            <td class="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">${app.escapeHtml(mov.data || '-')}</td>
            <td class="px-3 py-2 text-sm font-semibold ${cor}">${tipoLabel}</td>
            <td class="px-3 py-2 text-sm font-mono font-bold ${cor}">${sinal}${mov.quantidade}</td>
            <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(mov.motivo || '-')}</td>
        </tr>`;
    }).join('');

    const html = `<div class="overflow-x-auto">
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">${movimentos.length} movimentação(ões) registrada(s)</p>
        ${movimentos.length === 0 ? '<p class="italic text-slate-500 text-sm">Nenhuma movimentação registrada ainda.</p>' : `
        <table class="min-w-full">
            <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                <tr>
                    <th class="px-3 py-2">Data</th>
                    <th class="px-3 py-2">Tipo</th>
                    <th class="px-3 py-2">Qtd</th>
                    <th class="px-3 py-2">Motivo</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`}
    </div>`;

    app.showModal(`Histórico: ${itemNome}`, html, null);
};

app.renderFinanceSummaryWidget = async function() {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const startDate = `${year}-${month}-01`;
        const endDate = `${year}-${month}-31`;

        const [snapReceitas, snapDespesas] = await Promise.all([
            app.getSchoolCollectionRef('receitas').where('data', '>=', startDate).where('data', '<=', endDate).get(),
            app.getSchoolCollectionRef('despesas').where('data', '>=', startDate).where('data', '<=', endDate).get()
        ]);
        const totalReceitas = snapReceitas.docs.reduce((acc, d) => acc + (Number(d.data().valor) || 0), 0);
        const totalDespesas = snapDespesas.docs.reduce((acc, d) => acc + (Number(d.data().valor) || 0), 0);
        const saldo = totalReceitas - totalDespesas;
        const mesFmt = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const saldoClass = saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
        const saldoIcon = saldo >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

        return `<div class="mb-6">
            <h2 class="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-3">
                <i class="fas fa-chart-pie text-indigo-500"></i> Resumo Financeiro &mdash; ${mesFmt}
            </h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <div class="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                        <i class="fas fa-arrow-circle-up text-emerald-600 text-lg"></i>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Receitas</p>
                        <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400">${app.formatCurrencyBRL(totalReceitas)}</p>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <div class="w-11 h-11 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                        <i class="fas fa-arrow-circle-down text-rose-600 text-lg"></i>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Despesas</p>
                        <p class="text-lg font-bold text-rose-600 dark:text-rose-400">${app.formatCurrencyBRL(totalDespesas)}</p>
                    </div>
                </div>
                <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-4">
                    <div class="w-11 h-11 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                        <i class="fas ${saldoIcon} text-indigo-600 text-lg"></i>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Saldo do Mês</p>
                        <p class="text-lg font-bold ${saldoClass}">${app.formatCurrencyBRL(saldo)}</p>
                    </div>
                </div>
            </div>
        </div>`;
    } catch (e) {
        return '';
    }
};

app.renderEstoqueEscolar = async function(content) {
    const snapshot = await app.getSchoolCollectionRef('estoque').orderBy('nome').get();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const totalItens = items.length;
    const totalQuantidade = items.reduce((acc, item) => acc + (Number(item.quantidade) || 0), 0);
    const itensBaixos = items.filter((item) => (Number(item.quantidade) || 0) <= (Number(item.estoqueMinimo) || 0)).length;

    const rows = items.map((item) => {
        const quantidade = Number(item.quantidade) || 0;
        const minimo = Number(item.estoqueMinimo) || 0;
        const custo = Number(item.custoUnitario) || 0;
        const total = quantidade * custo;
        const low = quantidade <= minimo;
        return `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="px-3 py-2 text-sm font-medium dark:text-slate-100">${app.escapeHtml(item.nome || '-')}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.escapeHtml(item.categoria || '-')}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${quantidade} ${app.escapeHtml(item.unidade || 'un')}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${minimo}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.formatCurrencyBRL(custo)}</td>
                <td class="px-3 py-2 text-sm dark:text-slate-200">${app.formatCurrencyBRL(total)}</td>
                <td class="px-3 py-2 text-xs font-semibold ${low ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}">${low ? 'Abaixo do mínimo' : 'OK'}</td>
                <td class="px-3 py-2">
                    <div class="flex flex-wrap gap-1">
                        <button onclick="app.openEstoqueMovimentoModal('${item.id}')" class="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200">Movimentar</button>
                        <button onclick="app.verMovimentosEstoque('${item.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Histórico</button>
                        <button onclick="app.openEstoqueItemModal('${item.id}')" class="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">Editar</button>
                        <button onclick="app.deleteEstoqueItem('${item.id}')" class="px-2 py-1 text-xs rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 hover:bg-red-200">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-boxes-stacked text-cyan-600"></i> Estoque</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">Itens: <span class="font-semibold">${totalItens}</span> • Quantidade total: <span class="font-semibold">${totalQuantidade}</span> • Abaixo do mínimo: <span class="font-semibold ${itensBaixos > 0 ? 'text-red-600 dark:text-red-400' : ''}">${itensBaixos}</span></p>
                </div>
                <button onclick="app.openEstoqueItemModal()" class="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg">Novo item</button>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                            <th class="px-3 py-2">Item</th>
                            <th class="px-3 py-2">Categoria</th>
                            <th class="px-3 py-2">Quantidade</th>
                            <th class="px-3 py-2">Mínimo</th>
                            <th class="px-3 py-2">Custo Unit.</th>
                            <th class="px-3 py-2">Valor Total</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="8">Nenhum item de estoque cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

// ─── Fornecedores ────────────────────────────────────────────────────────────

app.renderFornecedores = async function(content) {
    const snap = await app.getFornecedorCollectionRef().orderBy('nome').get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const rows = items.map((f) => `
        <tr class="border-b border-slate-100 dark:border-slate-700">
            <td class="px-3 py-1.5 text-sm font-medium dark:text-slate-100">${app.escapeHtml(f.nome || '-')}</td>
            <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(f.cnpj || '-')}</td>
            <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(f.contato || '-')}</td>
            <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(f.email || '-')}</td>
            <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(f.endereco || '-')}</td>
            <td class="px-3 py-1.5">
                <span class="px-2 py-0.5 text-xs rounded-full font-semibold ${f.ativo !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}">${f.ativo !== false ? 'Ativo' : 'Inativo'}</span>
            </td>
            <td class="px-3 py-1.5">
                <div class="flex gap-1">
                    <button onclick="app.openFornecedorModal('${f.id}')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="Editar"><i class="fas fa-pen text-xs"></i></button>
                    <button onclick="app.deleteFornecedor('${f.id}')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Excluir"><i class="fas fa-trash text-xs"></i></button>
                </div>
            </td>
        </tr>
    `).join('');

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-truck text-orange-600"></i> Fornecedores</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${items.length} fornecedor(es) cadastrado(s)</p>
                </div>
                <button onclick="app.openFornecedorModal()" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg">Novo Fornecedor</button>
            </div>
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                            <th class="px-3 py-2">Nome</th>
                            <th class="px-3 py-2">CNPJ / CPF</th>
                            <th class="px-3 py-2">Telefone / WhatsApp</th>
                            <th class="px-3 py-2">E-mail</th>
                            <th class="px-3 py-2">Endereço</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="7">Nenhum fornecedor cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

app.openFornecedorModal = async function(id) {
    let data = {};
    if (id) {
        const doc = await app.getFornecedorCollectionRef().doc(id).get();
        if (doc.exists) data = doc.data();
    }
    document.getElementById('fornecedor-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
    modal.id = 'fornecedor-modal';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-lg dark:text-white">${id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
                <button onclick="document.getElementById('fornecedor-modal').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><i class="fas fa-times"></i></button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nome *</label>
                    <input id="forn-nome" value="${app.escapeHtml(data.nome || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Razão social ou nome fantasia">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">CNPJ / CPF</label>
                    <input id="forn-cnpj" value="${app.escapeHtml(data.cnpj || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="00.000.000/0001-00">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Telefone / WhatsApp</label>
                    <input id="forn-contato" value="${app.escapeHtml(data.contato || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="(31) 99999-9999">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">E-mail</label>
                    <input id="forn-email" type="email" value="${app.escapeHtml(data.email || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="contato@empresa.com">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Endereço</label>
                    <input id="forn-endereco" value="${app.escapeHtml(data.endereco || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Rua, número, cidade">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Observações</label>
                    <textarea id="forn-obs" rows="2" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">${app.escapeHtml(data.observacoes || '')}</textarea>
                </div>
                <div class="flex items-center gap-2">
                    <input id="forn-ativo" type="checkbox" class="rounded border-slate-300 text-orange-600" ${data.ativo !== false ? 'checked' : ''}>
                    <label for="forn-ativo" class="text-sm text-slate-700 dark:text-slate-300">Fornecedor ativo</label>
                </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button onclick="document.getElementById('fornecedor-modal').remove()" class="px-4 py-2 rounded-lg border dark:border-slate-600 dark:text-slate-200">Cancelar</button>
                <button onclick="app.saveFornecedor('${id || ''}')" class="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

app.saveFornecedor = async function(id) {
    const nome = (document.getElementById('forn-nome')?.value || '').trim();
    if (!nome) { app.showToast('Nome do fornecedor é obrigatório.', 'error'); return; }
    const payload = {
        nome,
        cnpj: (document.getElementById('forn-cnpj')?.value || '').trim(),
        contato: (document.getElementById('forn-contato')?.value || '').trim(),
        email: (document.getElementById('forn-email')?.value || '').trim(),
        endereco: (document.getElementById('forn-endereco')?.value || '').trim(),
        observacoes: (document.getElementById('forn-obs')?.value || '').trim(),
        ativo: document.getElementById('forn-ativo')?.checked !== false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!id) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    try {
        if (id) { await app.getFornecedorCollectionRef().doc(id).update(payload); }
        else { await app.getFornecedorCollectionRef().add(payload); }
        document.getElementById('fornecedor-modal')?.remove();
        app.showToast(id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.', 'success');
        await app.renderContent();
    } catch (e) { app.showToast('Erro ao salvar: ' + e.message, 'error'); }
};

app.deleteFornecedor = async function(id) {
    if (!confirm('Excluir este fornecedor? Esta ação não pode ser desfeita.')) return;
    const prodSnap = await app.getProdutoCollectionRef().where('fornecedorId', '==', id).limit(1).get();
    if (!prodSnap.empty) { app.showToast('Não é possível excluir: há produtos vinculados a este fornecedor.', 'error'); return; }
    await app.getFornecedorCollectionRef().doc(id).delete();
    app.showToast('Fornecedor excluído.', 'success');
    await app.renderContent();
};

// ─── Produtos ────────────────────────────────────────────────────────────────

app.renderProdutos = async function(content) {
    const [prodSnap, fornSnap] = await Promise.all([
        app.getProdutoCollectionRef().orderBy('nome').get(),
        app.getFornecedorCollectionRef().orderBy('nome').get()
    ]);
    const items = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fornecedores = fornSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const fornMap = Object.fromEntries(fornecedores.map((f) => [f.id, f.nome]));
    const ativos = fornecedores.filter((f) => f.ativo !== false);

    const rows = items.map((p) => {
        const preco = Number(p.precoUnitario) || 0;
        return `
            <tr class="border-b border-slate-100 dark:border-slate-700">
                <td class="px-3 py-1.5 text-sm font-medium dark:text-slate-100">${app.escapeHtml(p.nome || '-')}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(p.codigo || '-')}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(fornMap[p.fornecedorId] || p.fornecedorNome || '-')}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(p.categoria || '-')}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.escapeHtml(p.unidade || 'un')}</td>
                <td class="px-3 py-1.5 text-sm dark:text-slate-200">${app.formatCurrencyBRL(preco)}</td>
                <td class="px-3 py-1.5">
                    <span class="px-2 py-0.5 text-xs rounded-full font-semibold ${p.ativo !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}">${p.ativo !== false ? 'Ativo' : 'Inativo'}</span>
                </td>
                <td class="px-3 py-1.5">
                    <div class="flex gap-1">
                        <button onclick="app.openProdutoModal('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="Editar"><i class="fas fa-pen text-xs"></i></button>
                        <button onclick="app.deleteProduto('${p.id}')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Excluir"><i class="fas fa-trash text-xs"></i></button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    const alertFornecedor = ativos.length === 0 ? `
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
            <i class="fas fa-triangle-exclamation mr-2"></i>Nenhum fornecedor ativo. <button onclick="app.currentView='fornecedores';app.renderContent()" class="underline font-medium">Cadastre um fornecedor</button> antes de adicionar produtos.
        </div>` : '';

    content.innerHTML = `
        <div class="space-y-4">
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 class="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><i class="fas fa-box-open text-violet-600"></i> Produtos</h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${items.length} produto(s) cadastrado(s)</p>
                </div>
                <button onclick="app.openProdutoModal()" class="px-4 py-2 bg-violet-700 hover:bg-violet-800 text-white rounded-lg" ${ativos.length === 0 ? 'disabled title="Cadastre um fornecedor primeiro"' : ''}>Novo Produto</button>
            </div>
            ${alertFornecedor}
            <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table class="min-w-full">
                    <thead class="bg-slate-50 dark:bg-slate-700/40 border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500 dark:text-slate-300">
                        <tr>
                            <th class="px-3 py-2">Produto</th>
                            <th class="px-3 py-2">Código</th>
                            <th class="px-3 py-2">Fornecedor</th>
                            <th class="px-3 py-2">Categoria</th>
                            <th class="px-3 py-2">Unidade</th>
                            <th class="px-3 py-2">Preço Unit.</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td class="px-3 py-4 text-sm text-slate-500 dark:text-slate-400" colspan="8">Nenhum produto cadastrado.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

app.openProdutoModal = async function(id) {
    let data = {};
    if (id) {
        const doc = await app.getProdutoCollectionRef().doc(id).get();
        if (doc.exists) data = doc.data();
    }
    const fornSnap = await app.getFornecedorCollectionRef().orderBy('nome').get();
    const fornecedores = fornSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.ativo !== false);
    const fornOptions = fornecedores.map((f) => `<option value="${app.escapeHtml(f.id)}" ${data.fornecedorId === f.id ? 'selected' : ''}>${app.escapeHtml(f.nome)}</option>`).join('');

    document.getElementById('produto-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60';
    modal.id = 'produto-modal';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-screen overflow-y-auto">
            <div class="flex items-center justify-between">
                <h3 class="font-bold text-lg dark:text-white">${id ? 'Editar Produto' : 'Novo Produto'}</h3>
                <button onclick="document.getElementById('produto-modal').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><i class="fas fa-times"></i></button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Fornecedor *</label>
                    <select id="prod-fornecedor" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        <option value="">Selecione um fornecedor…</option>
                        ${fornOptions}
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nome do Produto *</label>
                    <input id="prod-nome" value="${app.escapeHtml(data.nome || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Nome ou descrição do produto">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Código / SKU</label>
                    <input id="prod-codigo" value="${app.escapeHtml(data.codigo || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: SKU-001">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Categoria</label>
                    <input id="prod-categoria" value="${app.escapeHtml(data.categoria || '')}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="Ex: Material escolar">
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Unidade de Medida</label>
                    <select id="prod-unidade" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                        ${['un','kg','g','l','ml','cx','pct','m','m²','hr'].map((u) => `<option value="${u}" ${(data.unidade || 'un') === u ? 'selected' : ''}>${u}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Preço Unitário (R$)</label>
                    <input id="prod-preco" type="number" min="0" step="0.01" value="${Number(data.precoUnitario) || 0}" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                </div>
                <div class="md:col-span-2">
                    <label class="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Observações</label>
                    <textarea id="prod-obs" rows="2" class="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white">${app.escapeHtml(data.observacoes || '')}</textarea>
                </div>
                <div class="flex items-center gap-2">
                    <input id="prod-ativo" type="checkbox" class="rounded border-slate-300 text-violet-600" ${data.ativo !== false ? 'checked' : ''}>
                    <label for="prod-ativo" class="text-sm text-slate-700 dark:text-slate-300">Produto ativo</label>
                </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button onclick="document.getElementById('produto-modal').remove()" class="px-4 py-2 rounded-lg border dark:border-slate-600 dark:text-slate-200">Cancelar</button>
                <button onclick="app.saveProduto('${id || ''}')" class="px-4 py-2 rounded-lg bg-violet-700 hover:bg-violet-800 text-white">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

app.saveProduto = async function(id) {
    const fornecedorId = document.getElementById('prod-fornecedor')?.value || '';
    const nome = (document.getElementById('prod-nome')?.value || '').trim();
    if (!fornecedorId) { app.showToast('Selecione um fornecedor.', 'error'); return; }
    if (!nome) { app.showToast('Nome do produto é obrigatório.', 'error'); return; }
    const fornDoc = await app.getFornecedorCollectionRef().doc(fornecedorId).get();
    const fornecedorNome = fornDoc.exists ? (fornDoc.data().nome || '') : '';
    const payload = {
        nome,
        fornecedorId,
        fornecedorNome,
        codigo: (document.getElementById('prod-codigo')?.value || '').trim(),
        categoria: (document.getElementById('prod-categoria')?.value || '').trim(),
        unidade: document.getElementById('prod-unidade')?.value || 'un',
        precoUnitario: Number(document.getElementById('prod-preco')?.value) || 0,
        observacoes: (document.getElementById('prod-obs')?.value || '').trim(),
        ativo: document.getElementById('prod-ativo')?.checked !== false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (!id) payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    try {
        if (id) { await app.getProdutoCollectionRef().doc(id).update(payload); }
        else { await app.getProdutoCollectionRef().add(payload); }
        document.getElementById('produto-modal')?.remove();
        app.showToast(id ? 'Produto atualizado.' : 'Produto cadastrado.', 'success');
        await app.renderContent();
    } catch (e) { app.showToast('Erro ao salvar: ' + e.message, 'error'); }
};

app.deleteProduto = async function(id) {
    if (!confirm('Excluir este produto? Esta ação não pode ser desfeita.')) return;
    await app.getProdutoCollectionRef().doc(id).delete();
    app.showToast('Produto excluído.', 'success');
    await app.renderContent();
};
}
