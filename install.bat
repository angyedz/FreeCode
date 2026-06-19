@echo off
setlocal enabledelayedexpansion

echo ===============================
echo   FreeCode installer (Windows)
echo ===============================

REM --- Move to the script's own directory (project root) ---
cd /d "%~dp0"

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run.
  exit /b 1
)

REM --- Check Node.js major version is >= 18 ---
for /f "tokens=1 delims=." %%a in ('node -v') do set "NODE_MAJOR=%%a"
set "NODE_MAJOR=!NODE_MAJOR:v=!"
if !NODE_MAJOR! LSS 18 (
  echo [ERROR] Node.js 18+ required. Found:
  node -v
  exit /b 1
)
echo [ok] Node.js detected:
node -v

REM --- Check npm is installed ---
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Reinstall Node.js (npm ships with it).
  exit /b 1
)

REM --- Install dependencies (prefer reproducible npm ci) ---
if exist package-lock.json (
  echo [*] Installing dependencies with npm ci...
  call npm ci
) else (
  echo [*] No lockfile found, using npm install...
  call npm install
)
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  exit /b 1
)

REM --- Build the bundle ---
echo [*] Building...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  exit /b 1
)
if not exist "dist\freecode.mjs" (
  echo [ERROR] Build did not produce dist\freecode.mjs.
  exit /b 1
)

REM --- Create a launcher wrapper in .\bin\freecode.cmd ---
set "INSTALL_DIR=%~dp0bin"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
> "%INSTALL_DIR%\freecode.cmd" echo @echo off
>> "%INSTALL_DIR%\freecode.cmd" echo node "%%~dp0..\dist\freecode.mjs" %%*
echo [ok] Launcher created at %INSTALL_DIR%\freecode.cmd

REM --- Add the launcher directory to the user PATH (no duplicates) ---
set "USER_PATH="
for /f "skip=2 tokens=2,*" %%A in ('reg query HKCU\Environment /v PATH 2^>nul') do set "USER_PATH=%%B"

echo !USER_PATH! | find /i "%INSTALL_DIR%" >nul
if errorlevel 1 (
  if defined USER_PATH (
    setx PATH "!USER_PATH!;%INSTALL_DIR%" >nul
  ) else (
    setx PATH "%INSTALL_DIR%" >nul
  )
  echo [ok] Added %INSTALL_DIR% to your user PATH.
  echo     Open a NEW terminal for PATH changes to take effect.
) else (
  echo [ok] %INSTALL_DIR% already in PATH.
)

echo.
echo Done. Run "freecode" in a new terminal to start.
endlocal