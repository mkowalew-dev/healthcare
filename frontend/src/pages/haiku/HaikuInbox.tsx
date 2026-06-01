import { useState, useEffect, useCallback } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { haikuApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { AlertTriangle, MessageSquare, RefreshCw, Check, ChevronRight } from 'lucide-react';

interface InboxData {
  messages: Array<{
    id: string; subject: string; body: string; sent_at: string;
    sender_name: string; sender_role: string;
  }>;
  critical_labs: Array<{
    id: string; test_name: string; panel_name: string; value: string; unit: string;
    reference_range: string; status: 'critical' | 'abnormal'; resulted_at: string;
    patient_id: string; patient_first: string; patient_last: string; mrn: string;
  }>;
  refill_requests: Array<{
    id: string; name: string; dosage: string; frequency: string;
    patient_id: string; patient_first: string; patient_last: string; mrn: string;
  }>;
  badge_count: number;
}

type Tab = 'labs' | 'messages' | 'refills';

export default function HaikuInbox() {
  const { profile } = useAuth();
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('labs');
  const [acknowledging, setAcknowledging] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await haikuApi.inbox();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (labId: string) => {
    setAcknowledging(prev => new Set(prev).add(labId));
    try {
      await haikuApi.acknowledgeLab(labId);
      setData(prev => prev ? {
        ...prev,
        critical_labs: prev.critical_labs.filter(l => l.id !== labId),
      } : prev);
    } finally {
      setAcknowledging(prev => { const s = new Set(prev); s.delete(labId); return s; });
    }
  };

  const markRead = async (msgId: string) => {
    try {
      await haikuApi.markMessageRead(msgId);
      setData(prev => prev ? {
        ...prev,
        messages: prev.messages.filter(m => m.id !== msgId),
      } : prev);
    } catch { /* ignore */ }
  };

  const provider = profile as { first_name?: string; last_name?: string };
  const criticalCount  = data?.critical_labs.filter(l => l.status === 'critical').length ?? 0;
  const abnormalCount  = data?.critical_labs.filter(l => l.status === 'abnormal').length ?? 0;
  const unreadCount    = data?.messages.length ?? 0;
  const refillCount    = data?.refill_requests.length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="bg-[#0d274d] px-4 pt-12 pb-4">
        <p className="text-white/50 text-xs mb-0.5">In-Basket</p>
        <h1 className="text-white text-xl font-bold">
          Dr. {provider?.last_name}
        </h1>
        {data && (
          <p className="text-white/60 text-xs mt-1">
            {criticalCount > 0 && <span className="text-red-300 font-semibold">{criticalCount} critical · </span>}
            {abnormalCount > 0 && <span className="text-orange-300">{abnormalCount} abnormal · </span>}
            {unreadCount} messages
          </p>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-white border-b border-gray-200 sticky top-0 z-10">
        {(['labs', 'messages', 'refills'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-[#0d274d] text-[#0d274d]' : 'border-transparent text-gray-400'
            }`}
          >
            {t === 'labs' && `Labs${data ? ` (${data.critical_labs.length})` : ''}`}
            {t === 'messages' && `Messages${data ? ` (${unreadCount})` : ''}`}
            {t === 'refills' && `Refills${data ? ` (${refillCount})` : ''}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {/* Refresh button */}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs text-gray-400 ml-auto"
          >
            <RefreshCw size={12} /> Refresh
          </button>

          {/* Labs tab */}
          {tab === 'labs' && (
            <>
              {data?.critical_labs.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Check size={32} className="mx-auto mb-2 text-green-400" />
                  <p className="text-sm">All lab results reviewed</p>
                </div>
              )}
              {data?.critical_labs.map(lab => (
                <div
                  key={lab.id}
                  className={`bg-white rounded-2xl p-4 shadow-sm border-l-4 ${
                    lab.status === 'critical' ? 'border-red-500' : 'border-orange-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        size={16}
                        className={lab.status === 'critical' ? 'text-red-500' : 'text-orange-400'}
                      />
                      <span
                        className={`text-xs font-bold uppercase tracking-wide ${
                          lab.status === 'critical' ? 'text-red-500' : 'text-orange-500'
                        }`}
                      >
                        {lab.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {lab.resulted_at ? formatDistanceToNow(parseISO(lab.resulted_at), { addSuffix: true }) : '—'}
                    </span>
                  </div>

                  <p className="font-semibold text-gray-900 mt-1.5 text-sm">{lab.test_name}</p>
                  <p className="text-gray-500 text-xs">{lab.panel_name}</p>

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-lg font-bold text-gray-900">{lab.value}</span>
                    <span className="text-gray-400 text-sm">{lab.unit}</span>
                    {lab.reference_range && (
                      <span className="text-xs text-gray-400">ref: {lab.reference_range}</span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mt-1.5">
                    {lab.patient_first} {lab.patient_last} · MRN {lab.mrn}
                  </p>

                  <button
                    onClick={() => acknowledge(lab.id)}
                    disabled={acknowledging.has(lab.id)}
                    className="mt-3 w-full bg-[#0d274d] text-white rounded-xl py-2 text-sm font-medium active:scale-95 transition-transform disabled:opacity-50"
                  >
                    {acknowledging.has(lab.id) ? 'Signing…' : 'Sign Result'}
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Messages tab */}
          {tab === 'messages' && (
            <>
              {unreadCount === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <MessageSquare size={32} className="mx-auto mb-2 text-blue-200" />
                  <p className="text-sm">No unread messages</p>
                </div>
              )}
              {data?.messages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => markRead(msg.id)}
                  className="w-full bg-white rounded-2xl p-4 shadow-sm text-left flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-[#0d274d]/10 flex items-center justify-center shrink-0 text-[#0d274d] font-semibold text-sm">
                    {msg.sender_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900 text-sm truncate">{msg.sender_name}</p>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatDistanceToNow(parseISO(msg.sent_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 truncate mt-0.5">{msg.subject}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{msg.body}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0 mt-1" />
                </button>
              ))}
            </>
          )}

          {/* Refills tab */}
          {tab === 'refills' && (
            <>
              {refillCount === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Check size={32} className="mx-auto mb-2 text-green-400" />
                  <p className="text-sm">No pending refill requests</p>
                </div>
              )}
              {data?.refill_requests.map(rx => (
                <div key={rx.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="font-semibold text-gray-900 text-sm">{rx.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rx.dosage} · {rx.frequency}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {rx.patient_first} {rx.patient_last} · MRN {rx.mrn}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button className="flex-1 bg-[#0d274d] text-white rounded-xl py-2 text-sm font-medium active:scale-95 transition-transform">
                      Approve
                    </button>
                    <button className="flex-1 border border-gray-200 text-gray-600 rounded-xl py-2 text-sm font-medium active:scale-95 transition-transform">
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
