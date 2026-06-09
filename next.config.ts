import type { NextConfig } from "next";

// Conservative, app-wide security headers. Deliberately no Content-Security-Policy
// here — Monaco (web workers, blob: URLs) and KaTeX (inline styles) need a tuned
// CSP, so that is left as a follow-up rather than risking a broken editor.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // clickjacking
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
