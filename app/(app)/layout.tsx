import { FinanceProvider } from "@/components/providers/FinanceProvider"
import { Sidebar } from "@/components/shell/Sidebar"
import { TopBar } from "@/components/shell/TopBar"
import { DataGate } from "@/components/shell/DataGate"
import { TransactionEditorHost } from "@/components/transactions/TransactionEditor"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FinanceProvider>
      <div className="flex min-h-screen bg-canvas">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-8 py-8">
            <DataGate>{children}</DataGate>
          </main>
        </div>
      </div>
      <TransactionEditorHost />
    </FinanceProvider>
  )
}
