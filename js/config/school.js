export const DEFAULT_SCHOOL_ID = 'SENATB072';
export const GLOBAL_SUPER_ADMIN_UID = 'xSeQ7zitlkdWfYRW0IBbQoCS0yF3';

export function getActiveSchoolId() {
    return localStorage.getItem('activeSchoolId') || DEFAULT_SCHOOL_ID;
}

export function setActiveSchoolId(schoolId) {
    if (!schoolId || typeof schoolId !== 'string') return;
    localStorage.setItem('activeSchoolId', schoolId);
}
