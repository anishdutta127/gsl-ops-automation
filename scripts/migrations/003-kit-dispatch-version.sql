-- Phase 7 Part 5.B P2b.X: kit_dispatches.allocations OCC.
--
-- Adds an optimistic-concurrency `version` column to kit_dispatches.
-- The allocations + dispatch_summary + shipment_tracking + pod fields
-- are REPLACE-on-update (UI form submits the full new value); under
-- concurrent edit the last writer silently overwrites the first. This
-- is the kit-details flow Misba uses daily - the exact pipeline 6H
-- existed to fix.
--
-- The repo's updateAllocations method will check WHERE id=$1 AND
-- version=$expected, and bump version on success. If 0 rows affected,
-- the lib surfaces a 409 Conflict to the UI; the operator reloads
-- and retries.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Run with:
--   node scripts/apply-migration.mjs scripts/migrations/003-kit-dispatch-version.sql

BEGIN;

ALTER TABLE kit_dispatches
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
