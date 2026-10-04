$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'bootstrap-ui-stand.ps1')
$env:DATABASE_URL='postgresql://audit:audit@127.0.0.1:1/audit'
$env:REDIS_URL='redis://127.0.0.1:1'
$env:AUTH_SECRET='audit-only-secret-not-production'
$env:OPENAI_API_KEY='audit-never-call'
$env:NEXT_TELEMETRY_DISABLED='1'
$standWeb=Join-Path $env:TEMP 'campusforge-independent-ui-audit-20261004\apps\web'
Push-Location -LiteralPath $standWeb
try { node '.\node_modules\next\dist\bin\next' dev -p 3107 --hostname 127.0.0.1 } finally { Pop-Location }
