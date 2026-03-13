export const store = {
    currentUser: null,
    currentUserData: null,
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
    isSidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
    calendarView: null
};
