/** @type {import('next').NextConfig} */
const nextConfig = {
  // Per CLAUDE.md inheritance checklist: experimental.outputFileTracingIncludes
  // must be nested under experimental for Next 14.2.x (silent-strip gotcha
  // when placed top-level). The PI / Dispatch / Delivery-Ack template
  // assets live at public/ops-templates/ and must be included in the
  // serverless bundle so docxtemplater can load them at runtime.
  //
  // Phase 6A (2026-05-20, Pranav review #2): /api/mou/generate-docx
  // shipped without an entry, so YP-v2.1.docx / STEAM-v2.1.docx /
  // HBPE-v2.1.docx were never bundled into the serverless function
  // and the wizard's "Generate .docx" returned a "Template file not
  // found" error in production. Adding the includes for the MOU
  // wizard route bundles the .docx alongside the function.
  experimental: {
    outputFileTracingIncludes: {
      '/api/pi/generate': ['./public/ops-templates/**/*'],
      '/api/mou/generate-docx': ['./public/mou-templates/**/*'],
    },
  },
};

export default nextConfig;
