'use client'

import { useEffect } from 'react'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          backgroundColor: '#fafafa',
          color: '#1a1a1a',
          minHeight: '100vh',
        }}
      >
        <main
          style={{
            maxWidth: 480,
            margin: '0 auto',
            padding: '6rem 1.5rem 2rem',
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, color: '#0f3057' }}>
            Something went wrong loading this page.
          </h1>
          <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
            Refresh to try again. If the problem repeats, send the diagnostic
            id below to Anish.
          </p>
          {error.digest ? (
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
                color: '#444',
              }}
            >
              Error id: <code>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: '#3aafa9',
                color: '#0f3057',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <a
              href="/"
              style={{
                minHeight: 44,
                padding: '12px 18px',
                borderRadius: 6,
                border: '1px solid #d4d4d4',
                color: '#0f3057',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
