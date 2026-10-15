"use client"

import { useApi } from "@/components/hooks/useApi"
import { ChatPanel } from "@/components/assistant/ChatPanel"
import { RulesPanel, type RuleRow } from "@/components/assistant/RulesPanel"

export default function AssistantPage() {
  const rules = useApi<{ rules: RuleRow[] }>("/api/rules")

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 xl:col-span-7">
        <ChatPanel onRulesChanged={() => void rules.reload()} />
      </div>
      <div className="col-span-12 xl:col-span-5">
        <RulesPanel rules={rules.data?.rules ?? []} loading={rules.loading} error={rules.error} reload={() => void rules.reload()} />
      </div>
    </div>
  )
}
