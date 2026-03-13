const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

exports.deleteUserByUid = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const requesterId = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterId}`).get();
  const requester = requesterSnap.exists ? requesterSnap.data() : null;

  if (!requester || requester.tipo !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Somente administrador pode excluir usuarios.');
  }

  const uid = data && data.uid;
  if (!uid || typeof uid !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'UID invalido.');
  }

  try {
    await admin.auth().deleteUser(uid);
  } catch (err) {
    if (!err || err.code !== 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', 'Usuario nao encontrado.');
    }
  }

  await admin.firestore().doc(`users/${uid}`).delete();
  return { ok: true };
});

exports.reclaimUserByEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const requesterId = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterId}`).get();
  const requester = requesterSnap.exists ? requesterSnap.data() : null;

  if (!requester || requester.tipo !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Somente administrador pode gerenciar usuarios.');
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
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const { userId, title, body, imageUrl, icon, data: notificationData } = data;

  if (!userId || !title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'userId, title e body são obrigatórios.');
  }

  try {
    // Buscar token do usuário
    const userDoc = await admin.firestore().doc(`users/${userId}`).get();
    
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
    await admin.firestore().collection('notifications').add({
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
      await admin.firestore().doc(`users/${userId}`).update({
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
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const requesterId = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterId}`).get();
  const requester = requesterSnap.exists ? requesterSnap.data() : null;

  if (!requester || (requester.tipo !== 'admin' && requester.tipo !== 'professor')) {
    throw new functions.https.HttpsError('permission-denied', 'Somente administradores ou professores podem enviar notificações em massa.');
  }

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
          const userDoc = await admin.firestore().doc(`users/${userId}`).get();
          
          if (!userDoc.exists) {
            results.failed++;
            results.errors.push({ userId, reason: 'not-found' });
            return;
          }

          const userData = userDoc.data();
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
          await admin.firestore().collection('notifications').add({
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
            await admin.firestore().doc(`users/${userId}`).update({
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
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const requesterId = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterId}`).get();
  const requester = requesterSnap.exists ? requesterSnap.data() : null;

  if (!requester || (requester.tipo !== 'admin' && requester.tipo !== 'professor')) {
    throw new functions.https.HttpsError('permission-denied', 'Somente administradores ou professores podem enviar notificações para turmas.');
  }

  const { turmaId, title, body, imageUrl, icon, data: notificationData } = data;

  if (!turmaId || !title || !body) {
    throw new functions.https.HttpsError('invalid-argument', 'turmaId, title e body são obrigatórios.');
  }

  try {
    // Buscar todos os alunos da turma
    const alunosSnapshot = await admin.firestore()
      .collection('users')
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
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Precisa estar autenticado.');
  }

  const requesterId = context.auth.uid;
  const requesterSnap = await admin.firestore().doc(`users/${requesterId}`).get();
  const requester = requesterSnap.exists ? requesterSnap.data() : null;

  if (!requester || requester.tipo !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Somente administradores podem enviar notificações por tipo de usuário.');
  }

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
      .collection('users')
      .where('tipo', '==', userType)
      .get();

    if (usersSnapshot.empty) {
      return { success: 0, failed: 0, noToken: 0, disabled: 0, message: 'Nenhum usuário encontrado.' };
    }

    const userIds = usersSnapshot.docs.map(doc => doc.id);

    // Usar a função de múltiplos usuários
    const sendMultiple = require('./index').sendNotificationToMultipleUsers;
    return await sendMultiple({
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
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({error: 'Campos obrigatórios: to, subject, html/text'});
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

