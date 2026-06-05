import type { Metadata } from "next"
import "./globals.css"
import { Roboto } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

/*
 * Fonts (Step 5, GSL brand): Roboto is the brand primary - used for both
 * body and headings (weights below). Proxima Nova for headlines is a
 * follow-up pending the licence file; Roboto-only stands until then.
 *
 * next/font self-hosts + subsets Roboto and emits a size-adjusted fallback
 * automatically (adjustFontFallback default), so display:swap reflows
 * without layout shift (no CLS). The --font-roboto var feeds both the
 * heading + sans Tailwind families and the legacy --font-* aliases.
 *
 * lang="en-IN" per the British-English-on-Indian-context choice; en-IN
 * signals the Indian variant for screen readers and spelling-checkers.
 */

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
})

export const metadata: Metadata = {
  title: "GSL Ops Automation",
  description: "Post-MOU operations: actuals, PI generation, dispatch, training, feedback.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en-IN" className={cn(roboto.variable)}>
      <body className="antialiased font-sans bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <TooltipProvider>
          <main id="main-content">{children}</main>
        </TooltipProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
