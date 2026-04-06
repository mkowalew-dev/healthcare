import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { labsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { LabStatusBadge } from '../../components/ui/Badge';
import { LabResult } from '../../types';
import { FlaskConical, AlertTriangle, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function LabResults() {
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'abnormal' | 'pending'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    labsApi.list().then(res => setLabs(res.data)).finally(() => setLoading(false));
  }, []);

  const filtered = labs.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'abnormal') return l.status === 'abnormal' || l.status === 'critical';
    return l.status === 'pending';
  });

  // Group by panel
  const grouped = filtered.reduce((acc, lab) => {
    const panel = lab.panel_name || 'Other Tests';
    if (!acc[panel]) acc[panel] = [];
    acc[panel].push(lab);
    return acc;
  }, {} as Record<string, LabResult[]>);

  // Get trend data for A1C
  const a1cTrend = labs
    .filter(l => l.test_code === 'A1C' && l.resulted_at && l.value)
    .sort((a, b) => a.resulted_at!.localeCompare(b.resulted_at!))
    .map(l => ({
      date: format(parseISO(l.resulted_at!), 'MM/dd'),
      value: parseFloat(l.value!),
    }));

  if (loading) return <PageLoader />;

  const abnormalCount = labs.filter(l => l.status === 'abnormal' || l.status === 'critical').length;
  const pendingCount = labs.filter(l => l.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Test Results</h1>
        <p className="text-sm text-gray-500 mt-0.5">Lab work and diagnostic results</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Results</div>
          <div className="text-2xl font-bold text-gray-900">{labs.filter(l => l.status !== 'pending').length}</div>
        </div>
        <div className="stat-card border-l-4 border-l-cisco-orange">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Abnormal</div>
          <div className="text-2xl font-bold text-cisco-orange">{abnormalCount}</div>
        </div>
        <div className="stat-card border-l-4 border-l-gray-300">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pending</div>
          <div className="text-2xl font-bold text-gray-500">{pendingCount}</div>
        </div>
      </div>

      {/* A1C Trend Chart */}
      {a1cTrend.length > 1 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-cisco-blue" />
            <h2 className="font-semibold text-gray-900">HbA1c Trend</h2>
            <span className="text-xs text-gray-400 ml-auto">Target: &lt; 7.0%</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={a1cTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}%`, 'HbA1c']} />
              <Line type="monotone" dataKey="value" stroke="#049FD9" strokeWidth={2} dot={{ fill: '#049FD9', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'abnormal', 'pending'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-cisco-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            data-testid={`filter-${f}`}
          >
            {f === 'all' ? 'All Results' : f}
          </button>
        ))}
      </div>

      {/* Results grouped by panel */}
      {Object.entries(grouped).map(([panel, panelLabs]) => (
        <div key={panel} className="card overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <FlaskConical size={15} className="text-cisco-blue" />
            <h3 className="font-semibold text-gray-800 text-sm">{panel}</h3>
            <span className="text-xs text-gray-400 ml-auto">{panelLabs.length} test(s)</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Result</th>
                <th>Reference Range</th>
                <th>Provider</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {panelLabs.map((lab) => (
                <>
                  <tr
                    key={lab.id}
                    className={`cursor-pointer ${lab.status === 'critical' ? 'bg-red-50' : ''}`}
                    onClick={() => setExpanded(expanded === lab.id ? null : lab.id)}
                    data-testid={`lab-row-${lab.id}`}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        {(lab.status === 'critical' || lab.status === 'abnormal') && (
                          <AlertTriangle size={14} className={lab.status === 'critical' ? 'text-cisco-red' : 'text-cisco-orange'} />
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{lab.test_name}</div>
                          {lab.test_code && <div className="text-xs text-gray-400 font-mono">{lab.test_code}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {lab.value ? (
                        <span className={`font-mono font-semibold ${
                          lab.status === 'critical' ? 'text-cisco-red' :
                          lab.status === 'abnormal' ? 'text-cisco-orange' : 'text-gray-800'
                        }`}>
                          {lab.value} {lab.unit}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="text-gray-500 text-xs">{lab.reference_range || '—'}</td>
                    <td className="text-gray-500 text-xs">
                      {lab.provider_last ? `Dr. ${lab.provider_first} ${lab.provider_last}` : '—'}
                    </td>
                    <td className="text-gray-500 text-xs">
                      {lab.resulted_at ? format(parseISO(lab.resulted_at), 'MM/dd/yyyy') :
                       lab.ordered_at ? `Ordered ${format(parseISO(lab.ordered_at), 'MM/dd')}` : '—'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <LabStatusBadge status={lab.status} />
                        {expanded === lab.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                      </div>
                    </td>
                  </tr>
                  {expanded === lab.id && lab.notes && (
                    <tr key={`${lab.id}-notes`}>
                      <td colSpan={6} className="bg-amber-50 px-8 py-3">
                        <div className="text-xs font-medium text-amber-800 mb-1">Clinical Notes</div>
                        <div className="text-sm text-amber-900">{lab.notes}</div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="card p-12 text-center">
          <FlaskConical size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No results found</p>
        </div>
      )}
    </div>
  );
}
