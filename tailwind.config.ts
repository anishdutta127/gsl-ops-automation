/*
 * Tailwind v3 config wired to the CSS-variable token layer in
 * src/app/globals.css. Every Tailwind utility class that maps to a
 * colour resolves through a CSS var, never a raw hex code (per
 * DESIGN.md "Design tokens / Colour rules"). This keeps brand
 * swaps + per-tenant theming a single :root edit.
 *
 * Extension covers:
 *   - shadcn theme tokens: background / foreground / card /
 *     popover / primary / secondary / muted / accent / destructive
 *     / border / input / ring (each with -foreground where
 *     applicable). These are referenced by the shadcn primitives
 *     in src/components/ui/.
 *   - GSL brand tokens: brand.teal, brand.navy as direct named
 *     classes.
 *   - Signal palette: signal.ok, signal.attention, signal.alert,
 *     signal.neutral. Used by Ops-specific components in
 *     src/components/ops/ for status colour signalling.
 *
 * Font extension exposes Montserrat (heading) + Open Sans (body)
 * loaded via next/font in src/app/layout.tsx.
 */

import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ['var(--font-montserrat)', 'sans-serif'],
        sans: ['var(--font-open-sans)', 'sans-serif'],
      },
      colors: {
        // shadcn theme tokens
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--card)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        // GSL brand tokens (DESIGN.md Brand palette)
        brand: {
          teal: 'var(--brand-teal)',
          navy: 'var(--brand-navy)',
        },

        // Semantic signal palette (DESIGN.md Semantic signal palette)
        signal: {
          ok: 'var(--signal-ok)',
          attention: 'var(--signal-attention)',
          alert: 'var(--signal-alert)',
          neutral: 'var(--signal-neutral)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

export default config
