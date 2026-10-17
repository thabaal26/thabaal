# The whole QA run on this computer: build, start a fresh QA app (private Postgres, seeded QA Test Shop, real keys
# blanked), then every QA script in order. Logs go to .git/qa-*.log; a one-line result per script is printed.
#   powershell -File tests/qa/run-all.ps1 [-NoBuild] [-Skip visual,crawl-phone]
param([switch]$NoBuild, [string]$Skip = "")
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$skipList = $Skip.Split(",") | Where-Object { $_ }

# Stop a previous QA app and its database.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'qa\\serve|qa/serve|start -p 3200' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
if (Test-Path .qadb\postmaster.pid) {
  $pgPid = Get-Content .qadb\postmaster.pid -TotalCount 1
  if ($pgPid) { Stop-Process -Id ([int]$pgPid) -Force -ErrorAction SilentlyContinue }
  Start-Sleep 2
  Remove-Item .qadb\postmaster.pid -Force -ErrorAction SilentlyContinue
}
if (-not $NoBuild) {
  if (Test-Path .next) { Remove-Item .next -Recurse -Force }
  cmd /c "npx next build > .git\qa-build.log 2>&1"
  if ($LASTEXITCODE -ne 0) { "BUILD FAILED (see .git/qa-build.log)"; exit 1 }
  "build ok"
}
Start-Process -FilePath powershell -ArgumentList '-NoProfile', '-Command', "Set-Location '$PWD'; node tests\qa\serve.mjs *> .git\qa-serve.log" -WindowStyle Hidden
$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  Start-Sleep 3
  try { if ((Invoke-WebRequest http://localhost:3200/login -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { $ready = $true; break } } catch {}
}
if (-not $ready) { "QA app did not start (see .git/qa-serve.log)"; exit 1 }
"QA app ready"

$steps = @(
  @{ name = "payments"; cmd = "node tests\qa\payments.mjs" },
  @{ name = "payments-ui"; cmd = "node tests\qa\payments-ui.mjs" },
  @{ name = "crud"; cmd = "node tests\qa\crud.mjs" },
  @{ name = "crawl-desktop"; cmd = "node tests\qa\crawl.mjs desktop" },
  @{ name = "crawl-phone"; cmd = "node tests\qa\crawl.mjs phone" },
  @{ name = "visual"; cmd = "node tests\qa\visual.mjs" }
)
foreach ($s in $steps) {
  if ($skipList -contains $s.name) { continue }
  cmd /c "$($s.cmd) > .git\qa-$($s.name).log 2>&1"
  $code = $LASTEXITCODE
  $last = (Get-Content ".git\qa-$($s.name).log" | Where-Object { $_ -match 'passed|page visits|screens,' } | Select-Object -Last 1)
  "$($s.name): exit $code  $last"
}
