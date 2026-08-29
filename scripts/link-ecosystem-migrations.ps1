# Crea un junction Windows dalla cartella migrations del satellite
# verso OpuntiaIndustry (coda unica).
# Uso:
#   powershell -File scripts/link-ecosystem-migrations.ps1 -SatelliteRoot "E:\Progetti Cursor\WikiOpuntia"
#   powershell -File scripts/link-ecosystem-migrations.ps1 -SatelliteRoot "E:\Progetti Cursor\OpuntiaItalia"

param(
  [Parameter(Mandatory = $true)]
  [string]$SatelliteRoot
)

$ErrorActionPreference = "Stop"
$master = "E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations"
$target = Join-Path $SatelliteRoot "supabase\migrations"

if (-not (Test-Path $master)) {
  throw "Cartella master non trovata: $master"
}

$supabaseDir = Join-Path $SatelliteRoot "supabase"
if (-not (Test-Path $supabaseDir)) {
  New-Item -ItemType Directory -Path $supabaseDir | Out-Null
}

if (Test-Path $target) {
  $item = Get-Item $target -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "Junction già presente: $target"
    exit 0
  }
  $backup = "$target.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
  Rename-Item -Path $target -NewName (Split-Path $backup -Leaf)
  Write-Host "Cartella esistente rinominata in $backup"
}

New-Item -ItemType Junction -Path $target -Target $master | Out-Null
Write-Host "Collegato $target -> $master"
