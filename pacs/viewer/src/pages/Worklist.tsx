import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getWorklist, formatPatientName, formatDate, type WorklistStudy } from '../api/pacs';
import {
  Monitor, LogOut, RefreshCw, AlertTriangle, ChevronRight,
  Clock, CheckCircle, Eye, Filter, Download,
} from 'lucide-react';
import clsx from 'clsx';

const PRIORITY_STYLE: Record<string, string> = {
  STAT:    'bg-red-900/40 text-red-300 border-red-800/50',
  URGENT:  'bg-orange-900/40 text-orange-300 border-orange-800/50',
  ROUTINE: 'bg-pacs-panel text-pacs-muted border-pacs-border',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  UNREAD:      <Clock className="w-3.5 h-3.5 text-blue-400" />,
  IN_PROGRESS: <Eye className="w-3.5 h-3.5 text-yellow-400" />,
  COMPLETED:   <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  UNREAD:      'Unread',
  IN_PROGRESS: 'In Progress',
  COMPLETED:   'Completed',
};

const MODALITY_COLOR: Record<string, string> = {
  CT: 'text-cyan-400',
  MR: 'text-violet-400',
  CR: 'text-lime-400',
  DR: 'text-lime-400',
  MG: 'text-pink-400',
  US: 'text-orange-400',
  NM: 'text-yellow-400',
  PT: 'text-yellow-400',
};

export default function Worklist() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [studies, setStudies] = useState<WorklistStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modalityFilter, setModalityFilter] = useState('ALL');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getWorklist();
      setStudies(data);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message;
      setError(msg || 'Failed to load worklist');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = studies.filter(s => {
    if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
    if (modalityFilter !== 'ALL' && s.modality !== modalityFilter) return false;
    return true;
  });

  const modalities = [...new Set(studies.map(s => s.modality))].sort();
  const unreadCount = studies.filter(s => s.status === 'UNREAD').length;
  const statCount   = studies.filter(s => s.priority === 'STAT').length;

  return (
    <div className="flex flex-col h-screen bg-pacs-bg overflow-hidden">

      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 bg-pacs-surface border-b border-pacs-border shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-pacs-accent" />
          <div>
            <span className="text-sm font-semibold text-pacs-text">CareConnect PACS</span>
            <span className="text-pacs-muted text-sm ml-2">Radiology Worklist</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {statCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-900/30 border border-red-800/40 rounded-full px-3 py-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs font-medium text-red-300">{statCount} STAT</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-pacs-text-dim">{user?.name}</span>
            <span className="text-xs text-pacs-muted">·</span>
            <span className="text-xs text-pacs-muted">{user?.title}</span>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-pacs-hover text-pacs-muted hover:text-pacs-text transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Sub-toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-pacs-panel border-b border-pacs-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-pacs-muted">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-xs uppercase tracking-wider">Filter</span>
          </div>

          {/* Status filter */}
          <div className="flex gap-1">
            {['ALL', 'UNREAD', 'IN_PROGRESS', 'COMPLETED'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-pacs-accent text-white'
                    : 'bg-pacs-panel border border-pacs-border text-pacs-muted hover:text-pacs-text'
                )}
              >
                {s === 'ALL' ? 'All' : (STATUS_LABEL[s] ?? s)}
              </button>
            ))}
          </div>

          {/* Modality filter */}
          <div className="flex gap-1">
            {['ALL', ...modalities].map(m => (
              <button
                key={m}
                onClick={() => setModalityFilter(m)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  modalityFilter === m
                    ? 'bg-pacs-accent text-white'
                    : 'bg-pacs-panel border border-pacs-border text-pacs-muted hover:text-pacs-text'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-pacs-muted">
            {filtered.length} study{filtered.length !== 1 ? 'ies' : 'y'}
            {unreadCount > 0 && <> · <span className="text-blue-400">{unreadCount} unread</span></>}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded hover:bg-pacs-hover text-pacs-muted hover:text-pacs-text transition-colors disabled:opacity-50"
            title="Refresh worklist"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto pacs-scroll">
        {error && (
          <div className="m-4 flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 text-sm font-medium">Unable to load worklist</p>
              <p className="text-red-400/70 text-xs mt-1">{error}</p>
              <p className="text-pacs-muted text-xs mt-1">Ensure the PACS server is running at <code className="text-pacs-text font-mono">http://localhost:3021</code></p>
            </div>
          </div>
        )}

        {!error && loading && (
          <div className="flex items-center justify-center h-40">
            <div className="flex items-center gap-2 text-pacs-muted">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading worklist…</span>
            </div>
          </div>
        )}

        {!error && !loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-pacs-muted">
            <CheckCircle className="w-8 h-8 mb-2 text-pacs-border" />
            <p className="text-sm">No studies match the current filter</p>
          </div>
        )}

        {!error && !loading && filtered.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left bg-pacs-surface border-b border-pacs-border sticky top-0 z-10">
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider">Patient</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider">Study</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-16">Mod</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-24">Date</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-20">Images</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-20">Priority</th>
                <th className="px-4 py-2.5 text-xs font-medium text-pacs-muted uppercase tracking-wider w-28">Status</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((study, idx) => (
                <tr
                  key={study.studyInstanceUID}
                  onClick={() => navigate(`/viewer/${study.studyInstanceUID}`)}
                  className={clsx(
                    'border-b border-pacs-border/50 cursor-pointer group transition-colors',
                    study.priority === 'STAT' ? 'hover:bg-red-950/20' : 'hover:bg-pacs-hover',
                    study.status === 'COMPLETED' && 'opacity-60'
                  )}
                >
                  <td className="px-4 py-3 text-pacs-muted text-xs">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-pacs-text">{formatPatientName(study.patientName)}</p>
                    <p className="text-xs text-pacs-muted mt-0.5">ID: {study.patientID} · Acc: {study.accessionNumber}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-pacs-text">{study.studyDescription}</p>
                    <p className="text-xs text-pacs-muted mt-0.5">{study.institution}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('font-bold text-sm', MODALITY_COLOR[study.modality] ?? 'text-pacs-text-dim')}>
                      {study.modality}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-pacs-text-dim text-xs">{formatDate(study.studyDate)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {study.hasImages
                        ? <span className="text-pacs-text-dim text-xs">{study.numberOfImages}</span>
                        : (
                          <span className="flex items-center gap-1 text-pacs-muted text-xs" title="Download sample images to view">
                            <Download className="w-3 h-3" />
                            demo
                          </span>
                        )
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'px-2 py-0.5 rounded text-xs border font-medium',
                      PRIORITY_STYLE[study.priority] ?? PRIORITY_STYLE.ROUTINE
                    )}>
                      {study.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[study.status]}
                      <span className="text-xs text-pacs-text-dim">{STATUS_LABEL[study.status] ?? study.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="w-4 h-4 text-pacs-border group-hover:text-pacs-accent transition-colors" />
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
