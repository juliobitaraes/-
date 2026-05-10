export function buildPresencaResumo(alunos = [], registros = {}, getPresencaStatusInfo) {
    let presentes = 0;
    let faltas = 0;
    let bonificadas = 0;

    alunos.forEach((aluno) => {
        const statusInfo = getPresencaStatusInfo(registros[aluno.id] || {});
        if (statusInfo.presencaEfetiva) presentes += 1;
        else faltas += 1;
        if (statusInfo.isBonificada) bonificadas += 1;
    });

    return { presentes, faltas, bonificadas };
}

export function getChangedFrequencyStatusStudents(alunos = [], draftRegistros = {}, baselineRegistros = {}, getPresencaStatusInfo) {
    const toStatus = (registro) => getPresencaStatusInfo(registro).statusLabel;

    return alunos.filter((aluno) => {
        const atual = toStatus(draftRegistros[aluno.id] || {});
        const anterior = toStatus(baselineRegistros[aluno.id] || {});
        return atual !== anterior;
    }).map((aluno) => ({
        alunoId: aluno.id,
        statusTexto: toStatus(draftRegistros[aluno.id] || {})
    }));
}

export async function notifyFrequencyChanges(changes = [], notifyFn, payloadBuilder) {
    if (!Array.isArray(changes) || changes.length === 0 || typeof notifyFn !== 'function' || typeof payloadBuilder !== 'function') {
        return;
    }

    const notifications = changes.map((change) => {
        const payload = payloadBuilder(change);
        return notifyFn(change.alunoId, payload.titulo, payload.mensagem, payload.meta);
    });

    await Promise.allSettled(notifications);
}

export function buildAlunosEmRisco(presencas = [], turmaId, alunosMap = new Map(), getPresencaStatusInfo, riscoPercentual = 75) {
    const frequenciaAcumuladaMap = new Map();

    presencas
        .filter((p) => p && p.turmaId === turmaId)
        .forEach((registroPresenca) => {
            const registros = registroPresenca.registros && typeof registroPresenca.registros === 'object'
                ? registroPresenca.registros
                : {};

            Object.entries(registros).forEach(([alunoId, dado]) => {
                if (!alunosMap.has(alunoId)) return;

                const statusInfo = getPresencaStatusInfo(dado);
                if (!frequenciaAcumuladaMap.has(alunoId)) {
                    frequenciaAcumuladaMap.set(alunoId, {
                        alunoNome: alunosMap.get(alunoId) || 'Aluno',
                        presencas: 0,
                        total: 0
                    });
                }

                const row = frequenciaAcumuladaMap.get(alunoId);
                row.total += 1;
                if (statusInfo.presencaEfetiva) row.presencas += 1;
            });
        });

    return Array.from(frequenciaAcumuladaMap.values())
        .filter((row) => row.total > 0)
        .map((row) => ({
            ...row,
            faltas: Math.max(0, row.total - row.presencas),
            frequencia: (row.presencas / row.total) * 100
        }))
        .filter((row) => row.frequencia < riscoPercentual)
        .sort((a, b) => (
            a.frequencia !== b.frequencia
                ? a.frequencia - b.frequencia
                : (b.faltas !== a.faltas
                    ? b.faltas - a.faltas
                    : a.alunoNome.localeCompare(b.alunoNome, 'pt-BR', { sensitivity: 'base' }))
        ));
}

export function buildRegistrosIniciais(alunos = [], registrosExistentes = {}, normalizeBonificacaoStatus) {
    const registros = {};

    alunos.forEach((aluno) => {
        const reg = registrosExistentes[aluno.id] || {};
        registros[aluno.id] = {
            presente: typeof reg.presente === 'boolean' ? reg.presente : true,
            justificativa: String(reg.justificativa || ''),
            comprovanteUrl: String(reg.comprovanteUrl || ''),
            comprovanteNome: String(reg.comprovanteNome || ''),
            comprovanteTipo: String(reg.comprovanteTipo || ''),
            bonificacaoStatus: normalizeBonificacaoStatus(reg.bonificacaoStatus)
        };
    });

    return registros;
}

export function buildPresencaPersistenciaData(alunos = [], draftRegistros = {}, userId, getPresencaStatusInfo) {
    const registros = {};
    let presentes = 0;
    let faltas = 0;
    let bonificadas = 0;

    alunos.forEach((aluno) => {
        const current = draftRegistros[aluno.id] || {};
        const statusInfo = getPresencaStatusInfo(current);
        if (statusInfo.presencaEfetiva) presentes += 1;
        else faltas += 1;
        if (statusInfo.isBonificada) bonificadas += 1;

        registros[aluno.id] = {
            presente: statusInfo.isPresente,
            justificativa: String(current.justificativa || '').trim(),
            comprovanteUrl: String(current.comprovanteUrl || '').trim(),
            comprovanteNome: String(current.comprovanteNome || '').trim(),
            comprovanteTipo: String(current.comprovanteTipo || '').trim(),
            bonificacaoStatus: statusInfo.bonificacaoStatus,
            atualizadoPor: userId,
            atualizadoEm: new Date().toISOString()
        };
    });

    return {
        registros,
        totais: {
            presentes,
            faltas,
            bonificadas
        }
    };
}