# 🚀 Firebase Deployment Guide - maraai.net

## ⚡ QUICK DEPLOY (5 minutes)

### **Prerequisites**
```bash
# 1. Install Firebase CLI
npm install -g firebase-tools

# 2. Login to Firebase
firebase login

# 3. Verify you have access to maraai-488fb project
firebase projects:list
```

### **Deploy Steps**

#### **Step 1: Build Frontend**
```bash
cd c:\Users\admin\Desktop\MaraAi

# Build React frontend for Firebase Hosting
npm run build:frontend
# or: cd frontend && npm run build

# Output: frontend/dist/ (ready for Firebase Hosting)
```

#### **Step 2: Build Cloud Functions**
```bash
# Build backend API for Cloud Functions
cd functions
npm install
npm run build
# Output: functions/lib/ (compiled JS)

cd ..
```

#### **Step 3: Deploy to Firebase**
```bash
# Deploy everything to maraai-488fb
firebase deploy --project maraai-488fb

# Expected output:
# ✔  Deploy complete!
# 
# Project Console: https://console.firebase.google.com/project/maraai-488fb
# Hosting URL: https://maraai-488fb.web.app
# Functions URL: deployed to europe-west1
```

#### **Step 4: Setup Custom Domain**
```bash
# Add maraai.net to Firebase Hosting
firebase hosting:channel:deploy live --project maraai-488fb

# Then in Firebase Console:
# Go to Hosting → Custom Domain → Add Domain
# Enter: maraai.net
# Update DNS records at domain registrar
```

---

## 📋 DETAILED SETUP

### **1. Firebase Project Configuration**

Create `.firebaserc` (auto-created by `firebase init`):
```json
{
  "projects": {
    "default": "maraai-488fb"
  },
  "targets": {},
  "etags": {}
}
```

Update existing if needed:
```bash
firebase use maraai-488fb --add
```

### **2. Environment Variables**

Create `.env` file (root folder):
```bash
# Firebase
FIREBASE_PROJECT_ID=maraai-488fb
FIREBASE_API_KEY=AIzaSy...YOUR_KEY...
FIREBASE_AUTH_DOMAIN=maraai-488fb.firebaseapp.com
FIREBASE_STORAGE_BUCKET=maraai-488fb.appspot.com
FIREBASE_MESSAGING_SENDER_ID=598...
FIREBASE_APP_ID=1:598...:web:...

# Gemini AI
GEMINI_API_KEY=AIzaSy...YOUR_GEMINI_KEY...

# Backend
DATABASE_URL=firestore  # Uses Firestore instead of SQLite
NODE_ENV=production
CORS_ORIGINS=https://maraai.net,https://www.maraai.net
```

Create `functions/.env.prod` for Cloud Functions:
```bash
GEMINI_API_KEY=AIzaSy...
GCLOUD_PROJECT=maraai-488fb
GOOGLE_CLOUD_PROJECT=maraai-488fb
VERTEX_LOCATION=europe-west1
```

### **3. Firebase Hosting Configuration**

Verify/update `firebase.json`:
```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "destination": "/api"
      },
      {
        "source": "/api/**",
        "function": {
          "functionId": "app",
          "region": "europe-west1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "cleanUrls": true,
    "trailingSlash": false,
    "headers": [
      {
        "source": "/api/**",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache, no-store, must-revalidate"
          },
          {
            "key": "Access-Control-Allow-Origin",
            "value": "*"
          }
        ]
      },
      {
        "source": "/**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "ignore": ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"]
    }
  ]
}
```

### **4. Cloud Functions Setup**

Ensure `functions/src/index.ts` exports the Express app:
```typescript
export const app = onRequest(
  { region: 'europe-west1', cors: true, memory: '1GiB' },
  expressApp
);
```

### **5. DNS Configuration (Domain Registrar)**

After Firebase adds domain, you'll get:
```
CNAME: maraai.net → firebase.domainvalidation.com
or
A Records:
  199.36.158.100
  199.36.158.101
  ...
```

Update at your domain registrar (GoDaddy, Namecheap, Google Domains, etc.):
1. Go to DNS settings
2. Add CNAME record: maraai.net → maraai-488fb.web.app
3. Wait for DNS propagation (~15-30 min)

Verify:
```bash
nslookup maraai.net
# Should resolve to Firebase IP
```

---

## 🔐 SECURITY & ENVIRONMENT

### **Firebase Rules (Firestore)**

Create `firestore.rules`:
```firebase
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Public reads for posts/reels
    match /posts/{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Admin only
    match /admin/{document=**} {
      allow read, write: if request.auth.token.admin == true;
    }
  }
}
```

### **Storage Rules (Firebase Storage)**

Create `storage.rules`:
```firebase
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow authenticated users to upload
    match /uploads/{userId}/{document=**} {
      allow read: if true;
      allow write: if request.auth.uid == userId;
    }
  }
}
```

Deploy rules:
```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

---

## 📊 MONITORING DEPLOYMENT

### **Check Deployment Status**
```bash
# View all deployed resources
firebase deploy --project maraai-488fb --dry-run

# View logs
firebase functions:log --project maraai-488fb

# Check Hosting
firebase hosting:sites:list --project maraai-488fb
```

### **View in Firebase Console**
```
https://console.firebase.google.com/project/maraai-488fb
```

Navigate to:
- **Hosting** → View stats, custom domains, releases
- **Cloud Functions** → Logs, metrics, errors
- **Firestore** → Database status, collections, usage
- **Storage** → Files, rules, analytics

### **Real-time Logs**
```bash
# Follow function logs
firebase functions:log --follow --limit=50

# Search for errors
firebase functions:log --limit=100 | grep ERROR
```

---

## 🧪 TESTING BEFORE DEPLOY

### **Local Emulation**
```bash
# Start Firebase Emulator Suite
firebase emulators:start

# Will run:
# - Hosting on http://localhost:5000
# - Functions on http://localhost:5001
# - Firestore on http://localhost:8080
```

### **Test API Endpoints**
```bash
# Chat endpoint
curl -X POST http://localhost:5001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Mara"}'

# Health check
curl http://localhost:5000/api/health
```

### **Frontend Test**
```
Open http://localhost:5000
- See 6 cards animate
- Chat with Mara
- Test module navigation
```

---

## 🔄 DEPLOYMENT WORKFLOW

### **For Updates:**

```bash
# 1. Make code changes
git add .
git commit -m "Feature: Add new module"

# 2. Build
npm run build:frontend
cd functions && npm run build && cd ..

# 3. Test locally
firebase emulators:start

# 4. Deploy to Firebase
firebase deploy --project maraai-488fb

# 5. Verify
curl https://maraai.net/api/health
```

### **Rollback if Needed**
```bash
# View recent deployments
firebase hosting:releases:list --project maraai-488fb

# Rollback to previous version
firebase hosting:releases:rollback --releaseId=<ID> --project maraai-488fb
```

---

## 📱 PRODUCTION CHECKLIST

Before deploying to maraai.net:

- [ ] `GEMINI_API_KEY` is production key (not dev)
- [ ] `FIREBASE_PROJECT_ID=maraai-488fb` set
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` includes maraai.net
- [ ] Frontend builds without errors: `npm run build:frontend`
- [ ] Functions compile: `cd functions && npm run build`
- [ ] No hardcoded secrets in code (use env vars)
- [ ] Firestore rules set correctly (security)
- [ ] Storage rules set correctly
- [ ] Database indexes created (auto-created for queries)
- [ ] Custom domain DNS configured
- [ ] HTTPS certificate auto-generated (Firebase does this)
- [ ] Tested locally with emulator
- [ ] Tested staging deployment first (optional)

---

## 🐛 TROUBLESHOOTING

### **"Cannot find module" errors in Functions**
```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

### **Frontend shows "Cannot GET /" error**
- Check: `firebase.json` has correct `public` path
- Check: `npm run build:frontend` completed
- Solution: `firebase serve --project maraai-488fb` to test locally

### **API returning 404**
- Check: Functions deployed (`firebase functions:list`)
- Check: firebase.json rewrites configured correctly
- Check: CORS headers set in functions/src/index.ts

### **Domain not working**
- Check: DNS propagation (`nslookup maraai.net`)
- Check: Firebase Hosting custom domain status
- Wait: DNS can take 15-30 min to propagate
- Verify: `curl https://maraai.net` returns HTML

### **Gemini API errors**
- Check: `GEMINI_API_KEY` valid and has quota
- Check: API enabled in Google Cloud Console
- Check: Key has "Generative Language API" access

---

## 💾 BACKUP & RECOVERY

### **Export Firestore Data**
```bash
# Backup Firestore
gcloud firestore export gs://maraai-488fb.appspot.com/firestore-backup

# Restore from backup
gcloud firestore restore gs://maraai-488fb.appspot.com/firestore-backup/<backup-timestamp>
```

### **Export Firebase Storage**
```bash
# Download all files
gsutil -m cp -r gs://maraai-488fb.appspot.com/uploads ./backup/storage
```

---

## 📈 PERFORMANCE & SCALING

### **Monitor Metrics**
Go to Firebase Console → Performance:
- **Page Load Time** - Should be <3s
- **Network** - WebSocket latency for chat
- **CPU/Memory** - Cloud Functions usage

### **Optimize**
- [ ] Enable CDN caching for static assets (auto in Firebase Hosting)
- [ ] Compress images in frontend/public
- [ ] Use lazy loading for modules
- [ ] Monitor Firestore indexes (auto-created)
- [ ] Set appropriate Cloud Functions memory: 512MB → 2GB

### **Scaling**
Firebase auto-scales:
- **Hosting** - CDN serves globally
- **Cloud Functions** - Auto-scales up to maxInstances (set in code)
- **Firestore** - Serverless, no scaling needed

---

## 🚀 FINAL STEP - VERIFY LIVE

After deployment:
```bash
# Test live domain
curl https://maraai.net
curl https://www.maraai.net
curl https://maraai.net/api/health

# Check homepage loads
open https://maraai.net

# Test chat
# Open https://maraai.net → Chat box → Send message
# Should get response from Mara (Gemini API)
```

---

**✨ That's it! MaraAI is now live on maraai.net via Firebase.**

For issues: `firebase --help` or Firebase Discord community.
