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

Write-Host "Deploying image: $fullImage" -ForegroundColor Cyan
Write-Host "Publishing Citrine on host port: $($env:CITRINE_HOST_PORT)" -ForegroundColor Cyan

Write-Host "Pulling image..." -ForegroundColor Cyan
docker pull $fullImage
if ($LASTEXITCODE -ne 0) {
  throw "Failed to pull image $fullImage. Verify the tag exists and credentials are configured."
}

docker compose -f $composeFilePath up -d --remove-orphans
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to start release stack'
}

$containerId = (docker compose -f $composeFilePath ps -q citrine).Trim()
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

throw "Timed out waiting for healthy container. Last health status: $health"
