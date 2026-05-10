import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildAlunoPayload,
    buildProvaResultadoPatch,
    buildTrabalhoNotaPayload
} from '../js/services/repositoryPayloadsCore.mjs';

test('buildAlunoPayload normaliza campos de cadastro', () => {
    const payload = buildAlunoPayload({
        nome: '  Ana Souza  ',
        email: '  ana@email.com  '
    });

    assert.deepEqual(payload, {
        nome: 'Ana Souza',
        email: 'ana@email.com',
        tipo: 'aluno'
    });
});

test('buildTrabalhoNotaPayload converte nota e preserva identificadores', () => {
    const payload = buildTrabalhoNotaPayload({
        alunoId: 'a1',
        turmaId: 't1',
        turmaNome: 'Turma A',
        componenteId: 'c1',
        componenteNome: 'Matematica',
        titulo: 'Trabalho 1',
        nota: '8.5'
    });

    assert.equal(payload.alunoId, 'a1');
    assert.equal(payload.turmaId, 't1');
    assert.equal(payload.componenteId, 'c1');
    assert.equal(payload.titulo, 'Trabalho 1');
    assert.equal(payload.nota, 8.5);
});

test('buildProvaResultadoPatch formata nota com uma casa decimal', () => {
    const payload = buildProvaResultadoPatch(59.96, 'user-42');
    assert.deepEqual(payload, {
        nota: '60.0',
        ajustadoPor: 'user-42'
    });
});
