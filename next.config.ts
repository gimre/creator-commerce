import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // nodemailer is a CommonJS node library with dynamic requires; bundling it
  // into the server output breaks those. Loaded from node_modules at runtime
  // instead.
  serverExternalPackages: ['nodemailer'],
  // Next 16 locks a build directory to one running `next dev`. Playwright's
  // webServer sets NEXT_DIST_DIR=.next-e2e so its test server never fights a
  // hand-started `next dev` (default .next) for the same lockfile.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // The share cards read their TTFs from disk at request time
  // (lib/server/og/fonts.ts), and a file that isn't in a route's trace isn't
  // in its serverless function on Vercel — the card would fail to render
  // there while working locally. Keys are picomatch globs over the route
  // path, which for a card is e.g. /[handle]/opengraph-image-<hash>/
  // [__metadata_id__]; values are globs from the project root.
  // Both keys because the generated route's last segment is the metadata
  // id; the TTFs are ~230 KB.
  outputFileTracingIncludes: {
    '**/opengraph-image*': ['./assets/fonts/**'],
    '**/opengraph-image*/**': ['./assets/fonts/**'],
  },
  images: {
    // UploadThing serves files from https://<appId>.ufs.sh/f/<key>.
    remotePatterns: [{ protocol: "https", hostname: "**.ufs.sh" }],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2678400
  },
  async headers() {
    return [
      {
        // The consent page's url carries a pending authorization code, and its
        // Allow button grants an outside app access to the account. Neither the
        // url (Referer) nor the page (framing, clickjacking) may leave it.
        source: '/oauth/consent',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "creatorcommerce",

  project: "creator-commerce",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
