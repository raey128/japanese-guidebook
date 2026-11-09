<#
.SYNOPSIS
Windows alternative to the root Makefile. Keep it in sync with the Makefile (see README).

.DESCRIPTION
Backend commands run with uv locally by default; pass -Docker (or set $env:DOCKER = '1') to run
them inside the compose `api` container instead. Several targets can be given in one call.

.EXAMPLE
.\make.ps1 seed-locations seed-places -Docker

.EXAMPLE
.\make.ps1 make-admin -Username alice -Docker
#>
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Targets = @('help'),
    [switch]$Docker,
    [string]$Username
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if ($env:DOCKER -eq '1') { $Docker = $true }

function Invoke-Native {
    param([string]$Dir, [string]$Exe, [string[]]$Arguments)
    Push-Location (Join-Path $Root $Dir)
    try {
        & $Exe @Arguments
        if ($LASTEXITCODE -ne 0) { throw "'$Exe $($Arguments -join ' ')' failed with exit code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}

function Invoke-Backend {
    if ($Docker) { Invoke-Native '.' 'docker' (@('compose', 'exec', '-T', 'api') + $args) }
    else { Invoke-Native 'backend' 'uv' (@('run') + $args) }
}

function Invoke-Frontend { Invoke-Native 'frontend' 'pnpm' $args }

$Tasks = [ordered]@{
    'up'             = { Invoke-Native '.' 'docker' @('compose', 'up', '--build', '-d') }
    'down'           = { Invoke-Native '.' 'docker' @('compose', 'down') }
    'migrate'        = { Invoke-Backend alembic upgrade head }
    'seed-locations' = { Invoke-Backend python -m app.cli seed-locations }
    'seed-places'    = { Invoke-Backend python -m app.cli seed-places }
    'make-admin'     = {
        if (-not $Username) { throw 'usage: .\make.ps1 make-admin -Username <name>' }
        Invoke-Backend python -m app.cli make-admin $Username
    }
    'dump'           = { Invoke-Backend python -m app.cli dump }
    'test'           = { & $Tasks['test-backend']; & $Tasks['test-frontend'] }
    'test-backend'   = { Invoke-Backend pytest --cov=app --cov-report=term-missing }
    'test-frontend'  = { Invoke-Frontend test }
    'e2e'            = { Invoke-Frontend e2e }
    'lint'           = { & $Tasks['lint-backend']; & $Tasks['lint-frontend'] }
    'lint-backend'   = {
        Invoke-Backend ruff check .
        Invoke-Backend ruff format --check .
    }
    'lint-frontend'  = {
        Invoke-Frontend lint
        Invoke-Frontend typecheck
    }
    'typecheck'      = {
        Invoke-Backend mypy app
        Invoke-Frontend typecheck
    }
    # Regenerate the frontend's TypeScript API client from the backend's OpenAPI schema.
    # Python writes the file itself so PowerShell's redirection doesn't re-encode it.
    'gen-client'     = {
        Invoke-Native 'backend' 'uv' @('run', 'python', '-c',
            "import json; from app.main import app; open('../frontend/openapi.json', 'w', encoding='utf-8').write(json.dumps(app.openapi()))")
        Invoke-Frontend gen:api
    }
    # Performance tooling (ticket 12); not part of the per-PR suite.
    'synthetic'      = { Invoke-Backend python -m app.cli synthetic --count 50000 }
    'perf'           = { Invoke-Native '.' 'k6' @('run', 'perf/k6.js') }
    'help'           = { $Tasks.Keys | Sort-Object }
}

foreach ($target in $Targets) {
    if (-not $Tasks.Contains($target)) { throw "unknown target '$target' (run .\make.ps1 help)" }
    & $Tasks[$target]
}
