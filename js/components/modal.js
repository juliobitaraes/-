export function createModalComponent(showToast) {
    return {
        showModal(title, content, onConfirm, options = {}) {
            const modalId = 'm-' + Date.now();
            const hasSecondary = options && typeof options.onSecondary === 'function' && options.secondaryLabel;
            const secondaryClass = options && options.secondaryClass
                ? options.secondaryClass
                : 'px-4 py-2 bg-emerald-600 text-white rounded-lg';
            const confirmLabel = options && options.confirmLabel ? options.confirmLabel : 'Salvar';
            const confirmClass = options && options.confirmClass
                ? options.confirmClass
                : 'px-4 py-2 bg-blue-700 text-white rounded-lg';
            const div = document.createElement('div');
            div.id = modalId;
            div.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 fade-in';
            div.innerHTML = `
                <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border dark:border-slate-700">
                    <div class="p-6 border-b dark:border-slate-700 flex justify-between items-center">
                        <h3 class="font-bold text-lg dark:text-white">${title}</h3>
                        <button onclick="document.getElementById('${modalId}').remove()" class="text-gray-500 dark:text-gray-400"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="p-6">${content}</div>
                    <div class="p-6 border-t dark:border-slate-700 flex justify-end gap-3">
                        <button onclick="document.getElementById('${modalId}').remove()" class="px-4 py-2 text-gray-600 dark:text-gray-300">Cancelar</button>
                        ${hasSecondary ? `<button id="btn-s-${modalId}" class="${secondaryClass}">${options.secondaryLabel}</button>` : ''}
                        <button id="btn-c-${modalId}" class="${confirmClass}">${confirmLabel}</button>
                    </div>
                </div>`;
            document.body.appendChild(div);
            document.getElementById(`btn-c-${modalId}`).onclick = async () => {
                try {
                    await onConfirm();
                    const modalEl = document.getElementById(modalId);
                    if (modalEl) modalEl.remove();
                    showToast('Sucesso!');
                } catch (e) {
                    alert(e.message);
                }
            };
            if (hasSecondary) {
                document.getElementById(`btn-s-${modalId}`).onclick = async () => {
                    try {
                        await options.onSecondary();
                        const modalEl = document.getElementById(modalId);
                        if (modalEl) modalEl.remove();
                        showToast('Sucesso!');
                    } catch (e) {
                        alert(e.message);
                    }
                };
            }
        },

        showToast(m, type = 'success') {
            const t = document.getElementById('toast-container');
            const e = document.createElement('div');
            const color = type === 'success' ? 'bg-green-600' : (type === 'info' ? 'bg-blue-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600'));
            e.className = `${color} text-white px-6 py-3 rounded shadow-lg mb-2 fade-in`;
            e.innerText = m;
            t.appendChild(e);
            setTimeout(() => e.remove(), 3000);
        }
    };
}
