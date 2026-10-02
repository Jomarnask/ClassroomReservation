# PUP Canlalay Campus CRS Design System & Branding Guidelines

This document serves as the official design specification and brand guideline for the **Polytechnic University of the Philippines – Canlalay Campus** Classroom & Facility Reservation System (CRS).

---

## 1. Brand Identity & Personality

| Attribute | Specification | Notes |
| :--- | :--- | :--- |
| **Institution** | Polytechnic University of the Philippines (PUP) | State University Institutional Identity |
| **Campus** | PUP Canlalay Campus | Academic & Instructional Facility Management |
| **System** | Classroom & Facility Reservation System (CRS) | Student, Faculty & Administrative Operations |
| **Brand Tone** | **Professional** | Trustworthy, authoritative, clear, and disciplined |
| **Energy Level** | **Medium** | Balanced, efficient, accessible without distracting animations |
| **Target Audience** | **Students, Faculty, and Researchers** | Fast room discovery, slot booking, approval workflows, schedule inspection |

---

## 2. Color Palette

The color system reflects PUP’s institutional heritage, combining deep academic maroon with warm secondary accents and high-contrast typography.

```
+---------------------------------------------------------------------------------------+
|  Primary: #880000     |  Secondary: #FFD658   |  Link: #337AB7     |  Text: #111111   |
|  (PUP Maroon)         |  (PUP Gold/Amber)     |  (Institutional)   |  (Deep Charcoal) |
+---------------------------------------------------------------------------------------+
```

### 2.1 Core Brand Colors

| Token Name | Hex Code | RGB | HSL | Usage / Application |
| :--- | :--- | :--- | :--- | :--- |
| `--color-primary` | `#880000` | `rgb(136, 0, 0)` | `hsl(0, 100%, 27%)` | Primary CTAs, active tab/role states, brand header bar, focus rings |
| `--color-primary-dark` | `#5C0000` | `rgb(92, 0, 0)` | `hsl(0, 100%, 18%)` | Hover/active states for primary buttons, header shadows |
| `--color-primary-light` | `#A30000` | `rgb(163, 0, 0)` | `hsl(0, 100%, 32%)` | Subtle borders, light accent highlights, focus outlines |
| `--color-secondary` | `#FFD658` | `rgb(255, 214, 88)` | `hsl(45, 100%, 67%)` | Secondary highlights, badges, attention markers, notification accents |
| `--color-accent` | `#880000` | `rgb(136, 0, 0)` | `hsl(0, 100%, 27%)` | Key UI anchors, interactive radio/checkbox accents, active indicator lines |
| `--color-link` | `#337AB7` | `rgb(51, 122, 183)` | `hsl(208, 56%, 46%)` | Text links, navigation anchors, institutional info tags, helper links |
| `--color-link-hover` | `#23527C` | `rgb(35, 82, 124)` | `hsl(208, 56%, 31%)` | Link hover and underline interactions |

### 2.2 Neutral & Surface Colors

| Token Name | Hex Code | Usage |
| :--- | :--- | :--- |
| `--color-text-primary` | `#111111` | Primary headings, labels, core readability content |
| `--color-text-secondary`| `#4B5563` | Subtitles, supporting copy, helper text, form hints |
| `--color-text-muted` | `#9CA3AF` | Placeholder text, disabled inputs, timestamp captions |
| `--color-bg-dark` | `#111111` | Dark theme backdrop token, high-contrast dark accents |
| `--color-bg-base` | `#F8FAFC` / `#F3F4F6` | Default page background, subtle neutral contrast |
| `--color-surface` | `#FFFFFF` | Card containers, modal backgrounds, input surface fills |
| `--color-border` | `#D1D5DB` | Standard input borders, card outlines, table dividers |
| `--color-border-subtle` | `#E5E7EB` | Subtle dividers, card header separators |

### 2.3 Status & Operational Feedback

| State | Background | Border | Text | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Available / Approved** | `#ECFDF5` | `#A7F3D0` | `#065F46` | Available classroom slots, verified credentials, online status |
| **Pending / Limited** | `#FEF3C7` | `#FDE68A` | `#92400E` | Reservations awaiting faculty/admin approval, partial occupancy |
| **Occupied / Rejected** | `#FEF2F2` | `#FECACA` | `#991B1B` | Occupied rooms, conflict alerts, validation error messages |
| **Informational** | `#EFF6FF` | `#DBEAFE` | `#1E40AF` | System announcements, directory validation guides |

---

## 3. Typography & Hierarchy

### 3.1 Font Family
- **Primary Typeface**: `Noto Sans`, sans-serif
- **Fallback / UI Font**: `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, sans-serif
- **Monospace (Code / IDs)**: `ui-monospace`, `SFMono-Regular`, `Consolas`, monospace

```css
font-family: 'Noto Sans', 'Inter', ui-sans-serif, system-ui, sans-serif;
```

### 3.2 Type Scale

| Role | Font Size | Line Height | Weight | Tracking / Letter Spacing | Example Use |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `28px` (`1.75rem`) | `34px` | Bold (`700`) | `-0.02em` | Portal welcome headings |
| **Heading 2 (H2)** | `22px` (`1.375rem`)| `28px` | Bold (`700`) | `-0.01em` | Section headers, card titles |
| **Heading 1 / Subhead (H1)** | `16px` (`1.0rem`)| `24px` | SemiBold (`600`) | `0` | Sub-section headers, modal titles |
| **Body (Default)** | `16px` (`1.0rem`) | `24px` | Regular (`400`) | `0` | Paragraph copy, instructional text |
| **Body (Compact / UI)** | `14px` (`0.875rem`)| `20px` | Regular / Medium | `0` | Table data, card descriptions |
| **Label / Button** | `13px` – `14px` | `18px` | Medium / SemiBold | `0.01em` | Form labels, button copy, role pills |
| **Micro / Caption** | `11px` – `12px` | `16px` | Regular / Medium | `0.02em` | Timestamps, system badges, ISO tags |

---

## 4. Spacing System & Grid

All dimensions, margins, and padding are multiples of the **4px base unit**.

| Unit | Size | Tailwind Token | Applied To |
| :--- | :--- | :--- | :--- |
| **1x** | `4px` | `0.5` / `p-1` | Micro-gaps between badges and dots, icon margins |
| **2x** | `8px` | `2` / `p-2` | Button horizontal padding, card internal row gaps |
| **3x** | `12px` | `3` / `p-3` | Input field vertical padding, small card padding |
| **4x** | `16px` | `4` / `p-4` | Standard component padding, list item gutters |
| **6x** | `24px` | `6` / `p-6` | Card padding, section spacing, grid gutters |
| **8x** | `32px` | `8` / `p-8` | Modal padding, auth card padding |
| **12x** | `48px` | `12` / `py-12` | Major section blocks, page container vertical padding |

---

## 5. Shape & Border Radius

The branding specifies a crisp, disciplined border radius of **`3px`** for form elements and standard components.

| Component Type | Radius Value | CSS Equivalent |
| :--- | :--- | :--- |
| **Buttons (Primary, Secondary, Role)** | `3px` | `border-radius: 3px;` |
| **Form Inputs & Selects** | `3px` | `border-radius: 3px;` |
| **Badges & Tags** | `3px` | `border-radius: 3px;` |
| **Content Cards & Panels** | `6px` – `8px` | Softened for large layout surfaces |
| **Auth Container (Hero Card)** | `12px` – `16px` | Floating centered surface container |

---

## 6. Component Specifications

### 6.1 Buttons

#### Primary Button
- **Background**: `#880000`
- **Text Color**: `#FFFFFF`
- **Font**: `Noto Sans`, `14px`, SemiBold (`600`)
- **Padding**: `10px 18px` (Base unit aligned)
- **Border Radius**: `3px`
- **Border**: None or `1px solid #880000`
- **Hover State**: Background `#5C0000`, smooth `0.2s ease` transition
- **Focus State**: `box-shadow: 0 0 0 3px rgba(136, 0, 0, 0.2); outline: none;`

```html
<button class="bg-[#880000] hover:bg-[#5c0000] text-white font-semibold text-sm px-4 py-2.5 rounded-[3px] transition">
  Primary Action
</button>
```

#### Secondary / Role Selector Button (`.role-btn`)
- **Default State**:
  - Background: `#FFFFFF`
  - Border: `1px solid #D1D5DB`
  - Text Color: `#374151`
  - Border Radius: `3px`
- **Hover State**:
  - Border Color: `#880000`
  - Text Color: `#880000`
- **Active State (`.active`)**:
  - Background: `#880000`
  - Border Color: `#880000`
  - Text Color: `#FFFFFF`
- **Active Hover State**:
  - Background: `#5C0000`
  - Border Color: `#5C0000`

```html
<button type="button" class="role-btn active flex items-center justify-center gap-2 py-2 px-3 rounded-[3px] border text-sm font-medium transition">
  Student
</button>
```

### 6.2 Form Inputs

- **Background**: `#FFFFFF` (or `#F8FAFC` for secondary state)
- **Border**: `1px solid #D1D5DB`
- **Border Radius**: `3px`
- **Text Color**: `#111111`
- **Placeholder Color**: `#9CA3AF`
- **Padding**: `8px 12px` (`14px` font size)
- **Focus State**:
  - Border Color: `#880000`
  - Box Shadow: `0 0 0 3px rgba(136, 0, 0, 0.12)`
  - Background: `#FFFFFF`

```html
<input
  type="text"
  placeholder="Sample input"
  class="w-full px-3 py-2 border border-gray-300 rounded-[3px] text-sm text-[#111111] placeholder-gray-400 focus:border-[#880000] focus:ring-2 focus:ring-[#880000]/15 focus:outline-none transition"
/>
```

### 6.3 Links & Navigation
- **Link Color**: `#337AB7`
- **Hover**: `#23527C`, underline
- **Active Tab**: Background `#880000`, white text, border radius `3px`

---

## 7. Responsive Breakpoints

| Breakpoint | Minimum Width | Typical Target |
| :--- | :--- | :--- |
| `sm` | `640px` | Mobile landscape, small tablets |
| `md` | `768px` | Tablets, dual-pane layouts |
| `lg` | `1024px` | Standard desktops, student dashboard views |
| `xl` | `1280px` | Admin consoles, high-density lab schedules |

---

## 8. Implementation Quick Reference

```css
:root {
  /* Brand Colors */
  --pup-maroon: #880000;
  --pup-darkmaroon: #5c0000;
  --pup-lightmaroon: #a30000;
  --pup-gold: #ffd658;
  --pup-blue: #337ab7;
  --pup-blue-hover: #23527c;

  /* Neutrals */
  --text-primary: #111111;
  --text-secondary: #4b5563;
  --border-default: #d1d5db;
  --bg-page: #f8fafc;

  /* Metrics */
  --base-unit: 4px;
  --radius-component: 3px;
  --font-family-sans: 'Noto Sans', 'Inter', system-ui, sans-serif;
}
```
