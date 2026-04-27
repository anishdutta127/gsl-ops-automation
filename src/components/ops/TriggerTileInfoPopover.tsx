'use client'

/*
 * TriggerTileInfoPopover (W4-B.2).
 *
 * Click-and-stay popover surfacing the 3-paragraph "What this means /
 * What it counts / What to do" text per trigger tile. Touch-friendly
 * (mobile + tablet operators cannot hover) and keyboard-accessible
 * (Tab to focus the Info icon; Enter / Space opens the popover; Escape
 * closes; Tab navigates inside).
 *
 * The trigger button is the only interactive element on the otherwise
 * server-rendered TriggerTile. Embedding it as a small Client
 * Component keeps the rest of the tile in the Server tree.
 */

import { Info } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { TriggerTileInfo } from '@/content/triggerTileInfo'

interface TriggerTileInfoPopoverProps {
  label: string
  info: TriggerTileInfo
}

export function TriggerTileInfoPopover({ label, info }: TriggerTileInfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        className="absolute right-1 top-1 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
        aria-label={`Information about ${label}`}
        data-testid={`trigger-info-${label}`}
      >
        <Info aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        className="space-y-2"
        data-testid={`trigger-info-content-${label}`}
      >
        <h4 className="font-heading text-sm font-semibold text-brand-navy">
          {label}
        </h4>
        <div className="space-y-2 text-xs text-foreground">
          <p>
            <span className="font-semibold text-brand-navy">What this means:</span>{' '}
            {info.meaning}
          </p>
          <p>
            <span className="font-semibold text-brand-navy">What it counts:</span>{' '}
            {info.counts}
          </p>
          <p>
            <span className="font-semibold text-brand-navy">What to do:</span>{' '}
            {info.action}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
