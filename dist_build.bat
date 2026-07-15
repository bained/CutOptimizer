@echo off
REM dist_build.bat — Full build + copy all required files to dist/
REM Run this after `neu build` to ensure all runtime files are present.

echo === Building with neu ===
neu build

if %ERRORLEVEL% NEQ 0 (
    echo neu build failed!
    exit /b %ERRORLEVEL%
)

echo === Copying files to dist\CutOptimizer\ ===

REM Copy lang files (needed by filesystem.readFile at runtime)
if not exist "dist\CutOptimizer\lang\" mkdir "dist\CutOptimizer\lang"
copy /Y lang\en.json "dist\CutOptimizer\lang\en.json"
copy /Y lang\bg.json "dist\CutOptimizer\lang\bg.json"

REM Copy examples (needed by example browser)
if not exist "dist\CutOptimizer\examples\" mkdir "dist\CutOptimizer\examples"
copy /Y examples\kitchen_project.json "dist\CutOptimizer\examples\kitchen_project.json"

REM Copy config (needed by ConfigManager)
if exist config.ini copy /Y config.ini "dist\CutOptimizer\config.ini"

echo === Done! dist\CutOptimizer is ready. ===
echo.
echo Run: dist\CutOptimizer\CutOptimizer-win_x64.exe --path=.