import Groq from "groq-sdk"

let client: Groq | null = null

/** Created on first use, so importing this module never requires GROQ_API_KEY. */
export const groq: Groq = new Proxy({} as Groq, {
  get(_t, prop) {
    if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const real = client as unknown as Record<PropertyKey, unknown>
    return real[prop]
  },
})
