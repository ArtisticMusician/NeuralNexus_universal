@echo off
echo 🧠 Neural Nexus: Universal AI Memory
echo ====================================

if not exist .env (
    echo ⚠️  No .env file found. Creating one now...
    copy .env.example .env
    
    set /p API_KEY="Enter a new API Key (default: nexus-secret): "
    if "%API_KEY%"=="" set API_KEY=nexus-secret
    
    powershell -Command "(gc .env) -replace 'NEXUS_API_KEY=your_secret_key_here', 'NEXUS_API_KEY=%API_KEY%' | Out-File -encoding ASCII .env"
    
    echo ✅ Configuration created.
) else (
    echo ✅ .env file found.
)

docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b
)

echo.
echo 🚀 Launching Neural Nexus...
echo    - API & Dashboard: http://localhost:3000
echo    - OpenAI Proxy:    http://localhost:3001/v1
echo.

docker-compose up --build -d

echo.
echo 🎉 System is running!
pause
