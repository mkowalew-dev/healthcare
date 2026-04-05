import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Shield, Eye, EyeOff, ChevronRight } from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    role: 'Patient',
    email: 'patient@demo.com',
    password: 'Demo123!',
    name: 'John Smith',
    color: 'bg-cisco-blue',
    description: 'Access MyHealth portal',
  },
  {
    role: 'Provider',
    email: 'provider@demo.com',
    password: 'Demo123!',
    name: 'Dr. Michael Chen',
    color: 'bg-cisco-dark-blue',
    description: 'Clinical workspace',
  },
  {
    role: 'Admin',
    email: 'admin@demo.com',
    password: 'Demo123!',
    name: 'System Admin',
    color: 'bg-gray-700',
    description: 'System administration',
  },
];

// Cisco-style logo
function CiscoMark({ size = 40 }: { size?: number }) {
  const h = size * 0.63;
  return (
    <svg width={size} height={h} viewBox="0 0 40 25" fill="none">
      <rect x="0" y="8" width="6" height="9" rx="1" fill="#049FD9" opacity="0.8"/>
      <rect x="8.5" y="4" width="6" height="17" rx="1" fill="#049FD9"/>
      <rect x="17" y="0" width="6" height="25" rx="1" fill="#049FD9"/>
      <rect x="25.5" y="4" width="6" height="17" rx="1" fill="#049FD9"/>
      <rect x="34" y="8" width="6" height="9" rx="1" fill="#049FD9" opacity="0.8"/>
    </svg>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e?: React.FormEvent, preEmail?: string, prePassword?: string) => {
    e?.preventDefault();
    const loginEmail = preEmail || email;
    const loginPassword = prePassword || password;

    if (!loginEmail || !loginPassword) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(loginEmail, loginPassword);
      // Determine redirect based on role
      const stored = localStorage.getItem('cc_token');
      if (stored) {
        const payload = JSON.parse(atob(stored.split('.')[1]));
        const role = payload.role;
        navigate(role === 'provider' ? '/provider/dashboard' : role === 'admin' ? '/admin/dashboard' : '/patient/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email);
    setPassword(account.password);
    handleLogin(undefined, account.email, account.password);
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left panel - Cisco brand */}
      <div className="hidden lg:flex w-[480px] flex-shrink-0 flex-col bg-cisco-dark-blue relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 -left-20 w-96 h-96 bg-cisco-blue rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-64 h-64 bg-cisco-cyan rounded-full blur-2xl" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 900" fill="none">
            {Array.from({length: 8}).map((_, i) => (
              <line key={i} x1={60*i} y1="0" x2={60*i+200} y2="900" stroke="white" strokeWidth="0.5" opacity="0.3"/>
            ))}
          </svg>
        </div>

        <div className="relative flex flex-col h-full p-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <CiscoMark size={40} />
            <div>
              <div className="text-white font-bold text-xl leading-tight">CareConnect</div>
              <div className="text-white/50 text-xs tracking-widest uppercase">EHR Platform</div>
            </div>
          </div>

          {/* Hero content */}
          <div className="mb-auto text-center">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              Enterprise Healthcare,<br />
              <span className="text-cisco-cyan">Reimagined.</span>
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              A comprehensive EHR system with patient portals,
              clinical workflows, and real-time observability
              powered by ThousandEyes and Splunk.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pb-6 border-t border-white/10 pt-6">
            {[
              { label: 'Patients', value: '1,240+' },
              { label: 'Providers', value: '48' },
              { label: 'Departments', value: '10' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-white/50 text-xs">{label}</div>
              </div>
            ))}
          </div>

          {/* Security badge */}
          <div className="flex items-center gap-2 text-white/40 text-xs">
            <Shield size={12} />
            <span>HIPAA Compliant · SOC 2 Type II · HL7 FHIR R4</span>
          </div>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <CiscoMark size={32} />
            <span className="font-bold text-cisco-dark-blue text-xl">CareConnect EHR</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-cisco-dark-blue mb-1">CareConnect EHR</h2>
            <p className="text-sm text-gray-500">Secure Patient Portal</p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-10 py-2.5 text-base"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ChevronRight size={16} />
                </>
              )}
            </button>
            </div>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">DEMO ACCESS</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Demo accounts */}
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.role}
                onClick={() => handleDemoLogin(account)}
                disabled={loading}
                className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg
                           hover:border-cisco-blue hover:bg-cisco-blue/5 transition-all duration-150
                           text-left disabled:opacity-50 group"
              >
                <div className={`w-9 h-9 rounded-lg ${account.color} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white text-xs font-bold">{account.role[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">{account.name}</div>
                  <div className="text-xs text-gray-500">{account.email} &middot; {account.description}</div>
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-cisco-blue flex-shrink-0" />
              </button>
            ))}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-8">
            Demo environment &middot; For ThousandEyes & Splunk demonstration purposes
          </p>
        </div>
      </div>
    </div>
  );
}
