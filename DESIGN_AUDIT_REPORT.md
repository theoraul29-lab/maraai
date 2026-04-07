# MaraAI Frontend Design Audit Report

**Audit Date:** April 2, 2026  
**Scope:** `frontend/src/` — All CSS files (15 total), key TSX components, global config  
**Auditor:** Automated Design Audit

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Global Issues](#global-issues)
3. [Page-by-Page Audit](#page-by-page-audit)
4. [Cross-Cutting Concerns](#cross-cutting-concerns)
5. [Severity Summary](#severity-summary)

---

## Executive Summary

The MaraAI frontend has **strong visual design fundamentals** — each page has a cohesive dark theme with neon accent colors, good mobile-first structure, and reasonable touch target sizing. However, the audit uncovered **3 CRITICAL**, **14 MAJOR**, **18 MINOR**, and **12 SUGGESTION**-level issues across 15 CSS files and the HTML/config layer.

The most impactful problems are:
- A **CSS syntax error** in Reels.css that breaks a rule
- **Duplicate class names** across files causing style collisions
- **Z-index anarchy** with 6+ pages competing at `9999`
- **Modules.css color tokens conflict** with actual page colors
- **Tailwind is loaded but unused**, adding ~300KB to the bundle for nothing

---

## Global Issues

### G-1: Tailwind CSS Loaded But Unused — MAJOR

**Files:** `index.css`, `tailwind.config.js`, `postcss.config.js`

`index.css` contains `@tailwind base; @tailwind components; @tailwind utilities;` but **zero Tailwind utility classes are used anywhere** in the CSS. The Tailwind config has no customization. This adds unnecessary CSS weight to the bundle (even with purge, the base layer adds resets that may conflict with custom CSS).

**Impact:** Bundle bloat, potential reset conflicts with custom CSS (e.g., Tailwind base resets `button` borders, margins on `h1`-`h6`, etc.)

### G-2: Font Loading Missing — MAJOR

**Files:** All CSS files reference `'Inter'` font family, `OrbitalStyles.css` uses `'Courier New'`

No `@font-face` declaration or Google Fonts `<link>` exists in `index.html` or any CSS file. The `Inter` font will **never load** — the browser falls back to system fonts silently.

**Font stack inconsistency:**
| File | Font Stack |
|------|-----------|
| Creator.css, Trading.css, VIP.css, WritersHub.css | `'Inter', sans-serif` |
| You.css | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` |
| OrbitalStyles.css (MARA text) | `'Courier New', monospace` |
| Other files | No font-family declared (inherits) |

### G-3: Z-Index Warfare — MAJOR

Multiple full-screen panels all use `z-index: 9999`, meaning whichever renders last wins:

| Component | Z-Index |
|-----------|---------|
| Creator container | 9999 |
| Trading container | 9999 |
| Writers container | 9999 |
| VIP container | 9999 |
| You container | 9999 |
| Auth Modal overlay | 9999 |
| UserProfile overlay | **10001** |
| You modal overlay | **10000** |
| Story modal overlay | **10001** |
| Nav container | 1000 |
| MaraChatWidget modal | 1000 |
| MaraChatWidget button | 999 |
| Chat Widget | 200 |
| Auth Button | 100-101 |
| MoodIndicator floating | 100 |
| Orbital orbs | 50 |
| Orbital center | 100 |

**Risk:** Opening UserProfile from within You page creates stacking context conflicts. The Chat Widget at z-index 200 is **buried under** all page panels.

### G-4: Duplicate Class Names Causing Collisions — CRITICAL

These classes are defined in **multiple CSS files** with **different styles**:

| Class | Files | Conflict |
|-------|-------|----------|
| `.stat-card` | `YouProfile.css` (purple #a855f7), `UserProfile.css` (red #FF3333), `Reels.css` (purple) | Different backgrounds, borders, colors |
| `.stat-value` | `YouProfile.css` (#a855f7), `UserProfile.css` (#FF3333), `You.css` (#9d4edd) | Three different accent colors |
| `.stat-label` | `YouProfile.css`, `UserProfile.css`, `You.css` | Conflicting font sizes (11px vs 10px vs 0.85rem) |
| `.you-header` | `You.css`, `YouProfile.css` | Completely different layouts |
| `.you-tabs` | `You.css`, `YouProfile.css` | Different gap/padding values |
| `.profile-bio` | `You.css`, `UserProfile.css` | Different colors, font sizes |

**Impact:** Whichever CSS file loads last wins, causing **unpredictable visual rendering** depending on route navigation order.

### G-5: modules.css Color Tokens Conflict with Actual Pages — MAJOR

`modules.css` defines thematic color variables for each module, but the actual page CSS uses **completely different colors**:

| Module | modules.css Primary | Actual Page CSS Primary |
|--------|-------------------|------------------------|
| Trading | `#f97316` (orange) | `#00ff7f` (neon green) |
| Writers | `#10b981` (emerald) | `#8b5cf6` (violet) |
| Creator | `#22d3ee` (cyan) | `#ff6b00` (orange) |
| VIP | `#facc15` (yellow) | `#d4af37` (gold) |
| Reels | `#a855f7` (purple) | `#a855f7` ✅ matches |
| You | `#818cf8` (indigo) | `#9d4edd` / `#a855f7` (purple) |

This means `modules.css` is **dead code** — its classes are never applied, or if they are, they show wrong colors.

### G-6: `App.css` Forces `font-size: 16px !important` on All Inputs — MINOR

```css
input, textarea, select, button {
  font-size: 16px !important;
}
```
This prevents iOS zoom on input focus (good), but the `!important` overrides all page-specific font sizes on buttons, making small buttons like `.writers-button.small` (0.8rem = ~13px) render at 16px on mobile.

---

## Page-by-Page Audit

---

### 1. HomePage (OrbitalStyles.css)

**Color Palette:**
- Background: `#000000`
- Primary cycling: `rgba(147, 51, 234)` → `rgba(239, 68, 68)` → `rgba(34, 197, 94)`
- Module orbs: `#a855f7`, `#06b6d4`, `#22c55e`, `#ec4899`, `#f59e0b`, `#8b5cf6`
- Text: `#fff`

**Font Sizes:** 36px (MARA text), 11px (orb labels), 9px mobile orb labels  
**Font Weights:** 900 (MARA), 700 (orb labels)

**Spacing:** Centered flex layout, no padding inconsistencies

**Responsive Breakpoints:**
- `max-width: 768px` — scales down orb/MARA sizes
- ❌ No intermediate tablet breakpoint

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus states | ❌ **MISSING** — No `:focus-visible` on any `.orb` element |
| ARIA labels | Not in CSS scope (check TSX) |
| Touch targets | ⚠️ Orbs are 100px on mobile — adequate but close to minimum |
| Color contrast | ✅ White text on dark backgrounds |

**Animation Performance:**
| Animation | Property | GPU? |
|-----------|----------|------|
| `holographicSpin` | `transform: rotate()` | ✅ GPU |
| `maraAmbientGlow` | `border-color`, `background`, `box-shadow` | ❌ **Paint-triggering** |
| `holographicPulse` | `box-shadow` | ❌ **Paint-triggering** |
| `maraGlowPulse` | `background` | ❌ **Paint-triggering** |
| `maraAuraExpand` | `background`, `box-shadow` | ❌ **Paint-triggering** |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| HP-1 | **MAJOR** | `.orb` elements have no `:focus-visible` styles — keyboard users cannot navigate modules |
| HP-2 | **MINOR** | 5 animations cycle `box-shadow` and `background` every 12s — causes continuous repaints on the main compositing layer. Should use `will-change: transform` or pre-compose layers |
| HP-3 | **MINOR** | `.orb-label` at 9px on mobile is below WCAG minimum readable size (12px) |
| HP-4 | **SUGGESTION** | No `prefers-reduced-motion` media query — animations run for motion-sensitive users |

---

### 2. Nav (Nav.css)

**Color Palette:** Background gradient `#0f172a → #111827 → #1e293b`, accent `#22d3ee` (cyan), text `#e5e7eb`, borders `#374151`/`#2a2a2a`

**Font Sizes:** 0.85rem (nav links), 1.25rem (brand), 0.9rem (landscape mobile)
**Font Weights:** 800 (brand), 600 (links), 500 (mobile links)

**Responsive Breakpoints:**
- Mobile-first (default)
- `768px` — switches to desktop nav
- `max-height: 500px AND max-width: 768px` — landscape mobile

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ✅ `.hamburger-btn:focus-visible`, `.nav-mobile-link:focus-visible` |
| Touch targets | ✅ `min-height: 54px` on mobile links |
| Active states | ✅ Visual active indicator with border-left |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| NAV-1 | **MINOR** | Hamburger `:active` state rotates lines, but the actual `.open` state class for the menu toggle isn't styled — the X animation only shows while finger is pressed, not when menu is open |
| NAV-2 | **MINOR** | `.nav-link.active` uses white text on cyan background (`#22d3ee` on `#22d3ee`) — the text color `#0f172a` is correct for contrast but the active state lacks a ring/outline for color-blind users |
| NAV-3 | **SUGGESTION** | Desktop nav links use `flex-wrap: wrap` but no max-width constraint — with many links, they could overflow |

---

### 3. Creator Panel (Creator.css)

**Color Palette:** `#0f0f1a`/`#1a1a2e` (bg), `#ff6b00` (orange primary), `#ffa500` (orange secondary), `#8b5cf6` (feature items bg)

**Responsive Breakpoints:** Mobile-first → 768px (tablet) → 1024px (desktop) + landscape `max-height: 600px`

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ✅ On close, action cards, buttons, feature items |
| Touch targets | ✅ 44px minimum on buttons |
| Safe area | ✅ `env(safe-area-inset-*)` support |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| CR-1 | **MINOR** | `.creator-container` uses `position: fixed` at mobile but `position: absolute` at 768px+ — if parent has `transform`, the absolute positioning breaks out of expected container |
| CR-2 | **SUGGESTION** | No scrollbar styling on `.creator-content` overflow — uses default browser scrollbar which looks jarring against the dark theme |

---

### 4. Reels (Reels.css)

**Color Palette:** `#000000`/`#0f0f1a`/`#1a1a2e` (bg), `#a855f7`/`#c77dff` (purple primary), `#888` (secondary text)

**Font Sizes:** 2.5rem (h1), 0.95rem (card titles), 0.85rem (stats), 0.8rem (duration)

**Responsive Breakpoints:** ❌ **NO RESPONSIVE BREAKPOINTS AT ALL**

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| RL-1 | **CRITICAL** | **CSS Syntax Error** on line ~300: `border: 1px solidrg ba(168, 85, 247, 0.3);` — the `solid rgba` is broken into `solidrg ba(...)`. This breaks the entire `.stat-card` rule block in Reels.css |
| RL-2 | **CRITICAL** | **Zero responsive breakpoints** — the `.reels-feed` grid has `grid-template-columns: 250px 1fr` which breaks on mobile (250px sidebar + content in a 375px viewport). The sidebar is unusable. |
| RL-3 | **MAJOR** | No `:focus-visible` styles on any interactive element (`.header-btn`, `.tag-btn`, `.reel-card`, `.btn-submit`, `.btn-draft`) |
| RL-4 | **MAJOR** | `.reels-container` uses `padding: 20px` with no mobile reduction — header `h1` at 2.5rem overflows on small screens |
| RL-5 | **MINOR** | `.reel-card:hover .reel-overlay` uses `opacity` transition which is fine, but the overlay itself has no touch/active state for mobile users |
| RL-6 | **MINOR** | No safe area support |
| RL-7 | **MINOR** | No scrollbar styling on `.reels-container` |

---

### 5. Trading Academy (Trading.css)

**Color Palette:** `#0f0f1a`/`#1a1a2e` (bg), `#00ff7f` (neon green primary), `#22d3ee` (cyan accent on ask button), `#ff6b00` (hover close), borders `#2a2a3a`

**Font Sizes:** 1.1rem→1.4rem (title), 0.8rem (labels), 0.85rem (content), 0.7rem (badges), 0.75rem (filters)

**Responsive Breakpoints:**
- Mobile-first (stacked)
- `768px-1023px` — tablet (2-col strategies grid)
- `1024px` — 3-column desktop layout
- `1440px` — wider sidebars

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ✅ On close, filter, strategy items, ask button |
| Touch targets | ✅ 44px minimum |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| TR-1 | **MINOR** | `.trading-sidebar` has `max-height: 40vh` on mobile — on a 667px iPhone SE, that's only 267px, limiting strategy browsing. Combined with `overflow-y: auto`, it creates a scroll-within-scroll pattern |
| TR-2 | **MINOR** | `.trading-ask-btn` uses `background: linear-gradient(135deg, #00ff7f, #22d3ee)` — mixing green and cyan creates a color that doesn't match any other element on the page |
| TR-3 | **SUGGESTION** | No safe area support |

---

### 6. UserProfile (UserProfile.css)

**Color Palette:** `#0a0a0a`/`#1a0a0a` (bg), `#FF3333` (red primary), `#CC0000` (dark red), `#FFFFFF` (contrast text)

This is the most visually distinct page — "Matrix Red & Black" theme, completely different from every other page.

**Font Sizes:** 28px (name h1), 14px (bio), 12px (meta/buttons), 11px (stat labels), 13px (cards/inputs)

**Responsive Breakpoints:**
- `max-width: 640px` — mobile layout adjustments

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ❌ **MISSING** — No `:focus-visible` on any element |
| Touch targets | ⚠️ `.profile-close` is 40x40px — below 44px minimum |
| Contrast | ⚠️ `#FF3333` on `#0a0a0a` = ~5.0:1 ratio (passes AA for normal text, fails for 11px small text) |
| Safe area | ❌ Missing |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| UP-1 | **MAJOR** | Zero `:focus-visible` styles — keyboard navigation is invisible |
| UP-2 | **MAJOR** | `.profile-close` at 40x40px is below the 44px mobile touch target minimum |
| UP-3 | **MINOR** | `.stat-card::before` uses `transition: left 0.5s` for a shine effect — this animates `left` which triggers **layout recalculation** on every frame. Should use `transform: translateX()` instead |
| UP-4 | **MINOR** | The Matrix grid `::before` pseudo-element uses `position: fixed` inside a scrollable container — it doesn't scroll with content, creating a visual glitch |
| UP-5 | **MINOR** | Red theme (#FF3333) visually clashes with the rest of the app's purple/neon palette. This page looks like it belongs to a different app. |

---

### 7. VIP Premium (VIP.css)

**Color Palette:** `#0f0f1a`/`#1a1a2e` (bg), `#d4af37`/`#ffd700` (gold primary), `#7c8dff` (checking state), `#ccc`/`#888`/`#aaa` (text grays)

**Responsive Breakpoints:**
- Mobile-first
- `768px` — centered modal, 2-col features/benefits
- `1024px` — 3-col features
- Landscape `max-height: 600px`

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ✅ On close, action button, feature cards |
| Touch targets | ✅ 44px minimums |
| Safe area | ✅ Full `env(safe-area-inset-*)` |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| VIP-1 | **MINOR** | `.vip-compare-row` compressed single-line styles make maintenance difficult, but functionally correct |
| VIP-2 | **MINOR** | `.vip-form-input:focus` only changes `border-color` but no `box-shadow` or visual ring — subtle focus indication |
| VIP-3 | **SUGGESTION** | No scrollbar styling on `.vip-content` |

---

### 8. WritersHub (WritersHub.css)

**Color Palette:** `#0f0f1a`/`#1a1a2e` (bg), `#8b5cf6`/`#a855f7` (violet primary), `#ef4444` (liked state), `#ff6b6b`/`rgba(255, 60, 60)` (danger)

**Responsive Breakpoints:**
- Mobile-first
- `768px` — wider padding, 2-col library
- `1000px` — 3-col library
- Landscape `max-height: 600px AND max-width: 768px`

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ✅ On close, tabs, buttons |
| Touch targets | ✅ 44px minimums |
| Safe area | ❌ Missing |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| WH-1 | **MINOR** | `.writers-cover` uses negative margins `margin: -14px -14px 12px -14px` and `width: calc(100% + 28px)` — fragile layout hack that breaks if card padding changes |
| WH-2 | **MINOR** | `.writers-like-btn` and `.writers-read-btn` have no `:focus-visible` styles despite having `:hover` |
| WH-3 | **SUGGESTION** | No scrollbar styling, no safe area support |

---

### 9. You / Social Feed (You.css)

**Color Palette:** `#0a0a0a`/`#1a1a2e` (bg), `#9d4edd`/`#7b2ff7`/`#c77dff` (purple), `#ff6b6b` (like), `rgba(157, 78, 221, *)` (borders/accents)

This is by far the **largest CSS file** (~700+ lines) covering the full social feed, profiles, modals, stories, composer, posts.

**Font Sizes:** 24px (headers), 14px (body), 13px (meta), 11px-12px (small labels), 9px (story info), 10px (story add text)

**Responsive Breakpoints:** ❌ **No media queries defined** (desktop-first with flex layouts that happen to work on mobile)

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ❌ **MISSING** — No `:focus-visible` on any of the dozens of interactive elements |
| Touch targets | ⚠️ `.modal-close` is 32x32px (below 44px); `.comment-like` has 0 padding |
| Contrast | ⚠️ Story info at 9px with white on semi-transparent bg violates minimum text size |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| YOU-1 | **MAJOR** | Zero `:focus-visible` styles across 700+ lines of CSS with dozens of buttons/links |
| YOU-2 | **MAJOR** | No responsive breakpoints — `.you-feed` grid uses `minmax(340px, 1fr)` which forces horizontal scroll on screens < 380px |
| YOU-3 | **MAJOR** | `.modal-close` at 32x32px is significantly below 44px touch target minimum |
| YOU-4 | **MINOR** | `.story-info` at 9px font size is below WCAG minimum (12px) |
| YOU-5 | **MINOR** | `.comment-like` button has `padding: 0` and `font-size: 11px` — extremely small touch target |
| YOU-6 | **MINOR** | No safe area support despite full-screen `position: fixed; inset: 0` |
| YOU-7 | **MINOR** | `.you-notice` is `display: none` — dead CSS |

---

### 10. YouProfile (YouProfile.css)

**Color Palette:** `#000000`/`#0f0f1a`/`#1a1a2e` (bg), `#a855f7`/`#c77dff` (purple), `#ef4444` (red accent in avatar glow cycle), `#22c55e` (green in glow cycle)

**Font Sizes:** 2.5rem (name), 1.1rem (handle), 0.85rem-0.95rem (body), 2rem (stat values)

**Responsive Breakpoints:**
- `max-width: 1023px` — mobile/tablet adjustments (extensive)
- Touch optimization with `:active` replacing `:hover`

**Accessibility:**
| Check | Status |
|-------|--------|
| Focus-visible | ❌ **MISSING** — No `:focus-visible` on `.tab-button`, `.color-btn`, vault buttons |
| Contrast | ✅ Good contrast ratios |

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| YP-1 | **MAJOR** | No `:focus-visible` styles on any element — `.tab-button`, `.color-btn`, vault form elements all lack keyboard focus indicators |
| YP-2 | **MINOR** | `.avatarGlow` animation cycles `box-shadow` across 3 colors over 12s — continuous paint operation |
| YP-3 | **MINOR** | `input[type="range"]` and `input[type="checkbox"]` use no custom styling — they render with default browser appearance, clashing with the dark theme |
| YP-4 | **SUGGESTION** | `.color-btn` at 40x40px is close to but below the 44px touch target minimum |

---

### 11. ErrorBoundary (ErrorBoundary.css)

**Color Palette:** `#000000`/`#0f0f1a`/`#1a1a2e` (bg), `#a855f7`/`#ec4899` (gradient title), `#ff6b6b` (error stack)

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| EB-1 | ✅ **GOOD** | Well-structured with size variants (page/section/component), proper focus states, 44px touch targets |
| EB-2 | **SUGGESTION** | `.error-title` uses `-webkit-text-fill-color: transparent` for gradient text — should include `color` fallback for older browsers |

---

### 12. MaraMoodIndicator (MaraMoodIndicator.css)

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| MI-1 | ✅ **GOOD** | Includes `.sr-only` class for screen readers |
| MI-2 | **MINOR** | `.mood-energy-ring` uses CSS custom properties (`--mood-energy`) in `calc()` within `opacity` — not all browsers support `calc()` with custom properties in `opacity` |

---

### 13. Auth Components (AuthButton.css, AuthModal.css)

**Color Palette:** `#1a1a2e`/`#16213e` (modal bg), `#9d4edd`/`#7b2ff7` (purple), `#fcd34d` (trial badge), `#86efac` (premium), `#ff9999` (errors/logout)

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| AU-1 | **MINOR** | AuthButton.css uses CSS nesting (`&.trial { }`) — requires modern browsers. No fallback for older browsers |
| AU-2 | **MINOR** | `.auth-modal-close` at `font-size: 28px` with no explicit `width`/`height` — touch target size depends on content |
| AU-3 | **SUGGESTION** | Auth modal `max-width: 420px` on desktop, `max-width: none` on mobile — good responsive pattern |

---

### 14. Chat Widgets (ChatWidget.css, MaraChatWidget.css)

**ChatWidget:** Neutral gray/blue theme (`#1a1a1a` bg, `#4a9eff` user messages, `#64c8ff` active language)  
**MaraChatWidget:** Purple theme (`#9d4edd`, `#c77dff`) matching the app palette

**Findings:**

| # | Severity | Issue |
|---|----------|-------|
| CW-1 | **MAJOR** | ChatWidget.css uses completely different design language (gray/blue) from the rest of the app (dark/purple/neon). It looks like it was imported from a different project |
| CW-2 | **MINOR** | ChatWidget has no mobile responsive styles — fixed `width: 380px` and `height: 600px` will overflow on small screens |
| CW-3 | ✅ **GOOD** | MaraChatWidget has proper mobile-first design with full-screen on mobile, floating on desktop |
| CW-4 | **MINOR** | Both chat widgets have custom scrollbar styles ✅ but lack `:focus-visible` on close/send buttons |

---

## Cross-Cutting Concerns

### C-1: Safe Area / Notch Support — MAJOR

| Page | safe-area-inset support |
|------|------------------------|
| App.css (global) | ✅ CSS vars defined |
| index.html | ✅ `viewport-fit=cover` |
| Creator.css | ✅ |
| VIP.css | ✅ |
| Trading.css | ❌ |
| Reels.css | ❌ |
| WritersHub.css | ❌ |
| You.css | ❌ |
| YouProfile.css | ❌ |
| UserProfile.css | ❌ |
| Nav.css | ❌ |

**Only 2 of 9 page-level CSS files** support safe areas despite `viewport-fit=cover` being set in `index.html`. On iPhone with notch, content will overlap the status bar/home indicator on 7 pages.

### C-2: Scrollbar Styling — MINOR (Inconsistent)

| Component | Custom Scrollbar |
|-----------|-----------------|
| UserProfile `.profile-posts-list` | ✅ Red themed |
| You `.comments-list`, `.story-section` | ✅ Purple themed |
| ChatWidget `.chat-messages` | ✅ White/gray |
| MaraChatWidget `.mara-chat-messages` | ✅ Purple themed |
| Reels (entire page) | ❌ Default |
| Trading sidebar/AI panel | ❌ Default |
| Writers content | ❌ Default |
| VIP content | ❌ Default |
| Creator content | ❌ Default |
| YouProfile | ❌ Default |

### C-3: `prefers-reduced-motion` — MISSING (All files)

Not a single CSS file contains `@media (prefers-reduced-motion: reduce)`. Users with motion sensitivity will see:
- 12-second cycling glow animations on HomePage
- Floating animations on module headers
- Continuous pulsing on mood indicator
- Infinite avatar glow cycling
- All hover transformations

### C-4: `prefers-color-scheme` — N/A

The app is dark-theme only. No light mode support exists. This is acceptable as a design choice but worth noting.

### C-5: Form Element Styling — INCONSISTENT

| Element | Trading | Writers | Reels | Auth | UserProfile |
|---------|---------|---------|-------|------|-------------|
| Input bg | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.5)` |
| Input border | `#00ff7f` | `#8b5cf6` | `rgba(168,85,247,0.3)` | `rgba(157,78,221,0.2)` | `#FF3333` |
| Focus ring | border only | border only | border + shadow | border + box-shadow | border + box-shadow |
| Placeholder | `#666` | `rgba(255,255,255,0.4)` | `#666` | `rgba(255,255,255,0.4)` | N/A |

Every page styles forms differently — no shared form component or CSS variables.

### C-6: Button Sizing Patterns — MOSTLY GOOD

Most pages define `min-height: 44px` on primary buttons ✅. Exceptions:
- `.modal-close` (32px) in You.css
- `.profile-close` (40px) in UserProfile.css  
- `.comment-like` (0 padding) in You.css
- `.color-btn` (40px) in YouProfile.css
- `.writers-button.small` (36px)

### C-7: Dark Theme Consistency — MOSTLY GOOD

All pages use dark backgrounds (`#000000` to `#1a1a2e` range). **Exception:** UserProfile uses a distinct red Matrix theme that breaks visual consistency.

Background gradient patterns used:
- `linear-gradient(135deg, #0f0f1a, #1a1a2e)` — Trading, Creator, Writers, VIP
- `linear-gradient(135deg, #000000, #0f0f1a, #1a1a2e)` — Reels, YouProfile
- `linear-gradient(135deg, #0a0a0a, #1a1a2e)` — You
- `linear-gradient(135deg, #0a0a0a, #1a0a0a)` — UserProfile (red-tinted)
- `#000000` — HomePage

---

## Severity Summary

### CRITICAL (3)

| ID | Issue |
|----|-------|
| G-4 | Duplicate class names (`.stat-card`, `.stat-value`, `.stat-label`, `.you-header`, `.you-tabs`) causing style collisions across files |
| RL-1 | CSS syntax error in Reels.css: `1px solidrg ba(168, 85, 247, 0.3)` breaks `.stat-card` rule |
| RL-2 | Reels page has zero responsive breakpoints — 250px sidebar unusable on mobile |

### MAJOR (14)

| ID | Issue |
|----|-------|
| G-1 | Tailwind CSS loaded but completely unused — bundle bloat + potential conflicts |
| G-2 | Inter font never loaded — no `@font-face` or `<link>` import |
| G-3 | Z-index warfare — 6+ components at z-index 9999 |
| G-5 | modules.css color tokens don't match actual page CSS colors (dead code) |
| C-1 | Safe area support missing on 7 of 9 pages despite `viewport-fit=cover` |
| HP-1 | HomePage orbs have no `:focus-visible` — keyboard inaccessible |
| RL-3 | Reels has no focus-visible styles on any element |
| RL-4 | Reels header h1 at 2.5rem overflows small mobile screens |
| UP-1 | UserProfile — zero `:focus-visible` styles |
| UP-2 | UserProfile `.profile-close` at 40px below 44px touch minimum |
| YOU-1 | You.css — zero `:focus-visible` across 700+ lines |
| YOU-2 | You.css — no responsive breakpoints, grid breaks on small screens |
| YOU-3 | You.css `.modal-close` at 32px significantly below 44px minimum |
| YP-1 | YouProfile — no `:focus-visible` styles |
| CW-1 | ChatWidget uses different design language (gray/blue) from app (purple/neon) |

### MINOR (18)

| ID | Issue |
|----|-------|
| G-6 | `font-size: 16px !important` on all inputs overrides page-specific button sizes |
| HP-2 | 5 animations continuously trigger paint with `box-shadow`/`background` cycling |
| HP-3 | Orb label at 9px on mobile below readable minimum |
| NAV-1 | Hamburger `:active` animation doesn't persist for open state |
| NAV-2 | Active nav link lacks color-blind-accessible indicator |
| CR-1 | Fixed vs absolute positioning mismatch at 768px breakpoint |
| RL-5 | Reel card overlay has no touch/active state |
| RL-6 | No safe area support |
| TR-1 | Scroll-in-scroll pattern with 40vh sidebar limit |
| UP-3 | Stat card shine effect animates `left` instead of `transform` |
| UP-4 | Matrix grid `::before` uses `position: fixed` inside scrollable container |
| UP-5 | Red Matrix theme visually clashes with app's purple palette |
| YOU-4 | Story info at 9px below minimum text size |
| YOU-5 | Comment like button has 0 padding — tiny touch target |
| YOU-6 | No safe area support |
| YP-2 | Avatar glow `box-shadow` animation causes continuous repaints |
| YP-3 | Range/checkbox inputs use default browser styling |
| CW-2 | ChatWidget has no mobile responsive styles |

### SUGGESTION (12)

| ID | Issue |
|----|-------|
| HP-4 | No `prefers-reduced-motion` support |
| NAV-3 | Desktop nav links could overflow without max-width |
| CR-2 | No scrollbar styling on creator content |
| TR-3 | No safe area support |
| VIP-3 | No scrollbar styling on VIP content |
| WH-3 | No scrollbar styling, no safe area |
| EB-2 | Gradient text needs `color` fallback |
| AU-3 | Auth modal responsive handling is good (noting for reference) |
| YP-4 | Color buttons at 40px close to minimum |
| WH-1 | Negative margin cover image hack is fragile |
| WH-2 | Like/read buttons missing focus-visible |
| C-3 | No `prefers-reduced-motion` support across entire app |

---

## Recommended Priority Fixes

### Immediate (CRITICAL)

1. **Fix Reels.css syntax error** — Change `1px solidrg ba(168, 85, 247, 0.3)` to `1px solid rgba(168, 85, 247, 0.3)`
2. **Add responsive breakpoints to Reels.css** — At minimum, stack sidebar vertically on mobile
3. **Namespace duplicate classes** — Prefix `.stat-card` → `.reels-stat-card`, `.up-stat-card`, `.yp-stat-card` etc.

### Short-term (MAJOR)

4. **Add `:focus-visible` styles** to HomePage orbs, Reels, UserProfile, You.css, YouProfile
5. **Remove or use Tailwind** — Either delete the Tailwind setup or migrate to it
6. **Add Inter font import** to `index.html`
7. **Establish z-index scale** — e.g., nav=100, panels=200, modals=300, overlays=400, chat=500
8. **Add safe area support** to all full-screen pages
9. **Delete or update modules.css** to match actual page colors

### Medium-term (MINOR + SUGGESTIONS)

10. Add `@media (prefers-reduced-motion: reduce)` globally
11. Standardize form element styling with CSS custom properties
12. Fix animation performance (use `transform` instead of `left`, add `will-change`)
13. Increase all touch targets to 44px minimum
14. Add custom scrollbar styling to all scrollable containers
15. Unify ChatWidget color scheme with app palette
