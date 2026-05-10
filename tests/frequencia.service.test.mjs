import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildAlunosEmRisco,
    buildPresencaPersistenciaData,
    buildPresencaResumo,
    buildRegistrosIniciais,
    getChangedFrequencyStatusStudents
} from '../js/services/frequenciaCore.mjs';

function getPresencaStatusInfoMock(registro = {}) {
    const isPresente = Boolean(registro.presente);
    const bonificacaoStatus = String(registro.bonificacaoStatus || 'pendente').trim().toLowerCase();
    const isBonificada = !isPresente && bonificacaoStatus === 'aprovada';
    const presencaEfetiva = isPresente || isBonificada;
    const statusLabel = isPresente ? 'Presente' : (isBonificada ? 'Falta bonificada' : 'Falta');

    return {
        isPresente,
        isBonificada,
        presencaEfetiva,
        bonificacaoStatus,
        statusLabel
    };
}

test('buildPresencaResumo contabiliza presenca efetiva e bonificacao', () => {
    const alunos = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const registros = {
        a1: { presente: true },
        a2: { presente: false, bonificacaoStatus: 'aprovada' },
        a3: { presente: false, bonificacaoStatus: 'rejeitada' }
    };

    const resumo = buildPresencaResumo(alunos, registros, getPresencaStatusInfoMock);
    assert.deepEqual(resumo, { presentes: 2, faltas: 1, bonificadas: 1 });
});

test('getChangedFrequencyStatusStudents retorna apenas alunos com mudanca de status', () => {
    const alunos = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const baseline = {
        a1: { presente: true },
        a2: { presente: false, bonificacaoStatus: 'pendente' },
        a3: { presente: false, bonificacaoStatus: 'rejeitada' }
    };
    const atual = {
        a1: { presente: true },
        a2: { presente: false, bonificacaoStatus: 'aprovada' },
        a3: { presente: false, bonificacaoStatus: 'rejeitada' }
    };

    const changed = getChangedFrequencyStatusStudents(alunos, atual, baseline, getPresencaStatusInfoMock);
    assert.equal(changed.length, 1);
    assert.equal(changed[0].alunoId, 'a2');
    assert.equal(changed[0].statusTexto, 'Falta bonificada');
});

test('buildAlunosEmRisco aplica filtro de corte e ordenacao', () => {
    const alunosMap = new Map([
        ['a1', 'Aluno 1'],
        ['a2', 'Aluno 2'],
        ['a3', 'Aluno 3']
    ]);
    const presencas = [
        {
            turmaId: 't1',
            registros: {
                a1: { presente: false, bonificacaoStatus: 'rejeitada' },
                a2: { presente: true },
                a3: { presente: false, bonificacaoStatus: 'rejeitada' }
            }
        },
        {
            turmaId: 't1',
            registros: {
                a1: { presente: false, bonificacaoStatus: 'rejeitada' },
                a2: { presente: true },
                a3: { presente: false, bonificacaoStatus: 'aprovada' }
            }
        },
        {
            turmaId: 't1',
            registros: {
                a1: { presente: true },
                a2: { presente: true },
                a3: { presente: false, bonificacaoStatus: 'rejeitada' }
            }
        }
    ];

    const risco = buildAlunosEmRisco(presencas, 't1', alunosMap, getPresencaStatusInfoMock, 75);
    assert.equal(risco.length, 2);
    assert.equal(risco[0].alunoNome, 'Aluno 1');
    assert.equal(risco[0].frequencia.toFixed(1), '33.3');
    assert.equal(risco[1].alunoNome, 'Aluno 3');
    assert.equal(risco[1].frequencia.toFixed(1), '33.3');
});

test('buildRegistrosIniciais aplica defaults e normalizacao', () => {
    const alunos = [{ id: 'a1' }, { id: 'a2' }];
    const registrosExistentes = {
        a1: { presente: false, justificativa: 'X', bonificacaoStatus: 'APROVADA' },
        a2: {}
    };
    const normalize = (status) => String(status || 'pendente').toLowerCase();

    const registros = buildRegistrosIniciais(alunos, registrosExistentes, normalize);
    assert.equal(registros.a1.presente, false);
    assert.equal(registros.a1.bonificacaoStatus, 'aprovada');
    assert.equal(registros.a2.presente, true);
    assert.equal(registros.a2.bonificacaoStatus, 'pendente');
});

test('buildPresencaPersistenciaData monta payload e totais para salvar', () => {
    const alunos = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const draftRegistros = {
        a1: { presente: true, justificativa: '   ' },
        a2: { presente: false, bonificacaoStatus: 'aprovada', comprovanteNome: 'abc.pdf' },
        a3: { presente: false, bonificacaoStatus: 'rejeitada', justificativa: 'faltou' }
    };

    const payload = buildPresencaPersistenciaData(alunos, draftRegistros, 'user-1', getPresencaStatusInfoMock);
    assert.deepEqual(payload.totais, { presentes: 2, faltas: 1, bonificadas: 1 });
    assert.equal(payload.registros.a1.justificativa, '');
    assert.equal(payload.registros.a2.bonificacaoStatus, 'aprovada');
    assert.equal(payload.registros.a3.atualizadoPor, 'user-1');
    assert.ok(typeof payload.registros.a3.atualizadoEm === 'string');
});