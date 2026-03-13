/**
 * Serviço de Notificações Push
 * Gerencia registro, permissões e recebimento de notificações
 */

import { db } from './init.js';
import { FIREBASE_VAPID_KEY } from '../config/firebase.js';

let messaging = null;
let currentToken = null;

/**
 * Inicializa o serviço de mensagens do Firebase
 */
export function initializeMessaging() {
    try {
        console.log('🔧 Verificando suporte a notificações...');
        
        // Verificar suporte básico
        if (!('Notification' in window)) {
            console.warn('⚠️ API de Notificações não suportada');
            return false;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ Service Workers não suportados');
            return false;
        }
        
        if (!('firebase' in window)) {
            console.error('❌ Firebase não carregado');
            return false;
        }
        
        if (!firebase.messaging.isSupported()) {
            console.warn('⚠️ Firebase Messaging não suportado neste navegador');
            return false;
        }
        
        // Verificar HTTPS (notificações precisam de HTTPS, exceto localhost)
        if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
            console.error('❌ Site não está em HTTPS');
            return false;
        }
        
        console.log('✅ Todos os requisitos atendidos');
        
        // Verificar configuração do Firebase
        const app = firebase.app();
        const config = app.options;
        console.log('🔧 Firebase App configurado:');
        console.log('   projectId:', config.projectId);
        console.log('   messagingSenderId:', config.messagingSenderId);
        
        if (!config.messagingSenderId) {
            console.error('❌ messagingSenderId não configurado!');
            return false;
        }
        
        messaging = firebase.messaging();
        console.log('✅ Firebase Messaging instanciado');
        
        // Registrar service worker
        if ('serviceWorker' in navigator) {
            console.log('📝 Registrando Service Worker...');
            navigator.serviceWorker.register('/firebase-messaging-sw.js')
                .then((registration) => {
                    console.log('✅ Service Worker registrado com sucesso');
                    console.log('   Scope:', registration.scope);
                    console.log('   Active:', registration.active ? 'Sim' : 'Não');
                })
                .catch((error) => {
                    console.error('❌ Erro ao registrar Service Worker:', error);
                });
        }
        
        console.log('✅ Firebase Messaging inicializado');
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar Firebase Messaging:', error);
        return false;
    }
}

/**
 * Solicita permissão para notificações e registra o token
 * @returns {Promise<string|null>} Token FCM ou null se permissão negada
 */
export async function requestNotificationPermission() {
    console.log('🔔 Verificando permissão de notificação...');
    
    if (!messaging) {
        console.warn('⚠️ Messaging não inicializado');
        return null;
    }

    // Verificar se permissão já foi concedida
    if (Notification.permission === 'granted') {
        console.log('✅ Permissão já concedida anteriormente');
        // Propagar erro se getToken falhar
        return await getToken();
    }

    console.log('📋 Permissão atual:', Notification.permission);
    console.log('🙋 Solicitando permissão ao usuário...');
    
    // Solicitar permissão
    const permission = await Notification.requestPermission();
    
    console.log('📋 Resposta do usuário:', permission);
    
    if (permission === 'granted') {
        console.log('✅ Permissão de notificação concedida');
        // Propagar erro se getToken falhar
        return await getToken();
    } else {
        console.log('❌ Permissão de notificação negada pelo usuário');
        return null;
    }
}

/**
 * Obtém o token FCM do dispositivo
 * @returns {Promise<string|null>} Token FCM
 */
export async function getToken() {
    try {
        console.log('🔑 Obtendo token FCM...');
        
        if (!messaging) {
            console.error('❌ Messaging não disponível');
            throw new Error('Firebase Messaging não foi inicializado');
        }

        // Verificar se service worker está registrado
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.getRegistration('/');
            console.log('📋 Service Worker registration:', registration);
            
            if (!registration) {
                console.warn('⚠️ Service Worker não registrado. Tentando registrar...');
                try {
                    const newReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
                    console.log('✅ Service Worker registrado:', newReg);
                    await navigator.serviceWorker.ready;
                    console.log('✅ Service Worker pronto');
                } catch (swError) {
                    console.error('❌ Erro ao registrar Service Worker:', swError);
                    throw new Error(`Service Worker não pôde ser registrado: ${swError.message}`);
                }
            } else {
                console.log('✅ Service Worker já registrado');
            }
        }

        // Verificar permissão antes de solicitar token
        console.log('🔐 Verificando permissão atual:', Notification.permission);
        if (Notification.permission !== 'granted') {
            throw new Error(`Permissão de notificações não concedida.\n\nStatus: ${Notification.permission}`);
        }
        
        console.log('📡 Solicitando token ao Firebase...');
        console.log('🔑 Verificando VAPID key...');
        
        // Validar VAPID key antes de usar
        if (!FIREBASE_VAPID_KEY || FIREBASE_VAPID_KEY === 'COLE_AQUI_A_VAPID_KEY_DO_FIREBASE_CONSOLE') {
            throw new Error('❌ VAPID Key não configurada!\n\n' +
                '🔧 COMO CONFIGURAR:\n\n' +
                '1. Acesse o Firebase Console:\n' +
                '   https://console.firebase.google.com/project/educloud-sistema/settings/cloudmessaging\n\n' +
                '2. Role até "Web Push certificates" (Certificados Web Push)\n\n' +
                '3. Se não houver nenhuma chave:\n' +
                '   • Clique em "Generate key pair" (Gerar par de chaves)\n\n' +
                '4. Copie a "Key pair" (chave pública)\n' +
                '   • Começa com "B..." (exemplo: BLUrbuundjlwx...)\n\n' +
                '5. Cole no arquivo: js/config/firebase.js\n' +
                '   • Substitua o valor de FIREBASE_VAPID_KEY\n\n' +
                '6. Salve o arquivo e recarregue a página');
        }
        
        try {
            // Garantir que service worker está pronto
            console.log('⏳ Aguardando service worker ficar pronto...');
            await navigator.serviceWorker.ready;
            console.log('✅ Service worker pronto!');
            
            // Obter registration
            const swRegistration = await navigator.serviceWorker.getRegistration('/');
            console.log('📋 Service Worker Registration:', swRegistration);
            
            if (!swRegistration) {
                throw new Error('Service Worker não está registrado');
            }
            
            console.log('🎯 Chamando messaging.getToken()...');
            console.log('🔑 VAPID Key configurada:', FIREBASE_VAPID_KEY.substring(0, 20) + '...');
            const token = await messaging.getToken({
                vapidKey: FIREBASE_VAPID_KEY,
                serviceWorkerRegistration: swRegistration
            });
            
            console.log('📬 Resultado do getToken:', token ? 'TOKEN RECEBIDO' : 'NULL/VAZIO');

            if (token) {
                currentToken = token;
                console.log('✅ Token FCM obtido com sucesso:', token.substring(0, 30) + '...');
                return token;
            } else {
                console.warn('⚠️ Nenhum token disponível. Verifique permissões.');
                throw new Error('Token FCM retornou vazio.\n\nPossíveis causas:\n• Firebase Messaging não configurado no Console\n• VAPID key incorreta\n• Service Worker não está funcionando');
            }
        } catch (tokenError) {
            console.error('❌ Erro ao obter token do Firebase:', tokenError);
            console.error('Tipo:', typeof tokenError);
            console.error('Código:', tokenError.code);
            console.error('Mensagem:', tokenError.message);
            console.error('Nome:', tokenError.name);
            console.error('Stack:', tokenError.stack);
            
            // Capturar TODAS as propriedades do erro
            const errorProps = {};
            for (let key in tokenError) {
                try {
                    errorProps[key] = tokenError[key];
                } catch (e) {
                    errorProps[key] = '[não acessível]';
                }
            }
            console.error('Todas as propriedades:', errorProps);
            
            let userMessage = '❌ ERRO AO GERAR TOKEN FCM\n';
            userMessage += '═'.repeat(40) + '\n\n';
            
            // Adicionar informações técnicas COMPLETAS
            userMessage += `📋 INFORMAÇÕES DO ERRO:\n`;
            userMessage += `Tipo: ${tokenError.name || typeof tokenError}\n`;
            userMessage += `Código: ${tokenError.code || 'NENHUM'}\n`;
            userMessage += `Mensagem Original:\n${tokenError.message || 'NENHUMA'}\n\n`;
            
            // Tentar extrair mais informações
            if (tokenError.customData) {
                userMessage += `Custom Data: ${JSON.stringify(tokenError.customData)}\n\n`;
            }
            
            // Propriedades adicionais
            const additionalProps = Object.keys(errorProps).filter(k => 
                !['name', 'message', 'code', 'stack'].includes(k)
            );
            if (additionalProps.length > 0) {
                userMessage += `Propriedades Adicionais:\n`;
                additionalProps.forEach(prop => {
                    userMessage += `• ${prop}: ${errorProps[prop]}\n`;
                });
                userMessage += `\n`;
            }
            
            userMessage += '─'.repeat(40) + '\n\n';
            
            // Verificar se é erro de VAPID key inválida
            if (tokenError.name === 'InvalidAccessError' || 
                (tokenError.message && tokenError.message.includes('applicationServerKey')) ||
                (tokenError.code === 15)) {
                userMessage += '❌ CAUSA: VAPID Key inválida ou não configurada\n\n';
                userMessage += '🔧 SOLUÇÃO PASSO A PASSO:\n\n';
                userMessage += '1. Acesse o Firebase Console:\n';
                userMessage += '   https://console.firebase.google.com/project/\n';
                userMessage += '   educloud-sistema/settings/cloudmessaging\n\n';
                userMessage += '2. Role até "Web Push certificates"\n\n';
                userMessage += '3. Se não houver nenhuma chave:\n';
                userMessage += '   • Clique em "Generate key pair"\n\n';
                userMessage += '4. Copie a chave pública (Key pair)\n';
                userMessage += '   • Começa com "B..."\n\n';
                userMessage += '5. Abra: js/config/firebase.js\n\n';
                userMessage += '6. Substitua o valor de FIREBASE_VAPID_KEY\n';
                userMessage += '   pela chave copiada\n\n';
                userMessage += '7. Salve e recarregue a página\n\n';
                userMessage += '⚠️ IMPORTANTE: A chave deve ser a mesma\n';
                userMessage += 'configurada no Firebase Console do projeto!';
            } else if (tokenError.code === 'messaging/permission-blocked') {
                userMessage += '❌ CAUSA: Permissão bloqueada\n\n';
                userMessage += 'SOLUÇÃO:\n';
                userMessage += '1. Toque no cadeado 🔒 ao lado da URL\n';
                userMessage += '2. Toque em "Permissões do site"\n';
                userMessage += '3. Em "Notificações" → "Permitir"\n';
                userMessage += '4. Recarregue a página';
            } else if (tokenError.code === 'messaging/unsupported-browser') {
                userMessage += '❌ CAUSA: Navegador não suportado\n\n';
                userMessage += 'SOLUÇÃO:\n';
                userMessage += 'Use Chrome, Firefox ou Edge atualizado';
            } else if (tokenError.code === 'messaging/failed-service-worker-registration') {
                userMessage += '❌ CAUSA: Service Worker não registrou\n\n';
                userMessage += 'VERIFICAR:\n';
                userMessage += '• Arquivo firebase-messaging-sw.js na raiz\n';
                userMessage += '• Site em HTTPS\n';
                userMessage += '• Sem erros de carregamento';
            } else if (tokenError.code === 'messaging/token-subscribe-failed' || 
                       tokenError.code === 'messaging/token-unsubscribe-failed') {
                userMessage += '❌ CAUSA: Falha ao se inscrever no Firebase\n\n';
                userMessage += 'POSSÍVEIS RAZÕES:\n';
                userMessage += '• Firebase Cloud Messaging desabilitado\n';
                userMessage += '• VAPID key incorreta/expirada\n';
                userMessage += '• Problema de rede/firewall\n';
                userMessage += '• APIs do FCM não ativas no projeto\n\n';
                userMessage += '🔗 Verificar configuração:\n';
                userMessage += 'console.firebase.google.com/project/\neducloud-sistema/settings/cloudmessaging';
            } else if (tokenError.message && tokenError.message.includes('registration-token-not-registered')) {
                userMessage += '❌ CAUSA: Token não registrado\n\n';
                userMessage += 'Firebase Messaging pode estar mal configurado';
            } else {
                userMessage += '💡 POSSÍVEIS CAUSAS:\n\n';
                userMessage += '1. VAPID Key não configurada no Firebase Console\n';
                userMessage += '   → console.firebase.google.com/project/\n';
                userMessage += '     educloud-sistema/settings/cloudmessaging\n\n';
                userMessage += '2. APIs não ativadas no Google Cloud:\n';
                userMessage += '   • Firebase Cloud Messaging API\n';
                userMessage += '   • FCM Registration API\n\n';
                userMessage += '3. Problema de rede/firewall bloqueando:\n';
                userMessage += '   • fcm.googleapis.com\n';
                userMessage += '   • fcmregistrations.googleapis.com\n\n';
                userMessage += '4. Service Worker com problema\n\n';
                userMessage += '📋 Compartilhe estes detalhes completos\n';
                userMessage += 'com o desenvolvedor para análise.';
            }
            
            // Adicionar informações de ambiente
            userMessage += '\n\n' + '═'.repeat(40) + '\n';
            userMessage += '🔧 AMBIENTE:\n';
            userMessage += `Navegador: ${navigator.userAgent}\n`;
            userMessage += `URL: ${location.href}\n`;
            userMessage += `Protocolo: ${location.protocol}\n`;
            userMessage += `Permissão: ${Notification.permission}\n`;
            
            // Criar erro com mensagem detalhada
            const detailedError = new Error(userMessage);
            detailedError.originalError = tokenError;
            detailedError.code = tokenError.code;
            throw detailedError;
        }
    } catch (error) {
        console.error('❌ Erro geral ao obter token:', error);
        throw error;
    }
}

/**
 * Salva o token FCM no Firestore para o usuário atual
 * @param {string} userId - ID do usuário
 * @param {string} token - Token FCM
 * @param {object} deviceInfo - Informações do dispositivo
 */
export async function saveTokenToFirestore(userId, token, deviceInfo = {}) {
    try {
        console.log('💾 Salvando token no Firestore...');
        console.log('   userId:', userId);
        console.log('   token:', token.substring(0, 30) + '...');
        
        if (!userId || !token) {
            console.error('❌ UserId ou token inválido');
            return false;
        }

        const tokenData = {
            token: token,
            userId: userId,
            createdAt: firebase.firestore.Timestamp.now(),
            updatedAt: firebase.firestore.Timestamp.now(),
            device: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                ...deviceInfo
            }
        };

        console.log('📝 Salvando na coleção fcmTokens...');
        // Salvar token na coleção de tokens
        await db.collection('fcmTokens').doc(token).set(tokenData, { merge: true });
        
        console.log('📝 Atualizando documento do usuário...');
        // Também salvar referência no documento do usuário
        await db.collection('users').doc(userId).update({
            fcmToken: token,
            fcmTokenUpdatedAt: firebase.firestore.Timestamp.now(),
            notificationsEnabled: true
        });

        console.log('✅ Token salvo no Firestore com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar token:', error);
        console.error('   Detalhes:', error.message);
        return false;
    }
}

/**
 * Remove o token FCM do Firestore
 * @param {string} userId - ID do usuário
 * @param {string} token - Token FCM
 */
export async function removeTokenFromFirestore(userId, token) {
    try {
        if (!userId || !token) {
            return false;
        }

        // Remover da coleção de tokens
        await db.collection('fcmTokens').doc(token).delete();
        
        // Limpar referência no usuário
        await db.collection('users').doc(userId).update({
            fcmToken: firebase.firestore.FieldValue.delete(),
            fcmTokenUpdatedAt: firebase.firestore.Timestamp.now(),
            notificationsEnabled: false
        });

        console.log('Token removido do Firestore');
        return true;
    } catch (error) {
        console.error('Erro ao remover token:', error);
        return false;
    }
}

/**
 * Configura listener para mensagens em foreground
 * @param {function} callback - Função callback para processar mensagem
 */
export function onMessageListener(callback) {
    if (!messaging) {
        console.warn('Messaging não disponível');
        return () => {};
    }

    return messaging.onMessage((payload) => {
        console.log('Mensagem recebida (foreground):', payload);
        
        // Mostrar notificação mesmo em foreground
        if (Notification.permission === 'granted') {
            const notificationTitle = payload.notification?.title || 'SENATEDU';
            const notificationOptions = {
                body: payload.notification?.body || 'Nova notificação',
                icon: payload.notification?.icon || '/icon-192.svg',
                badge: '/badge-72.svg',
                tag: payload.data?.tag || 'default',
                data: payload.data || {}
            };

            const notification = new Notification(notificationTitle, notificationOptions);
            
            notification.onclick = (event) => {
                event.preventDefault();
                if (payload.data?.url) {
                    window.location.href = payload.data.url;
                }
                notification.close();
            };
        }

        if (callback && typeof callback === 'function') {
            callback(payload);
        }
    });
}

/**
 * Registra dispositivo para receber notificações
 * @param {string} userId - ID do usuário
 * @returns {Promise<boolean>} Sucesso ou falha
 */
export async function registerForNotifications(userId) {
    try {
        console.log('📱 registerForNotifications: Iniciando para userId:', userId);
        
        if (!userId) {
            console.error('❌ userId vazio ou inválido');
            throw new Error('ID do usuário não encontrado');
        }
        
        // Verificar HTTPS
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isSecure) {
            throw new Error(`Site precisa estar em HTTPS.\n\nURL atual: ${location.protocol}//${location.hostname}\n\nAcesse usando https://`);
        }
        
        // Inicializar messaging
        if (!initializeMessaging()) {
            throw new Error('Firebase Messaging não inicializou');
        }
        
        console.log('✅ Messaging inicializado');

        // Solicitar permissão e obter token
        // Se houver erro ao gerar token, será lançada exceção com detalhes
        const token = await requestNotificationPermission();
        
        if (!token) {
            console.error('❌ Não foi possível obter token FCM');
            
            // Se chegou aqui com token null, é porque a permissão não foi concedida
            if (Notification.permission === 'denied') {
                throw new Error('Notificações bloqueadas.\n\nPara ativar:\n1. Toque no cadeado 🔒 ao lado da URL\n2. Toque em "Permissões do site"\n3. Em "Notificações" selecione "Permitir"');
            } else if (Notification.permission === 'default') {
                throw new Error('Permissão não foi concedida.\n\nQuando aparecer o popup, clique em "Permitir"');
            } else {
                // Não deveria chegar aqui, pois se permissão é granted e há erro, 
                // a exceção detalhada já teria sido lançada
                throw new Error('Token não pôde ser obtido.\n\nRecarregue a página e tente novamente.');
            }
        }

        console.log('✅ Token FCM obtido:', token.substring(0, 20) + '...');

        // Salvar token no Firestore
        const saved = await saveTokenToFirestore(userId, token);
        
        if (!saved) {
            console.error('❌ Falha ao salvar token no Firestore');
            throw new Error('Token não foi salvo no banco de dados.\n\nVerifique as regras do Firestore.');
        }
        
        console.log('✅ Token salvo no Firestore com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao registrar para notificações:', error);
        throw error; // Re-throw para ser tratado pela UI
    }
}

/**
 * Desregistra dispositivo de notificações
 * @param {string} userId - ID do usuário
 * @returns {Promise<boolean>} Sucesso ou falha
 */
export async function unregisterFromNotifications(userId) {
    try {
        if (!messaging || !currentToken) {
            return false;
        }

        // Remover token do Firestore
        await removeTokenFromFirestore(userId, currentToken);
        
        // Deletar token do Firebase
        await messaging.deleteToken();
        currentToken = null;
        
        return true;
    } catch (error) {
        console.error('Erro ao desregistrar notificações:', error);
        return false;
    }
}

/**
 * Verifica se notificações estão habilitadas
 * @returns {boolean} Status das notificações
 */
export function areNotificationsEnabled() {
    return Notification.permission === 'granted' && currentToken !== null;
}

/**
 * Verifica se o navegador suporta notificações
 * @returns {boolean} Suporte a notificações
 */
export function isNotificationSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator && firebase.messaging.isSupported();
}

/**
 * Diagnóstico completo do sistema de notificações
 * @returns {Promise<object>} Resultado do diagnóstico
 */
export async function diagnosticarNotificacoes() {
    const diagnostico = {
        timestamp: new Date().toISOString(),
        checks: []
    };
    
    // Check 1: API de Notificações
    diagnostico.checks.push({
        nome: 'API de Notificações',
        ok: 'Notification' in window,
        detalhes: 'Notification' in window ? 'Disponível' : 'Não suportado'
    });
    
    // Check 2: Service Workers
    diagnostico.checks.push({
        nome: 'Service Workers',
        ok: 'serviceWorker' in navigator,
        detalhes: 'serviceWorker' in navigator ? 'Disponível' : 'Não suportado'
    });
    
    // Check 3: Firebase carregado
    diagnostico.checks.push({
        nome: 'Firebase SDK',
        ok: 'firebase' in window,
        detalhes: 'firebase' in window ? `Version ${firebase.SDK_VERSION || 'unknown'}` : 'Não carregado'
    });
    
    // Check 4: Firebase Messaging suporte
    if ('firebase' in window) {
        const supported = firebase.messaging.isSupported();
        diagnostico.checks.push({
            nome: 'Firebase Messaging',
            ok: supported,
            detalhes: supported ? 'Suportado' : 'Não suportado neste navegador'
        });
    }
    
    // Check 5: HTTPS
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    diagnostico.checks.push({
        nome: 'HTTPS',
        ok: isSecure,
        detalhes: `${location.protocol}//${location.hostname}${location.port ? ':' + location.port : ''}`
    });
    
    // Check 6: Permissão
    diagnostico.checks.push({
        nome: 'Permissão de Notificações',
        ok: Notification.permission === 'granted',
        detalhes: Notification.permission
    });
    
    // Check 7: Service Worker Registration
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.getRegistration('/');
            diagnostico.checks.push({
                nome: 'Service Worker Registrado',
                ok: !!registration,
                detalhes: registration ? `Scope: ${registration.scope}, Active: ${!!registration.active}` : 'Não registrado'
            });
        } catch (e) {
            diagnostico.checks.push({
                nome: 'Service Worker Registrado',
                ok: false,
                detalhes: `Erro: ${e.message}`
            });
        }
    }
    
    // Check 8: Firebase Config
    if ('firebase' in window && firebase.apps.length > 0) {
        const config = firebase.app().options;
        diagnostico.checks.push({
            nome: 'Firebase Configurado',
            ok: !!(config.projectId && config.messagingSenderId),
            detalhes: `Project: ${config.projectId}, Sender: ${config.messagingSenderId}`
        });
    }
    
    // Check 9: Token atual
    diagnostico.checks.push({
        nome: 'Token FCM',
        ok: !!currentToken,
        detalhes: currentToken ? `${currentToken.substring(0, 30)}...` : 'Nenhum token gerado'
    });
    
    // Resumo
    const totalChecks = diagnostico.checks.length;
    const passedChecks = diagnostico.checks.filter(c => c.ok).length;
    diagnostico.resumo = `${passedChecks}/${totalChecks} checks passaram`;
    diagnostico.statusGeral = passedChecks === totalChecks ? 'OK' : 'PROBLEMAS DETECTADOS';
    
    console.log('📋 DIAGNÓSTICO DE NOTIFICAÇÕES');
    console.log('='.repeat(50));
    diagnostico.checks.forEach(check => {
        const icon = check.ok ? '✅' : '❌';
        console.log(`${icon} ${check.nome}: ${check.detalhes}`);
    });
    console.log('='.repeat(50));
    console.log(`${diagnostico.resumo} - ${diagnostico.statusGeral}`);
    
    return diagnostico;
}

/**
 * Envia notificação de teste
 * @param {string} userId - ID do usuário
 */
export async function sendTestNotification(userId) {
    try {
        const functions = firebase.functions();
        const sendNotification = functions.httpsCallable('sendNotificationToUser');
        
        const result = await sendNotification({
            userId: userId,
            title: 'Notificação de Teste',
            body: 'Se você recebeu isto, as notificações estão funcionando!',
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        });
        
        return result.data;
    } catch (error) {
        console.error('Erro ao enviar notificação de teste:', error);
        throw error;
    }
}

// Listener para renovação de token
export function setupTokenRefresh(userId) {
    if (!messaging) {
        return () => {};
    }

    return messaging.onTokenRefresh(async () => {
        try {
            console.log('Token FCM renovado');
            const newToken = await getToken();
            if (newToken && userId) {
                await saveTokenToFirestore(userId, newToken);
            }
        } catch (error) {
            console.error('Erro ao renovar token:', error);
        }
    });
}
