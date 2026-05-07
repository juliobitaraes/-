import { getActiveSchoolId } from '../config/school.js';

const CONFIGURABLE_SIDEBAR_SECTIONS = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'diario', label: 'Diario' },
    { id: 'presenca', label: 'Frequencia' },
    { id: 'relatorios', label: 'Relatorios' },
    { id: 'notificacoes', label: 'Notificacoes' },
    { id: 'usuarios', label: 'Usuarios' },
    { id: 'manual', label: 'Manual' },
    { id: 'turmas', label: 'Turmas' },
    { id: 'alunos', label: 'Alunos' },
    { id: 'materiais', label: 'Materiais' },
    { id: 'provas', label: 'Provas' },
    { id: 'atividades', label: 'Atividades EAD' },
    { id: 'contas_financeiras', label: 'Contas' },
    { id: 'receitas', label: 'Receitas' },
    { id: 'despesas', label: 'Despesas' },
    { id: 'movimentacoes_financeiras', label: 'Movimentacao' },
    { id: 'categorias_financeiras', label: 'Categorias' },
    { id: 'metas_financeiras', label: 'Metas' },
    { id: 'orcamentos_financeiros', label: 'Orcamentos' },
    { id: 'estoque', label: 'Estoque' },
    { id: 'fornecedores', label: 'Fornecedores' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'trabalhos', label: 'Trabalhos' },
    { id: 'forum', label: 'Forum' },
    { id: 'cadastro', label: 'Cadastro' }
];

const FEATURE_SECTIONS = CONFIGURABLE_SIDEBAR_SECTIONS.map((section) => section.id);
const DEFAULT_FEATURE_FLAGS = FEATURE_SECTIONS.reduce((acc, sectionId) => {
    acc[sectionId] = true;
    return acc;
}, {});

const SIDEBAR_CATEGORY_PRESETS = {
    admin: [
        { id: 'visao-geral', label: 'Visao Geral', sections: ['dashboard', 'notificacoes', 'relatorios'] },
        { id: 'academico', label: 'Academico', sections: ['diario', 'presenca', 'turmas', 'alunos', 'provas', 'materiais'] },
        { id: 'atividades', label: 'Atividades', sections: ['atividades', 'trabalhos', 'forum'] },
        { id: 'financeiro-operacional', label: 'Financeiro e Operacional', sections: ['contas_financeiras', 'receitas', 'despesas', 'movimentacoes_financeiras', 'categorias_financeiras', 'metas_financeiras', 'orcamentos_financeiros', 'estoque', 'fornecedores', 'produtos'] },
        { id: 'gestao-escolar', label: 'Gestao Escolar', sections: ['usuarios', 'manual', 'cadastro', 'escolas'] }
    ],
    professor: [
        { id: 'visao-geral', label: 'Visao Geral', sections: ['dashboard', 'notificacoes', 'relatorios'] },
        { id: 'academico', label: 'Academico', sections: ['diario', 'presenca', 'alunos', 'provas', 'materiais'] },
        { id: 'atividades', label: 'Atividades', sections: ['atividades', 'trabalhos', 'forum'] },
        { id: 'conta', label: 'Conta', sections: ['cadastro'] }
    ],
    secretaria: [
        { id: 'visao-geral', label: 'Visao Geral', sections: ['dashboard', 'relatorios'] },
        { id: 'academico', label: 'Academico', sections: ['diario', 'presenca', 'turmas', 'alunos'] },
        { id: 'financeiro-operacional', label: 'Financeiro e Operacional', sections: ['contas_financeiras', 'receitas', 'despesas', 'movimentacoes_financeiras', 'categorias_financeiras', 'metas_financeiras', 'orcamentos_financeiros', 'estoque', 'fornecedores', 'produtos'] },
        { id: 'colaboracao', label: 'Colaboracao', sections: ['forum', 'manual', 'cadastro'] }
    ],
    aluno: [
        { id: 'visao-geral', label: 'Visao Geral', sections: ['dashboard'] },
        { id: 'academico', label: 'Academico', sections: ['diario', 'presenca', 'materiais', 'provas'] },
        { id: 'atividades', label: 'Atividades', sections: ['atividades', 'trabalhos', 'forum'] },
        { id: 'conta', label: 'Conta', sections: ['cadastro'] }
    ]
};

const FORCED_HIDDEN_FEATURES_BY_SCHOOL = {};

export function extendNavigationConfig(app) {
    app.getConfigurableSidebarSections = function() {
        return CONFIGURABLE_SIDEBAR_SECTIONS.slice();
    };

    app.getSidebarCategoryPresets = function() {
        return SIDEBAR_CATEGORY_PRESETS;
    };

    app.normalizeSchoolFeatureFlags = function(rawFlags, schoolId) {
        const merged = { ...DEFAULT_FEATURE_FLAGS, ...(rawFlags || {}) };
        const forcedHidden = FORCED_HIDDEN_FEATURES_BY_SCHOOL[schoolId] || [];
        forcedHidden.forEach((sectionId) => {
            merged[sectionId] = false;
        });
        return merged;
    };

    app.getSchoolFeatureFlagsById = function(schoolId) {
        const schools = app.availableSchools || [];
        const found = schools.find((s) => s.id === schoolId);
        const raw = found && found.features ? found.features : null;
        return app.normalizeSchoolFeatureFlags(raw, schoolId);
    };

    app.isSectionEnabledForCurrentSchool = function(sectionId) {
        if (!FEATURE_SECTIONS.includes(sectionId)) return true;
        const schoolId = app.activeSchoolId || getActiveSchoolId();
        const flags = app.getSchoolFeatureFlagsById(schoolId);
        return !!flags[sectionId];
    };
}