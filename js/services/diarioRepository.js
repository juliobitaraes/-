import { collection as rawCollection, invalidateSchoolCollectionCache } from './db.js';
import { getActiveSchoolId } from '../config/school.js';
import {
    buildProvaResultadoPatch,
    buildTrabalhoNotaPayload
} from './repositoryPayloadsCore.mjs';

// Writes invalidam o cache de leitura para o diario nao renderizar dados antigos.
function collection(name) {
    const ref = rawCollection(name);
    const schoolId = getActiveSchoolId();
    const invalidate = () => invalidateSchoolCollectionCache(schoolId, name);
    const wrapDoc = (doc) => ({
        get: () => doc.get(),
        set: async (...args) => { await doc.set(...args); invalidate(); },
        update: async (...args) => { await doc.update(...args); invalidate(); },
        delete: async () => { await doc.delete(); invalidate(); }
    });
    return {
        where: (...args) => ref.where(...args),
        doc: (id) => wrapDoc(ref.doc(id)),
        add: async (...args) => { const r = await ref.add(...args); invalidate(); return r; }
    };
}

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

export async function addDiarioAtividade(data) {
    const { id, ...payload } = data;
    await collection('diario_atividades').doc(id).set({
        ...payload,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function updateDiarioAtividade(atividadeId, title) {
    await collection('diario_atividades').doc(atividadeId).update({
        titulo: title,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function deleteDiarioAtividade(atividadeId) {
    await collection('diario_atividades').doc(atividadeId).delete();
}

export async function updateTrabalhoNota(notaId, notaVal, activityId, title) {
    await collection('trabalhos_notas').doc(notaId).update({
        nota: parseFloat(notaVal),
        ...(activityId ? { activityId } : {}),
        ...(title ? { titulo: title } : {}),
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function updateProvaResultado(resultadoId, notaVal, userId) {
    const payload = buildProvaResultadoPatch(notaVal, userId);
    await collection('provas_resultados').doc(resultadoId).update({
        ...payload,
        ajustadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function addProvaResultado(provaId, alunoId, notaVal, userId) {
    const resultadoId = `diario_${provaId}_${alunoId}`;
    await collection('provas_resultados').doc(resultadoId).set({
        provaId,
        alunoId,
        nota: Number(notaVal).toFixed(1),
        respostas: {},
        data: firebase.firestore.FieldValue.serverTimestamp(),
        ajustadoPor: userId
    }, { merge: true });
}

export async function deleteProvaResultado(resultadoId) {
    await collection('provas_resultados').doc(resultadoId).delete();
}

export async function deleteTrabalhoNota(notaId) {
    await collection('trabalhos_notas').doc(notaId).delete();
}
