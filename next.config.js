/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // §4h: @xenova/transformers (client-side embedding model, see lib/embedWorker.js)
  // conditionally requires node-only optional deps (sharp, onnxruntime-node) that it
  // never actually calls in the browser bundle — without this, webpack fails trying
  // to resolve them for the client build.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      'onnxruntime-node$': false
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera/microphone opened to same-origin only (Mindcord Phase 2 WebRTC calling
          // needs getUserMedia; this app never embeds itself cross-origin, so self-only
          // is the minimum permissive change).
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' }
        ]
      }
    ]
  }
}

module.exports = nextConfig
