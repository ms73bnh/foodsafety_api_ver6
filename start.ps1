# 이 스크립트는 Node.js 경로를 자동으로 잡아 프로젝트를 실행합니다.
$NODE_PATH = "C:\Program Files\nodejs"

if (Test-Path "$NODE_PATH\node.exe") {
    $env:Path += ";$NODE_PATH"
    Write-Host "Node.js 경로를 설정했습니다: $NODE_PATH" -ForegroundColor Green
    
    Write-Host "1. 의존성 설치 확인 중..." -ForegroundColor Cyan
    if (!(Test-Path "node_modules")) {
        Write-Host "node_modules가 없습니다. 설치를 시작합니다..."
        & "$NODE_PATH\npm.cmd" install
    }
    
    Write-Host "2. Prisma 클라이언트 생성 중..." -ForegroundColor Cyan
    & "$NODE_PATH\npx.cmd" prisma generate
    
    Write-Host "3. 개발 서버를 실행합니다..." -ForegroundColor Cyan
    Write-Host "실행 후 브라우저에서 http://localhost:3000 에 접속하세요." -ForegroundColor Yellow
    & "$NODE_PATH\npm.cmd" run dev
} else {
    Write-Host "오류: C:\Program Files\nodejs\node.exe 를 찾을 수 없습니다." -ForegroundColor Red
    Write-Host "Node.js가 올바른 경로에 설치되었는지 확인해 주세요."
}
