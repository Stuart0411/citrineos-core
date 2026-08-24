param(
  [Parameter(Mandatory = $true)]
  [string]$Image,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'

$fullImage = "$Image`:$Tag"
$env:UI_IMAGE = $fullImage

Write-Host "Deploying image: $fullImage" -ForegroundColor Cyan

docker compose -f ./deploy/docker-compose.release.yml pull
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to pull release image'
}

docker compose -f ./deploy/docker-compose.release.yml up -d --remove-orphans
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to start release stack'
}

$containerId = (docker compose -f ./deploy/docker-compose.release.yml ps -q citrine-ui).Trim()
if ([string]::IsNullOrWhiteSpace($containerId)) {
  throw 'Could not resolve running container id for citrine-ui'
}

$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
$health = ''
while ((Get-Date) -lt $deadline) {
  $health = (docker inspect --format '{{.State.Health.Status}}' $containerId).Trim()
  if ($health -eq 'healthy') {
    Write-Host "Container is healthy: $containerId" -ForegroundColor Green
    exit 0
  }
  Start-Sleep -Seconds 3
}

throw "Timed out waiting for healthy container. Last health status: $health"
