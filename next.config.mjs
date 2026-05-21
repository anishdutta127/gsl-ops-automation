/** @type {import('next').NextConfig} */
const nextConfig = {
  // Per CLAUDE.md inheritance checklist: experimental.outputFileTracingIncludes
  // must be nested under experimental for Next 14.2.x (silent-strip gotcha
  // when placed top-level). Every API route that loads a .docx asset from
  // public/ at runtime needs an entry here so Vercel bundles the asset
  // into the serverless function. Missing entries surface as ENOENT in
  // production -> "template-missing" toast.
  //
  // Phase 6A (2026-05-20, Pranav review #2): added /api/mou/generate-docx
  // after the wizard's "Generate .docx" button returned a "Template file
  // not found" error in production.
  //
  // Phase 6E Finding 3 (2026-05-21): swept the 5 remaining template-
  // loading routes Phase 6A had flagged as deferred (dispatch note,
  // handover worksheet, dispatch generate, delivery ack, finance PI
  // download). Verified via the /api/admin/template-smoke diagnostic
  // route (since removed) that all 7 .docx assets are present in the
  // deployed serverless bundle at /var/task/public/.
  experimental: {
    outputFileTracingIncludes: {
      '/api/pi/generate':                        ['./public/ops-templates/**/*'],
      '/api/mou/generate-docx':                  ['./public/mou-templates/**/*'],
      '/api/dispatch/[id]/dispatch-note':        ['./public/ops-templates/**/*'],
      '/api/dispatch/[id]/handover-worksheet':   ['./public/ops-templates/**/*'],
      '/api/dispatch/generate':                  ['./public/ops-templates/**/*'],
      '/api/delivery-ack/template':              ['./public/ops-templates/**/*'],
      '/api/finance/pi/[paymentId]/download':    ['./public/ops-templates/**/*'],
    },
  },
};

export default nextConfig;
