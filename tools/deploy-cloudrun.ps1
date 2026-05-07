param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [Parameter(Mandatory = $true)]
    [string]$Region,

    [Parameter(Mandatory = $true)]
    [string]$ServiceName,

    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [ValidateSet('groq', 'gemini')]
    [string]$Provider = 'groq',

    [string]$Model
)

$ErrorActionPreference = 'Stop'

Write-Host "==> Auth and project setup"
gcloud auth login
gcloud config set project $ProjectId

gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com

Write-Host "==> Build image"
$Image = "gcr.io/$ProjectId/senatedu-proxy"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$DockerfilePath = Join-Path $RepoRoot "Dockerfile"
if (-not (Test-Path $DockerfilePath)) {
    throw "Dockerfile nao encontrado em $DockerfilePath"
}
Push-Location $RepoRoot
try {
    gcloud builds submit --tag $Image
} finally {
    Pop-Location
}

Write-Host "==> Deploy to Cloud Run"
if (-not $Model) {
    if ($Provider -eq 'groq') {
        $Model = 'llama-3.1-8b-instant'
    } else {
        $Model = 'gemini-2.0-flash-lite'
    }
}

if ($Provider -eq 'groq') {
    $EnvVars = "GROQ_API_KEY=$ApiKey,GROQ_MODEL=$Model"
} else {
    $EnvVars = "GEMINI_API_KEY=$ApiKey,GEMINI_MODEL=$Model"
}

gcloud run deploy $ServiceName `
  --image $Image `
  --platform managed `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $EnvVars

Write-Host "==> Done. Copy the service URL and set the endpoints in localStorage."
