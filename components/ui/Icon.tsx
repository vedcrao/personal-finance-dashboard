interface IconProps {
  name: string
  size?: number
  filled?: boolean
  className?: string
}

/** Material Symbols Outlined glyph (font loaded in app/layout.tsx). */
export function Icon({ name, size = 20, filled = false, className = "" }: IconProps) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined ${filled ? "filled" : ""} ${className}`}
      style={{ fontSize: size, width: size, height: size, overflow: "hidden" }}
    >
      {name}
    </span>
  )
}
