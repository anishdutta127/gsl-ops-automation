'use client'

/*
 * ShipmentTrackingForm (Gate 3 Step 8).
 *
 * Courier metadata + POD upload. POD upload flips dispatchStatus to
 * 'Delivered' per joint spec section 11 updated logic.
 */

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Save, CheckCircle, Upload, Download } from 'lucide-react'
import type { KitDispatchStatus, PODRecord, ShipmentTracking } from '@/lib/types'

interface Props {
  mouId: string
  tracking: ShipmentTracking | null
  pod: PODRecord | null
  dispatchStatus: KitDispatchStatus
  editable: boolean
}

export function ShipmentTrackingForm({
  mouId,
  tracking,
  pod,
  dispatchStatus,
  editable,
}: Props) {
  const router = useRouter()
  const [courierName, setCourierName] = useState(tracking?.courierName ?? '')
  const [trackingId, setTrackingId] = useState(tracking?.trackingId ?? '')
  const [dispatchDate, setDispatchDate] = useState(
    tracking?.dispatchDate ?? new Date().toISOString().slice(0, 10),
  )
  const [expectedDelivery, setExpectedDelivery] = useState(tracking?.expectedDelivery ?? '')
  const [deliveryStatus, setDeliveryStatus] = useState<'In Transit' | 'Delivered'>(
    tracking?.deliveryStatus ?? (dispatchStatus === 'Delivered' ? 'Delivered' : 'In Transit'),
  )
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const podInputRef = useRef<HTMLInputElement>(null)

  const hasPod = pod !== null

  async function saveTracking(): Promise<void> {
    setSaveState('saving')
    setErrorMessage(null)
    try {
      if (deliveryStatus === 'Delivered' && !hasPod) {
        throw new Error('POD upload is required before marking Delivered.')
      }
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/shipment/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          courierName: courierName.trim(),
          trackingId: trackingId.trim(),
          dispatchDate,
          expectedDelivery: expectedDelivery.trim() === '' ? null : expectedDelivery,
          deliveryStatus,
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

  async function uploadPod(): Promise<void> {
    const file = podInputRef.current?.files?.[0]
    if (!file) return
    setSaveState('saving')
    setErrorMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/dispatch/kits/${encodeURIComponent(mouId)}/pod/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `POD upload failed (${res.status})`)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 6000)
      router.refresh()
    } catch (e) {
      setSaveState('error')
      setErrorMessage(e instanceof Error ? e.message : 'POD upload failed')
    }
  }

  const inputClass =
    'mt-1 w-full rounded border border-border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy'

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-brand-navy">Courier name</label>
          <input
            type="text"
            value={courierName}
            onChange={(e) => setCourierName(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="courier-name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Tracking ID</label>
          <input
            type="text"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="tracking-id"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Dispatch date</label>
          <input
            type="date"
            value={dispatchDate}
            onChange={(e) => setDispatchDate(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="dispatch-date"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-brand-navy">Expected delivery (optional)</label>
          <input
            type="date"
            value={expectedDelivery}
            onChange={(e) => setExpectedDelivery(e.target.value)}
            disabled={!editable}
            className={inputClass}
            data-testid="expected-delivery"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-navy">Delivery status</label>
        <div className="mt-1 flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="deliveryStatus"
              value="In Transit"
              checked={deliveryStatus === 'In Transit'}
              onChange={() => setDeliveryStatus('In Transit')}
              disabled={!editable}
              className="size-4"
              data-testid="status-in-transit"
            />
            In Transit
          </label>
          <label
            className={
              'inline-flex items-center gap-2 text-sm '
              + (!hasPod ? 'opacity-60' : '')
            }
          >
            <input
              type="radio"
              name="deliveryStatus"
              value="Delivered"
              checked={deliveryStatus === 'Delivered'}
              onChange={() => setDeliveryStatus('Delivered')}
              disabled={!editable || !hasPod}
              className="size-4"
              data-testid="status-delivered"
            />
            Delivered {!hasPod ? '(POD required)' : ''}
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-600">
          Proof of delivery (POD)
        </h3>
        {hasPod && pod ? (
          <div className="flex items-center gap-2">
            <a
              href={pod.filePath}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-brand-navy hover:bg-slate-50"
              data-testid="pod-download"
            >
              <Download aria-hidden className="size-4" />
              View POD
            </a>
            <span className="text-xs text-slate-500">
              Uploaded {pod.uploadedAt.slice(0, 16).replace('T', ' ')}
            </span>
          </div>
        ) : (
          editable && (
            <div className="flex items-center gap-2">
              <input
                ref={podInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="text-xs"
                data-testid="pod-input"
              />
              <button
                type="button"
                onClick={() => void uploadPod()}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy/90"
                data-testid="pod-upload"
              >
                <Upload aria-hidden className="size-4" />
                Upload POD
              </button>
            </div>
          )
        )}
      </div>

      {errorMessage && (
        <div className="rounded-md border border-signal-alert/40 bg-red-50 px-4 py-2.5 text-sm text-signal-alert">
          {errorMessage}
        </div>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveTracking()}
            disabled={saveState === 'saving'}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
            data-testid="tracking-save"
          >
            <Save aria-hidden className="size-4" />
            {saveState === 'saving' ? 'Saving...' : 'Save tracking'}
          </button>
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle aria-hidden className="size-3" />
              {hasPod && deliveryStatus === 'Delivered'
                ? 'POD uploaded. Status flipped to Delivered.'
                : 'Shipment tracking saved. Will reflect everywhere within ~5 minutes.'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
