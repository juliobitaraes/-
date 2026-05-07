import { storage, functions, auth } from '../services/init.js';
import { batch, collection } from '../services/db.js';
import { sendNotificationEmail, sendNotificationEmailV2 } from '../services/email.js';
import { store } from '../store.js';
const db = { batch, collection };
export function extendCalendario(app) {
    app.ensureCalendarView = function() {
        if (!app.calendarView || typeof app.calendarView.month !== 'number' || typeof app.calendarView.year !== 'number') {
            const dt = new Date();
            app.calendarView = { month: dt.getMonth(), year: dt.getFullYear() };
        }
        return app.calendarView;
    };

    app.changeCalendarMonth = function(delta) {
        const view = app.ensureCalendarView();
        const next = new Date(view.year, view.month + delta, 1);
        app.calendarView = { month: next.getMonth(), year: next.getFullYear() };
        if (app.currentView === 'dashboard') {
            if (!app.renderCalendarOnly || !app.renderCalendarOnly()) app.renderContent();
        }
    };

    app.resetCalendarToToday = function() {
        const dt = new Date();
        app.calendarView = { month: dt.getMonth(), year: dt.getFullYear() };
        if (app.currentView === 'dashboard') {
            if (!app.renderCalendarOnly || !app.renderCalendarOnly()) app.renderContent();
        }
    };

    app.renderCalendarOnly = function() {
        if (app.currentView !== 'dashboard') return false;
        const target = document.getElementById('dashboard-calendar-body');
        if (!target) return false;
        const view = app.ensureCalendarView();
        const base = app._calendarBaseCache;
        if (base && base.componentesRelevantes && base.turmasMap) {
            const componentesEventos = app.buildComponentRangeEvents(
                base.componentesRelevantes,
                base.turmasMap,
                view.month,
                view.year,
                base.feriadosSet || new Set()
            );
            const events = [...(base.provasRelevantes || []), ...(base.eventosAdminNormalizados || []), ...componentesEventos];
            events.sort((a, b) => new Date(a.dataAgendada || 0) - new Date(b.dataAgendada || 0));
            app._calendarEventsCache = events;
            target.innerHTML = app.generateCalendarHTML(events, view.month, view.year);
        } else {
            const events = Array.isArray(app._calendarEventsCache) ? app._calendarEventsCache : [];
            target.innerHTML = app.generateCalendarHTML(events, view.month, view.year);
        }
        return true;
    };

    app.buildComponentRangeEvents = function(componentes, turmasMap, viewMonth, viewYear, feriadosSet = new Set()) {
        const monthStart = new Date(viewYear, viewMonth, 1);
        const monthEnd = new Date(viewYear, viewMonth + 1, 0);
        const events = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        (componentes || []).forEach((c) => {
            if (!c.dataInicio || !c.dataFim) return;
            const start = app.parseDateOnly(c.dataInicio);
            const end = app.parseDateOnly(c.dataFim);
            if (!start || !end || end < start) return;

            const startDay = new Date(start);
            startDay.setHours(0, 0, 0, 0);
            const endDay = new Date(end);
            endDay.setHours(0, 0, 0, 0);
            const isOngoing = today >= startDay && today <= endDay;

            const rangeStart = start > monthStart ? start : monthStart;
            const rangeEnd = end < monthEnd ? end : monthEnd;
            if (rangeEnd < monthStart || rangeStart > monthEnd) return;

            for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (feriadosSet.has(dateStr)) continue;
                events.push({
                    titulo: c.nome,
                    tipo: 'componente',
                    dataAgendada: dateStr,
                    turmaNome: turmasMap.get(c.turmaId) || 'Turma',
                    isOngoing,
                    componenteId: c.id,
                    professorIds: Array.isArray(c.professores)
                        ? c.professores
                        : (Array.isArray(c.professorIds)
                            ? c.professorIds
                            : (c.professorId ? [c.professorId] : (c.professorUid ? [c.professorUid] : [])))
                });
            }
        });

        return events;
    };

    app.generateCalendarHTML = function(events, viewMonth = null, viewYear = null) {
        const dt = new Date();
        const month = Number.isInteger(viewMonth) ? viewMonth : dt.getMonth();
        const year = Number.isInteger(viewYear) ? viewYear : dt.getFullYear();
        const daysInMonth = new Date(year, month + 1, 0).getDate(); const firstDayIndex = new Date(year, month, 1).getDay();
        const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
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
        const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']; weekdays.forEach(d => html += `<div class="text-center text-xs font-bold text-gray-400 p-1">${d}</div>`);
        for(let i=0;i<firstDayIndex;i++) html += `<div></div>`;
        for(let i=1;i<=daysInMonth;i++) {
            const currentDayStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`; const isToday = i === dt.getDate() && month === dt.getMonth() && year === dt.getFullYear() ? 'today' : '';
            const daysEvents = events.filter(e => e.dataAgendada && e.dataAgendada.startsWith(currentDayStr));
            let eventsHtml = '';
            daysEvents.forEach(e => {
                let color = 'bg-blue-100 text-blue-700'; if (e.tipo === 'trabalho') color = 'bg-purple-100 text-purple-700'; if (e.tipo === 'atividade') color = 'bg-green-100 text-green-700'; if (e.tipo === 'feriado') color = 'bg-green-200 text-green-800 font-bold'; if (e.tipo === 'recesso') color = 'bg-gray-200 text-gray-700'; if (e.tipo === 'evento') color = 'bg-yellow-100 text-yellow-800'; if (e.tipo === 'componente') color = 'bg-teal-100 text-teal-700';
                const emphasis = e.tipo === 'componente' && e.isOngoing ? 'font-bold' : '';
                const sombra = e.tipo === 'feriado' ? ' style="box-shadow: 0 2px 4px rgba(34, 197, 94, 0.4);"' : '';
                const payload = encodeURIComponent(JSON.stringify({ titulo: e.titulo, tipo: e.tipo, dataAgendada: e.dataAgendada, turmaNome: e.turmaNome, professorIds: e.professorIds }));
                const safeTitle = app.escapeHtml(e.titulo || '');
                eventsHtml += `<button type="button" class="calendar-event calendar-event-btn ${color} ${emphasis}" data-event="${payload}" title="${safeTitle}"${sombra}>${safeTitle}</button>`;
            });
            html += `<div class="calendar-day ${isToday} dark:text-gray-200"><div class="font-bold mb-1">${i}</div>${eventsHtml}</div>`;
        }
        html += `</div>`; return html;
    };

}