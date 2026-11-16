@echo off
setlocal enabledelayedexpansion

REM dist_build.bat — Full build and packaging for CutOptimizer v2.0.0

echo ====================================================
echo   CutOptimizer v2.0.0 - Full Build and Package
echo ====================================================
echo.

cd /d "%~dp0"

echo [1/5] Building cut-engine bundle...
node resources\js\app\engine\build-engine.mjs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] cut-engine build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo [2/5] Building Neutralino app (neu build)...
call neu build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] neu build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo [3/5] Setting up Windows executable...
if exist "dist\CutOptimizer\CutOptimizer-win_x64.exe" (
    move /Y "dist\CutOptimizer\CutOptimizer-win_x64.exe" "dist\CutOptimizer\CutOptimizer.exe" >nul
)

echo.
echo [4/5] Copying runtime examples and assets...
if not exist "dist\CutOptimizer\examples\" mkdir "dist\CutOptimizer\examples"
if exist "examples\kitchen_project.json" (
    copy /Y "examples\kitchen_project.json" "dist\CutOptimizer\examples\kitchen_project.json" >nul
) else if exist "resources\examples\kitchen_project.json" (
    copy /Y "resources\examples\kitchen_project.json" "dist\CutOptimizer\examples\kitchen_project.json" >nul
)

if exist "config.ini" (
    copy /Y "config.ini" "dist\CutOptimizer\config.ini" >nul
)

echo.
echo [5/5] Creating distribution release ZIP (CutOptimizer_v2.0.0.zip)...
powershell -NoProfile -Command ^
    "$dist = 'dist\CutOptimizer'; $zip = 'dist\CutOptimizer\CutOptimizer_v2.0.0.zip'; " ^
    "if (Test-Path $zip) { Remove-Item $zip -Force }; " ^
    "Compress-Archive -Path ('{0}\CutOptimizer.exe' -f $dist), ('{0}\resources.neu' -f $dist), ('{0}\examples' -f $dist) -DestinationPath $zip -Force; " ^
    "Write-Host ('Created: {0} ({1:N2} MB)' -f $zip, ((Get-Item $zip).Length / 1MB))"

echo.
echo ====================================================
echo   BUILD COMPLETE!
echo   Executable: dist\CutOptimizer\CutOptimizer.exe
echo   Release ZIP: dist\CutOptimizer\CutOptimizer_v2.0.0.zip
echo ====================================================

