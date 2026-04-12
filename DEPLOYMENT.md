# 🚀 MaraAI v2 - Deployment Guide

## ✨ WHAT'S BEEN IMPLEMENTED

### **Design & UI**
- ✅ **HomePage with 6 animated cards** - flip animation from bottom to top
  - Reels (Purple/Pink gradient)
  - Trading Academy (Orange/Red)
  - VIP Membership (Gold/Yellow)
  - Creator Panel (Cyan/Blue)
  - Writers Hub (Green/Emerald)
  - You/Profile (Indigo/Purple)
- ✅ **Responsive design** - Desktop, Tablet, Mobile (480px+)
- ✅ **Module-specific CSS** - Each section has unique color theme & styling
- ✅ **Interactive animations** - Hover effects, floating icons, smooth transitions

### **Backend AI Integration**
- ✅ **Mara AI (Gemini-powered)** - `server/ai.ts` handles all AI responses
  - Mood detection (happy, excited, sad, calm, curious, neutral)
  - Context awareness from chat history
  - Temperature 0.95 for creative responses
- ✅ **Mara Brain System** - `server/mara-brain.ts` provides:
  - User memory persistence (interactions, preferences)
  - Learning from user patterns
  - Emotional context analysis
  - Auto-saving every 30 seconds

### **Data Persistence**
- ✅ **SQLite (development) / PostgreSQL (production)**
  - Users table (auth, profile, roles)
  - Chats table (conversation history + mood)
  - Videos table (reels, metadata, engagement)
  - Orders table (premium subscriptions)
  - Preferences table (language, theme, personality)

### **Code Cleanup**
- ✅ **Removed Vertex AI imports** from main.py
- ✅ **Removed dead Flask endpoints** (`/api/chat`, `/api/trading/signals`)
- ✅ **Consolidated AI** - All AI requests now go through server/ai.ts (Gemini only)

### **API Endpoints (Active)**
- ✅ `/api/chat` - WebSocket chat with Mara
- ✅ `/api/videos/*` - Reels CRUD, like, view, save
- ✅ `/api/creator/*` - Post creation, analytics
- ✅ `/api/writers/*` - Manuscript library, publishing
- ✅ `/api/premium/*` - VIP status, orders
- ✅ `/api/payments/*` - Stripe & PayPal integration
- ✅ `/api/admin/*` - Stats, users, moderation

---

## 🎯 QUICK START - LOCAL DEVELOPMENT

### **Prerequisites**
```bash
Node.js 20+
npm / yarn
OPENROUTER_API_KEY (from https://openrouter.ai) or OLLAMA_BASE_URL
```

### **1. Setup**
```bash
cd c:\Users\admin\Desktop\MaraAi

# Install dependencies
npm install

# Set environment variables (create .env file)
cat > .env << EOF
OPENROUTER_API_KEY=your_openrouter_key_here
DATABASE_URL=sqlite:///./mara_system.db
JWT_SECRET=your_random_jwt_secret
NODE_ENV=development
PORT=5000
HOST=localhost
EOF
```

### **2. Run Local Server**
```bash
# Terminal 1: Start Node.js backend + WebSocket
npm run start:backend
# or: npm run dev

# Should output:
# > Using DATABASE_URL: sqlite:///./mara_system.db
# > Listening on http://localhost:5000
```

### **3. Access Platform**
```
http://localhost:5000
```

#### **Test Flow:**
1. **Homepage** - See 6 animated cards ✓
2. **Navigate to Reels** - Watch video feed ✓
3. **Chat with Mara** - Open chat box, send message
   - Mara responds with mood detection
   - Memory saved to DB
4. **Create content** - Post in Creator panel
5. **Premium** - Check VIP membership options

---

## 🧠 MARA AI BRAIN - How It Works

```
User Message → server/index.ts (WebSocket)
    ↓
checkRateLimit() → getUserPreferences()
    ↓
getMaraResponse() from server/ai.ts
    ├── OpenRouter / Ollama LLM call
    ├── detectMood() - analyze response
    ├── buildContextPrompt() - from mara-brain.ts
    └── Return { response, detectedMood }
    ↓
storage.createChatMessage() → SQLite/PostgreSQL
    ├── Save user message
    ├── Save AI response
    └── Tag with mood + confidence
    ↓
MaraBrainMemory.recordInteraction()
    ├── Update learningData
    ├── Extract topics
    └── Persist preferences
    ↓
Response sent to client via WebSocket
```

### **Memory Persistence Example:**
```javascript
const brain = maraBrain.getOrCreate(userId);
const memory = await brain.loadMemory();
// Returns: {
//   userId,
//   interactions: [...100 last chats],
//   preferences: { language, personality, style },
//   learningData: [{ topic, sentiment, frequency }],
//   mood: 'happy' // current detected mood
// }
```

---

## 📱 DESIGN BREAKDOWN

### **Card Animations (HomePage.css)**
```css
.card {
  animation: flipFromBottom 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
}

@keyframes flipFromBottom {
  0% {
    opacity: 0;
    transform: translateY(60px) rotateX(90deg); /* Rotate from bottom */
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotateX(0deg);
  }
}
```

### **Module Colors (modules.css)**
| Module | Primary Color | Secondary | Gradient |
|--------|------|-----------|----------|
| Reels | #a855f7 (Purple) | #ec4899 (Pink) | Purple → Pink |
| Trading | #f97316 (Orange) | #ef4444 (Red) | Orange → Red |
| Writers | #10b981 (Green) | #059669 (Emerald) | Green → Emerald |
| Creator | #22d3ee (Cyan) | #0ea5e9 (Blue) | Cyan → Blue |
| VIP | #facc15 (Gold) | #eab308 (Amber) | Gold → Amber |
| You | #818cf8 (Indigo) | #6366f1 (Purple) | Indigo → Purple |

---

## 🧪 VERIFICATION BEFORE DEPLOY

### **Run Pre-Deployment Checks**
```bash
npm run verify:deploy
# or: npx ts-node script/verify-deployment.ts

# Should output:
# ✅ Passed: 16
# ❌ Failed: 0
# ⚠️  Warnings: 0
# ✨ Ready for deployment!
```

### **Manual Checklist**
- [ ] OPENROUTER_API_KEY is valid (or OLLAMA_BASE_URL is configured)
- [ ] Database connection works (check `mara_system.db` or cloud DB)
- [ ] Frontend builds: `npm run build`
- [ ] No console errors in DevTools
- [ ] Mara responds with mood detection
- [ ] All 6 cards animate on homepage
- [ ] Module colors display correctly
- [ ] Mobile responsive (test at 480px width)

---

## 🌐 DEPLOYMENT PLATFORMS

### **Option 1: Local Development**
```bash
npm run start:backend
# Platform runs on http://localhost:5000
```

### **Option 2: Railway.app (Recommended)**
```bash
# 1. Push code to GitHub
git add .
git commit -m "Production ready"
git push origin main

# 2. Go to https://railway.app
#    - New Project → Deploy from GitHub repo
#    - Railway auto-detects Dockerfile.nodejs via railway.json

# 3. Set environment variables in Railway dashboard:
#    - OPENROUTER_API_KEY=your_key
#    - JWT_SECRET=your_random_secret
#    - DATABASE_URL=sqlite:///./maraai.sqlite
#    - NODE_ENV=production
#    - CORS_ORIGINS=https://maraai.net

# 4. Add a volume (optional, for persistent SQLite):
#    Mount path: /app/data
#    Then set DATABASE_URL=sqlite:///data/maraai.sqlite

# 5. Custom domain:
#    Settings → Domains → Add custom domain → maraai.net
#    Update DNS: CNAME → <your-railway-url>
```

### **Option 3: Docker (any host)**
```bash
# Build Docker image
docker build -t maraai:latest -f Dockerfile.nodejs .

# Run
docker run -p 5000:5000 \
  -e OPENROUTER_API_KEY=your_key \
  -e JWT_SECRET=your_secret \
  -e NODE_ENV=production \
  maraai:latest
```

---

## 📊 PRODUCTION SETTINGS

### **.env for Production**
```bash
NODE_ENV=production
PORT=5000
OPENROUTER_API_KEY=your_production_key
OPENROUTER_MODEL=openai/gpt-4o-mini
JWT_SECRET=your_strong_random_secret
DATABASE_URL=sqlite:///./maraai.sqlite
CORS_ORIGINS=https://maraai.net,https://www.maraai.net
LOG_LEVEL=info
MARA_BRAIN_AUTOSAVE_INTERVAL=30000
```

### **Build & Start**
```bash
# Build frontend
npm run build

# Start backend with frontend serving
npm run start
# Listens on http://0.0.0.0:5000
```

---

## 🔍 TROUBLESHOOTING

### **Issue: "OPENROUTER_API_KEY is not set"**
- Solution: Add `OPENROUTER_API_KEY` to `.env` file
- Get key: https://openrouter.ai/keys

### **Issue: "Cannot find module 'storage'"**
- Solution: Ensure `server/storage.ts` exists with correct exports

### **Issue: Cards not animating**
- Solution: Check browser DevTools, ensure CSS loaded (`HomePage.css`)
- Try: Hard refresh (Ctrl+Shift+R)

### **Issue: Mara not responding**
- Check: Is OPENROUTER_API_KEY valid? (or OLLAMA_BASE_URL configured?)
- Check: Does WebSocket connect? (DevTools → Network → WS)
- Check: Any rate limiting? (10 messages/min limit in server/index.ts)

### **Issue: Mobile design broken**
- Solution: Ensure `HomePage.css` media queries active
- Try: Check viewport meta tag in index.html

---

## 📈 MONITORING & ANALYTICS

### **Logs**
- Backend logs: Console output + `logs/` directory
- Database queries: `logs/sql/` if enabled
- Mara brain: `[MaraBrainMemory]` entries in console

### **Metrics**
- Active users: Check `users` table
- Chat volume: Count rows in `chats` table  
- Engagement: Check `videos` table (likes, views)

### **Health Check**
```bash
curl http://localhost:5000/api/health
# Response: {"status":"ok"}
```

---

## 💡 NEXT STEPS

1. **Test locally** - Ensure everything works on `http://localhost:5000`
2. **Verify Mara brain** - Send 5+ messages, check memory in DB
3. **Test mobile** - View on phone or browser DevTools mobile mode
4. **Check module colors** - Visit each module, verify colors
5. **Deploy to cloud** - Use chosen platform above
6. **Monitor production** - Check logs, user feedback

---

## 📞 SUPPORT

- **Documentation**: See `README.md` in root
- **API Reference**: Check `server/routes.ts` for all endpoints
- **Design System**: Review `frontend/src/modules.css` for colors

---

**Happy deploying! 🎉 MaraAI is production-ready.**
