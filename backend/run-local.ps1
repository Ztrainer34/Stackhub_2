# Starts the StackHub backend locally with backend/.env loaded.
#
# The server does NOT read .env itself — main.go only calls os.LookupEnv, and
# panics on the first variable it cannot find. start.sh works around this with
# `env $(cat .env | xargs) go run ...`, which has no PowerShell equivalent. This
# script is that equivalent.
#
# Variables are set for THIS PROCESS ONLY, so nothing leaks into the terminal
# session afterwards — which matters, because a stray SUPABASE_URL left in a
# shell is how a script ends up writing to production.
#
#   cd backend
#   .\run-local.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    # winget writes Go into the MACHINE PATH, but a process started before the
    # install keeps its old environment — and every terminal VS Code spawns
    # inherits VS Code's. A new tab does not help; only restarting the editor
    # does. Rather than fail, add the standard location for this process.
    $goBin = "C:\Program Files\Go\bin"
    if (Test-Path (Join-Path $goBin "go.exe")) {
        $env:Path = "$goBin;$env:Path"
        Write-Host "go was not on PATH; using $goBin for this run." -ForegroundColor Yellow
        Write-Host "Restart VS Code to pick it up permanently." -ForegroundColor Yellow
    } else {
        Write-Host "go is not on PATH and was not found at $goBin." -ForegroundColor Red
        Write-Host "Install it with:  winget install GoLang.Go"
        exit 1
    }
}

if (-not (Test-Path ".env")) {
    Write-Host "backend\.env not found. See LOCAL-DEV.md for its contents." -ForegroundColor Red
    exit 1
}

$loaded = 0
foreach ($line in Get-Content ".env") {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }

    $name, $value = $line -split '=', 2
    $name = $name.Trim()
    # Strip surrounding quotes if present; values are used verbatim otherwise.
    $value = $value.Trim() -replace '^["'']|["'']$', ''

    if ($name) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        $loaded++
    }
}

if ($loaded -eq 0) {
    Write-Host "backend\.env is empty — nothing to load." -ForegroundColor Red
    Write-Host "The file exists but has no KEY=value lines. Did the paste get saved?"
    exit 1
}

# Print the target, never the credentials. Seeing 127.0.0.1 here is the
# confirmation that this run cannot touch production.
$db = [Environment]::GetEnvironmentVariable("DB_CONNECTION", "Process")
$host_only = if ($db -match '@([^/]+)') { $matches[1] } else { "unknown" }

Write-Host "Loaded $loaded variables from backend\.env" -ForegroundColor Green
Write-Host "Database: $host_only" -ForegroundColor Cyan
if ($db -match '\.supabase\.co') {
    Write-Host ""
    Write-Host "*** THIS IS A HOSTED SUPABASE PROJECT, NOT LOCAL ***" -ForegroundColor Red
    Write-Host "Writes from this server go to that project. Ctrl+C now if unintended."
    Start-Sleep -Seconds 5
}
Write-Host "Starting on http://localhost:8080 ..." -ForegroundColor Green
Write-Host ""

go run cmd/server/main.go
