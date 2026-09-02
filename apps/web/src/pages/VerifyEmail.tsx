import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';

export function VerifyEmail() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    
    api.verifyEmail(token)
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'));
  }, [token]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setLoading(true);
    
    try {
      await api.setPassword(token!, password);
      navigate('/login', { state: { message: 'Password set successfully. Please log in.' } });
    } catch (err: any) {
      setError(err.message || 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };
  
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] font-sans">
        <div className="flex items-center gap-3 text-sm font-medium">
          <svg className="w-5 h-5 animate-spin text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Verifying security token...
        </div>
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] px-4 font-sans">
        <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-2xl border border-[#e7e5e4] shadow-[0_4px_24px_rgba(0,0,0,0.04)] text-center">
          <div className="w-12 h-12 rounded-full bg-[#fef2f2] text-[#dc2626] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="font-display-serif text-3xl font-light mb-3">Invalid Link</h1>
          <p className="text-sm text-[#4e4e4e] mb-6 leading-relaxed">
            This verification link is invalid or has expired. Please request a new invitation.
          </p>
          <Link to="/login" className="el-btn-primary w-full text-center">
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] px-4 font-sans relative overflow-hidden">
      <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-2xl border border-[#e7e5e4] shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative z-10">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-[#0c0a09] rounded-sm flex items-center justify-center text-white text-xs font-bold">
              NL
            </div>
            <span className="font-display-serif text-2xl font-light text-[#0c0a09]">
              NextLite <span className="font-sans text-xs uppercase tracking-widest text-[#777169]">Voice</span>
            </span>
          </Link>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">Activate Account</h1>
          <p className="text-xs text-[#777169] mt-1">
            Your email has been verified. Set your password to activate your account.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] rounded-xl text-xs font-medium">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
              minLength={8}
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
              minLength={8}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full el-btn-primary h-[44px] text-sm mt-2"
          >
            {loading ? 'Activating Account...' : 'Set Password & Activate'}
          </button>
        </form>
      </div>
    </div>
  );
}
