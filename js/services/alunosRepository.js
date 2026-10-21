import { collection } from './db.js';
import { buildAlunoPayload } from './repositoryPayloadsCore.mjs';

export { buildAlunoPayload };

export async function createAluno(userId, data) {
    await collection('users').doc(userId).set(data);
    // As regras do Firestore exigem members/{uid} para o aluno ler dados da escola.
    // Se o usuario atual nao puder gravar, a Cloud Function syncStudentMember cobre.
    try {
        await collection('members').doc(userId).set({
            uid: userId,
            nome: data.nome || '',
            email: data.email || '',
            tipo: 'aluno',
            role: 'aluno',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (err) {
        console.warn('Nao foi possivel gravar members do aluno:', err && err.code);
    }
}

export async function updateAluno(userId, patch) {
    await collection('users').doc(userId).update(patch);
}

export async function getAlunoById(userId) {
    const doc = await collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
}

export async function addAlunoToTurma(turmaId, userId) {
    await collection('turmas').doc(turmaId).update({
        alunos: firebase.firestore.FieldValue.arrayUnion(userId)
    });
}

export async function removeAlunoFromTurma(turmaId, userId) {
    await collection('turmas').doc(turmaId).update({
        alunos: firebase.firestore.FieldValue.arrayRemove(userId)
    });
}

export async function setAlunoBlockedUntil(userId, releaseDate) {
    await collection('users').doc(userId).update({
        blockedUntil: firebase.firestore.Timestamp.fromDate(releaseDate)
    });
}

export async function clearAlunoBlock(userId) {
    await collection('users').doc(userId).update({
        blockedUntil: firebase.firestore.FieldValue.delete()
    });
}
