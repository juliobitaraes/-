import { store } from '../store.js';

const LARGE_DESKTOP_MIN_WIDTH = 1920;

export function extendSidebarState(app) {
    app.toggleSidebar = function() {
        if (app.isLargeDesktopSidebarLocked()) return;
        store.isSidebarCollapsed = !store.isSidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
        app.applySidebarState();
    };

    app.isLargeDesktopSidebarLocked = function() {
        // Browsers don't expose monitor inches, so width is used as a practical proxy.
        return window.innerWidth >= LARGE_DESKTOP_MIN_WIDTH;
    };

    app.applySidebarState = function() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.getElementById('main-content');
        if (!sidebar) return;
        if (window.innerWidth < 768) {
            sidebar.classList.remove('sidebar-collapsed');
            return;
        }
        if (app.isLargeDesktopSidebarLocked()) {
            store.isSidebarCollapsed = false;
            localStorage.setItem('sidebarCollapsed', 'false');
            sidebar.classList.remove('sidebar-collapsed');
            if (mainContent) mainContent.classList.replace('md:ml-20', 'md:ml-64');
            return;
        }
        if (store.isSidebarCollapsed) {
            sidebar.classList.add('sidebar-collapsed');
            if (mainContent) mainContent.classList.replace('md:ml-64', 'md:ml-20');
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            if (mainContent) mainContent.classList.replace('md:ml-20', 'md:ml-64');
        }
    };

    app.handleOutsideClick = function(e) {
        if (window.innerWidth < 768 || app.isLargeDesktopSidebarLocked()) return;
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.querySelector('.sidebar-toggle-btn');
        if (!sidebar) return;
        if (sidebar.contains(e.target) || (toggleBtn && toggleBtn.contains(e.target))) return;
        if (!store.isSidebarCollapsed) {
            store.isSidebarCollapsed = true;
            localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
            app.applySidebarState();
        }
    };

    app.handleSidebarTap = function(e) {
        if (window.innerWidth < 768 || app.isLargeDesktopSidebarLocked()) return;
        if (e.target.closest('button, a, input, select, textarea, [role="button"]')) return;
        store.isSidebarCollapsed = !store.isSidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', store.isSidebarCollapsed);
        app.applySidebarState();
    };
}