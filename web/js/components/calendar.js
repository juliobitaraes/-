export function generateCalendarHTML(events, viewMonth = null, viewYear = null) {
    const dt = new Date();
    const month = Number.isInteger(viewMonth) ? viewMonth : dt.getMonth();
    const year = Number.isInteger(viewYear) ? viewYear : dt.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    let html = `
        <div class="mb-2 flex items-center justify-between">
            <button type="button" onclick="app.changeCalendarMonth(-1)" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-label="Mês anterior">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="flex items-center gap-2">
                <button type="button" onclick="app.resetCalendarToToday()" class="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60" aria-label="Ir para o mês atual">Hoje</button>
                <div class="font-bold text-center capitalize dark:text-white">${monthNames[month]} ${year}</div>
            </div>
            <button type="button" onclick="app.changeCalendarMonth(1)" class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600" aria-label="Próximo mês">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="calendar-grid">`;
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    weekdays.forEach(d => html += `<div class="text-center text-xs font-bold text-gray-400 p-1">${d}</div>`);
    for (let i = 0; i < firstDayIndex; i++) html += `<div></div>`;

    const escapeTitle = (text) => String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    for (let i = 1; i <= daysInMonth; i++) {
        const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isToday = i === dt.getDate() && month === dt.getMonth() && year === dt.getFullYear() ? 'today' : '';
        const daysEvents = events.filter(e => e.dataAgendada && e.dataAgendada.startsWith(currentDayStr));
        let eventsHtml = '';
        daysEvents.forEach(e => {
            let color = 'bg-blue-100 text-blue-700';
            if (e.tipo === 'trabalho') color = 'bg-purple-100 text-purple-700';
            if (e.tipo === 'atividade') color = 'bg-green-100 text-green-700';
            if (e.tipo === 'feriado') color = 'bg-red-200 text-red-800 font-bold';
            if (e.tipo === 'recesso') color = 'bg-gray-200 text-gray-700';
            if (e.tipo === 'evento') color = 'bg-yellow-100 text-yellow-800';
            if (e.tipo === 'componente') color = 'bg-teal-100 text-teal-700';
            const emphasis = e.tipo === 'componente' && e.isOngoing ? 'font-bold' : '';
            const payload = encodeURIComponent(JSON.stringify({ titulo: e.titulo, tipo: e.tipo, dataAgendada: e.dataAgendada, turmaNome: e.turmaNome, professorIds: e.professorIds }));
            const safeTitle = escapeTitle(e.titulo || '');
            eventsHtml += `<button type="button" class="calendar-event calendar-event-btn ${color} ${emphasis}" data-event="${payload}" title="${safeTitle}" onclick="app.openCalendarEventModal(this)">${safeTitle}</button>`;
        });
        html += `<div class="calendar-day ${isToday} dark:text-gray-200"><div class="font-bold mb-1">${i}</div>${eventsHtml}</div>`;
    }
    html += `</div>`;
    return html;
}
