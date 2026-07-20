import { useState, useEffect, useCallback } from 'react';
import { analyticsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BarChart2, Users, Globe, MousePointerClick, Wifi, RefreshCw,
  TrendingUp, TrendingDown, Minus, Monitor, Smartphone, Activity,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const APP_META: Record<string, { label: string; color: string; badge: string }> = {
  clinical: { label: 'CareConnect Clinical', color: '#049FD9', badge: 'bg-blue-100 text-blue-700' },
  mychart:  { label: 'MyChart Patient',      color: '#6EBE4A', badge: 'bg-green-100 text-green-700' },
  haiku:    { label: 'Haiku Mobile',         color: '#FBAB18', badge: 'bg-amber-100 text-amber-700' },
  pacs:     { label: 'PACS Viewer',          color: '#8B5CF6', badge: 'bg-purple-100 text-purple-700' },
  portal:   { label: 'Staff Portal',         color: '#1D4289', badge: 'bg-indigo-100 text-indigo-700' },
};

const APP_PIE_COLORS = Object.values(APP_META).map(m => m.color);

function AppBadge({ app }: { app: string }) {
  const meta = APP_META[app] ?? { label: app, badge: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${meta.badge}`}>
      {meta.label}
    </span>
  );
}

function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  return 'Browser';
}

function parseDevice(ua: string): 'mobile' | 'desktop' {
  return /iPhone|iPad|Android/i.test(ua) ? 'mobile' : 'desktop';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChangeChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${positive ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
      {positive ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      {Math.abs(value)}%
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  change?: number | null;
}

function StatCard({ label, value, sub, icon: Icon, iconColor, iconBg, change }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        {change !== undefined && <ChangeChip value={change ?? null} />}
      </div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
      <div className="text-sm font-medium text-gray-600 mt-0.5">{label}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

const RANGE_OPTS = [
  { label: '7 days',  value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const;

const APP_FILTER_OPTS = [
  { label: 'All apps', value: 'all' },
  { label: 'Clinical',  value: 'clinical' },
  { label: 'MyChart',   value: 'mychart' },
  { label: 'Haiku',     value: 'haiku' },
  { label: 'PACS',      value: 'pacs' },
  { label: 'Portal',    value: 'portal' },
] as const;

// ── Custom tooltip for AreaChart ──────────────────────────────────────────────

function AreaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs">
      <div className="font-semibold text-gray-700 mb-2">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Analytics() {
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [appFilter, setAppFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [rtLoading, setRtLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [overview, setOverview]       = useState<any>(null);
  const [timeseries, setTimeseries]   = useState<any[]>([]);
  const [topPages, setTopPages]       = useState<any[]>([]);
  const [topIPs, setTopIPs]           = useState<any[]>([]);
  const [appBreakdown, setAppBreakdown] = useState<any[]>([]);
  const [realtime, setRealtime]       = useState<any>(null);

  const [sortPage, setSortPage]   = useState<'pageviews' | 'sessions' | 'uniqueVisitors'>('pageviews');
  const [sortIP, setSortIP]       = useState<'pageviews' | 'sessions'>('pageviews');
  const [showAllPages, setShowAllPages] = useState(false);
  const [showAllIPs, setShowAllIPs]     = useState(false);

  const loadMain = useCallback(() => {
    setLoading(true);
    const appParam = appFilter === 'all' ? undefined : appFilter;
    Promise.all([
      analyticsApi.overview(days, appParam),
      analyticsApi.timeseries(days, appParam),
      analyticsApi.topPages(days, appParam),
      analyticsApi.topIPs(days, appParam),
      analyticsApi.apps(days),
    ]).then(([ov, ts, tp, ips, apps]) => {
      setOverview(ov.data);
      setTimeseries(ts.data.map((r: any) => ({
        ...r,
        date: format(parseISO(r.date), days === 90 ? 'MM/dd' : 'EEE MM/dd'),
      })));
      setTopPages(tp.data);
      setTopIPs(ips.data);
      setAppBreakdown(apps.data.map((r: any) => ({
        ...r,
        name: APP_META[r.app]?.label ?? r.app,
      })));
    }).finally(() => setLoading(false));
  }, [days, appFilter]);

  const loadRealtime = useCallback(() => {
    setRtLoading(true);
    analyticsApi.realtime()
      .then(r => { setRealtime(r.data); setLastRefresh(new Date()); })
      .finally(() => setRtLoading(false));
  }, []);

  useEffect(() => { loadMain(); }, [loadMain]);
  useEffect(() => {
    loadRealtime();
    const id = setInterval(loadRealtime, 30_000);
    return () => clearInterval(id);
  }, [loadRealtime]);

  if (loading) return <PageLoader />;

  const maxPages = Math.max(...topPages.map(p => p.pageviews), 1);
  const maxIPs   = Math.max(...topIPs.map(p => p.pageviews), 1);
  const totalPV  = appBreakdown.reduce((s, r) => s + r.pageviews, 0) || 1;

  const sortedPages = [...topPages]
    .sort((a, b) => b[sortPage] - a[sortPage])
    .slice(0, showAllPages ? undefined : 10);

  const sortedIPs = [...topIPs]
    .sort((a, b) => b[sortIP] - a[sortIP])
    .slice(0, showAllIPs ? undefined : 10);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time web analytics for the CareConnect ecosystem</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* App filter */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden divide-x divide-gray-200">
            {APP_FILTER_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setAppFilter(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  appFilter === opt.value
                    ? 'bg-cisco-blue text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden divide-x divide-gray-200">
            {RANGE_OPTS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === opt.value
                    ? 'bg-cisco-dark-blue text-white'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pageviews"
          value={fmt(overview?.pageviews ?? 0)}
          sub={`Last ${days} days`}
          icon={MousePointerClick}
          iconColor="text-cisco-blue"
          iconBg="bg-cisco-blue/10"
          change={overview?.changes?.pageviews}
        />
        <StatCard
          label="Sessions"
          value={fmt(overview?.sessions ?? 0)}
          sub="Unique browser sessions"
          icon={BarChart2}
          iconColor="text-cisco-dark-blue"
          iconBg="bg-cisco-dark-blue/10"
          change={overview?.changes?.sessions}
        />
        <StatCard
          label="Unique Visitors"
          value={fmt(overview?.uniqueVisitors ?? 0)}
          sub="Distinct IP addresses"
          icon={Globe}
          iconColor="text-cisco-green"
          iconBg="bg-cisco-green/10"
          change={overview?.changes?.uniqueVisitors}
        />
        <StatCard
          label="Authenticated Users"
          value={fmt(overview?.authenticatedUsers ?? 0)}
          sub="Logged-in accounts"
          icon={Users}
          iconColor="text-cisco-orange"
          iconBg="bg-cisco-orange/10"
        />
      </div>

      {/* ── Pageviews Over Time ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-cisco-blue" />
            <h2 className="font-semibold text-gray-900">Pageviews Over Time</h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cisco-blue inline-block rounded" /> Pageviews
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-cisco-dark-blue inline-block rounded" style={{ borderStyle: 'dashed' }} /> Sessions
            </span>
          </div>
        </div>

        {timeseries.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timeseries} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="10%" stopColor="#049FD9" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#049FD9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="10%" stopColor="#1D4289" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1D4289" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip content={<AreaTooltip />} />
              <Area
                type="monotone" dataKey="pageviews" name="Pageviews"
                stroke="#049FD9" strokeWidth={2} fill="url(#pvGrad)" dot={false}
              />
              <Area
                type="monotone" dataKey="sessions" name="Sessions"
                stroke="#1D4289" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#sessGrad)" dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No pageview data for the selected period" />
        )}
      </div>

      {/* ── Top Pages + App Breakdown ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

        {/* Top Pages */}
        <div className="xl:col-span-3 card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MousePointerClick size={16} className="text-cisco-blue" />
              <h2 className="font-semibold text-gray-900">Top Pages</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              Sort:
              {(['pageviews', 'sessions', 'uniqueVisitors'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setSortPage(k)}
                  className={`px-2 py-0.5 rounded ${sortPage === k ? 'bg-cisco-blue/10 text-cisco-blue font-medium' : 'hover:bg-gray-100'}`}
                >
                  {k === 'uniqueVisitors' ? 'Visitors' : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Page / Route</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Views</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide hidden sm:table-cell">Sessions</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide hidden md:table-cell">Visitors</th>
                </tr>
              </thead>
              <tbody>
                {sortedPages.length === 0 && (
                  <tr><td colSpan={4}><EmptyState message="No page data yet" /></td></tr>
                )}
                {sortedPages.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-400 w-5 flex-shrink-0 text-right">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-gray-700 truncate max-w-xs">{row.route}</div>
                          <AppBadge app={row.app} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 hidden lg:block overflow-hidden">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${(row.pageviews / maxPages) * 100}%`, background: APP_META[row.app]?.color ?? '#049FD9' }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-10 text-right">{fmt(row.pageviews)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-gray-500 hidden sm:table-cell">{fmt(row.sessions)}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-500 hidden md:table-cell">{fmt(row.uniqueVisitors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {topPages.length > 10 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowAllPages(v => !v)}
                className="text-xs text-cisco-blue hover:underline font-medium"
              >
                {showAllPages ? 'Show less' : `Show all ${topPages.length} pages`}
              </button>
            </div>
          )}
        </div>

        {/* App Breakdown */}
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-cisco-blue" />
            <h2 className="font-semibold text-gray-900">Traffic by App</h2>
          </div>

          {appBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={appBreakdown} cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3} dataKey="pageviews"
                  >
                    {appBreakdown.map((entry, i) => (
                      <Cell key={i} fill={APP_META[entry.app]?.color ?? APP_PIE_COLORS[i % APP_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => [val.toLocaleString(), 'Pageviews']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2 mt-2">
                {appBreakdown.map((row, i) => {
                  const meta = APP_META[row.app];
                  const pct = Math.round((row.pageviews / totalPV) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta?.color ?? '#999' }} />
                      <span className="text-xs text-gray-600 flex-1 truncate">{meta?.label ?? row.app}</span>
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{pct}%</span>
                      <span className="text-xs text-gray-400 w-12 text-right">{fmt(row.pageviews)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState message="No app breakdown data" />
          )}
        </div>
      </div>

      {/* ── Top IPs + Real-time Feed ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Top IP Addresses */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-cisco-blue" />
              <h2 className="font-semibold text-gray-900">Top IP Addresses</h2>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <button
                onClick={() => setSortIP('pageviews')}
                className={`px-2 py-0.5 rounded ${sortIP === 'pageviews' ? 'bg-cisco-blue/10 text-cisco-blue font-medium' : 'hover:bg-gray-100'}`}
              >
                Views
              </button>
              <button
                onClick={() => setSortIP('sessions')}
                className={`px-2 py-0.5 rounded ${sortIP === 'sessions' ? 'bg-cisco-blue/10 text-cisco-blue font-medium' : 'hover:bg-gray-100'}`}
              >
                Sessions
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">IP Address</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Views</th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide hidden sm:table-cell">Sessions</th>
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {sortedIPs.length === 0 && (
                  <tr><td colSpan={4}><EmptyState message="No IP data yet" /></td></tr>
                )}
                {sortedIPs.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                        <div>
                          <div className="font-mono text-xs text-gray-800">{row.ip}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {row.hasAccount && (
                              <span className="text-[10px] bg-cisco-green/10 text-cisco-green px-1.5 py-0 rounded-full font-medium">auth</span>
                            )}
                            {(row.apps ?? []).map((a: string) => (
                              <span key={a} className={`text-[10px] px-1.5 py-0 rounded-full font-medium ${APP_META[a]?.badge ?? 'bg-gray-100 text-gray-500'}`}>
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 bg-gray-100 rounded-full h-1.5 hidden lg:block overflow-hidden">
                          <div className="bg-cisco-blue h-1.5 rounded-full" style={{ width: `${(row.pageviews / maxIPs) * 100}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-10 text-right">{fmt(row.pageviews)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm text-gray-500 hidden sm:table-cell">{fmt(row.sessions)}</td>
                    <td className="px-5 py-3 text-right text-xs text-gray-400">
                      {row.lastSeen ? formatDistanceToNow(new Date(row.lastSeen), { addSuffix: true }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {topIPs.length > 10 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowAllIPs(v => !v)}
                className="text-xs text-cisco-blue hover:underline font-medium"
              >
                {showAllIPs ? 'Show less' : `Show all ${topIPs.length} IPs`}
              </button>
            </div>
          )}
        </div>

        {/* Real-time Activity */}
        <div className="card">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <h2 className="font-semibold text-gray-900">Real-Time Activity</h2>
              {realtime && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {realtime.activeSessions} active now
                </span>
              )}
            </div>
            <button
              onClick={loadRealtime}
              disabled={rtLoading}
              className="p-1.5 text-gray-400 hover:text-cisco-blue hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={14} className={rtLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
            {(!realtime || realtime.events.length === 0) ? (
              <EmptyState message="No activity in the last 30 minutes" />
            ) : realtime.events.map((ev: any) => (
              <div key={ev.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="mt-0.5 flex-shrink-0">
                  {parseDevice(ev.userAgent ?? '') === 'mobile'
                    ? <Smartphone size={14} className="text-gray-400" />
                    : <Monitor size={14} className="text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-700 truncate">{ev.path}</span>
                    <AppBadge app={ev.app} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    <span className="font-mono">{ev.ip}</span>
                    <span>·</span>
                    <span>{parseBrowser(ev.userAgent ?? '')}</span>
                    {ev.userId && <><span>·</span><span className="text-emerald-600">auth</span></>}
                  </div>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 flex items-center gap-1.5">
            <Activity size={11} />
            Last 30 min · auto-refreshes every 30 s · updated {format(lastRefresh, 'HH:mm:ss')}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <BarChart2 size={28} className="mb-2 opacity-40" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
