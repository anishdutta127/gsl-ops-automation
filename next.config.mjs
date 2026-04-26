/** @type {import('next').NextConfig} */
const nextConfig = {
  // Per CLAUDE.md inheritance checklist: experimental.outputFileTracingIncludes
  // must be nested under experimental for Next 14.2.x (silent-strip gotcha
  // when placed top-level). The PI / Dispatch / Delivery-Ack template
  // assets live at public/ops-templates/ and must be included in the
  // serverless bundle so docxtemplater can load them at runtime.
  experimental: {
    outputFileTracingIncludes: {
      '/api/pi/generate': ['./public/ops-templates/**/*'],
    },
  },
};

export default nextConfig;
