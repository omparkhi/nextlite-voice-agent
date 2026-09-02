import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userPayload = await login(email, password);

      if (userPayload?.role === 'ADMIN') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] px-4 relative overflow-hidden font-sans">
      {/* Soft atmospheric gradient background orbs */}
      <div className="absolute top-[-100px] left-[20%] w-[450px] h-[450px] rounded-full bg-radial from-[#a7e5d3]/40 via-[#f4c5a8]/20 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[20%] w-[450px] h-[450px] rounded-full bg-radial from-[#c8b8e0]/30 via-[#a8c8e8]/20 to-transparent blur-3xl pointer-events-none" />

      <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-2xl border border-[#e7e5e4] shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative z-10">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="w-6 h-6 bg-[#0c0a09] rounded-sm flex items-center justify-center text-white text-xs font-bold">
              NL
            </div>
            <span className="font-display-serif text-7xl font-light tracking-tight text-[#0c0a09]">
              NextLite <span className="font-sans text-xs uppercase tracking-widest text-[#777169]">Voice</span>
            </span>
          </Link>
          <h2 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            Sign in to platform
          </h2>
          <p className="text-xs text-[#777169] mt-1">
            Access your AI voice agents and client dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] rounded-xl text-xs font-medium flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09] transition-all"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e]">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs text-[#777169] hover:text-[#0c0a09] transition-colors">
                Forgot?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09] transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full el-btn-primary h-[44px] text-sm font-medium mt-2 shadow-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Authenticating...
              </span>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#f0efed] text-center text-xs text-[#777169]">
          Need an account? <Link to="/" className="text-[#0c0a09] font-medium hover:underline">Explore NextLite Voice</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
