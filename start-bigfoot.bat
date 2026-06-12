@echo off
title Project Big Foot
echo Starting Project Big Foot...
cd /d C:\bf
start "" cmd /k "npm.cmd run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/project-bigfoot/"
echo Server started. Browser opening...
