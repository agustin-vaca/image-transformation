---
name: Luminous SaaS
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#464554'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#006591'
  on-secondary: '#ffffff'
  secondary-container: '#39b8fd'
  on-secondary-container: '#004666'
  tertiary: '#b90538'
  on-tertiary: '#ffffff'
  tertiary-container: '#dc2c4f'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  h1:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  h2:
    fontFamily: Manrope
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  h3:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 48px
  xl: 80px
  container-margin: 32px
  gutter: 20px
---

## Brand & Style

This design system is built on the principles of **Precision, Clarity, and Creative Flow**. It targets professional editors, developers, and creators who require a distraction-free environment that prioritizes content over interface. 

The aesthetic is **Corporate Modern** with a infusion of **Glassmorphism** for utility layers. It utilizes heavy whitespace to reduce cognitive load during complex image processing tasks. The emotional response is one of "Technical Reliability"—a system that feels as powerful as the algorithms driving it, yet as intuitive as a physical canvas.

## Colors

The palette is anchored by **Electric Indigo**, a high-energy primary accent that signals action and interactivity. This is supported by **Sky Blue** for secondary feedback and **Rose** for critical destructive actions. 

The neutral palette uses a sophisticated range of slates and navies. Pure black is avoided in favor of `#0F172A` to maintain a softer, premium professional look. Backgrounds utilize subtle off-white washes to define different functional zones without the need for heavy borders.

## Typography

**Manrope** is the sole typeface for this design system, chosen for its technical precision and geometric balance. It bridges the gap between a humanist sans-serif and a modern geometric font, making it ideal for both high-level marketing and dense data-heavy toolbars.

The hierarchy utilizes tight leading for headlines to create a compact, impactful look, while body text is given generous line height (1.6x) to ensure legibility during long configuration sessions. Monospaced metadata (using Inter) should be used for technical image specs like dimensions and file sizes.

## Layout & Spacing

This design system employs a **12-column fluid grid** with a fixed maximum width for content-heavy pages and a full-bleed "Workbench" layout for the image editor. The spacing rhythm is strictly based on an **8px linear scale**.

Toolbars and sidebars use `md` (24px) padding to create a sense of openness, while internal component spacing (like button icons or label pairs) uses `xs` (4px) or `base` (8px) to maintain visual grouping. Use `xl` (80px) vertical spacing between major landing page sections to reinforce the minimalist aesthetic.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Ambient Shadows**. 
1.  **Level 0 (Base):** The main canvas background.
2.  **Level 1 (Surfaces):** Cards and sidebars, defined by a 1px soft border (#E2E8F0) rather than a shadow.
3.  **Level 2 (Floating UI):** Dropdowns and Modals, using a high-diffusion ambient shadow (Blur: 20px, Y: 10, Opacity: 8% of Primary Color).
4.  **Glassmorphism Overlays:** Elements that sit directly on top of images (like "Process" buttons or tooltips) must use a 12px backdrop-blur with a 20% white tint to maintain legibility without obscuring the content underneath.

## Shapes

The shape language is consistently **Rounded**. 
- Standard components (Buttons, Inputs) use the base `0.5rem` radius.
- Large containers (Image Cards, Upload Zones) use the `1rem` (rounded-lg) radius to feel more approachable.
- Progress bars and small tags use full pill-shaping (rounded-full) to distinguish them as status indicators rather than interactive containers.

## Components

### Upload Zones
Upload zones must use a dashed 2px border using the primary color at 30% opacity. Upon drag-over, the background should transition to a 5% primary color tint with a subtle scale-up animation (1.02x).

### Progress Bars
Progress tracks are thin (4px height) using a neutral light gray. The active fill uses a linear gradient from `secondary_color_hex` to `primary_color_hex`. For active processing, apply a "shimmer" animation to the fill.

### Image Cards
Cards should feature a 1:1 or 4:3 aspect-ratio container for the image. Metadata (filename, size) is placed below the image using `body-sm`. Action icons (Edit, Delete, Download) should appear only on hover, utilizing a glassmorphism overlay in the top-right corner.

### Buttons
- **Primary:** Solid `primary_color_hex` with white text. Subtle 4px bottom shadow of the same color.
- **Ghost:** No background, 1px border. Used for secondary actions in toolbars to prevent visual clutter.
- **Icon Buttons:** Circular background, `base` spacing, used exclusively for tool-switching.

### Input Fields
Inputs use a white background with a 1px slate border. On focus, the border transitions to the primary color with a 3px soft outer glow (ring) of the same color at 20% opacity.