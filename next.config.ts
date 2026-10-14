import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async redirects() {
    // The old single-page dashboard now lives across Overview / Transactions
    return [{ source: "/dashboard", destination: "/", permanent: false }]
  },
}

export default nextConfig
