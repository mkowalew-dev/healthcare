import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Monitor, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email] = useState('dr.chen@careconnect.demo');
  const [password, setPassword] = useState('');
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
          <form onSubmit={handleSubmit} className="space-y-5" data-testid="pacs-login-form">
            <div>
              <label
                htmlFor="pacs-email"
                className="block text-xs font-medium text-pacs-text-dim uppercase tracking-wider mb-2"
              >
                Radiologist Email
              </label>
              <input
                id="pacs-email"
                type="email"
                value={email}
                readOnly
                autoComplete="email"
                className="w-full bg-pacs-panel border border-pacs-border rounded-lg px-4 py-2.5 text-pacs-text text-sm
                           cursor-default opacity-75
                           focus:outline-none focus:ring-2 focus:ring-pacs-accent/50 focus:border-pacs-accent"
                data-testid="pacs-email-input"
              />
            </div>

            <div>
              <label
                htmlFor="pacs-password"
                className="block text-xs font-medium text-pacs-text-dim uppercase tracking-wider mb-2"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="pacs-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-pacs-panel border border-pacs-border rounded-lg px-4 py-2.5 text-pacs-text text-sm pr-10
                             focus:outline-none focus:ring-2 focus:ring-pacs-accent/50 focus:border-pacs-accent"
                  data-testid="pacs-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-pacs-muted hover:text-pacs-text-dim"
                  data-testid="pacs-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2.5"
                data-testid="pacs-login-error"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pacs-accent hover:bg-pacs-accent-dim disabled:opacity-50 disabled:cursor-not-allowed
                         text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
              data-testid="pacs-login-button"
            >
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
