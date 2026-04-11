import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Copy,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PillButton } from "@/components/ui/core";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadingBlock, PageHeader } from "@/components/ui/shell";
import { api, downloadBlob } from "@/lib/api";
import { downloadBrowserFile, formatNumber } from "@/lib/formatters";

const EMPTY_FORM = {
  name: "",
  timezone: "UTC",
  daily_window_start_local: "09:00",
  daily_window_end_local: "17:00",
  max_concurrent: 1,
  min_interval_seconds_between_calls: 5,
  default_context: "default",
  voicemail_drop_enabled: true,
  voicemail_drop_media_uri: "",
  consent_enabled: false,
  consent_media_uri: "",
  consent_timeout_seconds: 5,
  amd_options: {
    initial_silence_ms: 2000,
    greeting_ms: 2000,
    after_greeting_silence_ms: 1000,
    total_analysis_time_ms: 5000,
  },
};

export default function SchedulingPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadPage, setLeadPage] = useState(1);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignForm, setCampaignForm] = useState(EMPTY_FORM);
  const [campaignMode, setCampaignMode] = useState("create");
  const [importingLeads, setImportingLeads] = useState(false);
  const [leadFile, setLeadFile] = useState(null);

  const [metaQuery, campaignsQuery, detailsQuery, statsQuery, leadsQuery] = useQueries({
    queries: [
      {
        queryKey: ["outbound-meta"],
        queryFn: async () => (await api.get("/api/outbound/meta")).data,
      },
      {
        queryKey: ["campaigns", showArchived],
        queryFn: async () =>
          (await api.get(`/api/outbound/campaigns?include_archived=${showArchived}`)).data,
      },
      {
        queryKey: ["campaign-details", selectedCampaignId],
        enabled: Boolean(selectedCampaignId),
        queryFn: async () =>
          (await api.get(`/api/outbound/campaigns/${selectedCampaignId}`)).data,
      },
      {
        queryKey: ["campaign-stats", selectedCampaignId],
        enabled: Boolean(selectedCampaignId),
        queryFn: async () =>
          (await api.get(`/api/outbound/campaigns/${selectedCampaignId}/stats`)).data,
      },
      {
        queryKey: ["campaign-leads", selectedCampaignId, leadPage, leadQuery],
        enabled: Boolean(selectedCampaignId),
        queryFn: async () => {
          const params = new URLSearchParams({
            page: String(leadPage),
            page_size: "25",
          });
          if (leadQuery) {
            params.set("q", leadQuery);
          }
          return (await api.get(`/api/outbound/campaigns/${selectedCampaignId}/leads?${params.toString()}`)).data;
        },
      },
    ],
  });

  useEffect(() => {
    if (!selectedCampaignId && campaignsQuery.data?.length) {
      setSelectedCampaignId(campaignsQuery.data[0].id);
    }
  }, [campaignsQuery.data, selectedCampaignId]);

  const selectedCampaign = useMemo(
    () => campaignsQuery.data?.find((item) => item.id === selectedCampaignId) || detailsQuery.data || null,
    [campaignsQuery.data, detailsQuery.data, selectedCampaignId],
  );

  function openCreateModal() {
    setCampaignMode("create");
    setCampaignForm({
      ...EMPTY_FORM,
      timezone: metaQuery.data?.server_timezone || "UTC",
      default_context: selectedCampaign?.default_context || "default",
    });
    setCampaignModalOpen(true);
  }

  function openEditModal() {
    if (!selectedCampaign) {
      return;
    }
    setCampaignMode("edit");
    setCampaignForm({
      ...EMPTY_FORM,
      ...selectedCampaign,
      amd_options: {
        ...EMPTY_FORM.amd_options,
        ...(selectedCampaign.amd_options || {}),
      },
    });
    setCampaignModalOpen(true);
  }

  async function saveCampaign() {
    try {
      if (campaignMode === "create") {
        const response = await api.post("/api/outbound/campaigns", campaignForm);
        toast.success("Campaign created.");
        setSelectedCampaignId(response.data?.id || null);
      } else {
        await api.patch(`/api/outbound/campaigns/${selectedCampaignId}`, campaignForm);
        toast.success("Campaign updated.");
      }
      setCampaignModalOpen(false);
      campaignsQuery.refetch();
      detailsQuery.refetch();
      statsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save campaign.");
    }
  }

  async function updateStatus(status, cancelPending = false) {
    if (!selectedCampaignId) {
      return;
    }
    try {
      await api.post(`/api/outbound/campaigns/${selectedCampaignId}/status`, {
        status,
        cancel_pending: cancelPending,
      });
      toast.success(`Campaign moved to ${status}.`);
      campaignsQuery.refetch();
      detailsQuery.refetch();
      statsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update status.");
    }
  }

  async function cloneCampaign() {
    if (!selectedCampaignId) {
      return;
    }
    try {
      const response = await api.post(`/api/outbound/campaigns/${selectedCampaignId}/clone`);
      toast.success("Campaign cloned.");
      setSelectedCampaignId(response.data?.id || null);
      campaignsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to clone campaign.");
    }
  }

  async function archiveCampaign() {
    if (!selectedCampaignId || !window.confirm("Archive this campaign?")) {
      return;
    }
    try {
      await api.post(`/api/outbound/campaigns/${selectedCampaignId}/archive`);
      toast.success("Campaign archived.");
      campaignsQuery.refetch();
      detailsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to archive campaign.");
    }
  }

  async function deleteCampaign() {
    if (!selectedCampaignId || !window.confirm("Delete this campaign?")) {
      return;
    }
    try {
      await api.delete(`/api/outbound/campaigns/${selectedCampaignId}`);
      toast.success("Campaign deleted.");
      setSelectedCampaignId(null);
      campaignsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to delete campaign.");
    }
  }

  async function downloadSampleCsv() {
    try {
      const response = await downloadBlob("/api/outbound/sample.csv");
      downloadBrowserFile(response.data, "outbound_sample_leads.csv");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to download sample CSV.");
    }
  }

  async function importLeads() {
    if (!selectedCampaignId || !leadFile) {
      return;
    }
    setImportingLeads(true);
    try {
      const formData = new FormData();
      formData.append("file", leadFile);
      const response = await api.post(
        `/api/outbound/campaigns/${selectedCampaignId}/leads/import`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      toast.success(
        `Imported ${response.data.accepted} leads, duplicates ${response.data.duplicates}, rejected ${response.data.rejected}.`,
      );
      setLeadFile(null);
      leadsQuery.refetch();
      statsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Lead import failed.");
    } finally {
      setImportingLeads(false);
    }
  }

  async function mutateLead(leadId, action, body = {}) {
    try {
      if (action === "delete") {
        await api.delete(`/api/outbound/leads/${leadId}`);
      } else {
        await api.post(`/api/outbound/leads/${leadId}/${action}`, body);
      }
      toast.success(`Lead ${action} completed.`);
      leadsQuery.refetch();
      statsQuery.refetch();
    } catch (err) {
      toast.error(err?.response?.data?.detail || `Failed to ${action} lead.`);
    }
  }

  if (campaignsQuery.isLoading) {
    return (
      <AppShell>
        <LoadingBlock label="Loading Campaigns" />
      </AppShell>
    );
  }

  const campaigns = campaignsQuery.data || [];
  const leads = leadsQuery.data?.items || leadsQuery.data?.leads || [];
  const stats = statsQuery.data || {};
  const leadStates = stats.lead_states || {};

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Outbound Voice Campaigns"
          title="Scheduling"
          description="Manage campaigns, import leads, monitor dial progress, and control the campaign lifecycle directly from the new UI."
          actions={
            <>
              <PillButton onClick={() => campaignsQuery.refetch()}>
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className={campaignsQuery.isFetching ? "animate-spin" : ""} />
                  Refresh
                </span>
              </PillButton>
              <PillButton variant="solid" onClick={openCreateModal}>
                <span className="flex items-center gap-2">
                  <Plus size={14} />
                  New Campaign
                </span>
              </PillButton>
            </>
          }
        />

        <div className="grid gap-6 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-4">
            <Card className="rounded-[28px] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#838282]">
                    Campaigns
                  </p>
                  <p className="mt-2 text-sm text-[#666666]">
                    Server time zone: {metaQuery.data?.server_timezone || "UTC"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#838282]">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(event) => setShowArchived(event.target.checked)}
                    className="accent-[#111111]"
                  />
                  Show Archived
                </label>
              </div>
            </Card>

            {campaigns.length ? (
              campaigns.map((campaign) => (
                <button
                  type="button"
                  key={campaign.id}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  className="w-full text-left"
                >
                  <Card
                    className={`rounded-[28px] p-5 ${campaign.id === selectedCampaignId ? "border-[#111111] bg-white" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{campaign.name}</p>
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#838282]">
                          {campaign.timezone} • {campaign.daily_window_start_local} - {campaign.daily_window_end_local}
                        </p>
                      </div>
                      <span className="rounded-full border border-[#111111]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">
                        {campaign.status}
                      </span>
                    </div>
                  </Card>
                </button>
              ))
            ) : (
              <EmptyState
                title="No Campaigns Yet"
                description="Create the first outbound campaign to begin importing leads and managing dial attempts."
                actionLabel="New Campaign"
                onAction={openCreateModal}
              />
            )}
          </div>

          <div className="space-y-6 xl:col-span-8">
            {selectedCampaign ? (
              <>
                <Card className="rounded-[32px] p-8">
                  <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#838282]">
                        Selected Campaign
                      </p>
                      <h2 className="mt-3 font-clash-display text-4xl font-bold uppercase">
                        {selectedCampaign.name}
                      </h2>
                      <p className="mt-3 text-sm text-[#666666]">
                        Context: {selectedCampaign.default_context || "default"} •
                        Time zone: {selectedCampaign.timezone}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PillButton onClick={openEditModal}>
                        <span className="flex items-center gap-2">
                          <Save size={14} />
                          Edit
                        </span>
                      </PillButton>
                      <PillButton onClick={cloneCampaign}>
                        <span className="flex items-center gap-2">
                          <Copy size={14} />
                          Clone
                        </span>
                      </PillButton>
                      <PillButton onClick={archiveCampaign}>
                        <span className="flex items-center gap-2">
                          <Archive size={14} />
                          Archive
                        </span>
                      </PillButton>
                      <PillButton onClick={deleteCampaign}>
                        <span className="flex items-center gap-2">
                          <Trash2 size={14} />
                          Delete
                        </span>
                      </PillButton>
                    </div>
                  </div>

                  <div className="mt-8 grid gap-4 md:grid-cols-4">
                    <Stat label="Total Leads" value={formatNumber(Object.values(leadStates).reduce((acc, count) => acc + Number(count || 0), 0))} />
                    <Stat label="Pending" value={formatNumber(leadStates.pending || 0)} />
                    <Stat label="Completed" value={formatNumber(leadStates.completed || 0)} />
                    <Stat label="Canceled" value={formatNumber(leadStates.canceled || 0)} />
                  </div>

                  <div className="mt-8 flex flex-wrap gap-2">
                    <PillButton
                      variant="solid"
                      onClick={() => updateStatus("running")}
                    >
                      <span className="flex items-center gap-2">
                        <Play size={14} />
                        Start
                      </span>
                    </PillButton>
                    <PillButton onClick={() => updateStatus("paused")}>
                      <span className="flex items-center gap-2">
                        <Pause size={14} />
                        Pause
                      </span>
                    </PillButton>
                    <PillButton onClick={() => updateStatus("stopped", true)}>
                      <span className="flex items-center gap-2">
                        <Square size={14} />
                        Stop
                      </span>
                    </PillButton>
                  </div>
                </Card>

                <Card className="rounded-[32px] p-8">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#838282]">
                        Leads
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <label className="relative block">
                          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#bfbfbf]" />
                          <input
                            value={leadQuery}
                            onChange={(event) => setLeadQuery(event.target.value)}
                            placeholder="Search leads..."
                            className="border border-[#111111]/10 bg-white py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#111111]"
                          />
                        </label>
                        <PillButton onClick={() => leadsQuery.refetch()}>Search</PillButton>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => setLeadFile(event.target.files?.[0] || null)}
                        className="max-w-[220px] text-sm"
                      />
                      <PillButton onClick={downloadSampleCsv}>
                        <span className="flex items-center gap-2">
                          <RotateCcw size={14} />
                          Sample CSV
                        </span>
                      </PillButton>
                      <PillButton
                        variant="solid"
                        onClick={importLeads}
                        disabled={!leadFile || importingLeads}
                      >
                        <span className="flex items-center gap-2">
                          <Upload size={14} />
                          {importingLeads ? "Importing..." : "Import Leads"}
                        </span>
                      </PillButton>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left">
                      <thead className="border-b border-[#111111]/10">
                        <tr>
                          {["Name", "Phone", "State", "Attempts", "Context", "Actions"].map((header) => (
                            <th
                              key={header}
                              className="px-3 py-3 text-[10px] font-bold uppercase tracking-[0.28em] text-[#838282]"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.map((lead) => (
                          <tr key={lead.id} className="border-b border-[#111111]/5">
                            <td className="px-3 py-3 text-sm font-bold">{lead.name || "Unnamed"}</td>
                            <td className="px-3 py-3 text-sm">{lead.phone_number}</td>
                            <td className="px-3 py-3 text-sm">{lead.state}</td>
                            <td className="px-3 py-3 text-sm">{lead.attempt_count}</td>
                            <td className="px-3 py-3 text-sm">{lead.context_override || selectedCampaign.default_context}</td>
                            <td className="px-3 py-3">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-full p-2 transition-colors hover:bg-[#111111] hover:text-white"
                                  onClick={() => mutateLead(lead.id, "recycle", { mode: "redial" })}
                                >
                                  <RotateCcw size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full p-2 transition-colors hover:bg-[#111111] hover:text-white"
                                  onClick={() => mutateLead(lead.id, "ignore")}
                                >
                                  <Archive size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full p-2 transition-colors hover:bg-red-500 hover:text-white"
                                  onClick={() => mutateLead(lead.id, "delete")}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            ) : (
              <EmptyState
                title="Select a Campaign"
                description="Choose a campaign from the left side to view lead stats, start or pause dialing, and manage imported leads."
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        title={campaignMode === "create" ? "New Campaign" : "Edit Campaign"}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" value={campaignForm.name} onChange={(value) => setCampaignForm((prev) => ({ ...prev, name: value }))} />
          <SelectField
            label="Time Zone"
            value={campaignForm.timezone}
            options={metaQuery.data?.iana_timezones?.slice(0, 400) || ["UTC"]}
            onChange={(value) => setCampaignForm((prev) => ({ ...prev, timezone: value }))}
          />
          <Field
            label="Daily Window Start"
            type="time"
            value={campaignForm.daily_window_start_local}
            onChange={(value) =>
              setCampaignForm((prev) => ({ ...prev, daily_window_start_local: value }))
            }
          />
          <Field
            label="Daily Window End"
            type="time"
            value={campaignForm.daily_window_end_local}
            onChange={(value) =>
              setCampaignForm((prev) => ({ ...prev, daily_window_end_local: value }))
            }
          />
          <Field
            label="Max Concurrent"
            type="number"
            value={campaignForm.max_concurrent}
            onChange={(value) => setCampaignForm((prev) => ({ ...prev, max_concurrent: Number(value) }))}
          />
          <Field
            label="Min Interval Seconds"
            type="number"
            value={campaignForm.min_interval_seconds_between_calls}
            onChange={(value) =>
              setCampaignForm((prev) => ({
                ...prev,
                min_interval_seconds_between_calls: Number(value),
              }))
            }
          />
          <Field
            label="Default Context"
            value={campaignForm.default_context}
            onChange={(value) => setCampaignForm((prev) => ({ ...prev, default_context: value }))}
          />
          <Field
            label="Consent Timeout Seconds"
            type="number"
            value={campaignForm.consent_timeout_seconds}
            onChange={(value) =>
              setCampaignForm((prev) => ({ ...prev, consent_timeout_seconds: Number(value) }))
            }
          />
          <Toggle
            label="Voicemail Drop Enabled"
            checked={Boolean(campaignForm.voicemail_drop_enabled)}
            onChange={(checked) =>
              setCampaignForm((prev) => ({ ...prev, voicemail_drop_enabled: checked }))
            }
          />
          <Toggle
            label="Consent Enabled"
            checked={Boolean(campaignForm.consent_enabled)}
            onChange={(checked) =>
              setCampaignForm((prev) => ({ ...prev, consent_enabled: checked }))
            }
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <PillButton onClick={() => setCampaignModalOpen(false)}>Cancel</PillButton>
          <PillButton variant="solid" onClick={saveCampaign}>
            Save Campaign
          </PillButton>
        </div>
      </Modal>
    </AppShell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-[24px] border border-[#111111]/10 bg-white px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#838282]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#838282]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-[#111111]/10 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#111111]"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="block space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#838282]">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-[#111111]/10 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-[#111111]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between rounded-[20px] border border-[#111111]/10 bg-white px-4 py-3">
      <span className="text-sm font-bold">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#111111]"
      />
    </label>
  );
}
