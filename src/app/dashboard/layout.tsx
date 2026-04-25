/*
 * Dashboard chrome: header band with title + user menu (per DESIGN.md
 * "Surface 1 / Layout"). Phase 1 placeholder.
 */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <header className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">Ops at a glance</h2>
      </header>
      {children}
    </div>
  )
}
