# Script para monitorar logs do Firebase Functions em tempo real
# USO: .\watch-logs.ps1

Write-Host "🔍 Monitorando logs do Firebase Functions..." -ForegroundColor Cyan
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    Clear-Host
    Write-Host "=== LOGS FIREBASE FUNCTIONS (Últimas 10 linhas) ===" -ForegroundColor Green
    Write-Host "Atualizando a cada 3 segundos..." -ForegroundColor Gray
    Write-Host ""
    
    npx firebase functions:log --limit 10 2>&1
    
    Start-Sleep -Seconds 3
}
