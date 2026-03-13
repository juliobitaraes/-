/**
 * Service Worker para Firebase Cloud Messaging
 * Gerencia notificações push em background
 */

// Importar Firebase scripts para service worker
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyChnKOxAQH9RqSYmvcf3zYmajg3p5LCogc",
    authDomain: "educloud-sistema.firebaseapp.com",
    projectId: "educloud-sistema",
    storageBucket: "educloud-sistema.firebasestorage.app",
    messagingSenderId: "279645366191",
    appId: "1:279645366191:web:df16df577ccc959a4f315a"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Obter instância do messaging
const messaging = firebase.messaging();

// Lidar com mensagens em background
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Notificação em background recebida:', payload);
    
    const notificationTitle = payload.notification?.title || 'SENATEDU';
    const notificationOptions = {
        body: payload.notification?.body || 'Nova notificação',
        icon: payload.notification?.icon || '/icon-192.svg',
        badge: '/badge-72.svg',
        tag: payload.data?.tag || 'default',
        requireInteraction: false,
        data: payload.data || {}
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Lidar com cliques na notificação
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notificação clicada:', event.notification);
    
    event.notification.close();
    
    // Abrir ou focar na janela do app
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Verificar se já existe uma janela aberta
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus().then(() => {
                            // Enviar mensagem para o cliente com a URL
                            client.postMessage({
                                type: 'NOTIFICATION_CLICK',
                                url: urlToOpen,
                                data: event.notification.data
                            });
                        });
                    }
                }
                // Se não houver janela aberta, abrir nova
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// Service Worker installation
self.addEventListener('install', (event) => {
    console.log('[firebase-messaging-sw.js] Service Worker instalado');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[firebase-messaging-sw.js] Service Worker ativado');
    event.waitUntil(clients.claim());
});
