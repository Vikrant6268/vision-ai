@echo off
REM ====================================================================
REM  Vision AI - start everything
REM
REM  Double-click this file. It opens two windows:
REM    1. Python AI service  (YOLO object detection, offline OCR)
REM    2. Node.js backend    (the website and all the APIs)
REM
REM  Then open Chrome at http://localhost:3000
REM  Close both windows to stop.
REM ====================================================================

echo Starting Vision AI...
echo.

start "Vision AI - Python AI Service" cmd /k "cd /d %~dp0ai-service && call venv\Scripts\activate.bat && python run.py"

REM Give Python a head start so the model is loading while Node boots.
timeout /t 5 /nobreak >nul

start "Vision AI - Node Backend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo Both services are starting in their own windows.
echo The Python window takes about 20 seconds to load the YOLO model.
echo.
echo Then open:  http://localhost:3000
echo.
pause
