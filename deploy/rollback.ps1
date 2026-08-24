param(
  [Parameter(Mandatory = $true)]
  [string]$Image,

  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = 'Stop'

Write-Host "Rolling back to $Image`:$Tag" -ForegroundColor Yellow
& ./deploy/deploy.ps1 -Image $Image -Tag $Tag
if ($LASTEXITCODE -ne 0) {
  throw 'Rollback failed'
}

Write-Host 'Rollback completed.' -ForegroundColor Green
