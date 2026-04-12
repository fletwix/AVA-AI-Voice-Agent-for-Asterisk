import { useMemo, useState } from "react";
import { MessageCircle, Plus, Settings, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { JsonObjectModal } from "@/components/config/JsonObjectModal";
import { Card, PillButton } from "@/components/ui/core";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui/shell";
import { useConfigDocument } from "@/hooks/useConfigDocument";

export default function ContextsPage() {
  const { config, isLoading, save } = useConfigDocument();
  const [modalState, setModalState] = useState({ open: false, name: "", value: {}, lockName: false });

  const contexts = useMemo(
    () => Object.entries(config?.contexts || {}).map(([name, value]) => ({ name, value })),
    [config],
  );

  async function persist(nextConfig, message) {
    await save(nextConfig, message);
  }

  async function saveContext(name, value) {
    const nextConfig = structuredClone(config || {});
    nextConfig.contexts = nextConfig.contexts || {};
    nextConfig.contexts[name] = value;
    await persist(nextConfig, `Context ${name} saved.`);
    setModalState({ open: false, name: "", value: {}, lockName: false });
  }

  async function deleteContext(name) {
    if (!window.confirm(`Delete context "${name}"?`)) {
      return;
    }
    const nextConfig = structuredClone(config || {});
    delete nextConfig.contexts?.[name];
    await persist(nextConfig, `Context ${name} deleted.`);
  }

  if (isLoading || !config) {
    return (
      <AppShell>
        <LoadingBlock label="Loading Contexts" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="AI Personas & Behaviors"
          title="Contexts"
          description="Manage greetings, prompts, provider overrides, and phase tool allow-lists for each context using the live backend config."
          actions={
            <PillButton
              variant="solid"
              onClick={() =>
                setModalState({
                  open: true,
                  name: "",
                  value: { greeting: "Hello", prompt: "", profile: "telephony_ulaw_8k", tools: [] },
                  lockName: false,
                })
              }
            >
              <span className="flex items-center gap-2">
                <Plus size={14} />
                Add Context
              </span>
            </PillButton>
          }
        />

        {contexts.length ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {contexts.map((context) => (
              <Card key={context.name} className="rounded-[32px] p-8">
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-white">
                    <MessageCircle size={20} />
                  </div>
                </div>
                <h3 className="font-clash-display text-3xl font-bold uppercase">
                  {context.name}
                </h3>
                <p className="mt-3 text-sm text-[#666666]">
                  Profile {context.value?.profile || "—"} • Provider {context.value?.provider || "default"}
                </p>
                <p className="mt-4 line-clamp-4 text-sm leading-6 text-[#555555]">
                  {context.value?.greeting || context.value?.prompt || "No greeting configured."}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {(context.value?.pre_call_tools || []).map((tool) => (
                    <Badge key={`pre-${tool}`} label={tool} tone="neutral" />
                  ))}
                  {(context.value?.tools || []).map((tool) => (
                    <Badge key={`in-${tool}`} label={tool} tone="dark" />
                  ))}
                  {(context.value?.post_call_tools || []).map((tool) => (
                    <Badge key={`post-${tool}`} label={tool} tone="accent" />
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <ActionButton
                    onClick={() =>
                      setModalState({
                        open: true,
                        name: context.name,
                        value: context.value,
                        lockName: true,
                      })
                    }
                  >
                    <Settings size={14} />
                    Edit
                  </ActionButton>
                  <ActionButton
                    onClick={() => deleteContext(context.name)}
                    className="hover:bg-red-500 hover:text-white"
                  >
                    <Trash2 size={14} />
                    Delete
                  </ActionButton>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No Contexts Configured"
            description="Add a context to control greetings, prompts, and context-specific tool visibility."
            actionLabel="Add Context"
            onAction={() =>
              setModalState({
                open: true,
                name: "",
                value: { greeting: "Hello", prompt: "", profile: "telephony_ulaw_8k", tools: [] },
                lockName: false,
              })
            }
          />
        )}
      </div>

      <JsonObjectModal
        isOpen={modalState.open}
        onClose={() => setModalState({ open: false, name: "", value: {}, lockName: false })}
        title={modalState.lockName ? "Edit Context" : "Add Context"}
        initialName={modalState.name}
        initialValue={modalState.value}
        lockName={modalState.lockName}
        onSave={saveContext}
      />
    </AppShell>
  );
}

function ActionButton({ children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-full border border-[#111111]/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] transition-all hover:bg-[#111111] hover:text-white ${className}`}
    >
      {children}
    </button>
  );
}

function Badge({ label, tone }) {
  const classes = {
    neutral: "bg-[#111111]/5 text-[#666666]",
    dark: "bg-[#111111] text-white",
    accent: "bg-amber-100 text-amber-900",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${classes[tone]}`}>
      {label}
    </span>
  );
}
