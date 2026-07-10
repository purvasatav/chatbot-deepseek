/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'tesseract.js'],
  // pdfjs-dist loads its worker file (pdf.worker.mjs) dynamically at runtime,
  // so Next.js's automatic file-tracing for serverless functions misses it.
  // This explicitly forces it to be bundled with the extract route's function.
  outputFileTracingIncludes: {
    '/api/chat/extract/route': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
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