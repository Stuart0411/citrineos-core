# SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
#
# SPDX-License-Identifier: Apache-2.0

param(
  [Parameter(Mandatory = $true)]
  [string]$Image,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

$fullImage = "$Image`:$Tag"
$env:CITRINE_IMAGE = $fullImage
if ([string]::IsNullOrWhiteSpace($env:CITRINE_HOST_PORT)) {
  $env:CITRINE_HOST_PORT = '8080'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFilePath = Join-Path $scriptDir 'docker-compose.release.yml'
if (-not (Test-Path $composeFilePath)) {
  throw "Compose file not found: $composeFilePath"
}

$envFilePath = Join-Path $scriptDir 'citrine.runtime.env'
if (-not (Test-Path $envFilePath)) {
  throw "Runtime env file not found: $envFilePath. Copy citrine.runtime.env.example and fill in real values."
}
if (-not (Select-String -Path $envFilePath -Pattern '^BOOTSTRAP_CITRINEOS_DATABASE_USERNAME=' -Quiet)) {
  throw "Runtime env file must define BOOTSTRAP_CITRINEOS_DATABASE_USERNAME. The legacy ...DATABASE_USER variable is ignored."
}
$runtimeEnv = Get-Content $envFilePath
$databasePassword = ($runtimeEnv | Where-Object { $_ -match '^BOOTSTRAP_CITRINEOS_DATABASE_PASSWORD=' }) -replace '^BOOTSTRAP_CITRINEOS_DATABASE_PASSWORD=', ''
if ([string]::IsNullOrWhiteSpace($databasePassword) -or $databasePassword -eq 'replace-me') {
  throw "Runtime env file must set BOOTSTRAP_CITRINEOS_DATABASE_PASSWORD to a non-placeholder value."
}
$env:CITRINE_DATABASE_PASSWORD = $databasePassword

Write-Host "Deploying image: $fullImage" -ForegroundColor Cyan
Write-Host "Publishing Citrine on host port: $($env:CITRINE_HOST_PORT)" -ForegroundColor Cyan

Write-Host "Pulling image..." -ForegroundColor Cyan
docker pull $fullImage
if ($LASTEXITCODE -ne 0) {
  throw "Failed to pull image $fullImage. Verify the tag exists and credentials are configured."
}

docker compose -p citrine-server -f $composeFilePath up -d --remove-orphans
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to start release stack'
}

$containerId = (docker compose -p citrine-server -f $composeFilePath ps -q citrine).Trim()
if ([string]::IsNullOrWhiteSpace($containerId)) {
  throw 'Could not resolve running container id for citrine'
}

$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$health = ''
while ((Get-Date) -lt $deadline) {
  $health = (docker inspect --format '{{.State.Health.Status}}' $containerId).Trim()
  if ($health -eq 'healthy') {
    Write-Host "Container is healthy: $containerId" -ForegroundColor Green
    Write-Host "Open: http://localhost:$($env:CITRINE_HOST_PORT)/" -ForegroundColor Green
    exit 0
  }
  Start-Sleep -Seconds 3
}

Write-Host "Container status:" -ForegroundColor Yellow
docker inspect --format '{{json .State}}' $containerId
Write-Host "Recent health checks:" -ForegroundColor Yellow
docker inspect --format '{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{println}}{{end}}' $containerId
Write-Host "Recent Citrine logs:" -ForegroundColor Yellow
docker compose -p citrine-server -f $composeFilePath logs --tail 100 citrine
throw "Timed out waiting for healthy container. Last health status: $health"
