#!/usr/bin/env node

// Script simples para fazer deploy das regras do Firestore
const { execSync } = require('child_process');

console.log('📋 Fazendo deploy das regras do Firestore...\n');

try {
  // Executar o comando firebase usando o módulo local
  const output = execSync('npx firebase deploy --only firestore:rules', {
    stdio: 'inherit',
    shell: true
  });
  
  console.log('\n✅ Deploy das regras concluído com sucesso!');
} catch (error) {
  console.error('\n❌ Erro ao fazer deploy:', error.message);
  process.exit(1);
}
