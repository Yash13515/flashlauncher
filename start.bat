@echo off
echo Starting Maximizer Campaign Heatmap Dashboard
echo ==============================================

echo [1/1] Starting unified full-stack server (UI + API Proxy)...
start "Campaign Heatmap Dashboard" cmd /c "python server.py"

echo.
echo Server started successfully!
echo The dashboard will now open in your default browser.
echo closing this window will NOT stop the servers.
timeout /t 2 >nul

start http://localhost:8080/
exit
