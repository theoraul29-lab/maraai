# 🏗️ MaraAI Platform Architecture

## System Overview

MaraAI is a modern AI platform with 6 specialized modules deployed on Firebase Hosting with Cloud Functions backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                     maraai.net (Firebase Hosting)               │
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
│  Gemini API  │ │  Firestore   │ │   Storage    │ │  Firebase    │
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
├── functions/                         # Firebase Cloud Functions
│   ├── src/
│   │   └── index.ts                  # Express API Handler
│   │       ├── Chat Endpoints
│   │       ├── Module Endpoints
│   │       ├── User Management
│   │       └── Admin Routes
│   ├── package.json                  # Functions Dependencies
│   ├── tsconfig.json                 # TypeScript Config
│   └── dist/                         # [AUTO] Compiled Code
│
├── server/                           # Node.js Express (Alternative)
│   ├── index.ts                      # Main Server
│   ├── routes.ts                     # Route Registration
│   ├── ai.ts                         # Gemini API Client
│   ├── mara-brain.ts                 # Memory + Learning System
│   ├── firebase.ts                   # Firebase Config
│   ├── storage.ts                    # Persistence Layer
│   ├── middleware/
│   │   ├── auth.ts                   # Authentication
│   │   ├── rate-limit.ts             # Rate Limiting
│   │   └── error-handler.ts          # Error Handling
│   └── modules/                      # Business Logic
│       ├── chat.ts
│       ├── trading.ts
│       ├── reels.ts
│       ├── creator.ts
│       ├── writers.ts
│       └── payments.ts
│
├── dataconnect/                      # Google Data Connect (Optional)
│   └── schema.fwice
│
├── k8s/                              # Kubernetes Deployment (Optional)
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
│
├── FIREBASE_DEPLOY.md                # Comprehensive Deploy Guide
├── QUICK_DEPLOY.md                   # 5-10 Min Quick Start
├── DEPLOYMENT_CHECKLIST.md          # Verification Checklist
├── DEPLOYMENT_READY.md              # Setup Overview
├── firebase.json                     # Firebase Configuration
├── .firebaserc                       # Firebase Project Config
├── .env.example                      # Environment Template
├── deploy-firebase.ps1               # Windows Deploy Script
├── deploy-firebase.sh                # Linux/Mac Deploy Script
│
└── [Other Config Files]
    ├── package.json                  # Root Dependencies
    ├── tsconfig.json                 # TypeScript Config
    ├── vite.config.js                # Vite Config
    ├── railway.json                  # Railway Config
    ├── docker                        # Container
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
- Gemini API for intelligent responses
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

1. **Firebase Auth**
   - Email/password login
   - Google OAuth
   - Phone authentication

2. **Middleware Authentication**
   - JWT token validation
   - User context injection
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
   - Firestore rules (users read/write own data only)
   - Storage rules (only owners can upload)
   - Encryption at rest
   - Encryption in transit (HTTPS/TLS)

3. **Environment Security**
   - API keys in .env (not in repo)
   - Secrets managed by Firebase
   - No hardcoded credentials
   - Audit trails for admin actions

---

## 🗄️ Database Schema

### **Firestore Collections**

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

### **Firebase Components**

```
Firebase Project (maraai-488fb)
├── Hosting
│   ├── Public: frontend/dist/
│   ├── Rewrites: /api/** → Cloud Functions
│   ├── Cache Rules: Static assets cached forever
│   └── Custom Domain: maraai.net
│
├── Cloud Functions
│   ├── Region: europe-west1
│   ├── Runtime: Node.js 22
│   ├── Memory: 1GB per instance
│   └── Timeout: 60 seconds
│
├── Firestore
│   ├── Location: europe-west1
│   ├── Collections: users, chats, posts, videos
│   ├── Indexes: Auto-created on first query
│   └── Backup: Daily automatic backup
│
├── Storage
│   ├── Buckets: User uploads, media cache
│   ├── Rules: Users upload to /uploads/{userId}/*
│   └── CDN: Global distribution
│
└── Authentication
    ├── Methods: Email/password, Google, Phone
    ├── Session Management: Long-lived tokens
    └── MFA: Optional for premium users
```

### **Alternative Deployment Options**

```
Option 1: Cloud Run (Currently Used)
├── Container: Dockerized Express app
├── Region: europe-west1
├── Scaling: Auto-scale 0-100 instances
└── Cost: Per request

Option 2: App Engine Flexible
├── Runtime: Node.js
├── Health Checks: Auto-restart on failure
├── Scaling: Min/max instances
└── Cost: Per instance-hour

Option 3: Kubernetes (GKE)
├── Orchestration: Managed Kubernetes
├── Replicas: Auto-scale based on traffic
├── Rolling Updates: Zero-downtime deploys
└── Cost: Per node/hour
```

---

## 🔄 Development Workflow

### **Local Development**

```bash
# Start frontend dev server
cd frontend && npm run dev

# Start backend server
npm run dev

# Start Firebase emulator
firebase emulators:start
```

### **Testing**

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### **Build & Deploy**

```bash
# Build for production
npm run build:frontend
cd functions && npm run build

# Deploy to Firebase
firebase deploy

# Deploy to specific region
firebase deploy --project maraai-488fb
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
- Bandwidth: Unlimited (Firebase CDN)

---

## 📈 Monitoring & Analytics

### **Firebase Console Metrics**

- Hosting traffic and errors
- Function execution time and memory
- Database read/write operations
- Storage bandwidth and requests
- Authentication conversion rates

### **Error Tracking**

- Cloud Functions logs
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

- SOC 2 Type II (via Google Cloud)
- ISO 27001 (Google Cloud Security)
- GDPR compliant
- HIPAA eligible (not enabled)

---

## ✨ Next Steps

1. **Deploy:** Follow [QUICK_DEPLOY.md](QUICK_DEPLOY.md)
2. **Test:** Verify homepage and chat endpoints
3. **Monitor:** Watch Firebase Console for logs
4. **Optimize:** Fine-tune performance as needed
5. **Scale:** Add more modules or features

---

**🎉 MaraAI is architected for scale, security, and AI-driven personalization!**
