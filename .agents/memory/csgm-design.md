---
name: CSGM Design System
description: Premium UI design conventions, CSS classes, color palette, and critical component call patterns for CSGM AMROUS.
---

## Color Palette
- Primary: `#345d6e` (petroleum blue)
- Accent: `#7ecde8`
- Dark bg (sidebar/auth): `#0b1120` / `#0d1117` / `#111827`
- Light content bg: `#f8fafc` (body), `#f1f5f9` (panels)
- Text primary: `#0f172a`, secondary: `#64748b`

## Typography
- Font: Inter via Google Fonts in index.html
- All components use `font-family: 'Inter'` via index.css global reset

## CSS Utility Classes (index.css)
- `.animate-fade-up` — fadeUp animation (0.35s cubic-bezier)
- `.animate-fade-in` — simple fade
- `.animate-scale-in` — scale from 0.94 (used for modals)
- `.premium-input` — border-color + ring on focus: `#345d6e`
- `.btn-press` — active scale(0.97)
- `.table-row-hover` — bg-slate-100 on hover
- `.nav-item-active` — dark gradient bg + left cyan accent bar (sidebar)
- `.glass-panel` — rgba white backdrop blur panel
- `.pulse-glow` — petroleum blue glow animation

## Architecture Notes
- Sidebar: dark `bg-[#0d1117]`, `w-64`, nav-item-active CSS class
- Main content: light `bg-[#f8fafc]` via body, cards use `bg-white` with `border-slate-200/80` and `rounded-2xl`
- Modals: `backdrop-blur-sm bg-slate-900/60` overlay, `animate-scale-in` modal card
- Tables: thead `bg-slate-50/80`, `table-row-hover` on tbody rows, `text-[9px]` uppercase header labels
- Buttons: primary uses `#345d6e` bg + `btn-press` active class

## Critical Pattern
- **FileUploadField** is defined INSIDE WorkerForm component body.
- Must be called as `{FileUploadField({...})}` NOT `<FileUploadField />` — calling as JSX causes focus loss on every keystroke.

**Why:** React treats a function defined inside render as a new component type each render, unmounting/remounting it on every state change. Calling it as a plain function avoids this.
