import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] text-[#0c0a09] px-4 font-sans relative overflow-hidden">
        <div className="w-full max-w-md p-8 md:p-10 bg-white rounded-2xl border border-[#e7e5e4] shadow-[0_4px_24px_rgba(0,0,0,0.04)] text-center relative z-10">
          <div className="w-12 h-12 rounded-full bg-[#f0efed] text-[#0c0a09] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="font-display-serif text-3xl font-light mb-3">Check Your Email</h1>
          <p className="text-sm text-[#4e4e4e] mb-6 leading-relaxed">
            If an account exists with that email address, we've sent instructions to reset your password.
          </p>
          <Link to="/login" className="el-btn-primary w-full text-center">
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

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
            <span className="text-2xl font-bold tracking-tight text-[#0c0a09]">
              VanifyAI
            </span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-[#0c0a09]">Forgot Password</h1>
          <p className="text-xs text-[#777169] mt-1">
            Enter your account email to receive a reset link
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full el-btn-primary h-[44px] text-sm mt-2"
          >
            {loading ? 'Sending Instructions...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-[#777169]">
          Remember your password? <Link to="/login" className="text-[#0c0a09] font-medium hover:underline">Back to Sign In</Link>
        </div>
      </div>
    </div>
  );
}
