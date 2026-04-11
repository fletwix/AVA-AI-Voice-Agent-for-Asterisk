import { useMemo, useState } from "react";
import { CheckCircle2, Plus, Power, Server, Settings, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Card, PillButton } from "@/components/ui/core";
import { JsonObjectModal } from "@/components/config/JsonObjectModal";
import { Banner, EmptyState, LoadingBlock, PageHeader } from "@/components/ui/shell";
import { useConfigDocument } from "@/hooks/useConfigDocument";
import { api } from "@/lib/api";

export default function ProvidersPage() {
  const { config, setConfig, save, isLoading, refetch } = useConfigDocument();
  const [modalState, setModalState] = useState({ open: false, name: "", value: {}, lockName: false });

  const providers = useMemo(() => {
    const items = Object.entries(config?.providers || {}).map(([name, value]) => ({
      name,
      value,
    }));
    return items.sort((left, right) => left.name.localeCompare(right.name));
  }, [config]);

  const defaultProvider = config?.default_provider || "";

  function openCreateModal() {
    setModalState({
      open: true,
      name: "",
      value: { enabled: true, type: "openai", capabilities: ["llm"] },
      lockName: false,
    });
  }

  function openEditModal(provider) {
    setModalState({
      open: true,
      name: provider.name,
      value: provider.value,
      lockName: true,
    });
  }

  async function persist(nextConfig, message) {
    const success = await save(nextConfig, message);
    if (success) {
      await refetch();
    }
  }

  async function saveProvider(name, value) {
    if (!name) {
      toast.error("Provider name is required.");
      return;
    }
    const nextConfig = structuredClone(config || {});
    nextConfig.providers = nextConfig.providers || {};
    nextConfig.providers[name] = value;
    if (!nextConfig.default_provider) {
      nextConfig.default_provider = name;
    }
    await persist(nextConfig, `Provider ${name} saved.`);
    setModalState({ open: false, name: "", value: {}, lockName: false });
  }

  async function deleteProvider(name) {
    if (name === defaultProvider) {
      toast.error("Default provider cannot be deleted.");
      return;
    }
    if (!window.confirm(`Delete provider "${name}"?`)) {
      return;
    }
    const nextConfig = structuredClone(config || {});
    delete nextConfig.providers?.[name];
    await persist(nextConfig, `Provider ${name} deleted.`);
  }

  async function setDefault(name) {
    const nextConfig = structuredClone(config || {});
    nextConfig.default_provider = name;
    await persist(nextConfig, `Default provider set to ${name}.`);
  }

  async function toggleEnabled(name) {
    const nextConfig = structuredClone(config || {});
    nextConfig.providers[name] = {
      ...nextConfig.providers[name],
      enabled: !nextConfig.providers[name]?.enabled,
    };
    await persist(nextConfig, `Provider ${name} updated.`);
  }

  async function testProvider(name, providerConfig) {
    try {
      const response = await api.post("/api/config/providers/test", {
        name,
        config: providerConfig,
      });
      toast.success(response.data?.message || `Provider ${name} test completed.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Provider ${name} test failed.`);
    }
  }

  async function restartEngine() {
    try {
      await api.post("/api/system/containers/ai_engine/restart?force=false");
      toast.success("AI Engine restart requested.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to restart AI Engine.");
    }
  }

  if (isLoading || !config) {
    return <LoadingBlock label="Loading Providers" />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="AI Backbone & Connectivity"
        title="Providers"
        description="Manage full-agent and modular providers backed by the real YAML config. Add, edit, test, enable, disable, and switch the default provider from the new interface."
        actions={
          <>
            <PillButton onClick={restartEngine}>Restart AI Engine</PillButton>
            <PillButton variant="solid" onClick={openCreateModal}>
              <span className="flex items-center gap-2">
                <Plus size={14} />
                Add Provider
              </span>
            </PillButton>
          </>
        }
      />

      <Banner tone="warning" action={<PillButton onClick={restartEngine}>Restart</PillButton>}>
        Changes to providers require a full AI Engine restart to take effect, especially when you add, remove, or rewire capabilities used by active pipelines.
      </Banner>

      {providers.length ? (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.name} className="flex h-full flex-col justify-between rounded-[32px] p-8">
              <div>
                <div className="mb-8 flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-white">
                    <Server size={20} />
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.name === defaultProvider ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                        Default
                      </span>
                    ) : null}
                    {!provider.value?.enabled ? (
                      <span className="rounded-full bg-[#111111]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#666666]">
                        Disabled
                      </span>
                    ) : null}
                  </div>
                </div>

                <h3 className="font-clash-display text-3xl font-bold uppercase">
                  {provider.name}
                </h3>
                <p className="mt-3 text-sm text-[#666666]">
                  Type: {provider.value?.type || "unknown"} • Capabilities:{" "}
                  {(provider.value?.capabilities || []).join(", ") || "none"}
                </p>
                <pre className="mt-6 overflow-x-auto rounded-[24px] bg-[#111111]/5 p-4 text-xs text-[#555555]">
                  {JSON.stringify(provider.value, null, 2)}
                </pre>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-2">
                <ActionButton onClick={() => setDefault(provider.name)}>
                  <CheckCircle2 size={14} />
                  Default
                </ActionButton>
                <ActionButton onClick={() => testProvider(provider.name, provider.value)}>
                  <Zap size={14} />
                  Test
                </ActionButton>
                <ActionButton onClick={() => toggleEnabled(provider.name)}>
                  <Power size={14} />
                  {provider.value?.enabled ? "Disable" : "Enable"}
                </ActionButton>
                <ActionButton onClick={() => openEditModal(provider)}>
                  <Settings size={14} />
                  Edit
                </ActionButton>
                <ActionButton
                  className="col-span-2 hover:bg-red-500 hover:text-white"
                  onClick={() => deleteProvider(provider.name)}
                >
                  <Trash2 size={14} />
                  Delete
                </ActionButton>
              </div>
            </Card>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No Providers Configured"
          description="Add a provider to begin wiring speech, LLM, or full-agent execution into the backend."
          actionLabel="Add Provider"
          onAction={openCreateModal}
        />
      )}

      <JsonObjectModal
        isOpen={modalState.open}
        onClose={() => setModalState({ open: false, name: "", value: {}, lockName: false })}
        title={modalState.lockName ? "Edit Provider" : "Add Provider"}
        initialName={modalState.name}
        initialValue={modalState.value}
        lockName={modalState.lockName}
        subtitle="The modal stores the provider object directly into config.providers so nothing is lost between edits."
        onSave={saveProvider}
      />
    </div>
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
