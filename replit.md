# Mara AI Platform

## Overview

Full-featured AI companion platform with TikTok-style video feed (grid + reels), real-time AI chat (powered by OpenAI gpt-4o-mini via Replit AI Integrations), Replit Auth, creator profiles, voice AI (STT/TTS), like/follow system, theme customization (4 themes + chameleon mood-based), multilingual (EN/RO/DE/RU), emotional analysis, 24h memory reset, and admin panel.

## Architecture

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Replit Auth (OIDC) via `server/replit_integrations/auth/`
- **AI**: OpenAI (gpt-4o-mini) via Replit AI Integrations (`AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL`)

## Key Files

- `shared/schema.ts` - All DB table definitions (videos, chatMessages, likes, followers, userPreferences) + types
- `shared/models/auth.ts` - Users & sessions tables (Replit Auth)
- `shared/models/chat.ts` - Conversations & messages tables (AI Integrations)
- `server/ai.ts` - Mara AI personality engine with mood detection, MOOD_TO_THEME mapping, language support
- `server/routes.ts` - Express API routes (videos, chat, profile, admin, TTS/STT, language, preferences)
- `server/storage.ts` - Database storage interface (clearOldMessages for 24h reset, updateUserLanguage)
- `server/replit_integrations/auth/` - Replit Auth OIDC setup
- `client/src/App.tsx` - Router with auth gate (landing vs home), profile, admin routes
- `client/src/pages/landing.tsx` - Pre-auth landing page with language selector
- `client/src/pages/home.tsx` - Hub-style home with card grid (Trading, Reels, Creator, Fun Zone, Premium, Video Grid) + inline Mara chat. Can switch to full reels/chat views.
- `client/src/pages/profile.tsx` - Creator profile page with follow/stats
- `client/src/pages/premium.tsx` - Premium subscription page (bank transfer payment)
- `client/src/pages/admin.tsx` - Admin panel (stats, user/video management, order approval)
- `client/src/pages/writers.tsx` - Mara AI Writers Hub (create/edit/publish stories, AI tips, browse published)
- `client/src/pages/trading.tsx` - Mara AI Trading Academy with interactive charts, tutorials, indicator explainers
- `client/src/components/ChatInterface.tsx` - AI chat with Mara, voice (mic/TTS), chameleon theme
- `client/src/components/MediaEditor.tsx` - Photo editor (filters, adjustments, text, rotate/flip, export) + music library
- `client/src/components/VideoFeed.tsx` - Video grid/reels toggle with filters
- `client/src/components/VideoCard.tsx` - Individual video card with like/view
- `client/src/components/ReelsFeed.tsx` - TikTok-style vertical reels with snap-scroll
- `client/src/components/UserHeader.tsx` - Authenticated user header with language selector
- `client/src/components/ThemeCustomizer.tsx` - 4-theme color switcher
- `client/src/components/LanguageSelector.tsx` - Language dropdown (EN/RO/DE/RU)
- `client/src/lib/i18n.ts` - Translation dictionaries for all 4 languages
- `client/src/hooks/use-auth.ts` - Auth hook (fetch user, logout)
- `client/src/hooks/use-theme.ts` - Theme state (midnight, emerald, crimson, amethyst)
- `client/src/hooks/use-chat.ts` - Chat messages query/mutation hooks (returns mood/suggestedTheme)
- `client/src/hooks/use-videos.ts` - Videos query/mutation hooks
- `client/src/hooks/use-language.ts` - Language context/provider, syncs with backend
- `client/src/index.css` - Dark theme CSS variables + glass utilities

## Database Tables

- `users` - Replit Auth users (varchar PK)
- `sessions` - Express sessions for auth
- `videos` - Video content (url, type, title, likes, views)
- `chat_messages` - Chat history (user + AI messages)
- `likes` - User-video like relationships
- `followers` - User-user follow relationships
- `user_preferences` - AI learning preferences per user (language, mood, topics)
- `premium_orders` - Bank transfer premium subscription orders (status: pending/confirmed/rejected)
- `creator_posts` - Monthly post tracking per creator (userId, videoId, createdAt)
- `saved_videos` - Video bookmarks (userId, videoId, note)
- `writer_pages` - Writer hub pages (penName, title, content, category, published, likes, views)

## Features

- **Hub Home Page**: Card-based dashboard with animated pulsing ✨MaraAI✨ logo, hub cards for Trading Academy, Reels Feed, Creator Dashboard, Fun Zone, Premium Features, and Video Grid. Inline Mara chat at bottom. Cards link to respective pages or switch to full-screen reels/chat views.
- **Reels Feed**: YouTube Shorts-style vertical feed with: autoplay on scroll (IntersectionObserver at 75%), click-to-fullscreen with sound, scroll-snap behavior, save/bookmark videos (saved_videos table), interest-based filtering (All/Trading/Education/Creative/Tech/Nature/Trending), Mara AI context panel in fullscreen (explains video + Q&A), like/save/share on every reel + fullscreen, infinite scroll via `/api/mara-feed`, 8 categories, YouTube embed + MP4 support, mute/unmute toggle in fullscreen
- **Multilingual**: EN, RO, DE, RU with full UI translation + AI responds in selected language
- **Creator Profiles**: User pages with videos, follower/following counts, follow button
- **Voice AI**: Mic button for STT, 12-voice TTS system (classic/friendly/professor/energetic/calm/storyteller/deep/bright/warm/serious/playful/confident). Voice selector + "Speak" button in chat input bar (yellow accent). Per-message speaker icons on Mara responses. Shared voice list in `client/src/lib/mara-voices.ts`. Backend maps to OpenAI voices (nova/shimmer/onyx/alloy) via `/api/mara-speak`.
- **Emotional Analysis**: Mood detection from chat messages via `[MOOD:word]` tags
- **24h Memory**: Chat messages cleared after 24 hours via `clearOldMessages(24)`
- **Security**: Auth guards on all chat endpoints (401 for unauthenticated), rate limiting on chat send (10 msgs/min per user, 429 with retryAfterMs)
- **Chameleon Theme**: Auto-applies theme based on detected mood (calm→midnight, happy→emerald, frustrated→crimson, creative→amethyst)
- **Creator Studio**: Dashboard at `/creator` with tabs: Dashboard (post reels, analytics) + Media Editor (photo editor with filters, adjustments, text overlay, music library). Everyone can post & use basic editing. Premium creators get 100% access (advanced filters, HD export, premium music)
- **Writers Hub**: Page at `/writers` — create, edit, publish stories/poems/books/articles/journals with Mara AI writing tips. Features: pen name, category selector, rich text editor, cover image upload (base64, max 2MB), AI tip generation, premium-gated publishing (non-premium see lock icon linking to /premium), browse published pages, like/view counts, full reader view with cover image hero
- **Trading Academy**: Paywalled page at `/trading` with monthly (€10/mo) and yearly (€100/yr, save €20) subscription plans. Monthly/yearly toggle on paywall. Shows subscription status bar with expiry date and "Renew Now" button when expiring within 7 days. Both PayPal and bank transfer supported. After payment: Mara as trading mentor (30yr experience), Canvas-drawn price chart, 8 concept explainers, tutorial flow, Q&A chat, 50 trading strategies with Spot & Futures explanations (paginated, expandable cards with chart images). Paywall shows locked strategy title preview list.
- **Admin Panel**: Stats dashboard, user management, video moderation, premium order approval with subscription period badges (protected by ADMIN_USER_IDS env var)
- **Premium Subscription**: Dual subscription system:
  - Creator Pro (€9, once): PayPal + bank transfer, unlocks advanced filters, HD export, premium sounds
  - Trading Academy Monthly (€10/mo): PayPal + bank transfer, 1 month access
  - Trading Academy Yearly (€100/yr): PayPal + bank transfer, 1 year access (save €20)
  - PayPal auto-confirms instantly, bank transfer requires admin approval
  - `orderType` field: "creator" or "trading"; `subscriptionPeriod`: "once", "monthly", "yearly"
  - `expiresAt` tracks subscription expiry; `getUserTradingAccess()` checks against current time

## Themes

4 color themes + chameleon mood-based auto-switching:

- Midnight (default): Electric purple-blue (calm/neutral/sad moods)
- Emerald: Vibrant green (happy/excited/playful moods)
- Crimson: Tech red (frustrated moods)
- Amethyst: Deep purple (creative/curious moods)

## Important Notes

- zod pinned at 3.23.8 (do NOT upgrade to 3.25+ — breaks Vite dep optimization)
- AI model: gpt-4o-mini (no custom temperature param)
- Admin access: ADMIN_USER_IDS env var (comma-separated), defaults to allowing all authenticated users if empty
- Video sources: YouTube embeds (stored as `youtube:VIDEO_ID`), Google CDN samples, test-videos.co.uk clips
- Videos seeded in DB with `youtube:` prefix are rendered as YouTube iframe embeds in ReelsFeed
- `/api/mara-feed` returns paginated, shuffled, categorized feed (max 50 pages × 20 items = 1000 reels)

## Running

- `npm run dev` starts Express + Vite on port 5000
- `npm run db:push` syncs Drizzle schema to PostgreSQL
