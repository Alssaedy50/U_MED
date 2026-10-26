# Implementation Plan — Multi-Theme Engine & Spacious UI Layout

This plan outlines the architectural additions and refinements to introduce multiple medical and youth-inspired visual themes, expand card and table padding with comfortable touch targets ($\ge 44\text{px}$), and implement smooth, expansive mobile bottom sheets and modal popups.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Multi-Theme Engine**: We will add a Theme Switcher in the top header and settings, supporting 4 distinctive visual themes:
>   1. **طبي كلاسيكي (Clinical Teal & Slate)**: Professional dark medical mode with deep slate and teal accents.
>   2. **طبي إشراقي (Light Clinical Clean)**: Crisp, high-contrast light medical theme with airy surfaces and azure accents.
>   3. **طابع شبابي حيوي (Youth Vibrant Medical)**: Energetic emerald, amber, and indigo gradients with playful modern medical badges.
>   4. **نمط المستشفيات المظلم (Midnight Neon / Dark Vault)**: Deep cyber-medical neon highlights for late-night studying.
> - **Spacious Cards & Layout**: All cards, grids, and tables will be upgraded with generous padding (`p-5` to `p-6`), large touch targets (`min-h-[44px]`), and responsive flex-wrap grids to prevent crowding and overlaps.
> - **Bottom Sheets & Modals**: Popups will feature smooth bottom-sheet sliding animations on mobile devices with expansive scrollable areas, and centered rounded modals on desktop.

## 1. Overview & Core Concept
- **What It Changes**: Upgrades the entire UMED platform with a robust theme context provider (`ThemeContext`), expands all cards and interactive controls for touch-friendly spacing, and transforms popups into smooth responsive bottom sheets.
- **Key Value**: Delivers a fully customizable visual experience with zero layout crowding on mobile and tablet screens.

## 2. User Experience & Visual Design
- **Theme Switcher**: Located in the top header and settings, allowing instant 1-click switching between 4 curated medical-youth themes.
- **Card & Table Padding**: Minimum card padding of 20px–24px, comfortable row heights (`py-3.5`), and large button targets (`min-h-[44px]`).
- **Bottom Sheet Modals**: Mobile modals slide up smoothly from the bottom with a backdrop blur and drag handle, while desktop modals render as centered dialogs.

## 3. Key Technical Architecture
- **Theme State**: Stored in React state and `localStorage` (`umed_active_theme`), applying root CSS classes (`theme-teal`, `theme-light`, `theme-vibrant`, `theme-midnight`).
- **Modals & Popups**: Upgraded `AcademicContextModal`, `BulkQuestionImportModal`, `ExamTakingModal`, and other dialogs with bottom-sheet CSS on mobile (`fixed bottom-0 left-0 right-0 max-h-[90dvh] rounded-t-3xl animate-in slide-in-from-bottom`).

## 4. Execution Steps
1. Create `src/context/ThemeContext.tsx` or add theme classes in `App.tsx` and `index.css`.
2. Update global theme variables and CSS styles in `src/index.css`.
3. Upgrade major card containers in `AcademicStructureManager.tsx`, `AssessmentManager.tsx`, `StudentDashboard.tsx`, and `StudentAssessmentList.tsx` with spacious padding and touch targets.
4. Convert mobile popups into smooth bottom sheets across modals.
5. Verify build (`compile_applet`) and type safety (`lint_applet`).
