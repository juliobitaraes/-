import { extendUtils } from './modules/utils.js';
import { extendCoreUtilities } from './modules/coreUtilities.js';
import { extendUiHelpers } from './modules/uiHelpers.js';
import { extendSidebarState } from './modules/sidebarState.js';
import { extendNavigationConfig } from './modules/navigationConfig.js';
import { extendProvas } from './modules/provas.js';
import { extendAlunos } from './modules/alunos.js';
import { extendMateriais } from './modules/materiais.js';
import { extendComunicacao } from './modules/comunicacao.js';
import { extendChat } from './modules/chat.js';
import { extendDiario } from './modules/diario.js?v=20260313-grade-filter-1';
import { extendCalendario } from './modules/calendario.js';
import { extendDashboard } from './modules/dashboard.js?v=20260313-grade-filter-1';
import { extendRelatorios } from './modules/relatorios.js';
import { extendUsuarios } from './modules/usuarios.js';
import { extendUsuariosNotificacoes } from './modules/usuariosNotificacoes.js';
import { extendUsuariosTurmas } from './modules/usuariosTurmas.js';
import { extendPresenca } from './modules/presenca.js';
import { extendFinanceiro } from './modules/financeiro.js';
import { extendOperacional } from './modules/operacional.js';
import { extendSchoolPreferences } from './modules/schoolPreferences.js';
import { extendSchoolFeatureFlags } from './modules/schoolFeatureFlags.js';
import { extendSchoolInvites } from './modules/schoolInvites.js';
import { extendSchoolMaintenance } from './modules/schoolMaintenance.js';
import { extendSchoolAdminActions } from './modules/schoolAdminActions.js';
import { extendEscolas } from './modules/escolas.js';
import { extendSchoolContext } from './modules/schoolContext.js';
import { extendNavigationLayout } from './modules/navigationLayout.js';
import { extendBootstrap } from './modules/bootstrap.js';

const REQUIRED_APP_METHODS = [
    'init',
    'monitorAuth',
    'renderMainLayout',
    'renderContent',
    'navigate',
    'setMobileMenuState',
    'closeSidebarMobile',
    'applyTheme',
    'applySidebarState',
    'renderEscolas',
    'normalizeSchoolFeatureFlags',
    'getPreferredSchoolId',
    'persistSchoolForUser'
];

const CRITICAL_APP_METHODS = [
    'init',
    'monitorAuth',
    'renderMainLayout',
    'renderContent',
    'navigate'
];

// Coordinator: delegates all feature extensions to domain modules.
export function extendApp(app) {
    extendUtils(app);
    extendCoreUtilities(app);
    extendUiHelpers(app);
    extendSidebarState(app);
    extendNavigationConfig(app);

    extendProvas(app);
    extendAlunos(app);
    extendMateriais(app);
    extendComunicacao(app);
    extendChat(app);
    extendDiario(app);
    extendCalendario(app);
    extendDashboard(app);
    extendRelatorios(app);
    extendUsuariosNotificacoes(app);
    extendUsuariosTurmas(app);
    extendUsuarios(app);
    extendPresenca(app);
    extendFinanceiro(app);
    extendOperacional(app);

    extendSchoolPreferences(app);
    extendSchoolFeatureFlags(app);
    extendSchoolInvites(app);
    extendSchoolMaintenance(app);
    extendSchoolAdminActions(app);

    extendEscolas(app);
    extendSchoolContext(app);
    extendNavigationLayout(app);

    extendBootstrap(app);
}

export function validateExtendedAppContract(app) {
    const missing = REQUIRED_APP_METHODS.filter((methodName) => typeof app[methodName] !== 'function');
    const missingCritical = CRITICAL_APP_METHODS.filter((methodName) => typeof app[methodName] !== 'function');

    if (missingCritical.length > 0) {
        console.error('[SENATEDU] Critical app contract mismatch after extendApp. Missing critical methods:', missingCritical);
    }

    if (missing.length > 0) {
        console.warn('[SENATEDU] App contract mismatch after extendApp. Missing methods:', missing);
    }
}