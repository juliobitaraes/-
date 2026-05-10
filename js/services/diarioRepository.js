import { collection } from './db.js';
import {
    buildProvaResultadoPatch,
    buildTrabalhoNotaPayload
} from './repositoryPayloadsCore.mjs';

export {
    buildProvaResultadoPatch,
    buildTrabalhoNotaPayload
};

export async function getComponentesByTurma(turmaId) {
    const snap = await collection('componentes').where('turmaId', '==', turmaId).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getTurmaById(turmaId) {
    const doc = await collection('turmas').doc(turmaId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

export async function getUserById(userId) {
    const doc = await collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

export async function addTrabalhoNota(data) {
    const payload = buildTrabalhoNotaPayload(data);
    await collection('trabalhos_notas').add({
        ...payload,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function updateProvaResultado(resultadoId, notaVal, userId) {
    const payload = buildProvaResultadoPatch(notaVal, userId);
    await collection('provas_resultados').doc(resultadoId).update({
        ...payload,
        ajustadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function deleteTrabalhoNota(notaId) {
    await collection('trabalhos_notas').doc(notaId).delete();
}
