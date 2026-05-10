import { collection } from './db.js';

export function getProvaDocRef(provaId) {
    return collection('provas').doc(provaId);
}

export async function getProvaById(provaId) {
    const doc = await getProvaDocRef(provaId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

export async function updateProva(provaId, payload) {
    await getProvaDocRef(provaId).update(payload);
}

export async function createProva(payload) {
    await collection('provas').add({
        ...payload,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
}

export async function getTurmaById(turmaId) {
    const doc = await collection('turmas').doc(turmaId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

export async function getComponentesByTurma(turmaId) {
    const snap = await collection('componentes').where('turmaId', '==', turmaId).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createProvaResultado({ provaId, alunoId, nota, respostas }) {
    await collection('provas_resultados').add({
        provaId,
        alunoId,
        nota,
        respostas,
        data: firebase.firestore.FieldValue.serverTimestamp()
    });
}
