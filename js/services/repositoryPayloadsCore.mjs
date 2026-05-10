export function buildAlunoPayload({ nome, email, tipo = 'aluno' }) {
    return {
        nome: String(nome || '').trim(),
        email: String(email || '').trim(),
        tipo
    };
}

export function buildTrabalhoNotaPayload({
    alunoId,
    turmaId,
    turmaNome,
    componenteId,
    componenteNome,
    titulo,
    nota
}) {
    return {
        alunoId,
        turmaId,
        turmaNome,
        componenteId,
        componenteNome,
        titulo,
        nota: parseFloat(nota)
    };
}

export function buildProvaResultadoPatch(notaVal, userId) {
    return {
        nota: Number(notaVal).toFixed(1),
        ajustadoPor: userId
    };
}
