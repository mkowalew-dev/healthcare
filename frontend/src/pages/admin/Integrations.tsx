import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { eprescribeApi, labOrderApi, notificationsApi, fhirApi } from '../../services/api';
import api from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import {
  Zap, CheckCircle, XCircle, RefreshCw, Bell, FlaskConical,
  Pill, Code2, Send, AlertTriangle, Clock, Activity, Sliders,
} from 'lucide-react';

const MOCK_BASE = (import.meta.env.VITE_MOCK_URL as string) || 'http://localhost:3002';

const SVC_LABELS: Record<string, { label: string; color: string }> = {
  surescripts: { label: 'Surescripts', color: 'text-purple-600' },
  quest:       { label: 'Quest LIS',   color: 'text-blue-600' },
  labcorp:     { label: 'LabCorp LIS', color: 'text-cyan-600' },
  twilio:      { label: 'Twilio SMS',  color: 'text-green-600' },
  sendgrid:    { label: 'SendGrid',    color: 'text-yellow-600' },
};

interface IntegrationCheck {
  vendor?: string;
  integration?: string;
  url: string;
  reachable: boolean;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
  checkedAt?: string;
}

interface IntegrationCard {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  checks: IntegrationCheck[];
  loading: boolean;
  lastChecked?: string;
}

export default function Integrations() {
  const [cards, setCards] = useState<Record<string, IntegrationCard>>({
    surescripts: {
      id: 'surescripts', name: 'Surescripts ePrescribing', icon: Pill, color: 'text-purple-600',
      description: 'SCRIPT 10.6 — Routes e-prescriptions to 67,000+ pharmacy locations nationwide',
      checks: [], loading: false,
    },
    lis: {
      id: 'lis', name: 'LIS Integration', icon: FlaskConical, color: 'text-blue-600',
      description: 'Quest Diagnostics & LabCorp — Routes lab orders and retrieves results via HL7 ORM',
      checks: [], loading: false,
    },
    notifications: {
      id: 'notifications', name: 'Patient Notifications', icon: Bell, color: 'text-green-600',
      description: 'Twilio SMS & SendGrid Email — Appointment reminders, critical lab alerts, Rx confirmations',
      checks: [], loading: false,
    },
    fhir: {
      id: 'fhir', name: 'FHIR R4 API', icon: Code2, color: 'text-orange-600',
      description: 'HL7 FHIR R4 — Patient, Observation, MedicationRequest, DiagnosticReport resources',
      checks: [], loading: false,
    },
  });

  const [notifStats, setNotifStats] = useState<any>(null);
  const [recentNotifs, setRecentNotifs] = useState<any[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [fhirPreview, setFhirPreview] = useState<any>(null);
  const [fhirLoading, setFhirLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [mockConfig, setMockConfig] = useState<Record<string, any>>({});
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const fetchMockConfig = useCallback(async () => {
    try {
      const res = await fetch(`${MOCK_BASE}/config`);
      if (res.ok) setMockConfig(await res.json());
    } catch { /* mock server not running */ }
  }, []);

  const saveMockConfig = async (updates: Record<string, any>) => {
    setConfigSaving(true);
    try {
      await fetch(`${MOCK_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      setMockConfig(prev => {
        const next = { ...prev };
        for (const [svc, vals] of Object.entries(updates)) {
          next[svc] = { ...next[svc], ...vals };
        }
        return next;
      });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } finally {
      setConfigSaving(false);
    }
  };

  const checkAll = useCallback(async () => {
    const [surescriptsRes, lisRes, notifRes, fhirRes] = await Promise.allSettled([
      eprescribeApi.integrationStatus(),
      labOrderApi.integrationStatus(),
      notificationsApi.integrationStatus(),
      fhirApi.integrationStatus(),
    ]);

    setCards(prev => ({
      ...prev,
      surescripts: {
        ...prev.surescripts,
        loading: false,
        checks: surescriptsRes.status === 'fulfilled' ? [surescriptsRes.value.data] : [{ vendor: 'Surescripts', url: '', reachable: false, latencyMs: 0, error: 'Check failed' }],
        lastChecked: new Date().toISOString(),
      },
      lis: {
        ...prev.lis,
        loading: false,
        checks: lisRes.status === 'fulfilled' ? lisRes.value.data.integrations : [],
        lastChecked: new Date().toISOString(),
      },
      notifications: {
        ...prev.notifications,
        loading: false,
        checks: notifRes.status === 'fulfilled' ? notifRes.value.data.integrations : [],
        lastChecked: new Date().toISOString(),
      },
      fhir: {
        ...prev.fhir,
        loading: false,
        checks: fhirRes.status === 'fulfilled' ? [fhirRes.value.data] : [{ integration: 'FHIR R4', url: '/fhir/metadata', reachable: false, latencyMs: 0, error: 'Check failed' }],
        lastChecked: new Date().toISOString(),
      },
    }));
  }, []);

  useEffect(() => {
    const init = async () => {
      setCards(prev => Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...v, loading: true }])
      ));
      await Promise.allSettled([
        checkAll(),
        fetchMockConfig(),
        notificationsApi.stats().then(r => setNotifStats(r.data)),
        notificationsApi.list({ }).then(r => setRecentNotifs(r.data.slice(0, 10))),
      ]);
      setPageLoading(false);
    };
    init();
  }, [checkAll, fetchMockConfig]);

  const handleRefresh = async (id: string) => {
    setCards(prev => ({ ...prev, [id]: { ...prev[id], loading: true } }));
    if (id === 'surescripts') {
      const res = await eprescribeApi.integrationStatus().catch(() => null);
      setCards(prev => ({ ...prev, surescripts: { ...prev.surescripts, loading: false, checks: res ? [res.data] : [], lastChecked: new Date().toISOString() } }));
    } else if (id === 'lis') {
      const res = await labOrderApi.integrationStatus().catch(() => null);
      setCards(prev => ({ ...prev, lis: { ...prev.lis, loading: false, checks: res ? res.data.integrations : [], lastChecked: new Date().toISOString() } }));
    } else if (id === 'notifications') {
      const res = await notificationsApi.integrationStatus().catch(() => null);
      setCards(prev => ({ ...prev, notifications: { ...prev.notifications, loading: false, checks: res ? res.data.integrations : [], lastChecked: new Date().toISOString() } }));
    } else if (id === 'fhir') {
      const res = await fhirApi.integrationStatus().catch(() => null);
      setCards(prev => ({ ...prev, fhir: { ...prev.fhir, loading: false, checks: res ? [res.data] : [{ integration: 'FHIR R4', url: '/fhir/metadata', reachable: false, latencyMs: 0, error: 'Unreachable' }], lastChecked: new Date().toISOString() } }));
    }
  };

  const handleTriggerNotification = async (type: string) => {
    setTriggering(type);
    setTriggerResult(null);
    try {
      const res = await notificationsApi.trigger(type);
      setTriggerResult({ type, ...res.data });
      const updated = await notificationsApi.list({});
      setRecentNotifs(updated.data.slice(0, 10));
    } catch {
      setTriggerResult({ type, error: 'Trigger failed' });
    } finally {
      setTriggering(null);
    }
  };

  const handleFhirPreview = async () => {
    setFhirLoading(true);
    try {
      const meta = await fhirApi.metadata();
      setFhirPreview(meta.data);
    } catch {
      setFhirPreview({ error: 'FHIR endpoint unavailable' });
    } finally {
      setFhirLoading(false);
    }
  };

  if (pageLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap size={24} className="text-cisco-blue" />
          Integration Health
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Monitor all external EHR integration dependencies — Surescripts, LIS, Twilio, SendGrid, FHIR</p>
      </div>

      {/* Summary stats */}
      {notifStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Notifications (7d)', value: notifStats.total, icon: Bell, color: 'text-cisco-blue' },
            { label: 'Sent', value: notifStats.sent, icon: CheckCircle, color: 'text-green-600' },
            { label: 'Failed', value: notifStats.failed, icon: XCircle, color: 'text-red-600' },
            { label: 'Critical Alerts', value: notifStats.critical_alerts, icon: AlertTriangle, color: 'text-red-600' },
            { label: 'Avg SMS Latency', value: notifStats.avg_sms_latency_ms ? `${notifStats.avg_sms_latency_ms}ms` : '—', icon: Activity, color: 'text-cisco-blue' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{s.label}</span>
                <s.icon size={16} className={s.color} />
              </div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Object.values(cards).map(card => {
          const Icon = card.icon;
          const allReachable = card.checks.length > 0 && card.checks.every(c => c.reachable);
          const anyFailed = card.checks.some(c => !c.reachable);

          return (
            <div key={card.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                      <Icon size={20} className={card.color} />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{card.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{card.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!card.loading && card.checks.length > 0 && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${allReachable ? 'bg-green-100 text-green-800' : anyFailed ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {allReachable ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {allReachable ? 'Healthy' : 'Degraded'}
                      </span>
                    )}
                    <button
                      onClick={() => handleRefresh(card.id)}
                      disabled={card.loading}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-cisco-blue hover:bg-blue-50"
                      title="Refresh"
                    >
                      <RefreshCw size={14} className={card.loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Integration endpoints */}
              <div className="p-5 space-y-3">
                {card.loading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-cisco-blue rounded-full animate-spin" />
                    Checking connectivity...
                  </div>
                ) : card.checks.length === 0 ? (
                  <div className="text-sm text-gray-400">No checks available</div>
                ) : (
                  card.checks.map((check, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {check.reachable
                          ? <CheckCircle size={14} className="text-green-500" />
                          : <XCircle size={14} className="text-red-500" />}
                        <span className="font-medium text-gray-700">{check.vendor || check.integration}</span>
                        <span className="text-xs text-gray-400 font-mono break-all">{check.url}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {check.httpStatus && (
                          <span className={`text-xs font-mono ${check.httpStatus < 400 ? 'text-green-700' : 'text-orange-600'}`}>
                            HTTP {check.httpStatus}
                          </span>
                        )}
                        <span className={`text-xs font-medium ${check.latencyMs < 200 ? 'text-green-700' : check.latencyMs < 500 ? 'text-yellow-700' : 'text-red-700'}`}>
                          {check.latencyMs}ms
                        </span>
                      </div>
                    </div>
                  ))
                )}
                {card.lastChecked && (
                  <div className="text-xs text-gray-400 flex items-center gap-1 mt-2">
                    <Clock size={10} />
                    Last checked {format(parseISO(card.lastChecked), 'HH:mm:ss')}
                  </div>
                )}

                {/* FHIR-specific action */}
                {card.id === 'fhir' && (
                  <div className="pt-2 border-t border-gray-100">
                    <button
                      onClick={handleFhirPreview}
                      disabled={fhirLoading}
                      className="text-xs text-cisco-blue hover:underline flex items-center gap-1"
                    >
                      {fhirLoading ? <div className="w-3 h-3 border border-cisco-blue border-t-transparent rounded-full animate-spin" /> : <Code2 size={12} />}
                      View CapabilityStatement
                    </button>
                    {fhirPreview && (
                      <pre className="mt-2 text-xs bg-gray-50 rounded p-2 overflow-auto max-h-32 text-gray-700">
                        {JSON.stringify(fhirPreview, null, 2).slice(0, 800)}...
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mock Chaos / Latency Control Panel */}
      {Object.keys(mockConfig).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Sliders size={16} className="text-cisco-blue" />
                Mock Simulation Controls
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Adjust per-service latency and failure rates live — no restart required. Use during a demo to show ThousandEyes detecting degradation.
              </p>
            </div>
            {configSaved && (
              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                <CheckCircle size={12} /> Saved
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4">Service</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4">Region</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4 w-36">Latency (ms)</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4 w-32">Jitter (ms)</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 pr-4 w-32">Failure Rate</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-2 w-32">Timeout Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(mockConfig).map(([svc, cfg]: [string, any]) => {
                  const meta = SVC_LABELS[svc] || { label: svc, color: 'text-gray-600' };
                  return (
                    <tr key={svc}>
                      <td className="py-2 pr-4">
                        <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-500">{cfg.region}</td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          className="form-input py-1 text-xs w-24"
                          defaultValue={cfg.latencyMs}
                          onBlur={e => saveMockConfig({ [svc]: { latencyMs: Number(e.target.value) } })}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          min="0"
                          max="2000"
                          className="form-input py-1 text-xs w-20"
                          defaultValue={cfg.jitterMs}
                          onBlur={e => saveMockConfig({ [svc]: { jitterMs: Number(e.target.value) } })}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            className="w-20 accent-red-500"
                            defaultValue={cfg.failureRate}
                            onMouseUp={e => saveMockConfig({ [svc]: { failureRate: Number((e.target as HTMLInputElement).value) } })}
                          />
                          <span className="text-xs text-gray-600 w-8">{Math.round(cfg.failureRate * 100)}%</span>
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            className="w-20 accent-orange-500"
                            defaultValue={cfg.timeoutRate}
                            onMouseUp={e => saveMockConfig({ [svc]: { timeoutRate: Number((e.target as HTMLInputElement).value) } })}
                          />
                          <span className="text-xs text-gray-600 w-8">{Math.round(cfg.timeoutRate * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'Simulate Surescripts Outage', config: { surescripts: { failureRate: 1.0, latencyMs: 50 } }, color: 'bg-red-100 text-red-800 hover:bg-red-200' },
              { label: 'Slow Quest Network', config: { quest: { latencyMs: 2500, jitterMs: 500 } }, color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' },
              { label: 'Twilio SMS Degraded', config: { twilio: { failureRate: 0.5, latencyMs: 800 } }, color: 'bg-orange-100 text-orange-800 hover:bg-orange-200' },
              { label: 'Reset All', config: { surescripts: { latencyMs: 180, jitterMs: 60, failureRate: 0, timeoutRate: 0 }, quest: { latencyMs: 240, jitterMs: 80, failureRate: 0, timeoutRate: 0 }, labcorp: { latencyMs: 310, jitterMs: 100, failureRate: 0, timeoutRate: 0 }, twilio: { latencyMs: 120, jitterMs: 40, failureRate: 0, timeoutRate: 0 }, sendgrid: { latencyMs: 95, jitterMs: 30, failureRate: 0, timeoutRate: 0 } }, color: 'bg-green-100 text-green-800 hover:bg-green-200' },
            ].map(preset => (
              <button
                key={preset.label}
                onClick={() => saveMockConfig(preset.config)}
                disabled={configSaving}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${preset.color}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notification Trigger Panel */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Send size={16} className="text-cisco-blue" />
          Trigger Automated Notifications
        </h2>
        <p className="text-sm text-gray-500 mb-4">Trigger bulk notifications to patients via Twilio SMS and SendGrid Email. Each trigger makes real outbound API calls observable by ThousandEyes.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { type: 'appointment_reminder', label: 'Appointment Reminders', description: 'Send 24h reminders to patients with upcoming appointments', icon: Clock, color: 'text-blue-600' },
            { type: 'lab_critical', label: 'Critical Lab Alerts', description: 'Alert patients with critical lab results from the last 24h', icon: AlertTriangle, color: 'text-red-600' },
            { type: 'prescription_ready', label: 'Rx Ready Notifications', description: 'Notify patients whose prescriptions were confirmed in the last hour', icon: Pill, color: 'text-purple-600' },
          ].map(n => {
            const NIcon = n.icon;
            return (
              <div key={n.type} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <NIcon size={16} className={n.color} />
                  <span className="font-medium text-sm text-gray-900">{n.label}</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{n.description}</p>
                <button
                  onClick={() => handleTriggerNotification(n.type)}
                  disabled={triggering !== null}
                  className="w-full btn-primary text-sm flex items-center justify-center gap-2 py-2"
                >
                  {triggering === n.type ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending via Twilio...
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Trigger
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {triggerResult && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${triggerResult.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
            {triggerResult.error
              ? `Error: ${triggerResult.error}`
              : `Sent ${triggerResult.sent} ${triggerResult.type.replace(/_/g, ' ')} notifications`
            }
          </div>
        )}
      </div>

      {/* Recent notification log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Notification Log</h2>
        </div>
        {recentNotifs.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No notifications sent yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Type</th>
                <th>Channel</th>
                <th>Status</th>
                <th>SMS Latency</th>
                <th>Email Latency</th>
                <th>Sent At</th>
              </tr>
            </thead>
            <tbody>
              {recentNotifs.map(n => (
                <tr key={n.id}>
                  <td className="font-medium">{n.patient_first} {n.patient_last}</td>
                  <td><span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{n.type.replace(/_/g, ' ')}</span></td>
                  <td className="text-xs text-gray-600 uppercase">{n.channel}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${n.status === 'sent' ? 'bg-green-100 text-green-800' : n.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                      {n.status === 'sent' ? <CheckCircle size={10} /> : n.status === 'failed' ? <XCircle size={10} /> : <Clock size={10} />}
                      {n.status}
                    </span>
                  </td>
                  <td className={`text-xs font-medium ${n.sms_latency_ms < 200 ? 'text-green-700' : n.sms_latency_ms < 500 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {n.sms_latency_ms ? `${n.sms_latency_ms}ms` : '—'}
                  </td>
                  <td className={`text-xs font-medium ${n.email_latency_ms < 200 ? 'text-green-700' : n.email_latency_ms < 500 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {n.email_latency_ms ? `${n.email_latency_ms}ms` : '—'}
                  </td>
                  <td className="text-xs text-gray-500">
                    {n.sent_at ? format(parseISO(n.sent_at), 'MM/dd HH:mm:ss') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
