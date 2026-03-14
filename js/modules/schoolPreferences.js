import { getActiveSchoolId, setActiveSchoolId, GLOBAL_SUPER_ADMIN_UID } from '../config/school.js';
import { store } from '../store.js';

const SCHOOL_SELECTOR_SUPER_ADMIN_EMAIL = 'julio.bitaraes.mail@gmail.com';

export function extendSchoolPreferences(app) {
    app.isGlobalSuperAdmin = function() {
        return !!store.currentUser && store.currentUser.uid === GLOBAL_SUPER_ADMIN_UID;
    };

    app.canUseSchoolSelector = function() {
        const currentEmail = (store.currentUser && store.currentUser.email)
            ? String(store.currentUser.email).trim().toLowerCase()
            : '';
        return app.isGlobalSuperAdmin() || currentEmail === SCHOOL_SELECTOR_SUPER_ADMIN_EMAIL;
    };

    app.getUserSchoolStorageKey = function(uid) {
        return `activeSchoolId:${uid}`;
    };

    app.getPreferredSchoolId = function(uid) {
        if (!uid) return getActiveSchoolId();
        return localStorage.getItem(app.getUserSchoolStorageKey(uid)) || getActiveSchoolId();
    };

    app.persistSchoolForUser = function(uid, schoolId) {
        if (!uid || !schoolId) return;
        localStorage.setItem(app.getUserSchoolStorageKey(uid), schoolId);
        setActiveSchoolId(schoolId);
    };

    app.getSchoolDisplayName = function(schoolId) {
        const schools = app.availableSchools || [];
        const found = schools.find((s) => s.id === schoolId);
        return (found && (found.nome || found.id)) || schoolId || 'SENATEDU';
    };
}