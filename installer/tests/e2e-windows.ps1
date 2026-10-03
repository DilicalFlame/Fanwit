# Install, check, uninstall, check, on this Windows machine (per user only).
param([string]$Engine = "fanwit-install.exe")
$ErrorActionPreference = "Stop"
$m = Join-Path $PSScriptRoot "e2e-windows.toml"
$dir = Join-Path $env:LOCALAPPDATA "Programs\Fanwit E2E"
$failed = 0
function Check($what, $ok) { if ($ok) { "ok   $what" } else { "FAIL $what"; $script:failed++ } }
function RegValue($key, $name) { try { (Get-ItemProperty -Path "Registry::$key" -Name $name -ErrorAction Stop).$name } catch { $null } }
$lnk = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Fanwit E2E.lnk"
$cfg = Join-Path $env:APPDATA "dev.fanwit.e2e\config.toml"

"== install"
& $Engine run --phase package --manifest $m | Out-Host
Check "binary" (Test-Path "$dir\fwe2e.exe")
Check "start menu shortcut" (Test-Path $lnk)
Check "autostart Run key" ((RegValue "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" "Fanwit E2E") -like '*fwe2e.exe" --headless')
Check "user environment variable" ([Environment]::GetEnvironmentVariable("FWE2E_HOME", "User") -eq $dir)
Check "file association" ((RegValue "HKCU\Software\Classes\.fwe2e" "(default)") -eq "fwe2e.fwe2e")
Check "open command" ((RegValue "HKCU\Software\Classes\fwe2e.fwe2e\shell\open\command" "(default)") -like '*fwe2e.exe" "%1"')
Check "URL scheme" ($null -ne (RegValue "HKCU\Software\Classes\fwe2e" "URL Protocol"))
Check "registry value" ((RegValue "HKCU\Software\FanwitE2E" "Telemetry") -eq 0)
Check "custom Rust step" ((Get-Content $cfg -Raw) -match 'theme = "dark"')

"== again (nothing to do)"
$second = & $Engine run --phase package --manifest $m
Check "second run changes nothing" (-not ($second | Where-Object { $_ -match '\.\.\.$' }))

"== uninstall"
& $Engine uninstall --manifest $m | Out-Host
Check "binary removed" (-not (Test-Path $dir))
Check "shortcut removed" (-not (Test-Path $lnk))
Check "Run key removed" ($null -eq (RegValue "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" "Fanwit E2E"))
Check "variable removed" ($null -eq [Environment]::GetEnvironmentVariable("FWE2E_HOME", "User"))
Check "association removed" ($null -eq (RegValue "HKCU\Software\Classes\.fwe2e" "(default)"))
Check "ProgId removed" (-not (Test-Path "Registry::HKCU\Software\Classes\fwe2e.fwe2e"))
Check "URL scheme removed" (-not (Test-Path "Registry::HKCU\Software\Classes\fwe2e"))
Check "registry value removed" ($null -eq (RegValue "HKCU\Software\FanwitE2E" "Telemetry"))
Check "config removed" (-not (Test-Path $cfg))
if ($failed) { "FAIL ($failed)"; exit 1 } else { "PASS Windows" }
