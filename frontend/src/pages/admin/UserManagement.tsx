import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { adminApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { Badge } from '../../components/ui/Badge';
import { Users, Search, UserCheck, UserX, Shield, Stethoscope, User } from 'lucide-react';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    adminApi.users().then(r => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const handleToggleActive = async (id: string) => {
    setToggling(id);
    try {
      const res = await adminApi.toggleUserActive(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: res.data.is_active } : u));
    } finally {
      setToggling(null);
    }
  };

  const filtered = users.filter(u => {
    const matchesSearch = !search ||
      u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.additional_info?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleIcon = (role: string) => {
    if (role === 'provider') return <Stethoscope size={13} className="text-cisco-dark-blue" />;
    if (role === 'admin') return <Shield size={13} className="text-cisco-orange" />;
    return <User size={13} className="text-cisco-blue" />;
  };

  const roleBadgeVariant = (role: string) => {
    if (role === 'provider') return 'info' as const;
    if (role === 'admin') return 'warning' as const;
    return 'normal' as const;
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">{users.length} total users in the system</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="form-input pl-9 w-64"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'patient', 'provider', 'admin'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                roleFilter === r ? 'bg-cisco-blue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r === 'all' ? 'All Roles' : r}s
            </button>
          ))}
        </div>
      </div>

      {/* Users table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Additional Info</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      user.role === 'provider' ? 'bg-cisco-dark-blue/10' :
                      user.role === 'admin' ? 'bg-cisco-orange/10' : 'bg-cisco-blue/10'
                    }`}>
                      {roleIcon(user.role)}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{user.display_name || '—'}</div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge variant={roleBadgeVariant(user.role)} className="capitalize">
                    {user.role}
                  </Badge>
                </td>
                <td className="text-xs text-gray-500">{user.additional_info || '—'}</td>
                <td>
                  <Badge variant={user.is_active ? 'success' : 'gray'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </td>
                <td className="text-xs text-gray-500">
                  {user.last_login ? format(parseISO(user.last_login), 'MM/dd/yy h:mm a') : 'Never'}
                </td>
                <td className="text-xs text-gray-500">
                  {format(parseISO(user.created_at), 'MM/dd/yyyy')}
                </td>
                <td>
                  <button
                    onClick={() => handleToggleActive(user.id)}
                    disabled={toggling === user.id}
                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      user.is_active
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-600 hover:bg-green-50'
                    } disabled:opacity-50`}
                  >
                    {toggling === user.id ? (
                      '...'
                    ) : user.is_active ? (
                      <><UserX size={12} /> Deactivate</>
                    ) : (
                      <><UserCheck size={12} /> Activate</>
                    )}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-500 text-sm">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
