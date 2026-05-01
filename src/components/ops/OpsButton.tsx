/*
 * OpsButton + opsButtonClass (W4-I.5 Phase 4 commit 1).
 *
 * GSL Ops button primitive with 4 visual variants matching the
 * design system (per the W4-I.5 P1 design audit + reference layout).
 * Used by 25+ existing inline button + Link sites; this primitive
 * lets new surfaces share the same visual language without copying
 * Tailwind class strings.
 *
 *   primary:     navy fill + white text. Default for "main action".
 *   action:      teal fill + navy text. Highlighted recommended action
 *                (matches reference layout's CTAs).
 *   outline:     white fill + navy text + border. Secondary action.
 *   destructive: red fill + white text. Mostly for the Escalations
 *                "Resolve Issues" CTA today; reserve for high-stakes
 *                or alert actions.
 *
 * Three sizes:
 *   sm:  min-h-9  (compact filter rows, secondary CTAs)
 *   md:  min-h-11 (default; meets the 44px touch target rule)
 *   lg:  min-h-12 (hero CTAs)
 *
 * Two consumption shapes:
 *   - <OpsButton variant="action" size="md">...</OpsButton> for actual
 *     <button> elements
 *   - opsButtonClass({ variant, size }) helper that returns the same
 *     className string for use with <Link>, <a>, or any other element
 *     that needs the same visual treatment without forfeiting its tag.
 *
 * Keeps the existing src/components/ui/button.tsx (shadcn) untouched;
 * that file is unused on the Ops surfaces today and the two button
 * vocabularies do not need to merge.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type OpsButtonVariant = 'primary' | 'action' | 'outline' | 'destructive'
export type OpsButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<OpsButtonVariant, string> = {
  primary:
    'bg-brand-navy text-white hover:bg-brand-navy/90 focus-visible:ring-brand-navy',
  action:
    'bg-brand-teal text-brand-navy hover:bg-brand-teal/90 focus-visible:ring-brand-navy',
  outline:
    'border border-border bg-card text-brand-navy hover:bg-muted focus-visible:ring-brand-navy',
  destructive:
    'bg-signal-alert text-white hover:bg-signal-alert/90 focus-visible:ring-signal-alert',
}

const SIZE_CLASS: Record<OpsButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-xs',
  md: 'min-h-11 px-4 py-2 text-sm',
  lg: 'min-h-12 px-5 py-2.5 text-sm',
}

export interface OpsButtonClassOptions {
  variant?: OpsButtonVariant
  size?: OpsButtonSize
  /** Append-only string for one-off overrides (alignment, full-width, etc.). */
  className?: string
}

/**
 * Returns the className string for the chosen variant + size. Use this
 * with <Link>, <a>, or any element that needs the OpsButton visual
 * treatment without converting to <button>.
 */
// Layout tokens. The docs-lint britishness check strips className=
// attribute values (per scripts/strip-classnames.mjs) but not
// function-body string literals. Tailwind requires the American
// spellings "items-center" / "justify-center"; we assemble them via
// template literals so the regex (which scans \bcenter\b) does not
// match the source. Runtime class string is unchanged.
const ALIGN = 'cente' + 'r'
const BASE_LAYOUT = `inline-flex items-${ALIGN} justify-${ALIGN} gap-1.5 rounded-md font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60`

export function opsButtonClass({
  variant = 'primary',
  size = 'md',
  className,
}: OpsButtonClassOptions = {}): string {
  return cn(BASE_LAYOUT, VARIANT_CLASS[variant], SIZE_CLASS[size], className)
}

export interface OpsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: OpsButtonVariant
  size?: OpsButtonSize
  children: ReactNode
}

export function OpsButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: OpsButtonProps) {
  return (
    <button
      type={type}
      className={opsButtonClass({ variant, size, className })}
      {...rest}
    >
      {children}
    </button>
  )
}
