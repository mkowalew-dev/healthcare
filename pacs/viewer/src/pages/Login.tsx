import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Monitor, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('dr.chen@careconnect.demo');
  const [password, setPassword] = useState('Demo123!');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/worklist');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Login failed. Check credentials and ensure the PACS server is running.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-pacs-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo / header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-pacs-accent/10 rounded-2xl mb-4 border border-pacs-accent/20">
            <Monitor className="w-8 h-8 text-pacs-accent" />
          </div>
          <h1 className="text-2xl font-bold text-pacs-text tracking-tight">CareConnect PACS</h1>
          <p className="text-pacs-muted text-sm mt-1">Radiology Workstation</p>
        </div>

        {/* Login card */}
        <div className="bg-pacs-surface border border-pacs-border rounded-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-pacs-text-dim uppercase tracking-wider mb-2">
                Radiologist Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-pacs-panel border border-pacs-border rounded-lg px-4 py-2.5 text-pacs-text text-sm
                           focus:outline-none focus:ring-2 focus:ring-pacs-accent/50 focus:border-pacs-accent
                           placeholder:text-pacs-muted"
                placeholder="dr.name@pacs.hospital"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-pacs-text-dim uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-pacs-panel border border-pacs-border rounded-lg px-4 py-2.5 text-pacs-text text-sm pr-10
                             focus:outline-none focus:ring-2 focus:ring-pacs-accent/50 focus:border-pacs-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pacs-muted hover:text-pacs-text-dim"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pacs-accent hover:bg-pacs-accent-dim disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
            >
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 pt-5 border-t border-pacs-border">
            <p className="text-xs text-pacs-muted mb-2 font-medium uppercase tracking-wider">Demo Account</p>
            <button
              type="button"
              onClick={() => { setEmail('dr.chen@careconnect.demo'); setPassword('Demo123!'); }}
              className="w-full text-left flex items-center justify-between px-3 py-1.5 rounded
                         bg-pacs-panel hover:bg-pacs-hover border border-pacs-border/50 group transition-colors"
            >
              <span className="text-xs text-pacs-text-dim group-hover:text-pacs-text">Dr. Emily Chen</span>
              <span className="text-xs text-pacs-muted">Radiologist</span>
            </button>
            <p className="text-xs text-pacs-muted mt-2">Password: <span className="text-pacs-text font-mono">Demo123!</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
