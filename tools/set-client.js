#!/usr/bin/env node
'use strict';

// Aplica as credenciais de um cliente (clients/<clientId>.json) aos arquivos
// de configuração usados em runtime, mantendo js/ e web/js/ sincronizados.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const clientsDir = path.join(repoRoot, 'clients');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function listAvailableClients() {
  return fs
    .readdirSync(clientsDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => f.replace(/\.json$/, ''));
}

const clientId = process.argv[2];
if (!clientId) {
  fail(`Informe o clientId. Uso: node tools/set-client.js <clientId>\nClientes disponíveis: ${listAvailableClients().join(', ')}`);
}

const configPath = path.join(clientsDir, `${clientId}.json`);
if (!fs.existsSync(configPath)) {
  fail(`Arquivo não encontrado: clients/${clientId}.json\nClientes disponíveis: ${listAvailableClients().join(', ')}`);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { firebase, vapidKey, emailjs, school, firebaseProjectId } = config;

for (const [key, value] of Object.entries(firebase || {})) {
  if (!value) fail(`Campo firebase.${key} vazio em clients/${clientId}.json`);
}

const firebaseJsContent = `// Gerado automaticamente por tools/set-client.js a partir de clients/${clientId}.json — não editar manualmente.
export const firebaseConfig = {
    apiKey: "${firebase.apiKey}",
    authDomain: "${firebase.authDomain}",
    projectId: "${firebase.projectId}",
    storageBucket: "${firebase.storageBucket}",
    messagingSenderId: "${firebase.messagingSenderId}",
    appId: "${firebase.appId}"
};

// VAPID Key para Firebase Cloud Messaging (Console → Cloud Messaging → Web Push certificates)
export const FIREBASE_VAPID_KEY = '${vapidKey || ''}';

export const EMAILJS_PUBLIC_KEY = "${emailjs?.publicKey || ''}";
export const EMAILJS_SERVICE_ID = "${emailjs?.serviceId || ''}";
export const EMAILJS_TEMPLATE_ID = "${emailjs?.templateId || ''}";
`;

const schoolJsContent = `// Gerado automaticamente por tools/set-client.js a partir de clients/${clientId}.json — não editar manualmente.
export const DEFAULT_SCHOOL_ID = '${school?.defaultSchoolId || ''}';
export const GLOBAL_SUPER_ADMIN_UID = '${school?.globalSuperAdminUid || ''}';

export function getActiveSchoolId() {
    return localStorage.getItem('activeSchoolId') || DEFAULT_SCHOOL_ID;
}

export function setActiveSchoolId(schoolId) {
    if (!schoolId || typeof schoolId !== 'string') return;
    localStorage.setItem('activeSchoolId', schoolId);
}
`;

const targets = [
  path.join(repoRoot, 'js', 'config'),
  path.join(repoRoot, 'web', 'js', 'config'),
];

for (const dir of targets) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'firebase.js'), firebaseJsContent, 'utf8');
  fs.writeFileSync(path.join(dir, 'school.js'), schoolJsContent, 'utf8');
}

console.log(`\n✅ Configuração do cliente "${clientId}" aplicada em js/config e web/js/config.`);
if (firebaseProjectId) {
  console.log(`\nPróximo passo — apontar o deploy para o projeto correto:\n  firebase deploy --project ${firebaseProjectId}`);
}
