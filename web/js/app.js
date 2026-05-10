/**
 * SENATEDU - Sistema de Gestão Escolar
 * App principal - orquestra módulos e gerencia estado
 */
import { store } from './store.js';
import { setActiveSchoolId } from './config/school.js';
import { sendWelcomeEmail, sendPasswordReset } from './services/email.js';
import { createModalComponent } from './components/modal.js';
import { generateCalendarHTML } from './components/calendar.js';
import { capitalize, escapeHtml, formatDateOnly, parseDateOnly, toInputDate, normalizeBonificacaoStatus, getPresencaStatusInfo } from './utils/helpers.js';
import { createAuthMethods } from './auth.js';
import { createPermissions } from './services/permissions.js';
import { extendApp, validateExtendedAppContract } from './app-impl.js?v=20260313-dashboard-grade-filter-1';

const modal = createModalComponent(() => {});
const showToast = (m, t) => modal.showToast(m, t);
const showModal = (title, content, onConfirm, options = {}) => modal.showModal(title, content, onConfirm, options);
const app = {
    get currentUser() { return store.currentUser; },
    get currentUserData() { return store.currentUserData; },
    get activeSchoolId() { return store.activeSchoolId; },
    set activeSchoolId(v) {
        store.activeSchoolId = v;
        setActiveSchoolId(v);
    },
    get availableSchools() { return store.availableSchools || []; },
    set availableSchools(v) { store.availableSchools = Array.isArray(v) ? v : []; },
    get currentView() { return store.currentView; },
    set currentView(v) { store.currentView = v; },
    get currentMaterialType() { return store.currentMaterialType; },
    set currentMaterialType(v) { store.currentMaterialType = v; },
    get tempQuestoes() { return store.tempQuestoes; },
    set tempQuestoes(v) { store.tempQuestoes = v; },
    get currentTurmaFilter() { return store.currentTurmaFilter; },
    set currentTurmaFilter(v) { store.currentTurmaFilter = v; },
    get currentComponenteFilter() { return store.currentComponenteFilter; },
    set currentComponenteFilter(v) { store.currentComponenteFilter = v; },
    get activeExamData() { return store.activeExamData; },
    set activeExamData(v) { store.activeExamData = v; },
    get activeExamAnswers() { return store.activeExamAnswers; },
    set activeExamAnswers(v) { store.activeExamAnswers = v; },
    get currentQuestionIndex() { return store.currentQuestionIndex; },
    set currentQuestionIndex(v) { store.currentQuestionIndex = v; },
    get questionTimer() { return store.questionTimer; },
    set questionTimer(v) { store.questionTimer = v; },
    get timeLeft() { return store.timeLeft; },
    set timeLeft(v) { store.timeLeft = v; },
    get activeListener() { return store.activeListener; },
    set activeListener(v) { store.activeListener = v; },
    get isDarkMode() { return store.isDarkMode; },
    set isDarkMode(v) { store.isDarkMode = v; },
    get isSidebarCollapsed() { return store.isSidebarCollapsed; },
    set isSidebarCollapsed(v) { store.isSidebarCollapsed = v; },
    get calendarView() { return store.calendarView; },
    set calendarView(v) { store.calendarView = v; }
};

Object.assign(app, createAuthMethods(app));
app.showModal = showModal;
app.showToast = showToast;
app.capitalize = capitalize;
app.escapeHtml = escapeHtml;
app.parseDateOnly = parseDateOnly;
app.formatDateOnly = formatDateOnly;
app.toInputDate = toInputDate;
app.normalizeBonificacaoStatus = normalizeBonificacaoStatus;
app.getPresencaStatusInfo = getPresencaStatusInfo;
app.sendPasswordReset = sendPasswordReset;
app.sendWelcomeEmail = sendWelcomeEmail;
app.generateCalendarHTML = generateCalendarHTML;

// attach extended implementations from app-impl
extendApp(app);
validateExtendedAppContract(app);
app.perms = createPermissions(() => app.currentUserData, () => app.getUserRole());

export { app };
window.app = app;
app.init();
