import { auth } from './services/init.js';
import { db } from './services/init.js';
import { store } from './store.js';
import { firebaseConfig } from './config/firebase.js';

export function createAuthMethods(app) {
    return {
        renderLogin() {
            document.getElementById('app').innerHTML = `
                <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-700 to-blue-600 p-4 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
                    <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-8 space-y-6 fade-in border border-gray-100 dark:border-slate-700">
                        <div class="text-center">
                            <div class="w-20 h-20 bg-gradient-to-br from-blue-700 to-blue-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
                                <i class="fas fa-graduation-cap text-3xl text-white"></i>
                            </div>
                            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">SENATEDU</h1>
                            <p class="text-gray-500 dark:text-gray-400">Sistema de Gestão Escolar</p>
                        </div>
                        <div id="login-error" class="hidden p-3 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded-lg text-sm text-center"></div>
                        <form id="login-form" class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                                <input type="email" id="login-email" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="admin@escola.com">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                                <input type="password" id="login-password" required class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-white" placeholder="••••••">
                            </div>
                            <button type="submit" id="login-btn" class="w-full bg-blue-700 hover:bg-blue-800 text-white py-2 rounded-lg font-semibold transition shadow-lg">
                                <span id="btn-text">Entrar</span>
                            </button>
                        </form>
                        <div class="text-center mt-4">
                            <button onclick="app.resetMyPassword()" class="text-sm text-blue-600 hover:underline dark:text-blue-400">Esqueci minha senha</button>
                        </div>
                    </div>
                </div>`;
            document.getElementById('login-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value.trim();
                const password = document.getElementById('login-password').value.trim();
                const btnText = document.getElementById('btn-text');
                btnText.innerHTML = '<div class="loading"></div>';
                try {
                    await auth.signInWithEmailAndPassword(email, password);
                } catch (err) {
                    document.getElementById('login-error').textContent = 'Email ou senha incorretos';
                    document.getElementById('login-error').classList.remove('hidden');
                    btnText.textContent = 'Entrar';
                }
            });
        },

        resetMyPassword() {
            const email = prompt("Digite seu e-mail:");
            if (email) app.sendPasswordReset(email.trim());
        },

        logout() {
            auth.signOut();
        },

        async criarUsuarioSemDeslogar(email, senha) {
            const appName = "SecondaryApp-" + new Date().getTime();
            const secondaryApp = firebase.initializeApp(firebaseConfig, appName);
            try {
                const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, senha);
                await secondaryApp.auth().signOut();
                secondaryApp.delete();
                return userCredential.user.uid;
            } catch (error) {
                secondaryApp.delete();
                throw error;
            }
        },

        monitorAuth() {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    try {
                        const doc = await db.collection('users').doc(user.uid).get();
                        if (doc.exists) {
                            store.currentUser = user;
                            store.currentUserData = { id: user.uid, ...doc.data() };
                            store.currentView = 'dashboard';
                            app.renderMainLayout();
                        } else {
                            auth.signOut();
                        }
                    } catch (e) {
                        app.renderLogin();
                    }
                } else {
                    app.renderLogin();
                }
            });
        }
    };
}
