export function createPermissions(getUser, getRole) {
    const resolveRole = () => String(getRole ? getRole() : (getUser?.()?.tipo || '')).trim().toLowerCase();
    const isRole = (role) => resolveRole() === role;
    const hasRole = (...roles) => roles.includes(resolveRole());

    const canManageSistema = () => isRole('admin');
    const canManageUsuarios = () => isRole('admin');
    const canManageTurmas = () => isRole('admin');
    const canConcluirTurma = () => hasRole('admin', 'professor');
    const canManageComponentes = () => !isRole('aluno');
    const canViewRelatorios = () => hasRole('admin', 'professor', 'secretaria');
    const canViewAccessLogs = () => isRole('admin');
    const canCreateAviso = () => !isRole('aluno');
    const canEditAviso = (aviso) => {
        if (isRole('admin')) return true;
        if (isRole('professor')) return Boolean(aviso && (aviso.tipo === 'aluno' || aviso.autorId === getUser?.()?.id));
        return false;
    };
    const canCreateAvaliacao = () => !isRole('aluno');
    const canEditAvaliacao = () => !isRole('aluno');
    const canDownloadGabarito = () => hasRole('admin', 'professor');
    const canCreateMaterial = () => !isRole('aluno');
    const canEditMaterial = (material) => {
        if (isRole('admin') || isRole('professor')) return true;
        return Boolean(material && material.professorId && material.professorId === getUser?.()?.id);
    };
    const canLancarNotaManual = () => hasRole('admin', 'professor');
    const canAjustarNotaProva = () => isRole('admin');
    const canAccessColabForum = () => hasRole('admin', 'professor');
    const canCreateForumSala = () => hasRole('admin', 'professor');
    const canDeleteForumSala = ({ turmaId, createdById } = {}) => {
        if (turmaId === 'geral') return hasRole('admin', 'professor');
        if (turmaId === 'colaboradores') return isRole('admin') || (createdById && createdById === getUser?.()?.id);
        return isRole('admin');
    };

    return {
        role: resolveRole,
        isAdmin: () => isRole('admin'),
        isProfessor: () => isRole('professor'),
        isSecretaria: () => isRole('secretaria'),
        isAluno: () => isRole('aluno'),
        hasRole,
        canManageSistema,
        canManageUsuarios,
        canManageTurmas,
        canConcluirTurma,
        canManageComponentes,
        canViewRelatorios,
        canViewAccessLogs,
        canCreateAviso,
        canEditAviso,
        canCreateAvaliacao,
        canEditAvaliacao,
        canDownloadGabarito,
        canCreateMaterial,
        canEditMaterial,
        canLancarNotaManual,
        canAjustarNotaProva,
        canAccessColabForum,
        canCreateForumSala,
        canDeleteForumSala
    };
}
