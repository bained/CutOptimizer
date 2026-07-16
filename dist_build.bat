@echo off
REM dist_build.bat — Full build + copy all required files to dist/
REM Run this after `neu build` to ensure all runtime files are present.

echo === Building with neu ===
neu build

if %ERRORLEVEL% NEQ 0 (
    echo neu build failed!
    exit /b %ERRORLEVEL%
)

echo === Renaming exe (removing -win_x64 suffix) ===
if exist "dist\CutOptimizer\CutOptimizer-win_x64.exe" (
    move /Y "dist\CutOptimizer\CutOptimizer-win_x64.exe" "dist\CutOptimizer\CutOptimizer.exe"
)

echo === Copying files to dist\CutOptimizer\ ===

REM Copy examples (needed by example browser)
if not exist "dist\CutOptimizer\examples\" mkdir "dist\CutOptimizer\examples"
copy /Y examples\kitchen_project.json "dist\CutOptimizer\examples\kitchen_project.json"

echo === Done! dist\CutOptimizer is ready. ===
echo.
echo Run: dist\CutOptimizer\CutOptimizer.exe --path=.
