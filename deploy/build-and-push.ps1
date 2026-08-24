param(
  [Parameter(Mandatory = $true)]
  [string]$Image,

  [Parameter(Mandatory = $true)]
  [string]$Tag,

  [switch]$AlsoTagLatest
)

$ErrorActionPreference = 'Stop'

$requiredBuildArgs = @(
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
  'NEXT_PUBLIC_CITRINE_CORE_URL',
  'NEXT_PUBLIC_FILE_SERVER_URL',
  'NEXTAUTH_URL'
)

$buildArgList = @()
foreach ($name in $requiredBuildArgs) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing required build arg environment variable: $name"
  }
  $buildArgList += @('--build-arg', "$name=$value")
}

$fullImage = "$Image`:$Tag"
Write-Host "Building and pushing $fullImage" -ForegroundColor Cyan

$cmd = @(
  'buildx', 'build',
  '--platform', 'linux/amd64',
  '--file', 'Dockerfile',
  '--tag', $fullImage,
  '--push'
) + $buildArgList + @('.')

& docker @cmd
if ($LASTEXITCODE -ne 0) {
  throw "docker buildx build failed for $fullImage"
}

if ($AlsoTagLatest) {
  $latestImage = "$Image`:latest"
  Write-Host "Also publishing $latestImage" -ForegroundColor Cyan
  docker buildx imagetools create --tag $latestImage $fullImage
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to publish $latestImage"
  }
}

Write-Host "Done. Published image: $fullImage" -ForegroundColor Green
