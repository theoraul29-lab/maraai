# Firebase Deployment Script for MaraAI - maraai.net
# Run: .\deploy-firebase.ps1

param(
    [string]$Environment = "production",
    [string]$Project = "maraai-488fb",
    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$OnlyFunctions,
    [switch]$OnlyHosting
)

Write-Host "🚀 MaraAI Firebase Deployment Script" -ForegroundColor Cyan
Write-Host "Environment: $Environment | Project: $Project" -ForegroundColor Yellow

# ==========================================
# 1. VERIFY PREREQUISITES
# ==========================================
Write-Host "`n📋 Step 1: Verifying prerequisites..." -ForegroundColor Cyan

$hasFirebase = firebase --version 2>$null
if (-not $hasFirebase) {
    Write-Host "❌ Firebase CLI not installed. Run: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Firebase CLI installed: $hasFirebase" -ForegroundColor Green

$hasNode = node --version
Write-Host "✅ Node.js installed: $hasNode" -ForegroundColor Green

$hasNpm = npm --version
Write-Host "✅ npm installed: $hasNpm" -ForegroundColor Green

# ==========================================
# 2. VERIFY PROJECT ACCESS
# ==========================================
Write-Host "`n🔐 Step 2: Verifying Firebase project access..." -ForegroundColor Cyan

firebase projects:list | Select-String $Project | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cannot access project $Project" -ForegroundColor Red
    Write-Host "Run: firebase login" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Firebase project accessible: $Project" -ForegroundColor Green

# ==========================================
# 3. VERIFY .env FILE
# ==========================================
Write-Host "`n🔑 Step 3: Verifying environment variables..." -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
    Write-Host "Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env" -Force
    Write-Host "❌ Please fill in .env with your API keys" -ForegroundColor Red
    exit 1
}

$envVars = @{
    "GEMINI_API_KEY" = $false
    "FIREBASE_PROJECT_ID" = $false
}

Get-Content ".env" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($envVars.ContainsKey($key) -and $value) {
            $envVars[$key] = $true
        }
    }
}

$missing = @()
$envVars.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object {
    $missing += $_.Key
}

if ($missing.Count -gt 0) {
    Write-Host "❌ Missing environment variables: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "Please fill .env file with required values" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ All required environment variables set" -ForegroundColor Green

# ==========================================
# 4. BUILD FRONTEND (if not skipped)
# ==========================================
if (-not $SkipBuild -and -not $OnlyFunctions) {
    Write-Host "`n🏗️  Step 4: Building frontend..." -ForegroundColor Cyan
    
    if (Test-Path "frontend") {
        Push-Location "frontend"
        Write-Host "Installing dependencies..." -ForegroundColor Gray
        npm install --legacy-peer-deps
        
        Write-Host "Building production bundle..." -ForegroundColor Gray
        npm run build
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Frontend build failed" -ForegroundColor Red
            exit 1
        }
        
        Pop-Location
        Write-Host "✅ Frontend built successfully" -ForegroundColor Green
        
        if (-not (Test-Path "frontend/dist")) {
            Write-Host "❌ Build output directory not found: frontend/dist" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Output: frontend/dist" -ForegroundColor Green
    }
}

# ==========================================
# 5. BUILD FUNCTIONS (if not skipped)
# ==========================================
if (-not $SkipBuild -and -not $OnlyHosting) {
    Write-Host "`n⚙️  Step 5: Building Cloud Functions..." -ForegroundColor Cyan
    
    if (Test-Path "functions") {
        Push-Location "functions"
        Write-Host "Installing dependencies..." -ForegroundColor Gray
        npm install
        
        Write-Host "Building TypeScript..." -ForegroundColor Gray
        npm run build
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Cloud Functions build failed" -ForegroundColor Red
            exit 1
        }
        
        Pop-Location
        Write-Host "✅ Cloud Functions built successfully" -ForegroundColor Green
    }
}

# ==========================================
# 6. RUN DRY-RUN IF REQUESTED
# ==========================================
if ($DryRun) {
    Write-Host "`n🧪 Step 6: Running deployment dry-run..." -ForegroundColor Cyan
    firebase deploy --project $Project --dry-run
    Write-Host "✅ Dry-run complete. No changes deployed." -ForegroundColor Green
    exit 0
}

# ==========================================
# 7. DEPLOY TO FIREBASE
# ==========================================
Write-Host "`n🚀 Step 7: Deploying to Firebase..." -ForegroundColor Cyan

$deployArgs = @("deploy", "--project", $Project, "--non-interactive")

if ($OnlyFunctions) {
    Write-Host "Deploying Cloud Functions only..." -ForegroundColor Gray
    $deployArgs += "--only", "functions"
} elseif ($OnlyHosting) {
    Write-Host "Deploying Hosting only..." -ForegroundColor Gray
    $deployArgs += "--only", "hosting"
} else {
    Write-Host "Deploying Hosting and Cloud Functions..." -ForegroundColor Gray
}

firebase @deployArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Deployment successful!" -ForegroundColor Green

# ==========================================
# 8. VERIFY DEPLOYMENT
# ==========================================
Write-Host "`n✔️  Verifying deployment..." -ForegroundColor Cyan

$maxRetries = 5
$retryCount = 0
$success = $false

while ($retryCount -lt $maxRetries -and -not $success) {
    try {
        $response = Invoke-WebRequest -Uri "https://maraai-488fb.web.app/api/health" -TimeoutSec 10 -SkipHttpErrorCheck
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Health check passed" -ForegroundColor Green
            $success = $true
        } else {
            Write-Host "⏳ Waiting for deployment... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
            $retryCount++
        }
    } catch {
        Write-Host "⏳ Waiting for deployment... ($($retryCount + 1)/$maxRetries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 5
        $retryCount++
    }
}

if (-not $success) {
    Write-Host "⚠️  Could not verify health endpoint yet. Check logs:" -ForegroundColor Yellow
    Write-Host "  firebase functions:log --project $Project" -ForegroundColor Gray
}

# ==========================================
# 9. DEPLOYMENT SUMMARY
# ==========================================
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🎉 Deployment Complete!" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan

Write-Host ""
Write-Host "📊 Project Details:" -ForegroundColor Yellow
Write-Host "  Project ID: $Project"
Write-Host "  Region: europe-west1"
Write-Host "  Environment: $Environment"

Write-Host ""
Write-Host "🌐 Access Points:" -ForegroundColor Yellow
Write-Host "  Firebase URLs:"
Write-Host "    Hosting: https://maraai-488fb.web.app"
Write-Host "    API: https://maraai-488fb.web.app/api"
Write-Host ""
Write-Host "  Custom Domain (after DNS setup):"
Write-Host "    Web: https://maraai.net"
Write-Host "    API: https://maraai.net/api"

Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Configure custom domain in Firebase Console:"
Write-Host "     Hosting → Custom Domain → Add (maraai.net)"
Write-Host ""
Write-Host "  2. Update DNS at domain registrar:"
Write-Host "     CNAME: maraai.net → maraai-488fb.web.app"
Write-Host ""
Write-Host "  3. Verify with:"
Write-Host "     nslookup maraai.net"
Write-Host ""
Write-Host "  4. View logs:"
Write-Host "     firebase functions:log --project $Project"
Write-Host ""
Write-Host "  5. Manage in console:"
Write-Host "     https://console.firebase.google.com/project/$Project"

Write-Host ""
Write-Host "[SUCCESS] MaraAI is live on Firebase Hosting!" -ForegroundColor Green
