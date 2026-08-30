param(
  [string]$DestinationRoot = "",
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($DestinationRoot)) {
  $DestinationRoot = Join-Path $projectRoot "backups"
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL 환경변수 또는 -DatabaseUrl 인수가 필요합니다."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgDump) { throw "pg_dump를 찾지 못했습니다. PostgreSQL Client Tools를 설치하고 PATH에 추가하세요." }
if (-not $pgRestore) { throw "pg_restore를 찾지 못했습니다. PostgreSQL Client Tools를 설치하고 PATH에 추가하세요." }

$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupDirectory = Join-Path ([System.IO.Path]::GetFullPath($DestinationRoot)) $stamp
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$dumpFile = Join-Path $backupDirectory "database.dump"
$schemaFile = Join-Path $backupDirectory "schema.sql"
$contentsFile = Join-Path $backupDirectory "restore-list.txt"
$manifestFile = Join-Path $backupDirectory "manifest.json"

& $pgDump.Source --dbname=$DatabaseUrl --format=custom --blobs --no-owner --no-acl --file=$dumpFile
if ($LASTEXITCODE -ne 0) { throw "전체 DB 백업에 실패했습니다." }

& $pgDump.Source --dbname=$DatabaseUrl --schema-only --no-owner --no-acl --file=$schemaFile
if ($LASTEXITCODE -ne 0) { throw "스키마 백업에 실패했습니다." }

& $pgRestore.Source --list $dumpFile | Set-Content -Path $contentsFile -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "백업 무결성 목록 확인에 실패했습니다." }

$files = @($dumpFile, $schemaFile, $contentsFile) | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
  [ordered]@{
    name = $item.Name
    bytes = $item.Length
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  createdAt = (Get-Date).ToString("o")
  format = "PostgreSQL custom dump"
  includesSchema = $true
  includesData = $true
  includesEmbeddingJson = $true
  includesPgvector = $true
  includesCommitteeChatFeedback = $true
  includesCommitteeAiLogs = $true
  note = "외부 Storage의 PDF 원본 파일은 이 DB 덤프에 포함되지 않습니다."
  files = $files
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestFile -Encoding utf8

Write-Host "백업 완료: $backupDirectory"
Write-Host "복원 예시: pg_restore --clean --if-exists --no-owner --dbname=<복원DB_URL> `"$dumpFile`""
