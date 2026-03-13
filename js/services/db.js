import { db } from './init.js';

export function collection(name) {
    return db.collection(name);
}

export function batch() {
    return db.batch();
}

export async function getCollection(name) {
    const s = await collection(name).get();
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
