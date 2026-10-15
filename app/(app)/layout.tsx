import { FinanceProvider } from "@/components/providers/FinanceProvider"
import { Sidebar } from "@/components/shell/Sidebar"
import { TopBar } from "@/components/shell/TopBar"
import { MobileHeader, MobileTabBar } from "@/components/shell/MobileNav"
import { DataGate } from "@/components/shell/DataGate"
import { NativeBridge } from "@/components/shell/NativeBridge"
import { TransactionEditorHost } from "@/components/transactions/TransactionEditor"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider>
      <NativeBridge />
      <div className="flex min-h-screen bg-canvas">
        {/* Desktop / tablet */}
        <div className="max-md:hidden">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="max-md:hidden">
            <TopBar />
          </div>
          {/* Phone */}
          <MobileHeader />
          <main className="mx-auto w-full max-w-[1440px] flex-1 overflow-x-clip px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-8 md:py-8 md:pb-8">
            <DataGate>{children}</DataGate>
          </main>
        </div>
      </div>
      <MobileTabBar />
      <TransactionEditorHost />
    </FinanceProvider>
  )
}
