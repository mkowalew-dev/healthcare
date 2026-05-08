import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Shield, Eye, EyeOff, ChevronRight } from 'lucide-react';

// Detect which portal we're on at runtime using the baked-in hostname env var.
const PATIENT_HOST = import.meta.env.VITE_PATIENT_HOST;
const currentPortal = PATIENT_HOST && window.location.hostname === PATIENT_HOST
  ? 'patient'
  : PATIENT_HOST
  ? 'clinical'
  : 'all';

const PORTAL_CONFIG = {
  patient: {
    title: 'MyChart',
    subtitle: 'Patient Portal',
    hero: 'Your health.\nYour way.',
    heroSub: 'View test results, request appointments, message your care team, and manage your health all in one place.',
  },
  clinical: {
    title: 'CareConnect',
    subtitle: 'Clinical Workspace',
    hero: 'Enterprise Healthcare,\nReimagined.',
    heroSub: 'A comprehensive EHR system with clinical workflows, ePrescribing, and real-time observability powered by ThousandEyes and Splunk.',
  },
  all: {
    title: 'CareConnect EHR',
    subtitle: 'Secure Sign In',
    hero: 'Enterprise Healthcare,\nReimagined.',
    heroSub: 'A comprehensive EHR system with patient portals, clinical workflows, and real-time observability powered by ThousandEyes and Splunk.',
  },
};

const portal = PORTAL_CONFIG[currentPortal];

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
  const [email] = useState('dr.chen@careconnect.demo');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
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
              <div className="text-white font-bold text-xl leading-tight">{portal.title}</div>
              <div className="text-white/50 text-xs tracking-widest uppercase">{portal.subtitle}</div>
            </div>
          </div>

          {/* Hero content */}
          <div className="mb-auto text-center">
            <h1 className="text-4xl font-bold text-white leading-tight mb-4">
              {portal.hero.split('\n').map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {i === portal.hero.split('\n').length - 1
                    ? <span className="text-cisco-cyan">{line}</span>
                    : line}
                </span>
              ))}
            </h1>
            <p className="text-white/60 text-base leading-relaxed">
              {portal.heroSub}
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
            <span className="font-bold text-cisco-dark-blue text-xl">{portal.title}</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-cisco-dark-blue mb-1">{portal.title}</h2>
            <p className="text-sm text-gray-500">{portal.subtitle}</p>
          </div>

          {/* Login form */}
          <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
            <div>
              <label className="form-label">Email address</label>
              <input
                type="email"
                className="form-input bg-gray-50 text-gray-600 cursor-default"
                value={email}
                readOnly
                autoComplete="email"
                data-testid="login-email-input"
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
                  data-testid="login-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  data-testid="login-toggle-password"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg" data-testid="login-error-message">
                {error}
              </div>
            )}

            <div className="flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-10 py-2.5 text-base"
              data-testid="login-submit-button"
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

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-8">
            Demo environment &middot; For ThousandEyes & Splunk demonstration purposes
          </p>
        </div>
      </div>
    </div>
  );
}
