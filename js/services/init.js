import { firebaseConfig, EMAILJS_PUBLIC_KEY } from '../config/firebase.js';

if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export const storage = firebase.storage();
export const functions = firebase.app().functions('us-central1'); // Região us-central1

// Inicializar Firebase Messaging se suportado
let messaging = null;
if ('serviceWorker' in navigator && firebase.messaging.isSupported()) {
    try {
        messaging = firebase.messaging();
        console.log('Firebase Messaging inicializado com sucesso');
    } catch (error) {
        console.error('Erro ao inicializar Firebase Messaging:', error);
    }
}

export { messaging };

