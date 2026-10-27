param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $true)]
    [string]$Region,

    [Parameter(Mandatory = $true)]
    [string]$ServiceName,

    [string]$ApiKey,

    [ValidateSet('groq', 'gemini')]
    [string]$Provider = 'groq',

    [string]$GeminiApiKey,

    [string]$GroqApiKey,

    [string]$Model
)

$ErrorActionPreference = 'Stop'
$Gcloud = 'gcloud.cmd'

function Read-ApiKey($Prompt) {
    $secureValue = Read-Host $Prompt -AsSecureString
    if (-not $secureValue -or $secureValue.Length -eq 0) {
        throw "A chave de API nao pode ficar vazia."
    }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

if ($ApiKey) {
    if ($Provider -eq 'groq') {
        if ($GroqApiKey) {
            throw "Use ApiKey ou GroqApiKey, nao ambos."
        }
        $GroqApiKey = $ApiKey
    } else {
        if ($GeminiApiKey) {
            throw "Use ApiKey ou GeminiApiKey, nao ambos."
        }
        $GeminiApiKey = $ApiKey
    }
}

if (-not $ApiKey) {
    if (-not $GeminiApiKey) {
        $GeminiApiKey = Read-ApiKey "Cole a chave Gemini (entrada oculta)"
    }
    if (-not $GroqApiKey) {
        $GroqApiKey = Read-ApiKey "Cole a chave Groq (entrada oculta)"
    }
}

if (-not $GeminiApiKey -and -not $GroqApiKey) {
    throw "Informe GeminiApiKey, GroqApiKey ou a chave legada ApiKey."
}

$GeminiModel = if ($Provider -eq 'gemini' -and $Model) { $Model } else { 'gemini-3.5-flash-lite' }
$GroqModel = if ($Provider -eq 'groq' -and $Model) { $Model } else { 'openai/gpt-oss-20b' }
$EnvVars = @()
if ($GeminiApiKey) {
    $EnvVars += "GEMINI_API_KEY=$GeminiApiKey"
    $EnvVars += "GEMINI_MODEL=$GeminiModel"
}
if ($GroqApiKey) {
    $EnvVars += "GROQ_API_KEY=$GroqApiKey"
    $EnvVars += "GROQ_MODEL=$GroqModel"
}
$EnvVars = $EnvVars -join ','

Write-Host "==> Checking Google Cloud authentication"
$activeAccount = & $Gcloud auth list --filter=status:ACTIVE --format='value(account)'
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel verificar a autenticacao do Google Cloud."
}
if (-not $activeAccount) {
    & $Gcloud auth login
    if ($LASTEXITCODE -ne 0) {
        throw "Falha na autenticacao do Google Cloud."
    }
}

Write-Host "==> Project setup"
& $Gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao selecionar o projeto $ProjectId."
}

& $Gcloud services enable run.googleapis.com cloudbuild.googleapis.com --project $ProjectId
if ($LASTEXITCODE -ne 0) {
    throw "Falha ao habilitar os servicos necessarios no projeto."
}

Write-Host "==> Build image"
$Image = "gcr.io/$ProjectId/senatedu-proxy"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DockerfilePath = Join-Path $RepoRoot "Dockerfile"
if (-not (Test-Path $DockerfilePath)) {
    throw "Dockerfile nao encontrado em $DockerfilePath"
}
Push-Location $RepoRoot
try {
    & $Gcloud builds submit --tag $Image
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao criar a imagem no Cloud Build (codigo $LASTEXITCODE). Verifique billing e permissoes do projeto."
    }
} finally {
    Pop-Location
}

Write-Host "==> Deploy to Cloud Run"
& $Gcloud run deploy $ServiceName `
  --image $Image `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $EnvVars
if ($LASTEXITCODE -ne 0) {
        throw "Falha ao publicar o servico no Cloud Run (codigo $LASTEXITCODE). Verifique billing e permissoes do projeto."
}

Write-Host "==> Done. Copy the service URL and set the endpoints in localStorage."
