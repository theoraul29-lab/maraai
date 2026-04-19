# 🏗️ MaraAI Platform Architecture

## System Overview

MaraAI is a modern AI platform with 6 specialized modules deployed on Railway with a Node.js backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                     maraai.net (Railway)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Frontend (React + TypeScript)               │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐           │   │
│  │  │   Reels    │ │  Trading   │ │    VIP     │  ...      │   │
│  │  │  Module    │ │  Module    │ │   Module   │           │   │
│  │  └────────────┘ └────────────┘ └────────────┘           │   │
│  │                                                            │   │
│  │  - 6 Animated Cards (flip bottom-to-top)               │   │
│  │  - Module-specific color themes                        │   │
│  │  - Real-time Chat Interface                            │   │
│  │  - Responsive Design (480px+)                          │   │
│  │  - Vite + Tailwind CSS                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              ↓                                    │
│                   /api/** → Cloud Functions                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│           Cloud Functions (Express.js, europe-west1)            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Express Server (functions/src/index.ts)      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  Routes:                   Handlers:                    │   │
│  │  ├── /api/chat             ├── ChatModule              │   │
│  │  ├── /api/trading/signals  ├── TradingModule           │   │
│  │  ├── /api/reels            ├── ReelsModule             │   │
│  │  ├── /api/creator/*        ├── CreatorModule           │   │
│  │  ├── /api/writers/*        ├── WritersModule           │   │
│  │  ├── /api/user/vip-status  └── PaymentModule           │   │
│  │  └── /api/health                                        │   │
│  │                                                           │   │
│  │  Rate Limiting:     WebSocket:                           │   │
│  │  - 10 msgs/min      - Real-time chat                    │   │
│  │  - Per user         - P2P signaling                     │   │
│  │                     - Connection pooling               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
        ↓              ↓              ↓              ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Anthropic API│ │   SQLite     │ │   Local      │ │    JWT       │
│  (AI/Chat)   │ │ (Database)   │ │  (Files)     │ │   Auth       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
        ↓
┌──────────────────────────────────┐
│     Mara AI Brain System          │
│  (server/mara-brain.ts)           │
├──────────────────────────────────┤
│ ├── Memory System                │
│ │   ├── User Interactions        │
│ │   ├── Chat History             │
│ │   └── User Preferences         │
│ │                                 │
│ ├── Learning System              │
│ │   ├── Topic Extraction         │
│ │   ├── Sentiment Analysis       │
│ │   └── Pattern Recognition      │
│ │                                 │
│ └── Personality System            │
│     ├── Mood Detection            │
│     ├── Response Styling          │
│     └── Context Awareness         │
└──────────────────────────────────┘
```

---

## 📁 Project Structure

```
MaraAI/
│
├── frontend/                          # React + TypeScript (Vite)
│   ├── src/
│   │   ├── HomePage.tsx              # 6 Module Cards + Navigation
│   │   ├── HomePage.css              # Flip Animations
│   │   ├── modules.css               # Module-Specific Styles
│   │   ├── components/
│   │   │   ├── ChatModule.tsx
│   │   │   ├── TradingModule.tsx
│   │   │   ├── ReelsModule.tsx
│   │   │   ├── CreatorModule.tsx
│   │   │   ├── WritersModule.tsx
│   │   │   └── YouModule.tsx
│   │   ├── hooks/                    # React Custom Hooks
│   │   ├── styles/                   # Tailwind Config
│   │   └── utils/                    # Helper Functions
│   ├── dist/                         # [AUTO] Built Files
│   ├── package.json                  # npm Dependencies
│   └── vite.config.js                # Build Configuration
│
├── server/                           # Node.js Express Backend
│   ├── index.ts                      # Main Server
│   ├── routes.ts                     # Route Registration
│   ├── ai.ts                         # Anthropic Claude API Client
│   ├── auth.ts                       # JWT Authentication
│   ├── mara-brain.ts                 # Memory + Learning System
│   ├── storage.ts                    # Persistence Layer
│   └── modules/                      # Business Logic
│       ├── chat.ts
│       ├── trading.ts
│       ├── reels.ts
│       ├── creator.ts
│       ├── writers.ts
│       └── payments.ts
│
├── DEPLOYMENT.md                     # Deploy Guide (Railway)
├── .env.example                      # Environment Template
│
└── [Other Config Files]
    ├── package.json                  # Root Dependencies
    ├── tsconfig.json                 # TypeScript Config
    ├── vite.config.js                # Vite Config
    ├── railway.json                  # Railway Config
    ├── Dockerfile.nodejs             # Container
    └── requirements.txt              # Python Dependencies
```

---

## 🎯 Core Features

### **1. Homepage with 6 Modules**

Each module is a card that:
- Animates on page load (flip from bottom)
- Has unique color theme (gradient)
- Links to dedicated module page
- Shows module statistics/preview
- Responsive on all devices

**Modules:**
1. **Reels** - Video streaming content
2. **Trading** - Crypto signals & analysis
3. **VIP** - Premium membership features
4. **Creator** - Content creation tools
5. **Writers** - Community writing platform
6. **You** - Personal profile & settings

### **2. Real-Time Chat with Mara AI**

Features:
- WebSocket connection for instant messages
- Anthropic Claude API (claude-sonnet-4-20250514) for intelligent responses
- Mood detection (happy, analytical, sarcastic, etc.)
- Chat history persistence
- Typing indicators
- Message timestamp
- User authentication

### **3. Mara AI Brain System**

Components:
- **Memory:** Stores all user interactions
- **Learning:** Extracts topics, sentiment, patterns
- **Preferences:** User language, style, interests
- **Context Awareness:** Previous conversations inform responses
- **Auto-save:** Every 30 seconds to Firestore

Features:
```javascript
MaraBrainMemory class:
├── loadMemory()           // Load chat history + preferences
├── recordInteraction()    // Save user-AI exchange
├── buildContextPrompt()   // Create context string for AI
├── updatePreferences()    // Store user settings
├── buildLearningData()    // Extract topics + frequency
└── saveToStorage()        // Persist to Firestore
```

### **4. Module-Specific Functionality**

Each module has:
- Dedicated page component
- Unique styling (colors, layout)
- API endpoints for data
- User interaction tracking
- Analytics integration

Example:
```javascript
// Trading Module
GET /api/trading/signals          // Get market signals
POST /api/trading/analysis        // Request analysis
GET /api/trading/portfolio        // User portfolio

// Writers Module
GET /api/writers/library          // List stories
POST /api/writers/publish         // Publish story
GET /api/writers/{id}/comments    // Get comments
```

---

## 🔐 Security Architecture

### **Authentication Layers**

1. **JWT Auth**
   - Email/password login with bcrypt
   - JWT token generation & validation (HMAC-SHA256)
   - User context injection via middleware
   - Session management

3. **Admin Authorization**
   - Role-based access control
   - Admin-only endpoints
   - Audit logging

### **Data Protection**

1. **API Security**
   - CORS configured (maraai.net only)
   - Rate limiting (10 msgs/min per user)
   - Input validation
   - SQL injection prevention (Drizzle ORM)

2. **Database Security**
   - SQLite with Drizzle ORM parameterized queries
   - Row-level authorization in route handlers
   - Encryption in transit (HTTPS/TLS)

3. **Environment Security**
   - API keys in .env (not in repo)
   - Secrets managed via Railway environment variables
   - No hardcoded credentials
   - Audit trails for admin actions

---

## 🗄️ Database Schema

### **SQLite Tables**

```
users/
├── {userId}
│   ├── email: string
│   ├── username: string
│   ├── preferences: object
│   │   ├── language: "ro" | "en"
│   │   ├── theme: "light" | "dark"
│   │   └── notifications: boolean
│   ├── createdAt: timestamp
│   └── isPremium: boolean

chats/
├── {chatId}
│   ├── userId: string
│   ├── messages: array
│   │   ├── role: "user" | "assistant"
│   │   ├── text: string
│   │   ├── mood: string
│   │   └── timestamp: number
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp

mara_brain/
├── {userId}
│   ├── chatHistory: array (limited to last 100)
│   ├── learningData: object
│   │   ├── topics: {[topic]: frequency}
│   │   ├── sentiment: {"positive": %, "negative": %}
│   │   └── preferences: object
│   ├── lastUpdated: timestamp
│   └── preferences: object

posts/
├── {postId}
│   ├── userId: string
│   ├── title: string
│   ├── content: string
│   ├── category: string
│   ├── likes: number
│   ├── comments: array
│   ├── createdAt: timestamp
│   └── updatedAt: timestamp

videos/
├── {videoId}
│   ├── userId: string
│   ├── title: string
│   ├── url: string
│   ├── thumbnail: string
│   ├── duration: number
│   ├── views: number
│   ├── likes: number
│   ├── createdAt: timestamp
│   └── metadata: object
```

---

## 🔌 API Endpoints

### **Chat Module**

```
POST /api/chat
{
  "message": "Hello Mara",
  "history": [
    { "role": "user", "text": "Hi" },
    { "role": "assistant", "text": "Hello!" }
  ]
}
→ {
  "message": "Response from Mara",
  "mood": "helpful",
  "timestamp": 1234567890
}
```

### **Trading Module**

```
GET /api/trading/signals
→ {
  "module": "trading",
  "content": "BTC analysis...",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **Reels Module**

```
GET /api/reels?limit=10
→ [
  {
    "id": "reel_1",
    "title": "Video title",
    "url": "storage-url",
    "views": 1000,
    "createdAt": 1234567890
  }
]
```

### **User Module**

```
GET /api/user/profile
→ {
  "id": "user_1",
  "email": "user@example.com",
  "premium": true,
  "preferences": {...}
}

GET /api/user/vip-status
→ { "isPremium": true }
```

### **Health Check**

```
GET /api/health
→ {
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 3600
}
```

---

## 🚀 Deployment Architecture

### **Railway Deployment**

```
Railway Project (maraai)
├── Service: Node.js Express + Vite static
│   ├── Build: Dockerfile.nodejs (multi-stage)
│   ├── Port: Injected via $PORT
│   ├── Health: /api/health
│   └── Custom Domain: maraai.net
│
├── Database: SQLite (volume-mounted)
│   ├── Location: /data/maraai.sqlite
│   └── Persistence: Railway volume
│
├── Auth: JWT (HMAC-SHA256)
│   ├── Token expiry: 24h
│   └── Secret: JWT_SECRET env var
│
└── AI: Anthropic Claude
    └── Key: ANTHROPIC_API_KEY env var
```

---

## 🔄 Development Workflow

### **Local Development**

```bash
# Start frontend dev server
cd frontend && npm run dev

# Start backend server
npm run dev
```

### **Testing**

```bash
# Unit tests
npm test
```

### **Build & Deploy**

```bash
# Build for production
npm run build:frontend

# Deploy to Railway (via GitHub push)
git push origin main
```

---

## 📊 Performance Targets

### **Frontend Performance**

- Page Load Time: <3 seconds
- First Contentful Paint: <1.5 seconds
- Largest Contentful Paint: <2.5 seconds
- Cumulative Layout Shift: <0.1
- Mobile Score: >90 (Lighthouse)

### **Backend Performance**

- API Response Time: <500ms (p95)
- Chat Message Latency: <1 second
- Database Query Time: <100ms
- Cloud Function Cold Start: <5 seconds

### **Scaling Metrics**

- Concurrent Users: 1,000+
- Requests/Second: 100+
- Database Queries/Second: 500+
- Bandwidth: Railway CDN

---

## 📈 Monitoring & Analytics

### **Railway Dashboard Metrics**

- Service traffic and errors
- CPU and memory usage
- Response times

### **Error Tracking**

- Server logs (Railway dashboard)
- Browser console errors
- API error rates
- Database transaction failures

### **User Analytics**

- Monthly active users
- Module usage breakdown
- Chat interaction frequency
- Feature adoption rates
- Churn metrics

---

## 🔐 Compliance & Privacy

### **Data Protection**

- GDPR compliant (EU hosting)
- Data encryption at rest and in transit
- Regular security audits
- Penetration testing quarterly
- Privacy policy in place

### **Compliance Certifications**

- SOC 2 (via Railway infrastructure)
- GDPR compliant

---

## ✨ Next Steps

1. **Deploy:** Push to GitHub → Railway auto-deploys
2. **Test:** Verify homepage and chat endpoints
3. **Monitor:** Watch Railway dashboard for logs
4. **Optimize:** Fine-tune performance as needed
5. **Scale:** Add more modules or features

---

**🎉 MaraAI is architected for scale, security, and AI-driven personalization!**
