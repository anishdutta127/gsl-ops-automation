"use client"

/*
 * Popover primitive (W4-B.2).
 *
 * Thin shadcn-style wrapper around @radix-ui/react-popover (re-exported
 * via the `radix-ui` meta package, already in dependencies). Used for
 * the trigger-tile info icons; touch-friendly click-and-stay behaviour
 * (tooltip dismiss-on-mouseout would be unusable on mobile / tablet).
 *
 * Pattern mirrors src/components/ui/dialog.tsx so the codebase has a
 * single primitive shape.
 */

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>,
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverAnchor(
  props: React.ComponentProps<typeof PopoverPrimitive.Anchor>,
) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-md border border-border bg-card p-3 text-sm text-foreground shadow-md outline-hidden focus-visible:ring-2 focus-visible:ring-brand-navy",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger }
