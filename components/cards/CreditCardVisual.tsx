import { Icon } from "@/components/ui/Icon"
import type { Account } from "@/lib/types"
import { cardNetwork, type CardNetwork } from "@/lib/finance"

export const CARD_THEMES = [
  { gradient: "from-[#1b2234] via-[#101626] to-[#070b13]", accent: "text-primary", dot: "bg-primary" },
  { gradient: "from-[#0c2e42] via-[#091b29] to-[#040c14]", accent: "text-secondary", dot: "bg-secondary" },
  { gradient: "from-[#0b3326] via-[#08201a] to-[#03100c]", accent: "text-tertiary", dot: "bg-tertiary" },
  { gradient: "from-[#2d1b3a] via-[#1a1026] to-[#0b0613]", accent: "text-fuchsia-300", dot: "bg-fuchsia-300" },
]

/** Physical card rendering (Stitch "Your Hardware" showcase). */
export function CreditCardVisual({ account, themeIndex }: { account: Account; themeIndex: number }) {
  const theme = CARD_THEMES[themeIndex % CARD_THEMES.length]
  return (
    <div
      className={`group relative flex aspect-[1.586/1] w-full flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-6 shadow-2xl shadow-black/50 transition-all duration-500 ${theme.gradient}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.10),transparent_55%,rgba(0,0,0,0.6))]" />
      <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-secondary-container/10 blur-3xl" />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-11 flex-col justify-between overflow-hidden rounded-md bg-gradient-to-br from-[#d4af37] via-[#f7e49a] to-[#aa8321] p-[2px] shadow-sm">
            <div className="mt-2 h-px w-full bg-black/25" />
            <div className="mb-2 h-px w-full bg-black/25" />
            <div className="absolute inset-x-3 inset-y-0 border-x border-black/25" />
          </div>
          <Icon name="wifi" size={22} className="rotate-90 text-on-surface-variant/70" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`max-w-[180px] truncate text-[11px] font-bold uppercase tracking-widest ${theme.accent}`}>{account.institution_name}</span>
          <span className="h-2 w-2 rounded-full bg-tertiary" />
        </div>
      </div>

      <div className="relative flex items-center justify-between">
        <p className="tabular text-xl tracking-[0.22em] text-on-surface/90 drop-shadow">•••• •••• •••• {account.mask ?? "••••"}</p>
      </div>

      <div className="relative flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{account.subtype ?? "Credit card"}</p>
          <p className="truncate text-sm font-semibold uppercase tracking-wide">{account.name}</p>
        </div>
        <NetworkLogo network={cardNetwork(account)} />
      </div>
    </div>
  )
}

/** Network marks drawn with CSS (no trademark image files). Unknown network → nothing. */
export function NetworkLogo({ network, small }: { network: CardNetwork; small?: boolean }) {
  if (!network) return null
  if (network === "mastercard") {
    const d = small ? "h-4 w-4" : "h-8 w-8"
    return (
      <div className={`flex items-center opacity-90 ${small ? "-space-x-1.5" : "-space-x-3"}`} aria-label="Mastercard">
        <div className={`${d} rounded-full bg-[#eb001b]/85`} />
        <div className={`${d} rounded-full bg-[#f79e1b]/85`} />
      </div>
    )
  }
  if (network === "visa") {
    return <span aria-label="Visa" className={`font-black italic tracking-tight text-white ${small ? "text-xs" : "text-2xl"}`}>VISA</span>
  }
  if (network === "amex") {
    return (
      <span aria-label="American Express"
        className={`rounded bg-[#2e77bb] font-black tracking-tighter text-white ${small ? "px-1 py-px text-[8px]" : "px-2 py-1 text-xs"}`}>
        AMEX
      </span>
    )
  }
  return <span aria-label="Discover" className={`font-bold uppercase tracking-wide text-orange-300 ${small ? "text-[9px]" : "text-sm"}`}>Discover</span>
}
