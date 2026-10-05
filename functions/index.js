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

async function commitDeleteBatch(docRefs = []) {
  if (!Array.isArray(docRefs) || docRefs.length === 0) return 0;

  let deleted = 0;
  for (let index = 0; index < docRefs.length; index += 400) {
    const batch = admin.firestore().batch();
    const slice = docRefs.slice(index, index + 400);
    slice.forEach((docRef) => batch.delete(docRef));
    await batch.commit();
    deleted += slice.length;
  }

  return deleted;
}

function parseResultadoNota(rawNota) {
  const nota = typeof rawNota === 'number' ? rawNota : parseFloat(rawNota);
  return Number.isFinite(nota) ? nota : null;
}

function getResultadoTimestampMs(resultadoData) {
  const value = resultadoData && resultadoData.data;
  if (!value) return 0;
  if (typeof value.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted.getTime() : 0;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const converted = new Date(value);
  return Number.isNaN(converted.getTime()) ? 0 : converted.getTime();
}

async function commitUpdateBatch(updates = []) {
  if (!Array.isArray(updates) || updates.length === 0) return 0;

  let updated = 0;
  for (let index = 0; index < updates.length; index += 400) {
    const batch = admin.firestore().batch();
    const slice = updates.slice(index, index + 400);
    slice.forEach(({ ref, payload }) => batch.update(ref, payload));
    await batch.commit();
    updated += slice.length;
  }

  return updated;
}

exports.repairSchoolProvaResultados = functions.https.onCall(async (data, context) => {
  const schoolId = data && typeof data.schoolId === 'string' ? data.schoolId.trim() : '';
  const provaId = data && typeof data.provaId === 'string' ? data.provaId.trim() : '';

  await assertSchoolPermission(context, schoolId, ['admin', 'professor']);

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  const db = admin.firestore();
  const provasRef = db.collection(`schools/${schoolId}/provas`);
  const resultadosRef = db.collection(`schools/${schoolId}/provas_resultados`);

  const [provasSnapshot, resultadosSnapshot, targetedSnapshot] = await Promise.all([
    provasRef.get(),
    resultadosRef.get(),
    provaId ? resultadosRef.where('provaId', '==', provaId).get() : Promise.resolve(null)
  ]);

  const validProvaIds = new Set(provasSnapshot.docs.map((doc) => doc.id));
  const orphanedRefs = resultadosSnapshot.docs
    .filter((doc) => !validProvaIds.has(doc.get('provaId')))
    .map((doc) => doc.ref);
  const targetedRefs = targetedSnapshot
    ? targetedSnapshot.docs.map((doc) => doc.ref)
    : [];

  const refsByPath = new Map();
  [...orphanedRefs, ...targetedRefs].forEach((ref) => {
    refsByPath.set(ref.path, ref);
  });

  const deletedCount = await commitDeleteBatch(Array.from(refsByPath.values()));

  return {
    schoolId,
    provaId: provaId || null,
    orphanedFound: orphanedRefs.length,
    targetedFound: targetedRefs.length,
    deletedCount
  };
});

exports.materializeBestUnlimitedAttempts = functions.https.onCall(async (data, context) => {
  const schoolId = data && typeof data.schoolId === 'string' ? data.schoolId.trim() : '';
  const provaId = data && typeof data.provaId === 'string' ? data.provaId.trim() : '';
  const dryRun = data && data.dryRun === true;

  await assertSchoolPermission(context, schoolId, ['admin']);

  if (!schoolId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e obrigatorio.');
  }

  const db = admin.firestore();
  const provasRef = db.collection(`schools/${schoolId}/provas`);
  const resultadosRef = db.collection(`schools/${schoolId}/provas_resultados`);

  let provasSnapshot;
  if (provaId) {
    provasSnapshot = await provasRef.where(admin.firestore.FieldPath.documentId(), '==', provaId).get();
  } else {
    provasSnapshot = await provasRef.where('attempts', '==', 0).get();
  }

  if (provasSnapshot.empty) {
    return {
      schoolId,
      provaId: provaId || null,
      provasProcessadas: 0,
      gruposAlunoProcessados: 0,
      docsAtualizados: 0,
      dryRun,
      message: provaId ? 'Prova nao encontrada ou sem tentativas ilimitadas.' : 'Nenhuma prova com tentativas ilimitadas encontrada.'
    };
  }

  const provas = provasSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((prova) => prova && prova.attempts === 0);

  if (provas.length === 0) {
    return {
      schoolId,
      provaId: provaId || null,
      provasProcessadas: 0,
      gruposAlunoProcessados: 0,
      docsAtualizados: 0,
      dryRun,
      message: 'A prova informada nao possui tentativas ilimitadas.'
    };
  }

  const updates = [];
  let gruposAlunoProcessados = 0;
  let docsCandidatosAtualizacao = 0;

  for (const prova of provas) {
    const resultadosSnapshot = await resultadosRef.where('provaId', '==', prova.id).get();
    if (resultadosSnapshot.empty) continue;

    const porAluno = new Map();
    resultadosSnapshot.docs.forEach((doc) => {
      const row = { id: doc.id, ref: doc.ref, ...doc.data() };
      const alunoId = row.alunoId;
      if (!alunoId) return;
      if (!porAluno.has(alunoId)) porAluno.set(alunoId, []);
      porAluno.get(alunoId).push(row);
    });

    porAluno.forEach((resultadosAluno) => {
      if (!Array.isArray(resultadosAluno) || resultadosAluno.length === 0) return;

      let best = null;
      resultadosAluno.forEach((resultado) => {
        const nota = parseResultadoNota(resultado.nota);
        if (!best) {
          best = resultado;
          return;
        }

        const bestNota = parseResultadoNota(best.nota);
        const tsAtual = getResultadoTimestampMs(resultado);
        const tsBest = getResultadoTimestampMs(best);

        if (nota != null && bestNota == null) {
          best = resultado;
          return;
        }
        if (nota != null && bestNota != null && nota > bestNota) {
          best = resultado;
          return;
        }
        if (nota != null && bestNota != null && nota === bestNota && tsAtual > tsBest) {
          best = resultado;
        }
      });

      const notaFinal = parseResultadoNota(best && best.nota);
      const bestId = best ? best.id : null;
      if (notaFinal == null || !bestId) return;

      gruposAlunoProcessados += 1;
      resultadosAluno.forEach((resultado) => {
        docsCandidatosAtualizacao += 1;
        updates.push({
          ref: resultado.ref,
          payload: {
            notaFinalModalidade: notaFinal,
            tentativaConsideradaModalidade: resultado.id === bestId,
            modalidadeTentativasIlimitadasMaterializadaEm: admin.firestore.FieldValue.serverTimestamp()
          }
        });
      });
    });
  }

  const docsAtualizados = dryRun ? 0 : await commitUpdateBatch(updates);

  if (!dryRun) {
    await writeSchoolAuditLog(schoolId, context.auth.uid, 'materialize_best_unlimited_attempts', {
      provaId: provaId || null,
      provasProcessadas: provas.length,
      gruposAlunoProcessados,
      docsAtualizados,
      docsCandidatosAtualizacao
    });
  }

  return {
    schoolId,
    provaId: provaId || null,
    provasProcessadas: provas.length,
    gruposAlunoProcessados,
    docsAtualizados,
    docsCandidatosAtualizacao,
    dryRun
  };
});

const TREINAMENTO_REFERENCIA_URL = `${APP_BASE_URL}/Treinamentos/NR11.html`;
const TREINAMENTO_MAX_HTML_BYTES = 900 * 1024;

function normalizeQuestionReviewText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^[a-d]\s*[\)\].:-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuestionReviewResponse(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
}

exports.revisarQuestoesProva = functions
  .runWith({ timeoutSeconds: 180, memory: '512MB' })
  .https.onCall(async (data, context) => {
    const schoolId = String((data && data.schoolId) || '').trim();
    await assertSchoolPermission(context, schoolId, ['admin', 'professor', 'secretaria']);

    const questions = data && data.questions;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 40) {
      throw new functions.https.HttpsError('invalid-argument', 'A prova deve conter de 1 a 40 questoes para revisao.');
    }

    const questionsForReview = questions.map((question, index) => {
      const text = String(question && question.text || '').trim();
      const options = question && question.options;
      const correct = Number(question && question.correct);
      if (!text || text.length > 2000 || !Array.isArray(options) || options.length !== 4
          || options.some((option) => typeof option !== 'string' || !option.trim() || option.length > 500)
          || !Number.isInteger(correct) || correct < 0 || correct > 3) {
        throw new functions.https.HttpsError('invalid-argument', `A questao ${index + 1} possui dados invalidos para revisao.`);
      }
      return { text, options: options.map((option) => option.trim()), correct };
    });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'GEMINI_API_KEY nao configurada nas functions.');
    }

    const systemInstruction = [
      'Voce e um revisor de qualidade de provas escolares em portugues do Brasil.',
      'Revise TODAS as questoes recebidas, considerando o conjunto inteiro.',
      'Identifique questoes repetidas ou semanticamente muito semelhantes, alternativas repetidas dentro da mesma questao, alternativas que nao respondem ou nao pertencem ao enunciado, enunciados confusos e gabaritos que nao correspondem a alternativa correta.',
      'Corrija esses problemas preservando tema, nivel e intencao pedagogica. Se houver questoes repetidas, reescreva o enunciado e as alternativas de uma delas para cobrar um aspecto distinto do tema.',
      'Cada questao deve ter exatamente quatro alternativas distintas e pertinentes, e exatamente uma alternativa correta. Use o indice da alternativa correta, de 0 a 3.',
      'Nao altere questoes que ja estejam estruturalmente corretas e nao inclua explicacoes ou texto fora do JSON.',
      'Retorne no formato JSON: {"questions":[{"text":"...","options":["...","...","...","..."],"correct":0}]}'
    ].join('\n');

    const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{
        role: 'user',
        parts: [{ text: `Revise estruturalmente esta prova e devolva todas as questoes no formato solicitado:\n${JSON.stringify(questionsForReview)}` }]
      }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 16000 }
    });

    let json = null;
    let lastStatus = 'sem resposta';
    const deadline = Date.now() + 150 * 1000;
    for (let attempt = 0; attempt < 8 && Date.now() < deadline && !json; attempt++) {
      const model = models[attempt % models.length];
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: requestBody
        });
        lastStatus = response.status;
        if (response.ok) {
          json = await response.json();
          break;
        }
        const errorBody = (await response.text()).slice(0, 300);
        console.warn('Gemini indisponivel para revisar questoes', model, response.status, errorBody);
        if (![429, 500, 503, 404].includes(response.status)) break;
      } catch (error) {
        lastStatus = 'erro de rede';
        console.warn('Falha ao chamar Gemini para revisar questoes', model, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    if (!json) {
      throw new functions.https.HttpsError('unavailable', `Nao foi possivel revisar as questoes com IA (${lastStatus}). Tente novamente.`);
    }

    const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
    const responseText = parts.map((part) => part.text || '').join('');
    let reviewedQuestions;
    try {
      const parsed = parseQuestionReviewResponse(responseText);
      reviewedQuestions = parsed && parsed.questions;
    } catch (error) {
      console.error('Resposta JSON invalida na revisao de questoes:', error);
      throw new functions.https.HttpsError('internal', 'A IA retornou uma revisao de questoes invalida. Tente novamente.');
    }

    if (!Array.isArray(reviewedQuestions) || reviewedQuestions.length !== questionsForReview.length) {
      throw new functions.https.HttpsError('internal', 'A IA nao preservou a quantidade de questoes durante a revisao. Tente novamente.');
    }

    const reviewed = reviewedQuestions.map((question, index) => {
      const text = String(question && question.text || '').trim();
      const options = question && question.options;
      const correct = Number(question && question.correct);
      if (!text || text.length > 2000 || !Array.isArray(options) || options.length !== 4
          || options.some((option) => typeof option !== 'string' || !option.trim() || option.length > 500)
          || !Number.isInteger(correct) || correct < 0 || correct > 3) {
        throw new functions.https.HttpsError('internal', `A revisao da questao ${index + 1} retornou uma estrutura invalida.`);
      }
      const normalizedOptions = options.map(normalizeQuestionReviewText);
      if (new Set(normalizedOptions).size !== 4) {
        throw new functions.https.HttpsError('internal', `A revisao da questao ${index + 1} manteve alternativas repetidas. Gere a prova novamente.`);
      }
      return { text, options: options.map((option) => option.trim()), correct };
    });

    const normalizedQuestions = reviewed.map((question) => normalizeQuestionReviewText(question.text));
    if (new Set(normalizedQuestions).size !== normalizedQuestions.length) {
      throw new functions.https.HttpsError('internal', 'A revisao manteve questoes repetidas. Gere a prova novamente.');
    }

    const revisedQuestionsCount = reviewed.reduce((count, question, index) => {
      const original = questionsForReview[index];
      const changed = normalizeQuestionReviewText(question.text) !== normalizeQuestionReviewText(original.text)
        || question.options.some((option, optionIndex) =>
          normalizeQuestionReviewText(option) !== normalizeQuestionReviewText(original.options[optionIndex]))
        || question.correct !== original.correct;
      return count + (changed ? 1 : 0);
    }, 0);

    return { questions: reviewed, revisedQuestionsCount };
  });

exports.gerarTreinamentoIA = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    const schoolId = String((data && data.schoolId) || '').trim();
    await assertSchoolPermission(context, schoolId, ['admin']);

    const titulo = String((data && data.titulo) || '').trim();
    const instrucoes = String((data && data.instrucoes) || '').trim();
    if (titulo.length < 3 || titulo.length > 120) {
      throw new functions.https.HttpsError('invalid-argument', 'Titulo deve ter entre 3 e 120 caracteres.');
    }
    if (instrucoes.length < 10 || instrucoes.length > 5000) {
      throw new functions.https.HttpsError('invalid-argument', 'Instrucoes devem ter entre 10 e 5000 caracteres.');
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError('failed-precondition', 'GEMINI_API_KEY nao configurada nas functions.');
    }
    const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'];

    const refResp = await fetch(TREINAMENTO_REFERENCIA_URL);
    if (!refResp.ok) {
      throw new functions.https.HttpsError('internal', 'Nao foi possivel carregar o treinamento de referencia.');
    }
    const referencia = await refResp.text();

    const systemInstruction = [
      'Voce cria treinamentos corporativos gamificados em um unico arquivo HTML autocontido.',
      'Mantenha EXATAMENTE o mesmo padrao de layout, estilos, estrutura de modulos, quizzes, pontuacao/XP, progresso e navegacao do treinamento de referencia fornecido.',
      'Altere somente o conteudo (textos, perguntas, exemplos, titulo, icones) para o novo tema.',
      'Conteudo em portugues do Brasil, tecnicamente correto e coerente com a legislacao/normas aplicaveis.',
      'Nao inclua Firebase nem codigo de rastreamento; ele sera adicionado depois.',
      'Ao concluir o treinamento, se o modelo de referencia chamar window.SENATEDU_TREINAMENTO.concluir, mantenha essa chamada com a nota final.',
      'Responda APENAS com o codigo HTML completo, de <!DOCTYPE html> ate </html>, sem markdown e sem explicacoes.'
    ].join('\n');

    const userPrompt = `TREINAMENTO DE REFERENCIA (padrao a seguir):\n\n${referencia}\n\n=====\n\nCrie um NOVO treinamento com o titulo "${titulo}".\nInstrucoes e caracteristicas desejadas:\n${instrucoes}`;

    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 65000 }
    });
    const deadline = Date.now() + 250 * 1000;
    let resp = null;
    for (let attempt = 0; attempt < 6 && Date.now() < deadline; attempt++) {
      const model = models[attempt % models.length];
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: requestBody
      });
      if (resp.ok || ![429, 500, 503, 404].includes(resp.status)) break;
      console.warn('Gemini indisponivel', model, resp.status, (await resp.text()).slice(0, 300));
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!resp || !resp.ok) {
      const status = resp ? resp.status : 'timeout';
      if (resp) console.error('Gemini error', status, (await resp.text()).slice(0, 500));
      throw new functions.https.HttpsError('unavailable', `A IA esta sobrecarregada no momento (HTTP ${status}). Tente novamente em alguns minutos.`);
    }
    const json = await resp.json();
    const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
    let html = parts.map((p) => p.text || '').join('').trim();
    html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '').trim();

    if (!/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
      throw new functions.https.HttpsError('internal', 'A IA retornou um HTML incompleto. Tente novamente com instrucoes mais enxutas.');
    }
    if (Buffer.byteLength(html, 'utf8') > TREINAMENTO_MAX_HTML_BYTES) {
      throw new functions.https.HttpsError('internal', 'O HTML gerado excede o tamanho maximo permitido.');
    }
    return { html };
  });

exports.treinamentoGerado = functions.https.onRequest(async (req, res) => {
  const match = /^\/Treinamentos\/gerado-([a-z0-9-]{1,60})\.html$/.exec(req.path);
  const schoolId = String(req.query.escola || '').trim();
  if (!match || !/^[A-Za-z0-9_-]{1,100}$/.test(schoolId)) {
    res.status(404).send('Nao encontrado');
    return;
  }
  const snap = await admin.firestore().doc(`schools/${schoolId}/treinamentos_html/${match[1]}`).get();
  const html = snap.exists ? snap.get('html') : null;
  if (typeof html !== 'string') {
    res.status(404).send('Nao encontrado');
    return;
  }
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(html);
});

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

exports.onSchoolCollectionWrite = functions.region('southamerica-east1').firestore
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

const INVALID_TOKEN_CODES = [
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
];

/**
 * Envia a notificação para TODOS os dispositivos registrados do usuário
 * (subcoleção fcmTokens + campo legado fcmToken) e remove tokens inválidos.
 */
async function sendPushToUserDevices(schoolId, userId, userData, payload) {
  const db = admin.firestore();
  const tokens = new Set();
  if (userData.fcmToken) tokens.add(userData.fcmToken);

  const tokenSnap = await db.collection(`schools/${schoolId}/fcmTokens`).where('userId', '==', userId).get();
  tokenSnap.forEach(d => {
    const t = (d.data() && d.data().token) || d.id;
    if (t) tokens.add(t);
  });

  if (tokens.size === 0) console.warn(`⚠️ Usuário ${userId}: sem token FCM registrado`);
  if (tokens.size === 0) return { noToken: true, sent: 0, failed: 0, messageIds: [], errors: [] };

  const { title, body, imageUrl, icon, data: extra } = payload;
  const dataStr = {};
  Object.keys(extra || {}).forEach(k => { dataStr[k] = String(extra[k]); });

  const result = { noToken: false, sent: 0, failed: 0, messageIds: [], errors: [] };

  for (const token of tokens) {
    const message = {
      token,
      notification: { title, body },
      data: dataStr,
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      webpush: {
        headers: { Urgency: 'high', TTL: '86400' },
        notification: { icon: icon || '/icon-192.png', badge: '/badge-72.png' }
      }
    };
    if (imageUrl) message.notification.imageUrl = imageUrl;

    try {
      const id = await admin.messaging().send(message);
      result.sent++;
      result.messageIds.push(id);
      console.log(`✅ FCM aceitou envio para ${userId} (token ...${token.slice(-8)}): ${id}`);
    } catch (error) {
      result.failed++;
      result.errors.push({ code: error.code, message: error.message });
      console.error(`❌ FCM falhou para ${userId}:`, error.code, error.message);
      if (INVALID_TOKEN_CODES.includes(error.code)) {
        await db.doc(`schools/${schoolId}/fcmTokens/${token}`).delete().catch(() => {});
        if (userData.fcmToken === token) {
          await db.doc(`schools/${schoolId}/users/${userId}`)
            .update({ fcmToken: admin.firestore.FieldValue.delete() }).catch(() => {});
        }
      }
    }
  }
  return result;
}

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

    if (userData.notificationsEnabled === false) {
      return { success: false, reason: 'disabled', message: 'Notificações desabilitadas pelo usuário.' };
    }

    const r = await sendPushToUserDevices(schoolId, userId, userData, { title, body, imageUrl, icon, data: notificationData });

    if (r.noToken) {
      return { success: false, reason: 'no-token', message: 'Usuário não possui token FCM registrado.' };
    }

    if (r.sent === 0) {
      const first = r.errors[0] || {};
      return { success: false, reason: 'fcm-error', message: `Falha no envio FCM (${first.code || 'erro'}): ${first.message || ''}` };
    }

    await admin.firestore().collection(`schools/${schoolId}/notifications`).add({
      schoolId: schoolId,
      userId: userId,
      title: title,
      body: body,
      sentAt: admin.firestore.Timestamp.now(),
      sentBy: context.auth.uid,
      messageId: r.messageIds[0],
      devices: r.sent,
      status: 'sent'
    });

    return { success: true, messageId: r.messageIds[0], devices: r.sent, failedDevices: r.failed };
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

          if (userData.notificationsEnabled === false) {
            results.disabled++;
            return;
          }

          const r = await sendPushToUserDevices(schoolId, userId, userData, { title, body, imageUrl, icon, data: notificationData });

          if (r.noToken) {
            results.noToken++;
            return;
          }

          if (r.sent === 0) {
            results.failed++;
            results.errors.push({ userId, reason: (r.errors[0] && r.errors[0].message) || 'fcm-error' });
            return;
          }

          results.success++;
          const response = r.messageIds[0];
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
        pass: process.env.SENDGRID_API_KEY || ''
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
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY || ''}`,
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

function setPublicActivityCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Max-Age', '3600');
}

function normalizePublicAtividadeQuestion(rawQuestion, index) {
  const options = Array.isArray(rawQuestion && rawQuestion.options)
    ? rawQuestion.options.map((opt) => String(opt || '').trim()).filter(Boolean)
    : [];
  const timeLimit = Number(rawQuestion && rawQuestion.timeLimit);

  return {
    id: rawQuestion && rawQuestion.id ? String(rawQuestion.id) : `q-${index + 1}`,
    text: String((rawQuestion && (rawQuestion.text || rawQuestion.question)) || `Questao ${index + 1}`).trim(),
    options,
    timeLimit: Number.isInteger(timeLimit) && timeLimit >= 5 && timeLimit <= 600 ? timeLimit : null
  };
}

function normalizeCorrectionQuestion(rawQuestion, index) {
  const normalized = normalizePublicAtividadeQuestion(rawQuestion, index);
  const correctRaw = rawQuestion && Number.isInteger(rawQuestion.correct) ? rawQuestion.correct : 0;
  const maxIndex = normalized.options.length - 1;
  const correctIndex = Math.min(Math.max(correctRaw, 0), Math.max(maxIndex, 0));
  return {
    ...normalized,
    correctIndex
  };
}

function sanitizeParticipantName(value) {
  return String(value || '').trim().slice(0, 120);
}

function sanitizeParticipantEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 160);
}

function normalizeAnswers(rawAnswers, totalQuestions) {
  const answers = Array.isArray(rawAnswers) ? rawAnswers : [];
  const normalized = new Array(totalQuestions).fill(null);
  for (let i = 0; i < totalQuestions; i += 1) {
    const value = answers[i];
    normalized[i] = Number.isInteger(value) ? value : null;
  }
  return normalized;
}

function buildActivitySummary(questions, answers, valorAtividade) {
  let acertos = 0;
  let respondidas = 0;
  const questoesErradas = [];

  questions.forEach((q, index) => {
    const selected = answers[index];
    if (!Number.isInteger(selected)) return;
    respondidas += 1;
    if (selected === q.correctIndex) {
      acertos += 1;
      return;
    }
    questoesErradas.push({
      numero: index + 1,
      enunciado: q.text,
      respostaMarcada: selected,
      respostaMarcadaTexto: q.options[selected] || 'Opcao nao identificada',
      respostaCorreta: q.correctIndex,
      respostaCorretaTexto: q.options[q.correctIndex] || 'Opcao nao identificada'
    });
  });

  const totalQuestoes = questions.length;
  const percentual = totalQuestoes > 0 ? (acertos / totalQuestoes) * 100 : 0;
  const nota = totalQuestoes > 0 ? (acertos / totalQuestoes) * valorAtividade : 0;

  return {
    acertos,
    respondidas,
    totalQuestoes,
    percentual,
    nota,
    valorAtividade,
    questoesErradas
  };
}

exports.getPublicAtividadeAvulsa = functions.https.onRequest(async (req, res) => {
  setPublicActivityCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Metodo nao permitido.' });

  try {
    const schoolId = String(req.body && req.body.schoolId || '').trim();
    const atividadeId = String(req.body && req.body.atividadeId || '').trim();
    if (!schoolId || !atividadeId) {
      return res.status(400).json({ ok: false, message: 'schoolId e atividadeId sao obrigatorios.' });
    }

    const atividadeDoc = await admin.firestore()
      .collection('schools')
      .doc(schoolId)
      .collection('provas')
      .doc(atividadeId)
      .get();

    if (!atividadeDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Atividade nao encontrada.' });
    }

    const atividade = atividadeDoc.data() || {};
    const isPublicActivity = String(atividade.tipo || '').toLowerCase() === 'atividade'
      && (atividade.avulsaPublica === true || atividade.quiz === true)
      && atividade.published === true;

    if (!isPublicActivity) {
      return res.status(403).json({ ok: false, message: 'Atividade indisponivel.' });
    }

    const isWordCloud = atividade.wordCloud === true;
    const questions = Array.isArray(atividade.questions)
      ? atividade.questions.map(normalizePublicAtividadeQuestion).filter((q) => q.options.length >= 2)
      : [];

    let wordCloudWords = [];
    if (isWordCloud) {
      const wordsSnapshot = await admin.firestore()
        .collection('schools').doc(schoolId).collection('word_cloud_words')
        .where('atividadeId', '==', atividadeId).get();
      wordCloudWords = wordsSnapshot.docs
        .map((doc) => ({ palavra: String(doc.data()?.palavra || ''), quantidade: Number(doc.data()?.quantidade || 0) }))
        .filter((item) => item.palavra && item.quantidade > 0)
        .sort((left, right) => right.quantidade - left.quantidade || left.palavra.localeCompare(right.palavra, 'pt-BR'));
    }

    let quizParticipantes = [];
    if (atividade.quiz === true && atividade.quizSessionId) {
      const participantesSnapshot = await admin.firestore().collection('schools').doc(schoolId).collection('quiz_participantes')
        .where('atividadeId', '==', atividadeId).get();
      quizParticipantes = participantesSnapshot.docs.map((doc) => ({ id: doc.id, nome: String(doc.data()?.nome || 'Aluno'), entrouEm: doc.data()?.entrouEm || null }));
    }

    let quizRanking = [];
    if (atividade.quiz === true && atividade.quizSessionId) {
      const resultadosSnapshot = await admin.firestore()
        .collection('schools')
        .doc(schoolId)
        .collection('provas_resultados')
        .where('provaId', '==', atividadeId)
        .get();
      const rankingMap = new Map();
      resultadosSnapshot.forEach((doc) => {
        const resultado = doc.data() || {};
        if (resultado.quizResposta !== true || resultado.quizSessionId !== String(atividade.quizSessionId)) return;
        const item = rankingMap.get(resultado.alunoId) || {
          alunoId: resultado.alunoId,
          alunoNome: String(resultado.alunoNome || resultado.alunoId || 'Aluno'),
          acertos: 0,
          tempoTotal: 0
        };
        const questionIndex = Number(resultado.questaoIndex);
        const question = questions[questionIndex];
        const acertou = question && Number(resultado.resposta) === normalizeCorrectionQuestion(atividade.questions[questionIndex], questionIndex).correctIndex;
        if (acertou) {
          item.acertos += 1;
          item.tempoTotal += Number(resultado.tempoResposta) || 0;
        }
        rankingMap.set(resultado.alunoId, item);
      });
      quizRanking = [...rankingMap.values()]
        .sort((left, right) => right.acertos - left.acertos || left.tempoTotal - right.tempoTotal)
        .map((item, index) => ({ ...item, posicao: index + 1 }));
    }

    const safePayload = {
      titulo: String(atividade.titulo || 'Atividade EAD'),
      tipo: 'atividade',
      avulsaPublica: atividade.avulsaPublica === true,
      quiz: atividade.quiz === true,
      published: true,
      valor: Number(atividade.valor || 0),
      criadoPorNome: atividade.criadoPorNome ? String(atividade.criadoPorNome) : '',
      dataFim: atividade.dataFim || atividade.dataAgendada || null,
      dataAgendada: atividade.dataAgendada || null,
      quizStatus: atividade.quizStatus || 'draft',
      quizQuestionIndex: Number.isInteger(atividade.quizQuestionIndex) ? atividade.quizQuestionIndex : -1,
      quizSessionId: atividade.quizSessionId ? String(atividade.quizSessionId) : null,
      quizQuestionStartedAt: atividade.quizQuestionStartedAt && typeof atividade.quizQuestionStartedAt.toDate === 'function'
        ? atividade.quizQuestionStartedAt.toDate().toISOString()
        : null,
      quizTempoQuestao: Number(atividade.quizTempoQuestao || 30),
      quizRanking,
      quizParticipantes,
      questions,
      wordCloud: isWordCloud,
      wordCloudWords,
      wordCloudResetVersion: Number(atividade.wordCloudResetVersion || 0)
    };

    return res.status(200).json({ ok: true, atividade: safePayload });
  } catch (error) {
    console.error('Erro getPublicAtividadeAvulsa:', error);
    return res.status(500).json({ ok: false, message: 'Falha ao carregar atividade.' });
  }
});

exports.submitAtividadeAvulsa = functions.https.onRequest(async (req, res) => {
  setPublicActivityCors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Metodo nao permitido.' });

  try {
    const schoolId = String(req.body && req.body.schoolId || '').trim();
    const atividadeId = String(req.body && req.body.atividadeId || '').trim();
    const participanteNome = sanitizeParticipantName(req.body && req.body.participanteNome);
    let participanteEmail = sanitizeParticipantEmail(req.body && req.body.participanteEmail);

    if (!schoolId || !atividadeId) {
      return res.status(400).json({ ok: false, message: 'schoolId e atividadeId sao obrigatorios.' });
    }
    if (participanteNome.length < 3) {
      return res.status(400).json({ ok: false, message: 'Nome do participante invalido.' });
    }

    const atividadeDoc = await admin.firestore()
      .collection('schools')
      .doc(schoolId)
      .collection('provas')
      .doc(atividadeId)
      .get();

    if (!atividadeDoc.exists) {
      return res.status(404).json({ ok: false, message: 'Atividade nao encontrada.' });
    }

    const atividade = atividadeDoc.data() || {};
    const isPublicActivity = String(atividade.tipo || '').toLowerCase() === 'atividade'
      && (atividade.avulsaPublica === true || atividade.quiz === true)
      && atividade.published === true;

    if (!isPublicActivity) {
      return res.status(403).json({ ok: false, message: 'Atividade indisponivel.' });
    }

    const isLiveQuizRequest = atividade.quiz === true && (req.body?.liveJoin === true || req.body?.liveAnswer === true);
    if (isLiveQuizRequest) {
      const nomeKey = participanteNome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'participante';
      participanteEmail = `quiz_${nomeKey}@example.com`;
    }
    if (!isLiveQuizRequest && !isValidEmail(participanteEmail)) {
      return res.status(400).json({ ok: false, message: 'Email do participante invalido.' });
    }
    if (isLiveQuizRequest && !participanteEmail) {
      return res.status(400).json({ ok: false, message: 'Identificador do participante ausente.' });
    }

    if (atividade.quiz === true && req.body && req.body.liveAnswer === true) {
      const sessionId = String(req.body.quizSessionId || '').trim();
      const questionIndex = Number(req.body.questaoIndex);
      const resposta = Number(req.body.resposta);
      if (atividade.quizStatus !== 'running' || !sessionId || sessionId !== String(atividade.quizSessionId || '') || !Number.isInteger(questionIndex) || questionIndex !== Number(atividade.quizQuestionIndex) || !Number.isInteger(resposta)) {
        return res.status(409).json({ ok: false, message: 'Esta rodada do Quiz nao esta mais disponivel.' });
      }
      const question = Array.isArray(atividade.questions) ? normalizeCorrectionQuestion(atividade.questions[questionIndex], questionIndex) : null;
      if (!question || resposta < 0 || resposta >= question.options.length) {
        return res.status(400).json({ ok: false, message: 'Resposta invalida.' });
      }
      const resultadosRef = admin.firestore().collection('schools').doc(schoolId).collection('provas_resultados');
      const anterior = await resultadosRef.where('provaId', '==', atividadeId).where('quizSessionId', '==', sessionId).where('alunoId', '==', participanteEmail).where('questaoIndex', '==', questionIndex).get();
      if (anterior.empty) {
        await resultadosRef.add({ provaId: atividadeId, alunoId: participanteEmail, alunoNome: participanteNome, quizResposta: true, quizSessionId: sessionId, questaoIndex: questionIndex, resposta, tempoResposta: Math.max(0, Number(req.body.tempoResposta) || 0), data: admin.firestore.FieldValue.serverTimestamp() });
      }
      return res.status(200).json({ ok: true, live: true, correct: resposta === question.correctIndex });
    }

    if (atividade.quiz === true && req.body && req.body.liveJoin === true) {
      if (atividade.quizStatus === 'finished') return res.status(409).json({ ok: false, message: 'A sala deste Quiz nao esta disponivel.' });
      const participanteId = participanteEmail.replace(/[^a-z0-9]/gi, '_').slice(0, 120);
      await admin.firestore().collection('schools').doc(schoolId).collection('quiz_participantes').doc(`${atividadeId}_${participanteId}`).set({
        atividadeId,
        quizSessionId: atividade.quizSessionId ? String(atividade.quizSessionId) : 'lobby',
        nome: participanteNome,
        email: participanteEmail,
        entrouEm: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.status(200).json({ ok: true, live: true });
    }

    if (atividade.wordCloud === true) {
      if (req.body && req.body.resetWordCloud === true) {
        const wordsSnapshot = await admin.firestore()
          .collection('schools').doc(schoolId).collection('word_cloud_words')
          .where('atividadeId', '==', atividadeId).get();
        const batch = admin.firestore().batch();
        wordsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        await atividadeDoc.ref.update({ wordCloudResetVersion: admin.firestore.FieldValue.increment(1) });
        return res.status(200).json({ ok: true, reset: true });
      }
      const palavra = String(req.body && req.body.palavra || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 80);
      if (palavra.length < 2 || /\s/u.test(palavra)) {
        return res.status(400).json({ ok: false, message: 'Digite apenas uma palavra.' });
      }
      const palavraNormalizada = palavra.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'palavra';
      const palavraRef = admin.firestore().collection('schools').doc(schoolId).collection('word_cloud_words').doc(`${atividadeId}_${palavraNormalizada}`);
      await admin.firestore().runTransaction(async (transaction) => {
        const snapshot = await transaction.get(palavraRef);
        const atual = snapshot.exists ? snapshot.data() : {};
        transaction.set(palavraRef, {
          atividadeId,
          palavra,
          quantidade: Number(atual.quantidade || 0) + 1,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });
      return res.status(200).json({ ok: true, saved: true });
    }

    const questions = Array.isArray(atividade.questions)
      ? atividade.questions.map(normalizeCorrectionQuestion).filter((q) => q.options.length >= 2)
      : [];

    if (questions.length === 0) {
      return res.status(400).json({ ok: false, message: 'Atividade sem questoes validas.' });
    }

    const answers = normalizeAnswers(req.body && req.body.answers, questions.length);
    const valorAtividade = Number(atividade.valor || 0);
    const summary = buildActivitySummary(questions, answers, valorAtividade);

    const respostasRef = admin.firestore()
      .collection('schools')
      .doc(schoolId)
      .collection('atividades_avulsas_respostas');

    const anterioresSnapshot = await respostasRef
      .where('atividadeId', '==', atividadeId)
      .where('participanteEmail', '==', participanteEmail)
      .get();

    let bestNotaAnterior = -Infinity;
    anterioresSnapshot.forEach((doc) => {
      const nota = Number(doc.data() && doc.data().nota || 0);
      if (Number.isFinite(nota) && nota > bestNotaAnterior) {
        bestNotaAnterior = nota;
      }
    });

    if (anterioresSnapshot.size > 0 && summary.nota <= bestNotaAnterior) {
      return res.status(200).json({
        ok: true,
        saved: false,
        bestNota: bestNotaAnterior,
        summary
      });
    }

    await respostasRef.add({
      atividadeId,
      atividadeTitulo: String(atividade.titulo || 'Atividade avulsa'),
      participanteNome,
      participanteEmail,
      acertos: summary.acertos,
      respondidas: summary.respondidas,
      totalQuestoes: summary.totalQuestoes,
      percentual: summary.percentual,
      nota: summary.nota,
      valorAtividade: summary.valorAtividade,
      realizadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    const bestNota = Number.isFinite(bestNotaAnterior)
      ? Math.max(bestNotaAnterior, summary.nota)
      : summary.nota;

    return res.status(200).json({
      ok: true,
      saved: true,
      bestNota,
      summary
    });
  } catch (error) {
    console.error('Erro submitAtividadeAvulsa:', error);
    return res.status(500).json({ ok: false, message: 'Falha ao registrar resultado.' });
  }
});

exports.deleteAtividadeAvulsaWithResults = functions.https.onCall(async (data, context) => {
  const schoolId = String(data && data.schoolId || '').trim();
  const atividadeId = String(data && data.atividadeId || '').trim();

  if (!schoolId || !atividadeId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e atividadeId sao obrigatorios.');
  }

  await assertSchoolPermission(context, schoolId, ['admin', 'professor', 'secretaria']);

  const atividadeRef = admin.firestore()
    .collection('schools')
    .doc(schoolId)
    .collection('provas')
    .doc(atividadeId);

  const atividadeSnap = await atividadeRef.get();
  if (!atividadeSnap.exists) {
    return { ok: true, deleted: false, deletedResultados: 0 };
  }

  const atividade = atividadeSnap.data() || {};
  const isAvulsa = String(atividade.tipo || '').toLowerCase() === 'atividade' && atividade.avulsaPublica === true;
  if (!isAvulsa) {
    throw new functions.https.HttpsError('failed-precondition', 'A atividade informada nao e avulsa.');
  }

  const respostasSnapshot = await admin.firestore()
    .collection('schools')
    .doc(schoolId)
    .collection('atividades_avulsas_respostas')
    .where('atividadeId', '==', atividadeId)
    .get();

  const wordCloudSnapshot = await admin.firestore()
    .collection('schools')
    .doc(schoolId)
    .collection('word_cloud_words')
    .where('atividadeId', '==', atividadeId)
    .get();

  let deletedResultados = 0;
  let batchRef = admin.firestore().batch();
  let ops = 0;
  const maxOpsPerBatch = 400;

  for (const doc of respostasSnapshot.docs) {
    batchRef.delete(doc.ref);
    deletedResultados += 1;
    ops += 1;

    if (ops >= maxOpsPerBatch) {
      await batchRef.commit();
      batchRef = admin.firestore().batch();
      ops = 0;
    }
  }

  for (const doc of wordCloudSnapshot.docs) {
    batchRef.delete(doc.ref);
    ops += 1;
    if (ops >= maxOpsPerBatch) {
      await batchRef.commit();
      batchRef = admin.firestore().batch();
      ops = 0;
    }
  }

  batchRef.delete(atividadeRef);
  await batchRef.commit();

  return {
    ok: true,
    deleted: true,
    deletedResultados
  };
});

exports.resetNuvemPalavras = functions.https.onCall(async (data, context) => {
  const schoolId = String(data && data.schoolId || '').trim();
  const atividadeId = String(data && data.atividadeId || '').trim();
  if (!schoolId || !atividadeId) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId e atividadeId sao obrigatorios.');
  }

  await assertSchoolPermission(context, schoolId, ['admin', 'professor', 'secretaria']);
  const atividadeRef = admin.firestore().collection('schools').doc(schoolId).collection('provas').doc(atividadeId);
  const atividadeSnap = await atividadeRef.get();
  if (!atividadeSnap.exists || atividadeSnap.data()?.wordCloud !== true) {
    throw new functions.https.HttpsError('failed-precondition', 'A atividade informada nao e uma nuvem de palavras.');
  }

  const wordsSnapshot = await admin.firestore().collection('schools').doc(schoolId).collection('word_cloud_words')
    .where('atividadeId', '==', atividadeId).get();
  const batch = admin.firestore().batch();
  wordsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return { ok: true, deleted: wordsSnapshot.size };
});
