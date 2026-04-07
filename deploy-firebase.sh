#!/bin/bash

# Firebase Deployment Script for MaraAI - maraai.net
# Run: bash deploy-firebase.sh [--dry-run] [--skip-build] [--only-functions] [--only-hosting]

set -e

# ==========================================
# CONFIGURATION
# ==========================================
ENVIRONMENT="production"
PROJECT="maraai-488fb"
DRY_RUN=false
SKIP_BUILD=false
ONLY_FUNCTIONS=false
ONLY_HOSTING=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --only-functions) ONLY_FUNCTIONS=true; shift ;;
    --only-hosting) ONLY_HOSTING=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==========================================
# HELPER FUNCTIONS
# ==========================================
log_info() {
  echo -e "${CYAN}ℹ️  $1${NC}"
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_step() {
  echo -e "\n${CYAN}$1${NC}"
}

# ==========================================
# 1. VERIFY PREREQUISITES
# ==========================================
log_step "📋 Step 1: Verifying prerequisites..."

if ! command -v firebase &> /dev/null; then
  log_error "Firebase CLI not installed. Run: npm install -g firebase-tools"
  exit 1
fi
log_success "Firebase CLI installed: $(firebase --version)"

if ! command -v node &> /dev/null; then
  log_error "Node.js not installed"
  exit 1
fi
log_success "Node.js installed: $(node --version)"

if ! command -v npm &> /dev/null; then
  log_error "npm not installed"
  exit 1
fi
log_success "npm installed: $(npm --version)"

# ==========================================
# 2. VERIFY PROJECT ACCESS
# ==========================================
log_step "🔐 Step 2: Verifying Firebase project access..."

if ! firebase projects:list 2>/dev/null | grep -q "$PROJECT"; then
  log_error "Cannot access project $PROJECT"
  log_warning "Run: firebase login"
  exit 1
fi
log_success "Firebase project accessible: $PROJECT"

# ==========================================
# 3. VERIFY .env FILE
# ==========================================
log_step "🔑 Step 3: Verifying environment variables..."

if [ ! -f ".env" ]; then
  log_warning ".env file not found"
  if [ -f ".env.example" ]; then
    cp .env.example .env
    log_info "Created .env from .env.example"
  fi
  log_error "Please fill in .env with your API keys"
  exit 1
fi

# Check for required env vars
if ! grep -q "GEMINI_API_KEY=" .env || ! grep -q "FIREBASE_PROJECT_ID=" .env; then
  log_error "Missing required environment variables in .env"
  exit 1
fi
log_success "All required environment variables set"

# ==========================================
# 4. BUILD FRONTEND
# ==========================================
if [ "$SKIP_BUILD" = false ] && [ "$ONLY_FUNCTIONS" = false ]; then
  log_step "🏗️  Step 4: Building frontend..."
  
  if [ -d "frontend" ]; then
    cd frontend
    log_info "Installing dependencies..."
    npm install --legacy-peer-deps
    
    log_info "Building production bundle..."
    npm run build
    
    if [ ! -d "dist" ]; then
      log_error "Build output directory not found: dist/"
      exit 1
    fi
    
    cd ..
    log_success "Frontend built successfully to frontend/dist"
  fi
fi

# ==========================================
# 5. BUILD CLOUD FUNCTIONS
# ==========================================
if [ "$SKIP_BUILD" = false ] && [ "$ONLY_HOSTING" = false ]; then
  log_step "⚙️  Step 5: Building Cloud Functions..."
  
  if [ -d "functions" ]; then
    cd functions
    log_info "Installing dependencies..."
    npm install
    
    log_info "Building TypeScript..."
    npm run build
    
    cd ..
    log_success "Cloud Functions built successfully"
  fi
fi

# ==========================================
# 6. DRY-RUN IF REQUESTED
# ==========================================
if [ "$DRY_RUN" = true ]; then
  log_step "🧪 Step 6: Running deployment dry-run..."
  firebase deploy --project "$PROJECT" --dry-run
  log_success "Dry-run complete. No changes deployed."
  exit 0
fi

# ==========================================
# 7. DEPLOY TO FIREBASE
# ==========================================
log_step "🚀 Step 7: Deploying to Firebase..."

DEPLOY_ARGS="--project $PROJECT --non-interactive"

if [ "$ONLY_FUNCTIONS" = true ]; then
  log_info "Deploying Cloud Functions only..."
  DEPLOY_ARGS="$DEPLOY_ARGS --only functions"
elif [ "$ONLY_HOSTING" = true ]; then
  log_info "Deploying Hosting only..."
  DEPLOY_ARGS="$DEPLOY_ARGS --only hosting"
else
  log_info "Deploying Hosting and Cloud Functions..."
fi

firebase deploy $DEPLOY_ARGS

if [ $? -ne 0 ]; then
  log_error "Deployment failed"
  exit 1
fi

log_success "Deployment successful!"

# ==========================================
# 8. VERIFY DEPLOYMENT
# ==========================================
log_step "✔️  Verifying deployment..."

MAX_RETRIES=5
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
  if curl -s "https://maraai-488fb.web.app/api/health" > /dev/null 2>&1; then
    log_success "Health check passed"
    SUCCESS=true
  else
    log_warning "Waiting for deployment... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 5
    RETRY_COUNT=$((RETRY_COUNT + 1))
  fi
done

if [ "$SUCCESS" = false ]; then
  log_warning "Could not verify health endpoint yet. Check logs:"
  log_info "firebase functions:log --project $PROJECT"
fi

# ==========================================
# 9. DEPLOYMENT SUMMARY
# ==========================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_success "Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo -e "${YELLOW}📊 Project Details:${NC}"
echo "  Project ID: $PROJECT"
echo "  Region: europe-west1"
echo "  Environment: $ENVIRONMENT"

echo ""
echo -e "${YELLOW}🌐 Access Points:${NC}"
echo "  Firebase URLs:"
echo "    Hosting: https://maraai-488fb.web.app"
echo "    API: https://maraai-488fb.web.app/api"
echo ""
echo "  Custom Domain (after DNS setup):"
echo "    Web: https://maraai.net"
echo "    API: https://maraai.net/api"

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "  1. Configure custom domain in Firebase Console:"
echo "     Hosting → Custom Domain → Add (maraai.net)"
echo ""
echo "  2. Update DNS at domain registrar:"
echo "     CNAME: maraai.net → maraai-488fb.web.app"
echo ""
echo "  3. Verify with:"
echo "     nslookup maraai.net"
echo ""
echo "  4. View logs:"
echo "     firebase functions:log --project $PROJECT"
echo ""
echo "  5. Manage in console:"
echo "     https://console.firebase.google.com/project/$PROJECT"

echo ""
log_success "MaraAI is live on Firebase Hosting!"
