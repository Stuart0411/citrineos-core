param(
  [string]$BaseUrl = 'http://localhost:8095',
  [string]$SiteId = 'site-main',
  [int]$TenantId = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$failures = New-Object System.Collections.Generic.List[string]

function Write-Pass {
  param([string]$Message)
  Write-Host "PASS: $Message" -ForegroundColor Green
}

function Write-Fail {
  param([string]$Message)
  Write-Host "FAIL: $Message" -ForegroundColor Red
  $script:failures.Add($Message)
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if ($Condition) {
    Write-Pass $Message
  } else {
    Write-Fail $Message
  }
}

function Convert-ErrorToObject {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)

  $raw = $ErrorRecord.ErrorDetails.Message
  if (-not [string]::IsNullOrWhiteSpace($raw)) {
    try {
      return $raw | ConvertFrom-Json
    } catch {
      return [pscustomobject]@{ status = 'error'; message = $raw }
    }
  }

  return [pscustomobject]@{ status = 'error'; message = $ErrorRecord.Exception.Message }
}

function Invoke-Intent {
  param(
    [hashtable]$Payload,
    [string]$ExpectedStatus,
    [string]$ExpectedMessageLike
  )

  $json = $Payload | ConvertTo-Json -Depth 8

  try {
    $result = Invoke-RestMethod -Method POST -Uri "$BaseUrl/intents" -ContentType 'application/json' -Body $json
    if ($ExpectedStatus -eq 'accepted') {
      Assert-True ($result.status -eq 'accepted') "intent accepted ($($Payload.reason))"
    } else {
      Write-Fail "expected rejection but request accepted ($($Payload.reason))"
    }
  } catch {
    $errObj = Convert-ErrorToObject $_

    if ($ExpectedStatus -eq 'rejected') {
      $okStatus = ($errObj.status -eq 'rejected')
      $okMessage = ($errObj.message -like "*$ExpectedMessageLike*")
      Assert-True ($okStatus -and $okMessage) "intent rejected with expected message ($($Payload.reason))"
    } else {
      Write-Fail "expected acceptance but got error: $($errObj.message)"
    }
  }
}

function Get-AdminState {
  return Invoke-RestMethod -Method GET -Uri "$BaseUrl/admin/state"
}

function Get-AdminConfig {
  return Invoke-RestMethod -Method GET -Uri "$BaseUrl/admin/config"
}

function Patch-AdminConfig {
  param([hashtable]$Patch)
  $json = $Patch | ConvertTo-Json -Depth 8
  return Invoke-RestMethod -Method PATCH -Uri "$BaseUrl/admin/config" -ContentType 'application/json' -Body $json
}

Write-Host 'Running EMS add-on smoke checks...' -ForegroundColor Cyan

# 1) Reachability checks.
try {
  $health = Invoke-RestMethod -Method GET -Uri "$BaseUrl/health"
  Assert-True (($health.status -eq 'ok') -and ($health.service -eq 'ems-addon')) 'health endpoint returns ok'
} catch {
  Write-Fail "health endpoint unavailable: $($_.Exception.Message)"
}

$baselineState = $null
$originalConfig = $null

try {
  $baselineState = Get-AdminState
  Write-Pass 'admin state endpoint reachable'
} catch {
  Write-Fail "admin state unavailable: $($_.Exception.Message)"
}

try {
  $originalConfig = Get-AdminConfig
  Write-Pass 'admin config endpoint reachable'
} catch {
  Write-Fail "admin config unavailable: $($_.Exception.Message)"
}

# 2) Intent accept/reject matrix.
$now = [DateTime]::UtcNow

$validIntent = @{
  siteId = $SiteId
  tenantId = $TenantId
  timestamp = $now.ToString('o')
  expiresAt = $now.AddMinutes(1).ToString('o')
  operationMode = 'ExternalLimits'
  constraints = @{ evChargeBudgetW = 8000 }
  source = 'smoke-script'
  reason = 'valid-intent'
  dedupeKey = ('valid-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
}
Invoke-Intent -Payload $validIntent -ExpectedStatus 'accepted' -ExpectedMessageLike ''

$staleIntent = @{
  siteId = $SiteId
  tenantId = $TenantId
  timestamp = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
  expiresAt = [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
  operationMode = 'ExternalLimits'
  constraints = @{ evChargeBudgetW = 5000 }
  source = 'smoke-script'
  reason = 'stale-intent'
  dedupeKey = ('stale-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
}
Invoke-Intent -Payload $staleIntent -ExpectedStatus 'rejected' -ExpectedMessageLike 'Stale EMS intent rejected'

$invalidTenantIntent = @{
  siteId = $SiteId
  tenantId = 0
  timestamp = [DateTime]::UtcNow.ToString('o')
  expiresAt = [DateTime]::UtcNow.AddMinutes(1).ToString('o')
  operationMode = 'ExternalLimits'
  constraints = @{ evChargeBudgetW = 5000 }
  source = 'smoke-script'
  reason = 'invalid-tenant'
  dedupeKey = ('invalid-' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
}
Invoke-Intent -Payload $invalidTenantIntent -ExpectedStatus 'rejected' -ExpectedMessageLike 'tenantId must be a positive integer'

# 3) Counter delta check.
if ($baselineState -ne $null) {
  try {
    $afterState = Get-AdminState

    $acceptedDelta = [int]$afterState.metrics.acceptedCount - [int]$baselineState.metrics.acceptedCount
    $rejectedDelta = [int]$afterState.metrics.rejectedCount - [int]$baselineState.metrics.rejectedCount

    Assert-True ($acceptedDelta -ge 1) "accepted counter incremented (delta=$acceptedDelta)"
    Assert-True ($rejectedDelta -ge 2) "rejected counter incremented (delta=$rejectedDelta)"
  } catch {
    Write-Fail "unable to compare state counters: $($_.Exception.Message)"
  }
}

# 4) Live config mutation and restore.
if ($originalConfig -ne $null) {
  try {
    $targetDryRun = -not [bool]$originalConfig.dryRun
    $targetProfileId = [int]$originalConfig.defaultChargingProfileId + 1

    $patched = Patch-AdminConfig -Patch @{
      dryRun = $targetDryRun
      defaultChargingProfileId = $targetProfileId
    }

    $patchedConfig = $patched.config
    Assert-True ([bool]$patchedConfig.dryRun -eq $targetDryRun) 'config patch applied: dryRun'
    Assert-True ([int]$patchedConfig.defaultChargingProfileId -eq $targetProfileId) 'config patch applied: defaultChargingProfileId'
  } catch {
    Write-Fail "config patch failed: $($_.Exception.Message)"
  }

  try {
    $restored = Patch-AdminConfig -Patch @{
      dryRun = [bool]$originalConfig.dryRun
      defaultChargingProfileId = [int]$originalConfig.defaultChargingProfileId
      enableRestIngress = [bool]$originalConfig.enableRestIngress
      stationSnapshots = @($originalConfig.stationSnapshots)
    }

    $restoredConfig = $restored.config
    $restoreOk = ([bool]$restoredConfig.dryRun -eq [bool]$originalConfig.dryRun) -and
      ([int]$restoredConfig.defaultChargingProfileId -eq [int]$originalConfig.defaultChargingProfileId)
    Assert-True $restoreOk 'config restored to original values'
  } catch {
    Write-Fail "config restore failed: $($_.Exception.Message)"
  }
}

Write-Host ''
if ($failures.Count -eq 0) {
  Write-Host 'Smoke result: PASS' -ForegroundColor Green
  exit 0
}

Write-Host "Smoke result: FAIL ($($failures.Count) issue(s))" -ForegroundColor Red
foreach ($failure in $failures) {
  Write-Host " - $failure" -ForegroundColor Red
}
exit 1
