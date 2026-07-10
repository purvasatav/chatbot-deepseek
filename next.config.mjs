/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'tesseract.js'],
  // pdfjs-dist loads its worker file dynamically at runtime, so Next's
  // automatic file-tracing for serverless functions misses it. The key here
  // must match the actual file path (app/api/.../route.js), not the URL.
  outputFileTracingIncludes: {
    'app/api/chat/extract/route.js': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  images: {
    unoptimized: true,
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: "https", hostname: "image.pollinations.ai" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default nextConfig;