'use client'

/*
 * KitsDetailsForm (Gate 3 Step 1).
 *
 * Client wrapper around GradewiseSection for the MOU Pipeline detail
 * edit surface. POSTs to /api/mou/[mouId]/kits-details. Honest toast
 * on success: "Saved. Will reflect everywhere within ~5 minutes."
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle } from 'lucide-react'
import { GradewiseSection } from '@/components/mou-system/GradewiseSection'
import type {
  GradewiseDistributionRow,
  ProductSelection,
} from '@/lib/mouSystem/types'

interface Props {
  mouId: string
  initialProductSelection: ProductSelection | null
  initialGradewiseDistribution: GradewiseDistributionRow[] | null
}

export function KitsDetailsForm({
  mouId,
  initialProductSelection,
  initialGradewiseDistribution,
}: Props) {
  const router = useRouter()
  const [productSelection, setProductSelection] = useState<ProductSelection | null>(
    initialProductSelection,
  )
  const [gradewiseDistribution, setGradewiseDistribution] = useState<
    GradewiseDistributionRow[] | null
  >(initialGradewiseDistribution)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function save(): Promise<void> {
    setSaveState('saving')
    setErrorMessage(null)
    try {
      const res = await fetch(`/api/mou/${mouId}/kits-details`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productSelection,
          gradewiseDistribution,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setSaveState('error')
      setErrorMessage(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div className="space-y-4">
      <GradewiseSection
        productSelection={productSelection}
        gradewiseDistribution={gradewiseDistribution}
        onProductSelectionChange={setProductSelection}
        onGradewiseDistributionChange={setGradewiseDistribution}
        expanded={true}
        onToggle={() => undefined}
      />
      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saveState === 'saving'}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
        >
          <Save aria-hidden className="size-4" />
          {saveState === 'saving' ? 'Saving…' : 'Save kits details'}
        </button>
        {saveState === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
            <CheckCircle aria-hidden className="size-3" /> Saved. Will reflect everywhere within ~5 minutes.
          </span>
        )}
      </div>
    </div>
  )
}
