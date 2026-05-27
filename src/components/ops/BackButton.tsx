'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

export function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      data-testid="back-button"
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
    >
      <ChevronLeft aria-hidden className="size-3.5" />
      Back
    </button>
  )
}
