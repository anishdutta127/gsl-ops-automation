'use client'

import { useEffect } from 'react'
import Link from 'next/link'

interface VexPiNewErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function VexPiNewError({ error, reset }: VexPiNewErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[vex-pi-new-error]', error)
  }, [error])

  return (
    <main id="main-content" className="mx-auto max-w-screen-sm px-4 py-24">
      <h1 className="font-heading text-2xl font-semibold text-brand-navy">
        Something went wrong loading the VEX PI form.
      </h1>
      <p className="mt-3 text-sm text-foreground">
        Refresh to try again. If the problem repeats, send the diagnostic id
        below to Anish.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Error id: <code>{error.digest}</code>
        </p>
      ) : null}
      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-brand-teal px-4 text-sm font-semibold text-brand-navy hover:bg-brand-teal/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy"
        >
          Refresh
        </button>
        <Link
          href="/operations/vex"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-brand-navy hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-navy"
        >
          Back to VEX
        </Link>
      </div>
    </main>
  )
}
