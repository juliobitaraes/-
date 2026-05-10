import { store } from '../store.js';
import { getActiveSchoolId, setActiveSchoolId } from '../config/school.js';

export function extendBootstrap(app) {
    app.init = function() {
        store.activeSchoolId = getActiveSchoolId();
        setActiveSchoolId(store.activeSchoolId);
        app.applyTheme();
        app.applySidebarState();
        if (!app._mobileResizeInit) {
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 768) app.setMobileMenuState(false);
                app.applySidebarState();
                if (typeof app.syncMobileViewportInsets === 'function') app.syncMobileViewportInsets();
            });
            window.addEventListener('orientationchange', () => {
                if (typeof app.syncMobileViewportInsets === 'function') {
                    setTimeout(() => app.syncMobileViewportInsets(), 140);
                }
            });
            app._mobileResizeInit = true;
        }
        if (!app._mobileA11yInit) {
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && window.innerWidth < 768) app.closeSidebarMobile();
            });
            app._mobileA11yInit = true;
        }
        if (!app._calendarClickInit) {
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.calendar-event-btn');
                if (btn) app.openCalendarEventModal(btn);
            });
            app._calendarClickInit = true;
        }
        app.monitorAuth();
    };
}