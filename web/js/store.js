import { getActiveSchoolId } from './config/school.js';

export const store = {
    currentUser: null,
    currentUserData: null,
    authErrorMessage: null,
    activeSchoolId: getActiveSchoolId(),
    availableSchools: [],
    currentView: 'dashboard',
    currentMaterialType: 'arquivo',
    tempQuestoes: [],
    currentTurmaFilter: 'todas',
    currentComponenteFilter: 'todos',
    activeExamData: null,
    activeExamAnswers: [],
    currentQuestionIndex: 0,
    questionTimer: null,
    timeLeft: 0,
    activeListener: null,
    isDarkMode: localStorage.getItem('theme') === 'dark',
    themeMode: localStorage.getItem('themeMode') || (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'),
    colorScheme: localStorage.getItem('colorScheme') || 'professional-gray',
    isSidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
    calendarView: null
};
