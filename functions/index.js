const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const GLOBAL_SUPER_ADMIN_UID = 'xSeQ7zitlkdWfYRW0IBbQoCS0yF3';
const SCHOOL_STATS_COLLECTIONS = [
  'users',
  'members',
  'turmas',
  'componentes',
  'materiais',
  'provas',
  'provas_resultados',
  'trabalhos',
  'trabalhos_notas',
  'trabalhos_salas',
  'atividades_salas',
  'forum',
  'forum_salas',
  'eventos_calendario',
  'presencas',
  'receitas',
  'despesas',
  'movimentacoes_financeiras',
  'estoque',
  'estoque_movimentos',
  'avisos',
  'notifications',
  'logs_acesso'
];
const SCHOOL_STATS_DOC_PATH = (schoolId) => `schools/${schoolId}/_meta/overview`;
const SCHOOL_STORAGE_PREFIX = (schoolId) => `schools/${schoolId}/`;
const STORAGE_STATS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const APP_BASE_URL = 'https://educloud-sistema.web.app';
const SMTP_CONFIG = {
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY || ''
  }
};
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@educloud.com';

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function normalizeWhatsappBR(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length < 10 || digits.length > 11) {
    throw new functions.https.HttpsError('invalid-argument', 'WhatsApp invalido. Informe DDD + numero com 10 ou 11 digitos.');
  }
  return `+55${digits}`;
}

async function sendSmtpEmail(options) {
  const transporter = nodemailer.createTransporter(SMTP_CONFIG);
  const mailOptions = {
    from: DEFAULT_FROM_EMAIL,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html || undefined,
    text: options.text || undefined,
    replyTo: options.replyTo || DEFAULT_FROM_EMAIL
  };

  if (options.cc) mailOptions.cc = Array.isArray(options.cc) ? options.cc.join(', ') : options.cc;
  if (options.bcc) mailOptions.bcc = Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc;

  return transporter.sendMail(mailOptions);
}

function isGlobalSuperAdmin(uid) {
  return uid === GLOBAL_SUPER_ADMIN_UID;
}

async function getSchoolMember(schoolId, uid) {
  const memberRef = admin.firestore().doc(`schools/${schoolId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    return null;
  }
  return memberSnap.data() || null;
}

async function assertSchoolPermission(context, schoolId, allowedRoles) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  if (!schoolId || typeof schoolId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalido.');
  }

  const requesterId = context.auth.uid;
  if (isGlobalSuperAdmin(requesterId)) {
    return {
      requesterId,
      requesterRole: 'global-super-admin',
      isGlobal: true
    };
  }

  const member = await getSchoolMember(schoolId, requesterId);
  if (!member) {
    throw new functions.https.HttpsError('permission-denied', 'Usuario nao pertence a esta escola.');
  }

  const role = member.tipo || member.role;
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Usuario sem permissao para esta operacao.');
  }

  return {
    requesterId,
    requesterRole: role,
    isGlobal: false
  };
}

async function assertUidSchoolPermission(uid, schoolId, allowedRoles) {
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  if (!schoolId || typeof schoolId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalido.');
  }

  if (isGlobalSuperAdmin(uid)) {
    return { uid, requesterRole: 'global-super-admin', isGlobal: true };
  }

  const member = await getSchoolMember(schoolId, uid);
  if (!member) {
    throw new functions.https.HttpsError('permission-denied', 'Usuario nao pertence a esta escola.');
  }

  const role = member.tipo || member.role;
  if (Array.isArray(allowedRoles) && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Usuario sem permissao para esta operacao.');
  }

  return { uid, requesterRole: role, isGlobal: false };
}

async function estimateCollectionSizeBytes(collectionRef, totalCount) {
  if (!totalCount) return 0;
  const sampleLimit = 25;
  const sampleSnapshot = await collectionRef.limit(sampleLimit).get();
  if (sampleSnapshot.empty) return 0;

  let sampleSizeBytes = 0;
  sampleSnapshot.forEach((doc) => {
    sampleSizeBytes += Buffer.byteLength(JSON.stringify(doc.data() || {}), 'utf8');
  });

  const averageBytes = sampleSizeBytes / sampleSnapshot.size;
  return Math.round(averageBytes * totalCount);
}

async function getCollectionCount(collectionRef) {
  const aggregate = await collectionRef.count().get();
  return aggregate.data().count || 0;
}

async function getSchoolStorageUsageBytes(schoolId) {
  const bucket = admin.storage().bucket();
  const prefix = SCHOOL_STORAGE_PREFIX(schoolId);
  let pageToken = undefined;
  let storageBytes = 0;
  let storageFiles = 0;

  do {
    const [files, , response] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 1000,
      pageToken
    });

    for (const file of files) {
      const size = Number(file?.metadata?.size || 0);
      if (Number.isFinite(size) && size > 0) {
        storageBytes += size;
      }
      storageFiles += 1;
    }

    pageToken = response && response.nextPageToken ? response.nextPageToken : undefined;
  } while (pageToken);

  return { storageBytes, storageFiles };
}

function shouldRefreshStorageStats(stats) {
  if (!stats || typeof stats !== 'object') return true;
  if (!Number.isFinite(Number(stats.tamanhoArquivosStorageBytes))) return true;
  const storageUpdatedAt = stats.storageUpdatedAt;
  if (!storageUpdatedAt || typeof storageUpdatedAt.toMillis !== 'function') return true;
  return (Date.now() - storageUpdatedAt.toMillis()) > STORAGE_STATS_REFRESH_INTERVAL_MS;
}

function sanitizeUserType(value) {
  return String(value || '').trim().toLowerCase();
}

function userTypeCounterField(tipo) {
  if (tipo === 'aluno') return 'alunos';
  if (tipo === 'professor') return 'professores';
  if (tipo === 'admin') return 'admins';
  if (tipo === 'secretaria') return 'secretarias';
  return 'outrosUsuarios';
}

async function recomputeSchoolOverviewDoc(schoolId) {
  const db = admin.firestore();
  const usersRef = db.collection(`schools/${schoolId}/users`);

  const [
    totalUsers,
    alunos,
    professores,
    admins,
    secretarias
  ] = await Promise.all([
    getCollectionCount(usersRef),
    getCollectionCount(usersRef.where('tipo', '==', 'aluno')),
    getCollectionCount(usersRef.where('tipo', '==', 'professor')),
    getCollectionCount(usersRef.where('tipo', '==', 'admin')),
    getCollectionCount(usersRef.where('tipo', '==', 'secretaria'))
  ]);

  let totalDocs = 0;
  let firestoreEstimatedBytes = 0;
  for (const collectionName of SCHOOL_STATS_COLLECTIONS) {
    const colRef = db.collection(`schools/${schoolId}/${collectionName}`);
    const count = await getCollectionCount(colRef);
    totalDocs += count;
    firestoreEstimatedBytes += await estimateCollectionSizeBytes(colRef, count);
  }

  const { storageBytes, storageFiles } = await getSchoolStorageUsageBytes(schoolId);

  const payload = {
    totalUsers,
    alunos,
    professores,
    admins,
    secretarias,
    outrosUsuarios: Math.max(0, totalUsers - (alunos + professores + admins + secretarias)),
    totalDocumentos: totalDocs,
    tamanhoEstimadoFirestoreBytes: firestoreEstimatedBytes,
    tamanhoArquivosStorageBytes: storageBytes,
    totalArquivosStorage: storageFiles,
    tamanhoEstimadoBytes: firestoreEstimatedBytes + storageBytes,
    storageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await db.doc(SCHOOL_STATS_DOC_PATH(schoolId)).set(payload, { merge: true });
  return payload;
}

async function assertGlobalSuperAdmin(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }
  if (!isGlobalSuperAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Somente o super admin global pode executar esta operacao.');
  }
}

async function writeSchoolAuditLog(schoolId, actorUid, action, details = {}) {
  return admin.firestore().collection(`schools/${schoolId}/audit_logs`).add({
    schoolId,
    actorUid,
    action,
    details,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function exportCollectionDocs(collectionRef, maxDocs = 2000) {
  const docs = [];
  let lastDoc = null;

  while (docs.length < maxDocs) {
    let query = collectionRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(Math.min(300, maxDocs - docs.length));

    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    snapshot.docs.forEach((doc) => {
      docs.push({ id: doc.id, ...doc.data() });
    });

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }

  return docs;
}

exports.createSchool = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);

  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  const nome = (data && typeof data.nome === 'string') ? data.nome.trim() : '';
  const adminEmail = (data && typeof data.adminEmail === 'string') ? data.adminEmail.trim().toLowerCase() : '';
  const adminWhatsapp = normalizeWhatsappBR(data && data.adminWhatsapp);

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  if (!adminEmail || !isValidEmail(adminEmail)) {
    throw new functions.https.HttpsError('invalid-argument', 'adminEmail obrigatorio e invalido.');
  }

  const safeSchoolId = schoolId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeSchoolId.length < 3) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalido. Use letras, numeros, _ ou -.');
  }

  const schoolRef = admin.firestore().doc(`schools/${safeSchoolId}`);
  const snap = await schoolRef.get();
  if (snap.exists) {
    throw new functions.https.HttpsError('already-exists', 'Escola ja existe.');
  }

  const schoolName = nome || safeSchoolId;
  const signupUrl = `${APP_BASE_URL}/?invite=admin&schoolId=${encodeURIComponent(safeSchoolId)}&email=${encodeURIComponent(adminEmail)}`;
  const emailSubject = `Convite de cadastro - ${schoolName}`;
  const emailText = [
    'Ola,',
    '',
    `Voce foi convidado para atuar como administrador da escola ${schoolName}.`,
    adminWhatsapp ? `WhatsApp cadastrado: ${adminWhatsapp}` : '',
    '',
    `Acesse: ${signupUrl}`,
    '',
    'Ao abrir a tela de login, a escola ja estara selecionada. Depois conclua seu cadastro com o suporte da plataforma.',
    '',
    'Mensagem automatica do SENATEDU.'
  ].filter(Boolean).join('\n');
  const emailHtml = `
    <p>Ola,</p>
    <p>Voce foi convidado para atuar como <b>administrador</b> da escola <b>${schoolName}</b>.</p>
    ${adminWhatsapp ? `<p>WhatsApp cadastrado: <b>${adminWhatsapp}</b></p>` : ''}
    <p><a href="${signupUrl}" target="_blank" rel="noopener">Clique aqui para concluir seu cadastro</a></p>
    <p>Se preferir, copie este link: <br><a href="${signupUrl}" target="_blank" rel="noopener">${signupUrl}</a></p>
    <p>Mensagem automatica do SENATEDU.</p>
  `;

  await schoolRef.set({
    nome: schoolName,
    code: safeSchoolId,
    ativo: true,
    features: {
      receitas: true,
      despesas: true,
      estoque: true
    },
    adminInvite: {
      email: adminEmail,
      whatsapp: adminWhatsapp || null,
      signupUrl,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    },
    createdBy: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  await admin.firestore().doc(SCHOOL_STATS_DOC_PATH(safeSchoolId)).set({
    totalUsers: 0,
    alunos: 0,
    professores: 0,
    admins: 0,
    secretarias: 0,
    outrosUsuarios: 0,
    totalDocumentos: 0,
    tamanhoEstimadoFirestoreBytes: 0,
    tamanhoArquivosStorageBytes: 0,
    totalArquivosStorage: 0,
    tamanhoEstimadoBytes: 0,
    storageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  try {
    await sendSmtpEmail({
      to: adminEmail,
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    });
  } catch (error) {
    await Promise.all([
      admin.firestore().doc(SCHOOL_STATS_DOC_PATH(safeSchoolId)).delete().catch(() => null),
      schoolRef.delete().catch(() => null)
    ]);
    throw new functions.https.HttpsError('internal', `Falha ao enviar convite por email: ${error.message || 'erro desconhecido'}`);
  }

  await writeSchoolAuditLog(safeSchoolId, context.auth.uid, 'school_created', {
    nome: schoolName,
    schoolId: safeSchoolId,
    adminEmail,
    adminWhatsapp,
    invitationEmailSent: true
  });

  return {
    ok: true,
    schoolId: safeSchoolId,
    nome: schoolName,
    adminEmail,
    adminWhatsapp,
    signupUrl,
    invitationEmailSent: true
  };
});

exports.setSchoolAdmin = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);

  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  const uid = (data && typeof data.uid === 'string') ? data.uid.trim() : '';

  if (!schoolId || !uid) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e uid sao obrigatorios.');
  }

  const schoolRef = admin.firestore().doc(`schools/${schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Escola nao encontrada.');
  }

  let authUser = null;
  try {
    authUser = await admin.auth().getUser(uid);
  } catch (err) {
    throw new functions.https.HttpsError('not-found', 'Usuario Auth nao encontrado para o UID informado.');
  }

  const fallbackNome = (authUser.displayName || (authUser.email || '').split('@')[0] || 'Administrador').trim();
  const fallbackEmail = (authUser.email || '').trim();
  const nome = (data && typeof data.nome === 'string' && data.nome.trim()) ? data.nome.trim() : fallbackNome;
  const email = (data && typeof data.email === 'string' && data.email.trim()) ? data.email.trim() : fallbackEmail;

  const db = admin.firestore();
  await Promise.all([
    db.doc(`schools/${schoolId}/members/${uid}`).set({
      uid,
      nome,
      email,
      tipo: 'admin',
      role: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid
    }, { merge: true }),
    db.doc(`schools/${schoolId}/users/${uid}`).set({
      nome,
      email,
      tipo: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth.uid
    }, { merge: true })
  ]);

  await writeSchoolAuditLog(schoolId, context.auth.uid, 'school_admin_set', {
    uid,
    nome,
    email
  });

  return { ok: true, schoolId, uid, nome, email };
});

exports.getSchoolsOverview = functions.https.onCall(async (_data, context) => {
  await assertGlobalSuperAdmin(context);

  const db = admin.firestore();
  const schoolsSnapshot = await db.collection('schools').get();
  const result = [];

  for (const schoolDoc of schoolsSnapshot.docs) {
    const schoolId = schoolDoc.id;
    const schoolData = schoolDoc.data() || {};
    const statsSnap = await db.doc(SCHOOL_STATS_DOC_PATH(schoolId)).get();
    let stats = statsSnap.exists
      ? (statsSnap.data() || {})
      : await recomputeSchoolOverviewDoc(schoolId);

    if (shouldRefreshStorageStats(stats)) {
      const firestoreEstimatedBytes = Number(stats.tamanhoEstimadoFirestoreBytes);
      const firestoreBytes = Number.isFinite(firestoreEstimatedBytes)
        ? firestoreEstimatedBytes
        : (Number(stats.tamanhoEstimadoBytes) || 0);

      const { storageBytes, storageFiles } = await getSchoolStorageUsageBytes(schoolId);
      const mergedStats = {
        tamanhoEstimadoFirestoreBytes: firestoreBytes,
        tamanhoArquivosStorageBytes: storageBytes,
        totalArquivosStorage: storageFiles,
        tamanhoEstimadoBytes: firestoreBytes + storageBytes,
        storageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.doc(SCHOOL_STATS_DOC_PATH(schoolId)).set(mergedStats, { merge: true });
      stats = { ...stats, ...mergedStats };
    }

    result.push({
      id: schoolId,
      nome: schoolData.nome || schoolData.name || schoolId,
      features: Object.entries(schoolData.features || {}).reduce((acc, [key, value]) => {
        acc[key] = value !== false;
        return acc;
      }, {}),
      totalUsers: Number(stats.totalUsers) || 0,
      alunos: Number(stats.alunos) || 0,
      professores: Number(stats.professores) || 0,
      admins: Number(stats.admins) || 0,
      secretarias: Number(stats.secretarias) || 0,
      outrosUsuarios: Number(stats.outrosUsuarios) || 0,
      totalDocumentos: Number(stats.totalDocumentos) || 0,
      tamanhoEstimadoFirestoreBytes: Number(stats.tamanhoEstimadoFirestoreBytes) || 0,
      tamanhoArquivosStorageBytes: Number(stats.tamanhoArquivosStorageBytes) || 0,
      totalArquivosStorage: Number(stats.totalArquivosStorage) || 0,
      tamanhoEstimadoBytes: Number(stats.tamanhoEstimadoBytes) || 0
    });
  }

  result.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { schools: result, generatedAt: Date.now() };
});

exports.rebuildSchoolStats = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);
  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  const stats = await recomputeSchoolOverviewDoc(schoolId);
  await writeSchoolAuditLog(schoolId, context.auth.uid, 'school_stats_rebuilt', {});
  return { ok: true, schoolId, stats };
});

exports.onSchoolCollectionWrite = functions.firestore
  .document('schools/{schoolId}/{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    const { schoolId, collectionId } = context.params;
    if (!SCHOOL_STATS_COLLECTIONS.includes(collectionId) && collectionId !== 'users') {
      return null;
    }

    const statsRef = admin.firestore().doc(SCHOOL_STATS_DOC_PATH(schoolId));
    const beforeExists = change.before.exists;
    const afterExists = change.after.exists;
    const afterData = afterExists ? (change.after.data() || {}) : null;
    const beforeData = beforeExists ? (change.before.data() || {}) : null;

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (!beforeExists && afterExists) {
      updates.totalDocumentos = admin.firestore.FieldValue.increment(1);
    } else if (beforeExists && !afterExists) {
      updates.totalDocumentos = admin.firestore.FieldValue.increment(-1);
    }

    if (collectionId === 'users') {
      if (!beforeExists && afterExists) {
        updates.totalUsers = admin.firestore.FieldValue.increment(1);
        updates[userTypeCounterField(sanitizeUserType(afterData.tipo))] = admin.firestore.FieldValue.increment(1);
      } else if (beforeExists && !afterExists) {
        updates.totalUsers = admin.firestore.FieldValue.increment(-1);
        updates[userTypeCounterField(sanitizeUserType(beforeData.tipo))] = admin.firestore.FieldValue.increment(-1);
      } else if (beforeExists && afterExists) {
        const oldField = userTypeCounterField(sanitizeUserType(beforeData.tipo));
        const newField = userTypeCounterField(sanitizeUserType(afterData.tipo));
        if (oldField !== newField) {
          updates[oldField] = admin.firestore.FieldValue.increment(-1);
          updates[newField] = admin.firestore.FieldValue.increment(1);
        }
      }
    }

    await statsRef.set(updates, { merge: true });
    return null;
  });

exports.getSchoolAuditLogs = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);

  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  const limit = Math.min(100, Math.max(1, Number(data && data.limit) || 30));

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  const snapshot = await admin.firestore()
    .collection(`schools/${schoolId}/audit_logs`)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return { schoolId, logs };
});

exports.exportSchoolBackup = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);

  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  const maxDocsPerCollection = Math.min(5000, Math.max(100, Number(data && data.maxDocsPerCollection) || 2000));

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  const collectionsToExport = [
    'users',
    'members',
    'turmas',
    'componentes',
    'materiais',
    'provas',
    'provas_resultados',
    'trabalhos',
    'trabalhos_notas',
    'presencas',
    'receitas',
    'despesas',
    'movimentacoes_financeiras',
    'estoque',
    'estoque_movimentos',
    'avisos',
    'notifications',
    'audit_logs'
  ];

  const backup = {
    meta: {
      schoolId,
      exportedAt: new Date().toISOString(),
      exportedBy: context.auth.uid,
      maxDocsPerCollection
    },
    collections: {}
  };

  for (const name of collectionsToExport) {
    const ref = admin.firestore().collection(`schools/${schoolId}/${name}`);
    backup.collections[name] = await exportCollectionDocs(ref, maxDocsPerCollection);
  }

  await writeSchoolAuditLog(schoolId, context.auth.uid, 'school_backup_exported', {
    maxDocsPerCollection,
    collections: Object.keys(backup.collections)
  });

  return backup;
});

exports.deleteSchool = functions.https.onCall(async (data, context) => {
  await assertGlobalSuperAdmin(context);

  const schoolId = (data && typeof data.schoolId === 'string') ? data.schoolId.trim() : '';
  const confirmation = (data && typeof data.confirmation === 'string') ? data.confirmation.trim() : '';

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  if (confirmation !== schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'Confirmacao invalida para remocao da escola.');
  }

  const db = admin.firestore();
  const schoolRef = db.doc(`schools/${schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Escola nao encontrada.');
  }

  const bucket = admin.storage().bucket();
  const prefix = SCHOOL_STORAGE_PREFIX(schoolId);
  let pageToken = undefined;
  let deletedStorageFiles = 0;

  do {
    const [files, , response] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 1000,
      pageToken
    });

    if (files.length > 0) {
      await Promise.all(files.map(async (file) => {
        try {
          await file.delete();
          deletedStorageFiles += 1;
        } catch (err) {
          if (!err || err.code !== 404) {
            throw err;
          }
        }
      }));
    }

    pageToken = response && response.nextPageToken ? response.nextPageToken : undefined;
  } while (pageToken);

  await db.recursiveDelete(schoolRef);

  return {
    ok: true,
    schoolId,
    deletedStorageFiles,
    deletedBy: context.auth.uid,
    deletedAt: new Date().toISOString()
  };
});

exports.deleteUserByUid = functions.https.onCall(async (data, context) => {
  const schoolId = data && data.schoolId;
  const authz = await assertSchoolPermission(context, schoolId, ['admin']);

  const uid = data && data.uid;
  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'UID invalido.');
  }

  const deleteAuthUser = Boolean(data && data.deleteAuthUser);

  if (deleteAuthUser) {
    if (!authz.isGlobal) {
      throw new functions.https.HttpsError('permission-denied', 'Apenas o super admin global pode excluir usuario do Auth.');
    }

    try {
      await admin.auth().deleteUser(uid);
    } catch (err) {
      if (!err || err.code !== 'auth/user-not-found') {
        throw new functions.https.HttpsError('not-found', 'Usuario nao encontrado no Auth.');
      }
    }
  }

  await Promise.all([
    admin.firestore().doc(`schools/${schoolId}/users/${uid}`).delete(),
    admin.firestore().doc(`schools/${schoolId}/members/${uid}`).delete()
  ]);

  if (authz.isGlobal) {
    await admin.firestore().doc(`users/${uid}`).delete().catch(() => null);
  }

  return { ok: true, schoolId, uid, deleteAuthUser };
});

exports.reclaimUserByEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth || !isGlobalSuperAdmin(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Somente o super admin global pode gerenciar Auth entre escolas.');
  }

  const email = data && typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email invalido.');
  }

  const usersRef = admin.firestore().collection('users');
  const exactSnap = await usersRef.where('email', '==', email).limit(1).get();
  const emailLower = email.toLowerCase();
  const lowerSnap = emailLower !== email
    ? await usersRef.where('email', '==', emailLower).limit(1).get()
    : null;

  if (!exactSnap.empty || (lowerSnap && !lowerSnap.empty)) {
    throw new functions.https.HttpsError('already-exists', 'Email ja cadastrado no sistema.');
  }

  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') {
      return { reclaimed: false, reason: 'auth-not-found' };
    }
    throw new functions.https.HttpsError('internal', 'Falha ao localizar usuario no Auth.');
  }

  await admin.auth().deleteUser(authUser.uid);
  return { reclaimed: true, uid: authUser.uid };
});

/**
 * Envia notificação para um usuário específico
 */
exports.sendNotificationToUser = functions.https.onCall(async (data, context) => {
  const schoolId = data && data.schoolId;
  await assertSchoolPermission(context, schoolId, ['admin', 'professor']);

  const { userId, title, body, imageUrl, icon, data: notificationData } = data;

  if (!userId || !title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'userId, title e body são obrigatórios.');
  }

  try {
    // Buscar token do usuário
    const userDoc = await admin.firestore().doc(`schools/${schoolId}/users/${userId}`).get();
    
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Usuário não encontrado.');
    }

    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
      return { success: false, reason: 'no-token', message: 'Usuário não possui token FCM registrado.' };
    }

    // Verificar se notificações estão habilitadas
    if (userData.notificationsEnabled === false) {
      return { success: false, reason: 'disabled', message: 'Notificações desabilitadas pelo usuário.' };
    }

    // Preparar mensagem
    const message = {
      token: fcmToken,
      notification: {
        title: title,
        body: body
      },
      data: notificationData || {},
      webpush: {
        notification: {
          icon: icon || '/icon-192.png',
          badge: '/badge-72.png',
          requireInteraction: false
        }
      }
    };

    if (imageUrl) {
      message.notification.imageUrl = imageUrl;
    }

    // Enviar notificação
    console.log('📤 Enviando notificação para:', { userId, token: fcmToken.substring(0, 20) + '...', title, body });
    
    const response = await admin.messaging().send(message);
    
    console.log('✅ Notificação enviada com sucesso! messageId:', response);
    
    // Registrar notificação enviada
    await admin.firestore().collection(`schools/${schoolId}/notifications`).add({
      schoolId: schoolId,
      userId: userId,
      title: title,
      body: body,
      sentAt: admin.firestore.Timestamp.now(),
      sentBy: context.auth.uid,
      messageId: response,
      status: 'sent'
    });

    return { success: true, messageId: response };
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    
    // Se o token é inválido, remover do usuário
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await admin.firestore().doc(`schools/${schoolId}/users/${userId}`).update({
        fcmToken: admin.firestore.FieldValue.delete(),
        notificationsEnabled: false
      });
    }
    
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Envia notificação para múltiplos usuários
 */
exports.sendNotificationToMultipleUsers = functions.https.onCall(async (data, context) => {
  const schoolId = data && data.schoolId;
  const authz = await assertSchoolPermission(context, schoolId, ['admin', 'professor']);

  const requesterId = authz.requesterId;

  const { userIds, title, body, imageUrl, icon, data: notificationData } = data;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'userIds deve ser um array não vazio.');
  }

  if (!title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'title e body são obrigatórios.');
  }

  try {
    console.log('📤 Enviando notificações para múltiplos usuários:', {
      totalUsers: userIds.length,
      title,
      body: body.substring(0, 100) + '...',
      sentBy: requesterId
    });

    const results = {
      success: 0,
      failed: 0,
      noToken: 0,
      disabled: 0,
      errors: []
    };

    // Processar em lotes de 10 (limite razoável)
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      console.log(`📦 Processando lote ${Math.floor(i/batchSize) + 1}: ${batch.length} usuários`);
      
      await Promise.all(batch.map(async (userId) => {
        try {
          const schoolUserDoc = await admin.firestore().doc(`schools/${schoolId}/users/${userId}`).get();
          const userSourceDoc = schoolUserDoc;
          
          if (!userSourceDoc.exists) {
            results.failed++;
            results.errors.push({ userId, reason: 'not-found' });
            return;
          }

          const userData = userSourceDoc.data();
          const fcmToken = userData.fcmToken;

          if (!fcmToken) {
            console.log(`⚠️ Usuário ${userId}: sem token FCM`);
            results.noToken++;
            return;
          }

          if (userData.notificationsEnabled === false) {
            console.log(`⚠️ Usuário ${userId}: notificações desabilitadas`);
            results.disabled++;
            return;
          }

          console.log(`📱 Enviando para usuário ${userId} (token: ${fcmToken.substring(0, 20)}...)`);

          const message = {
            token: fcmToken,
            notification: {
              title: title,
              body: body
            },
            data: notificationData || {},
            webpush: {
              notification: {
                icon: icon || '/icon-192.png',
                badge: '/badge-72.png'
              }
            }
          };

          if (imageUrl) {
            message.notification.imageUrl = imageUrl;
          }

          const response = await admin.messaging().send(message);
          console.log(`✅ Notificação enviada! userId: ${userId}, messageId: ${response}`);
          results.success++;

          // Registrar notificação
          await admin.firestore().collection(`schools/${schoolId}/notifications`).add({
            schoolId: schoolId,
            userId: userId,
            title: title,
            body: body,
            sentAt: admin.firestore.Timestamp.now(),
            sentBy: requesterId,
            messageId: response,
            status: 'sent'
          });

        } catch (error) {
          console.error(`❌ Erro ao enviar para ${userId}:`, error.message, error.code);
          results.failed++;
          results.errors.push({ userId, reason: error.message });
          
          // Limpar token inválido
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            console.log(`🗑️ Removendo token inválido do usuário ${userId}`);
            await admin.firestore().doc(`schools/${schoolId}/users/${userId}`).update({
              fcmToken: admin.firestore.FieldValue.delete(),
              notificationsEnabled: false
            });
          }
        }
      }));
    }

    console.log('📊 Resumo do envio de notificações:', {
      total: userIds.length,
      sucesso: results.success,
      falhas: results.failed,
      semToken: results.noToken,
      desabilitadas: results.disabled
    });

    return results;
  } catch (error) {
    console.error('Erro ao enviar notificações:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Envia notificação para todos os alunos de uma turma
 */
exports.sendNotificationToTurma = functions.https.onCall(async (data, context) => {
  const schoolId = data && data.schoolId;
  await assertSchoolPermission(context, schoolId, ['admin', 'professor']);

  const { turmaId, title, body, imageUrl, icon, data: notificationData } = data;

  if (!turmaId || !title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'turmaId, title e body são obrigatórios.');
  }

  try {
    // Buscar todos os alunos da turma
    const alunosSnapshot = await admin.firestore()
      .collection(`schools/${schoolId}/users`)
      .where('tipo', '==', 'aluno')
      .where('turma', '==', turmaId)
      .get();

    if (alunosSnapshot.empty) {
      return { success: 0, failed: 0, noToken: 0, disabled: 0, message: 'Nenhum aluno encontrado na turma.' };
    }

    const userIds = alunosSnapshot.docs.map(doc => doc.id);

    // Usar a função de múltiplos usuários
    const sendMultiple = require('./index').sendNotificationToMultipleUsers;
    return await sendMultiple({
      schoolId,
      userIds,
      title,
      body,
      imageUrl,
      icon,
      data: notificationData
    }, context);

  } catch (error) {
    console.error('Erro ao enviar notificações para turma:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Envia notificação para todos os usuários de um tipo
 */
exports.sendNotificationByUserType = functions.https.onCall(async (data, context) => {
  const schoolId = data && data.schoolId;
  await assertSchoolPermission(context, schoolId, ['admin']);

  const { userType, title, body, imageUrl, icon, data: notificationData } = data;

  if (!userType || !['aluno', 'professor', 'admin', 'responsavel'].includes(userType)) {
    throw new functions.https.HttpsError('invalid-argument', 'userType inválido. Use: aluno, professor, admin ou responsavel.');
  }

  if (!title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'title e body são obrigatórios.');
  }

  try {
    // Buscar todos os usuários do tipo especificado
    const usersSnapshot = await admin.firestore()
      .collection(`schools/${schoolId}/users`)
      .where('tipo', '==', userType)
      .get();

    if (usersSnapshot.empty) {
      return { success: 0, failed: 0, noToken: 0, disabled: 0, message: 'Nenhum usuário encontrado.' };
    }

    const userIds = usersSnapshot.docs.map(doc => doc.id);

    // Usar a função de múltiplos usuários
    const sendMultiple = require('./index').sendNotificationToMultipleUsers;
    return await sendMultiple({
      schoolId,
      userIds,
      title,
      body,
      imageUrl,
      icon,
      data: notificationData
    }, context);

  } catch (error) {
    console.error('Erro ao enviar notificações por tipo de usuário:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ===================================================================
// 📧 FUNÇÃO DE ENVIO DE EMAIL VIA NODEMAILER + SENDGRID
// ===================================================================

exports.sendEmail = functions.https.onCall(async (data, context) => {
  // Validar autenticação
  if (!context.auth) {
    console.warn('⚠️ Tentativa de envio de email não autenticada');
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'Você precisa estar logado no sistema para enviar emails'
    );
  }

  const schoolId = data && data.schoolId;
  await assertSchoolPermission(context, schoolId, ['admin', 'professor', 'secretaria']);

  console.log(`📧 Iniciando envio de email - Usuário: ${context.auth.uid}`);

  // Validar dados de entrada
  const { to, subject, html, text } = data;
  
  if (!to || !subject || (!html && !text)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Campos obrigatórios: to, subject, e (html ou text)'
    );
  }

  try {
    // Configurar transporter do Nodemailer com SendGrid
    console.log('🔧 Configurando transporter SMTP...');
    const transporter = nodemailer.createTransporter({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: 'REDACTED
      }
    });

    // Configurar email
    const mailOptions = {
      from: 'senateduvaledoaco@gmail.com',
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: subject,
      html: html || undefined,
      text: text || undefined,
      replyTo: data.replyTo || 'senateduvaledoaco@gmail.com'
    };

    // Adicionar CC e BCC se fornecidos
    if (data.cc) mailOptions.cc = Array.isArray(data.cc) ? data.cc.join(', ') : data.cc;
    if (data.bcc) mailOptions.bcc = Array.isArray(data.bcc) ? data.bcc.join(', ') : data.bcc;

    // Enviar email
    console.log('📧 Enviando email para:', to);
    console.log('📋 Assunto:', subject);
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email enviado com sucesso! MessageId:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || []
    };

  } catch (error) {
    console.error('❌ ERRO ao enviar email:');
    console.error('Tipo:', error.name);
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    
    const errorMsg = error.message || 'Erro desconhecido';
    throw new functions.https.HttpsError('internal', `Falha ao enviar email: ${errorMsg}`);
  }
});

// ===================================================================
// 📧 VERSÃO HTTP COM CORS (ALTERNATIVA)
// ===================================================================

exports.sendEmailHttp = functions.https.onRequest(async (req, res) => {
  console.log('🔵 sendEmailHttp INICIADA:', { method: req.method, origin: req.headers.origin });
  
  // Configurar CORS headers PRIMEIRO, antes de qualquer lógica
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-School-Id, x-school-id');
  res.set('Access-Control-Max-Age', '3600');

  console.log('🟢 CORS headers setados');

  // Responder a preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS recebida - respondendo 204');
    return res.status(204).send('');
  }

  console.log('🔵 Método:', req.method);

  try {
    // Apenas POST
    if (req.method !== 'POST') {
      console.log('❌ Método não permitido:', req.method);
      return res.status(405).json({error: 'Método não permitido'});
    }

    // Validar token de autenticação
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({error: 'Não autenticado'});
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Erro ao verificar token:', error);
      return res.status(401).json({error: 'Token inválido'});
    }

    console.log(`📧 HTTP: Usuário autenticado: ${decodedToken.uid}`);

    const { to, subject, html, text, replyTo } = req.body;
    const schoolId = (req.body && req.body.schoolId) || req.headers['x-school-id'];

    const authz = await assertUidSchoolPermission(decodedToken.uid, schoolId, ['admin', 'professor', 'secretaria', 'aluno']);

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({error: 'Campos obrigatórios: to, subject, html/text'});
    }

    // Aluno pode apenas testar envio para o proprio email (sem uso como relay).
    if (authz.requesterRole === 'aluno' && !authz.isGlobal) {
      const recipients = Array.isArray(to) ? to : [to];
      const requesterEmail = String(decodedToken.email || '').trim().toLowerCase();
      const targetEmail = String(recipients[0] || '').trim().toLowerCase();

      if (!requesterEmail || recipients.length !== 1 || targetEmail !== requesterEmail) {
        return res.status(403).json({
          error: 'Usuario sem permissao para esta operacao.',
          message: 'Aluno pode enviar email de teste apenas para o proprio email da conta.'
        });
      }
    }

    // Usar SendGrid API REST diretamente (mais confiável que SMTP)
    console.log('📧 Enviando via SendGrid API REST...');
    
    const sgMail = {
      personalizations: [{
        to: Array.isArray(to) ? to.map(email => ({email})) : [{email: to}],
      }],
      from: { email: 'senateduvaledoaco@gmail.com', name: 'SENATEDU' },
      subject: subject,
      content: [
        { type: 'text/html', value: html || text }
      ]
    };

    if (replyTo) {
      sgMail.reply_to = { email: replyTo };
    }

    const fetch = require('node-fetch');
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer REDACTED
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sgMail)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ SendGrid API error:', response.status, errorText);
      throw new Error(`SendGrid API error: ${response.status}`);
    }

    console.log('✅ Email enviado via SendGrid API! Status:', response.status);
    
    return res.status(200).json({
      success: true,
      messageId: response.headers.get('x-message-id') || 'sent',
      accepted: Array.isArray(to) ? to : [to],
      rejected: []
    });

  } catch (error) {
    console.error('❌ Erro HTTP:', error);
    return res.status(500).json({
      error: 'Falha ao enviar email',
      message: error.message
    });
  }
});

