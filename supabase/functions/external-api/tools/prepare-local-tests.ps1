param(
  [Parameter(Mandatory=$true)][string]$DatabaseUrl,
  [string]$ApiUrl = 'http://127.0.0.1:54321/functions/v1/external-api/v1/schedule',
  [string]$PsqlPath = 'psql',
  [string]$EnvFile = (Join-Path $PSScriptRoot '../.env.integration')
)
$ErrorActionPreference = 'Stop'
$dbUri = [Uri]$DatabaseUrl
$apiUri = [Uri]$ApiUrl
if ($dbUri.Scheme -notin @('postgres','postgresql') -or $dbUri.Host -notin @('localhost','127.0.0.1') -or
    $apiUri.Scheme -ne 'http' -or $apiUri.Host -notin @('localhost','127.0.0.1')) {
  throw 'Only a disposable local database and loopback HTTP endpoint are allowed.'
}
if (Test-Path -LiteralPath $EnvFile) { throw 'Test environment file already exists; use the existing keys or a new -EnvFile path.' }
$fixturePath = Join-Path $PSScriptRoot '../../../tests/fixtures/external_api_seed.sql'
$fixture = Get-Content -LiteralPath $fixturePath -Raw
function New-TestKey {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $key = 'rp_' + [Convert]::ToHexString($bytes).ToLowerInvariant()
  $hash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($key))).ToLowerInvariant()
  return @{ Key=$key; Hash=$hash }
}
$normal = New-TestKey
$limited = New-TestKey
$fixture = $fixture.Replace("repeat('a',64)","'$($normal.Hash)'").Replace("repeat('b',64)","'$($limited.Hash)'")
# Password is passed through the child environment, never command-line arguments.
$dbUserInfo = $dbUri.UserInfo.Split(':',2)
$previousPassword = $env:PGPASSWORD
try {
  if ($dbUserInfo.Length -eq 2) { $env:PGPASSWORD=[Uri]::UnescapeDataString($dbUserInfo[1]) }
  $dbPort = if ($dbUri.Port -gt 0) { $dbUri.Port } else { 5432 }
  $dbUser = [Uri]::UnescapeDataString($dbUserInfo[0])
  $dbName = [Uri]::UnescapeDataString($dbUri.AbsolutePath.TrimStart('/'))
  "begin;`n$fixture`ncommit;" | & $PsqlPath -h $dbUri.Host -p $dbPort -U $dbUser -d $dbName -v ON_ERROR_STOP=1 -q
  if ($LASTEXITCODE -ne 0) { throw 'Fixture insert failed; use a fresh disposable database. Existing rows were not overwritten.' }
} finally {
  $env:PGPASSWORD=$previousPassword
}
@"
EXTERNAL_API_TEST_URL=$ApiUrl
EXTERNAL_API_TEST_KEY=$($normal.Key)
EXTERNAL_API_TEST_LIMITED_KEY=$($limited.Key)
"@ | Set-Content -LiteralPath $EnvFile -Encoding utf8
Write-Output 'Fixtures ready. Test keys were written to the selected environment file; no secrets printed.'
