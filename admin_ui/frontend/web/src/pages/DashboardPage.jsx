import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  FolderCheck,
  HardDrive,
  Phone,
  RefreshCw,
  Server,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Card, PillButton } from "@/components/ui/core";
import { Banner, LoadingBlock, PageHeader, RefreshButton } from "@/components/ui/shell";
import { api } from "@/lib/api";
import {
  formatBytes,
  formatNumber,
  formatPercent,
} from "@/lib/formatters";

export default function DashboardPage() {
  const navigate = useNavigate();

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [
        containers,
        metrics,
        directories,
        platform,
        asterisk,
      ] = await Promise.allSettled([
        api.get("/api/system/containers"),
        api.get("/api/system/metrics"),
        api.get("/api/system/directories"),
        api.get("/api/system/platform"),
        api.get("/api/system/asterisk-status"),
      ]);

      return {
        containers: containers.status === "fulfilled" ? containers.value.data : null,
        metrics: metrics.status === "fulfilled" ? metrics.value.data : null,
        directories:
          directories.status === "fulfilled" ? directories.value.data : null,
        platform: platform.status === "fulfilled" ? platform.value.data : null,
        asterisk: asterisk.status === "fulfilled" ? asterisk.value.data : null,
        errors: [containers, metrics]
          .filter((result) => result.status === "rejected")
          .map((result) => result.reason?.response?.data?.detail || result.reason?.message || "Request failed"),
      };
    },
    refetchInterval: 10000,
  });

  const reloadMutation = async () => {
    try {
      const response = await api.post("/api/system/containers/ai_engine/reload");
      toast.success(response.data?.message || "AI Engine reload requested.");
      dashboardQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to reload AI Engine.");
    }
  };

  const reconnectAriMutation = async () => {
    try {
      const response = await api.post(
        "/api/system/containers/ai_engine/restart?force=false&recreate=true",
      );
      toast.success(response.data?.message || "AI Engine restart requested.");
      dashboardQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to restart AI Engine.");
    }
  };

  const fixDirectoriesMutation = async () => {
    try {
      const response = await api.post("/api/system/directories/fix");
      if (response.data?.success) {
        toast.success("Directory fixes applied.");
        dashboardQuery.refetch();
        return;
      }
      toast.error(response.data?.errors?.join(", ") || "Directory auto-fix failed.");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to fix directories.");
    }
  };

  const metrics = dashboardQuery.data?.metrics;
  const platform = dashboardQuery.data?.platform;
  const directories = dashboardQuery.data?.directories;
  const asterisk = dashboardQuery.data?.asterisk;
  const containers = dashboardQuery.data?.containers ?? [];

  const activeCalls = useMemo(() => {
    const aiEngine = Array.isArray(containers)
      ? containers.find((container) => container.name?.includes("ai_engine"))
      : null;
    return {
      aiEngine,
      runningContainers: Array.isArray(containers)
        ? containers.filter((container) => container.status === "running").length
        : 0,
    };
  }, [containers]);

  if (dashboardQuery.isLoading) {
    return <LoadingBlock label="Loading Dashboard" />;
  }

  const metricCards = [
    {
      label: "CPU",
      value: formatPercent(metrics?.cpu?.percent),
      subValue: `${metrics?.cpu?.count || 0} cores`,
      icon: Activity,
    },
    {
      label: "Memory",
      value: formatPercent(metrics?.memory?.percent),
      subValue: `${formatBytes(metrics?.memory?.used)} / ${formatBytes(metrics?.memory?.total)}`,
      icon: Server,
    },
    {
      label: "Disk",
      value: formatPercent(metrics?.disk?.percent),
      subValue: `${formatBytes(metrics?.disk?.free)} free`,
      icon: HardDrive,
    },
    {
      label: "Asterisk",
      value: asterisk?.live?.ari_reachable ? "Connected" : "Action Required",
      subValue: asterisk?.live?.ari_version || "Not reachable",
      icon: Phone,
      onClick: () => navigate("/asterisk"),
    },
    {
      label: "Audio Dirs",
      value: directories?.overall === "healthy" ? "Healthy" : "Needs Fix",
      subValue: directories?.checks?.host_directory?.message || "Check directory wiring",
      icon: FolderCheck,
      action:
        directories?.overall !== "healthy" ? (
          <button
            type="button"
            className="rounded-full border border-[#111111]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
            onClick={(event) => {
              event.stopPropagation();
              fixDirectoriesMutation();
            }}
          >
            Auto Fix
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System Overview"
        title="Dashboard"
        description="Live system status, container health, platform readiness, and quick recovery actions for your AVA deployment."
        actions={
          <>
            <RefreshButton
              loading={dashboardQuery.isFetching}
              onClick={() => dashboardQuery.refetch()}
            />
            <PillButton variant="solid" onClick={reloadMutation}>
              <span className="flex items-center gap-2">
                <RefreshCw size={14} />
                Reload Engine
              </span>
            </PillButton>
          </>
        }
      />

      {dashboardQuery.data?.errors?.length ? (
        <Banner
          tone="warning"
          action={
            <PillButton onClick={() => dashboardQuery.refetch()}>Retry</PillButton>
          }
        >
          <div>
            <p className="font-bold uppercase tracking-[0.12em]">
              Some system data could not be loaded.
            </p>
            <p className="mt-1 text-sm">
              This usually means the Admin UI cannot reach Docker or one of the
              service endpoints yet. Troubleshooting the Docker socket mount and
              service startup sequence is the first thing to check.
            </p>
          </div>
        </Banner>
      ) : null}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metricCards.map((item) => (
          <button
            type="button"
            key={item.label}
            onClick={item.onClick}
            className="text-left"
          >
            <Card className="h-full rounded-[28px] p-6">
              <div className="mb-8 flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-white">
                  <item.icon size={20} />
                </div>
                {item.action}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#838282]">
                {item.label}
              </p>
              <h3 className="mt-2 font-clash-display text-4xl font-bold uppercase leading-none">
                {item.value}
              </h3>
              <p className="mt-3 text-sm text-[#666666]">{item.subValue}</p>
            </Card>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-8 rounded-[32px] p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#838282]">
                Platform Readiness
              </p>
              <h2 className="mt-3 font-clash-display text-4xl font-bold uppercase">
                {platform?.summary?.ready ? "System Ready" : "Action Required"}
              </h2>
            </div>
            {!asterisk?.live?.ari_reachable ? (
              <PillButton variant="solid" onClick={reconnectAriMutation}>
                <span className="flex items-center gap-2">
                  <ShieldAlert size={14} />
                  Reconnect ARI
                </span>
              </PillButton>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoItem
              label="Passed Checks"
              value={`${platform?.summary?.passed || 0}`}
              hint="Platform checks"
            />
            <InfoItem
              label="OS"
              value={platform?.platform?.os?.id || "Unknown"}
              hint={platform?.platform?.os?.version}
            />
            <InfoItem
              label="AAVA"
              value={platform?.platform?.project?.version || "Unknown"}
              hint="Project version"
            />
            <InfoItem
              label="Docker"
              value={platform?.platform?.docker?.version || "Unknown"}
              hint={platform?.platform?.compose?.version || "Compose unavailable"}
            />
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            <TopologyNode
              label="Asterisk"
              value={asterisk?.live?.ari_reachable ? "Connected" : "Offline"}
              detail={asterisk?.live?.ari_version || "No ARI connection"}
            />
            <TopologyNode
              label="AI Engine"
              value={activeCalls.aiEngine?.status === "running" ? "Running" : "Stopped"}
              detail={activeCalls.aiEngine?.status === "running" ? "Service Active" : "Waiting for startup"}
            />
            <TopologyNode
              label="Containers"
              value={formatNumber(activeCalls.runningContainers)}
              detail={`${formatNumber(Array.isArray(containers) ? containers.length : 0)} configured services`}
            />
          </div>
        </Card>

        <div className="space-y-6 xl:col-span-4">
          <Card className="rounded-[32px] bg-[#111111] p-8 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-white/50">
              Quick Actions
            </p>
            <div className="mt-6 space-y-2">
              <QuickAction
                label="Run Preflight"
                onClick={async () => {
                  try {
                    await api.post("/api/system/preflight");
                    toast.success("Preflight started.");
                  } catch (err) {
                    toast.error(err?.response?.data?.detail || "Preflight failed.");
                  }
                }}
              />
              <QuickAction label="Open Asterisk Checks" onClick={() => navigate("/asterisk")} />
              <QuickAction label="Open Docker Services" onClick={() => navigate("/docker")} />
              <QuickAction label="View Logs" onClick={() => navigate("/logs")} />
            </div>
          </Card>

          <Card className="rounded-[32px] p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#838282]">
              Runtime Snapshot
            </p>
            <div className="mt-6 space-y-4">
              <SnapshotRow
                label="Active Calls"
                value={String(asterisk?.live?.active_channels || 0)}
              />
              <SnapshotRow
                label="Local AI"
                value={containers.some((item) => item.name?.includes("local_ai_server") && item.status === "running") ? "Running" : "Stopped"}
              />
              <SnapshotRow
                label="Default Provider"
                value={asterisk?.config?.default_provider || "See config"}
              />
              <SnapshotRow
                label="Health Mode"
                value={asterisk?.mode || "Unknown"}
              />
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, value, hint }) {
  return (
    <div className="rounded-[24px] border border-[#111111]/10 bg-white px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#838282]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold uppercase">{value}</p>
      <p className="mt-1 text-xs text-[#666666]">{hint || "—"}</p>
    </div>
  );
}

function TopologyNode({ label, value, detail }) {
  return (
    <div className="rounded-[28px] border border-[#111111]/10 p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#838282]">
        {label}
      </p>
      <h3 className="mt-2 font-clash-display text-3xl font-bold uppercase">
        {value}
      </h3>
      <p className="mt-2 text-sm text-[#666666]">{detail}</p>
    </div>
  );
}

function QuickAction({ label, onClick }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between border-b border-white/10 py-3 text-left text-sm font-bold uppercase tracking-[0.15em] transition-colors hover:text-white/70"
      onClick={onClick}
    >
      <span>{label}</span>
      <Wrench size={14} />
    </button>
  );
}

function SnapshotRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#838282]">
        {label}
      </span>
      <span className="text-xs font-bold uppercase tracking-[0.15em]">
        {value}
      </span>
    </div>
  );
}
