# UMED Design System & Mobile UX Overhaul — 4-Theme Architecture, Unified Footers & BiDi Remediation

This plan details the overhaul of the UMED medical education platform to deliver a resilient 4-Theme System (`medical`, `gold`, `light`, `dark`), a compact single-button popover theme switcher in the top bar, unified single-footer modal workflows, and responsive RTL/LTR (BiDi) layout fixes across 360px–1440px viewports.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and UX decisions incorporate your confirmed preferences and the architectural requirements from your specification.

- **Confirmed Decision 1 — Default Theme (`medical`)**: First-time visitors with no stored preference in `localStorage` (`'umed-theme'`) will default to the **Medical (`طبي`)** theme (Clinical Cyan/Teal on crisp daylight medical surfaces with deep clinical navy typography `#082f49`).
- **Confirmed Decision 2 — Compact Single-Button Popover Theme Switcher**: The top header bar will display **only one compact button** showing the currently active theme's icon and Arabic label (`طبي`, `ذهبي`, `نهاري`, or `غامق`). Clicking this button opens a floating popover menu containing all 4 themes with live color swatches and checkmarks, keeping the mobile top bar clean and uncluttered.
- **Confirmed Decision 3 — Unified Sticky Modal Footer**: All duplicate inline step navigation buttons at the bottom of Step 1 and Step 2 inside the Bulk Question Import wizard will be removed so that only the single sticky bottom modal footer controls step progression, with a concise Step 3 primary label (`اعتماد وحفظ (${stats.selectedValid})`).

---

## 1. Overview & Core Concept

- **What It Does**: Establishes a token-driven 4-theme CSS architecture on `document.documentElement.setAttribute('data-theme', theme)` backed by automatic safeguard overrides for legacy Tailwind dark utility classes, while fixing mobile card squeezing, single-line question clipping, duplicate action footers, and RTL/LTR parenthesis reversals.
- **Target Audience / Persona**: Medical students, batch representatives, department heads, university admins, and the platform owner across Yemeni medical colleges using 360px–412px mobile phones and desktop workstations.
- **Key Value**: Guarantees 100% WCAG AA+ legibility and card border visibility across all four themes (`medical`, `gold`, `light`, `dark`), prevents vertical 1-word-per-line text crushing in question bank cards, and ensures English USMLE-style clinical stems and options render with natural multi-line LTR alignment alongside Arabic RTL UI controls.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Instant Theme Switching via Header Popover**:
   - The user sees a single active theme button in the top header (e.g., `طبي`).
   - Tapping the button opens an elevated popover menu listing all four themes (`طبي`, `ذهبي`, `نهاري`, `غامق`).
   - Selecting any theme immediately updates `document.documentElement.setAttribute('data-theme', theme)`, persists `'umed-theme'` in `localStorage`, and closes the popover.
2. **Question Bank Selection & Management on Mobile**:
   - The Question Bank management toolbar uses a responsive `grid-cols-2 sm:grid-cols-3 gap-2.5` layout where `"تبديل وإدارة البنوك"` spans full width on mobile (`col-span-2 sm:col-span-1`) so its label never wraps into vertical columns.
   - Inside the Bank Selector modal, each bank card stacks vertically (`flex flex-col gap-3 p-4`): Row 1 houses the `"البنك النشط"` status badge and action buttons (`واضع الاختبار الذكي`, Edit, Delete); Row 2 gives 100% width to the bank title and description; Row 3 displays language, question mode, and study level badges.
3. **3-Step Bulk Question Import & Review**:
   - The top stepper bar (`1. الإعداد والمصدر | 2. إدخال الأسئلة | 3. التدقيق`) and online status indicator fit cleanly on 360px screens without horizontal overflow.
   - Step 1 and Step 2 scroll smoothly into a single sticky bottom footer without duplicate inline buttons.
   - Step 3 renders multi-line `<textarea rows={2} dir="auto">` inputs for English stems and answer options, plus a `min-h-[5.5rem]` Arabic/primary stem `<textarea dir="auto">`, ensuring long clinical descriptions never clip.

### Visual Identity & Theme Tokens
Each theme is bound to `[data-theme="<name>"]` on `<html>` with strict surface, border, and contrast tokens:

- **`medical` (طبي — Clinical Cyan/Teal — Default)**:
  - `--bg-app: #eef6f9` | `--bg-card: #ffffff` | `--bg-elevated: #e0f2fe` | `--bg-input: #f0f9ff`
  - `--text-primary: #082f49` | `--text-secondary: #0369a1` | `--text-muted: #475569`
  - `--border-color: #7dd3fc` | `--accent-primary: #0284c7` | `--accent-text: #ffffff`
  - `--card-shadow: 0 4px 14px rgba(2, 132, 199, 0.08)`
- **`gold` (ذهبي — Royal Luxury Obsidian & Gold)**:
  - `--bg-app: #0c0a06` | `--bg-card: #16120a` | `--bg-elevated: #241d10` | `--bg-input: #1c160c`
  - `--text-primary: #fef3c7` | `--text-secondary: #fbbf24` | `--text-muted: #d6c39c`
  - `--border-color: #5c471c` | `--accent-primary: #eab308` | `--accent-text: #0c0a06`
  - `--card-shadow: 0 6px 20px rgba(234, 179, 8, 0.12)`
- **`light` (نهاري — High-Contrast Daylight)**:
  - `--bg-app: #f1f5f9` | `--bg-card: #ffffff` | `--bg-elevated: #e2e8f0` | `--bg-input: #f8fafc`
  - `--text-primary: #0f172a` | `--text-secondary: #334155` | `--text-muted: #64748b`
  - `--border-color: #cbd5e1` | `--accent-primary: #0d9488` | `--accent-text: #ffffff`
  - `--card-shadow: 0 4px 12px rgba(15, 23, 42, 0.06)`
- **`dark` (غامق — Deep Midnight Slate)**:
  - `--bg-app: #060b14` | `--bg-card: #0f172a` | `--bg-elevated: #1e293b` | `--bg-input: #090e1a`
  - `--text-primary: #f8fafc` | `--text-secondary: #38bdf8` | `--text-muted: #94a3b8`
  - `--border-color: #334155` | `--accent-primary: #10b981` | `--accent-text: #060b14`
  - `--card-shadow: 0 6px 20px rgba(0, 0, 0, 0.45)`

### Typography & BiDi Discipline
- Arabic UI and prose use `Cairo` and `IBM Plex Sans Arabic`; English medical terms, counters, and timers use `JetBrains Mono` with `tabular-nums`.
- All question stems, option fields, explanations, and AI output textareas apply `dir="auto"` so English sentences align LTR with trailing `?` on the right while Arabic sentences align RTL.
- Role badges with English parentheticals such as `(Platform Owner)` are isolated inside `<span dir="ltr" className="inline-block">(Platform Owner)</span>` to eliminate `((Platform Owner)` BiDi bracket reversal.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: CSS Custom Properties + Global Utility Overrides vs. Component-by-Component Class Rewrites**
  - *Chosen Approach*: Combine semantic CSS variables (`--bg-app`, `--bg-card`, `--text-primary`, `--border-color`, `--accent-primary`, `--accent-text`) with comprehensive `[data-theme="medical"]`, `[data-theme="light"]`, `[data-theme="gold"]`, and `[data-theme="dark"]` safeguard overrides targeting hardcoded Tailwind classes (`bg-slate-950`, `bg-slate-900`, `bg-slate-800`, `text-white`, `text-slate-200`, `border-slate-800`, etc.).
  - *Why*: Ensures every screen, modal, badge, and input across the entire application adapts immediately without any white-on-white text or invisible card borders.
  - *Alternatives Considered*: Only updating classes in a few components, which would leave child modals and secondary views broken when switching to `medical` or `light` themes.

- **Decision 2: Single-Button Popover Theme Selector in Header**
  - *Chosen Approach*: Render a single button in the top bar displaying the active theme icon and label; clicking toggles a compact dropdown menu with the 4 theme options (with outside-click dismissal).
  - *Why*: Directly fulfills your preference while reclaiming horizontal space in the mobile header so the page title and notification bell never crowd or overflow on 360px viewports.

- **Decision 3: Multi-Line Textareas with `dir="auto"` for Medical Options**
  - *Chosen Approach*: Convert single-line `<input type="text">` elements for English question stems and MCQ answer options in Step 3 into `<textarea rows={2} dir="auto">` with `min-h-[3.25rem] resize-y leading-relaxed`, and expand the primary stem `<textarea dir="auto">` to `min-h-[5.5rem]`.
  - *Why*: Clinical vignettes and anatomical option names frequently exceed 40 characters; multi-line textareas prevent horizontal clipping on mobile screens.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram
```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Document Root (<html data-theme="...">)              │
│   Theme Engine: localStorage('umed-theme') -> 'medical' (default)        │
│   Palettes: [medical] | [gold] | [light] | [dark] + Global CSS Overrides │
└───────────────────┬──────────────────────────────────┬───────────────────┘
                    │                                  │
                    ▼                                  ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│        Top Header & RTL Drawer        │  │   Assessment Manager Console  │
│  • Single Active Theme Button         │  │  • Responsive 2/3-Col Toolbar │
│    └─► Popover: طبي | ذهبي | نهاري | غامق │  │  • 3-Row Vertical Bank Cards  │
│  • Decluttered Mobile Actions         │  │  • BiDi-Safe Role Badges      │
│  • Vertical Stacked Drawer User Card  │  │  • Zero Empty Bottom Boxes    │
└───────────────────────────────────────┘  └───────────────┬───────────────┘
                                                           │
                                                           ▼
                                           ┌───────────────────────────────┐
                                           │  Bulk Question Import Wizard  │
                                           │  • Compact 360px Stepper Bar  │
                                           │  • Step 1 & 2: No Inline Nav  │
                                           │  • Step 3: Multi-line Options │
                                           │    with dir="auto" Textareas  │
                                           │  • Single Sticky Modal Footer │
                                           │    ("اعتماد وحفظ (N)")         │
                                           └───────────────────────────────┘
```

### Interactive Component & State Mapping
- **Theme State & Popover (`App`)**:
  - `theme` state initialized from `localStorage.getItem('umed-theme')` (validating `'medical' | 'gold' | 'light' | 'dark'`, defaulting to `'medical'`).
  - `themeMenuOpen` boolean state controls the header popover menu; selecting an option invokes `handleSelectTheme(newTheme)`, updates `data-theme` on `document.documentElement`, syncs `isDarkMode` (`theme === 'dark' || theme === 'gold'`), and closes the popover.
  - Navigation Drawer footer stacks user display name, LTR phone/email identifier, and `<span dir="ltr">(Platform Owner)</span>` role badge vertically (`flex-col items-start gap-1.5`).
- **Bank Management & Cards (`AssessmentManager`)**:
  - Toolbar buttons use `grid grid-cols-2 sm:grid-cols-3 gap-2.5` with `col-span-2 sm:col-span-1` on `"تبديل وإدارة البنوك"`.
  - Bank selector cards use a 3-row vertical stack (`flex flex-col gap-3 p-4`) with stop-propagation action handlers for `"واضع الاختبار الذكي"`, Edit, and Delete.
- **Wizard Stepper, Multi-Line Review & Sticky Footer (`BulkQuestionImportModal`)**:
  - Inline bottom navigation blocks in Step 1 and Step 2 are removed; the unified sticky bottom footer handles all step transitions (`setup` -> `content` -> `review` -> save).
  - Step 2 content container includes proper top padding so the AI prompt studio card and direct generation button are never obscured.
  - Step 3 stem and option inputs use `<textarea dir="auto">` with full bidirectional text support and concise footer action labels.
