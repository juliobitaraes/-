import { db } from './init.js';
import { getActiveSchoolId } from '../config/school.js';

const SCHOOL_COLLECTION_CACHE = new Map();
const CACHE_TTL_MS = 2500;

function getCacheKey(schoolId, name) {
    return `${schoolId}::${name}`;
}

export function collection(name) {
    const schoolId = getActiveSchoolId();
    if (!schoolId) {
        throw new Error('schoolId ativo nao encontrado.');
    }
    return db.collection('schools').doc(schoolId).collection(name);
}

export function rootCollection(name) {
    return db.collection(name);
}

export function schoolCollection(schoolId, name) {
    if (!schoolId) {
        throw new Error('schoolId e obrigatorio para acessar dados multi-escola.');
    }
    return db.collection('schools').doc(schoolId).collection(name);
}

export function schoolDoc(schoolId, collectionName, docId) {
    if (!schoolId) {
        throw new Error('schoolId e obrigatorio para acessar dados multi-escola.');
    }
    return db.collection('schools').doc(schoolId).collection(collectionName).doc(docId);
}

export function batch() {
    return db.batch();
}

export function invalidateSchoolCollectionCache(schoolId, name) {
    if (!schoolId && !name) {
        SCHOOL_COLLECTION_CACHE.clear();
        return;
    }

    if (schoolId && name) {
        SCHOOL_COLLECTION_CACHE.delete(getCacheKey(schoolId, name));
        return;
    }

    if (schoolId) {
        Array.from(SCHOOL_COLLECTION_CACHE.keys())
            .filter((k) => k.startsWith(`${schoolId}::`))
            .forEach((k) => SCHOOL_COLLECTION_CACHE.delete(k));
    }
}

export async function getCollection(name) {
    const s = await collection(name).get();
    return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getSchoolCollection(schoolId, name) {
    const cacheKey = getCacheKey(schoolId, name);
    const cached = SCHOOL_COLLECTION_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.time) <= CACHE_TTL_MS) {
        return cached.data;
    }

    const s = await schoolCollection(schoolId, name).get();
    const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
    SCHOOL_COLLECTION_CACHE.set(cacheKey, { time: Date.now(), data });
    return data;
}
