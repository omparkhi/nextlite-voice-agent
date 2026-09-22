import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      await api.resetPassword(token!, password);
      navigate('/login', { state: { message: 'Password reset successfully. Please log in.' } });
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] px-4 font-sans relative overflow-hidden">
      <div className="absolute top-[-100px] left-[20%] w-[450px] h-[450px] rounded-full bg-radial from-[#a7e5d3]/40 via-[#f4c5a8]/20 to-transparent blur-3xl pointer-events-none" />

      <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-2xl border border-[#e7e5e4] shadow-[0_4px_24px_rgba(0,0,0,0.04)] relative z-10">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-4 group">
            <img
              src="/vanifyai-logo.jpg"
              alt="VanifyAI"
              className="w-8 h-8 rounded-lg object-contain bg-black p-1 shadow-xs ring-1 ring-black/5"
            />
            <span className="text-2xl font-semibold tracking-tight text-[#0c0a09]">
              VanifyAI
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-[#0c0a09]">Set New Password</h1>
          <p className="text-xs text-[#777169] mt-1">
            Choose a strong password with at least 8 characters
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
              New Password
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
              Confirm New Password
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
            {loading ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[#777169]">
          <Link to="/login" className="text-[#0c0a09] font-medium hover:underline">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
