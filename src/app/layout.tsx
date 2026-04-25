import type { Metadata } from "next"
import "./globals.css"
import { Montserrat, Open_Sans } from "next/font/google"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/*
 * Fonts (DESIGN.md "Typography"):
 * - Montserrat: headings, numeric displays, button labels.
 * - Open Sans: body, table cells, form labels.
 *
 * lang="en-IN" per the British-English-on-Indian-context choice; en-IN
 * signals the Indian variant for screen readers and spelling-checkers.
 */

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
})

const openSans = Open_Sans({
  subsets: ["latin"],
  variable: "--font-open-sans",
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
    <html lang="en-IN" className={cn(montserrat.variable, openSans.variable)}>
      <body className="antialiased font-sans bg-background text-foreground">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <TooltipProvider>
          <main id="main-content">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  )
}
