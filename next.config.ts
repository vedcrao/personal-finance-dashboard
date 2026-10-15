import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async redirects() {
    // The old single-page dashboard now lives across Overview / Transactions
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      // Transactions moved under Spending (query string is kept)
      { source: "/transactions", destination: "/spending", permanent: false },
    ]
  },
}

export default nextConfig
