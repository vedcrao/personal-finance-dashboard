import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai"

let model: GenerativeModel | null = null

/** Created on first use, so importing this file never fails when GOOGLE_AI_API_KEY isn't set. */
export function getGemini(): GenerativeModel {
  if (!model) {
    if (!process.env.GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY is not set")
    model = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" })
  }
  return model
}
