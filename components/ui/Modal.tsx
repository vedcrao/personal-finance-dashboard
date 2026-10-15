"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Icon } from "./Icon"

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  icon?: string
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Modal({ open, onClose, title, icon, children, footer, width = "max-w-lg" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex animate-fade-in items-end justify-center bg-black/70 backdrop-blur-md md:items-center md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`glass-raised max-h-[92vh] w-full ${width} animate-pop-in overflow-y-auto rounded-t-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] outline-none md:rounded-2xl md:p-6`}
      >
        <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            {icon && <Icon name={icon} className="text-secondary" />}
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant hover:text-on-surface"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}
