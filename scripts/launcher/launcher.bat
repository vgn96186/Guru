@echo off
cd /d "C:\Guru"
echo Starting Guru Dev Launcher...
node "scripts\launcher\launch.js"
if errorlevel 1 (
  echo.
  echo Something went wrong. See the error above.
  pause
)
