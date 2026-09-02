import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

export function CreateClient() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ emailSent: boolean; verificationLink?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const res = await api.createClient({ name, email, businessName });
      setCreatedInfo({
        emailSent: res.emailSent ?? true,
        verificationLink: res.verificationLink,
      });
      setShowModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (createdInfo?.verificationLink) {
      navigator.clipboard.writeText(createdInfo.verificationLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 font-sans relative">
      <div>
        <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
          Add New Client
        </h1>
        <p className="text-xs text-[#777169] mt-0.5">
          Provision a workspace account and invite owner email
        </p>
      </div>
      
      <div className="max-w-xl el-card p-8 bg-white">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] rounded-xl text-xs font-medium">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Contact Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acme.com"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Business / Organization Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Acme Voice Labs"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>
          
          <div className="flex items-center gap-3 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="el-btn-primary text-xs px-6"
            >
              {loading ? 'Provisioning...' : 'Create & Invite Client'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/clients')}
              className="el-btn-outline text-xs px-4"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Success Popup Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-[#e7e5e4] space-y-5">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#f0fdf4] text-[#16a34a] mx-auto border border-[#bbf7d0]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-display-serif text-2xl font-light text-[#0c0a09]">
                Client Created Successfully!
              </h3>
              <p className="text-xs text-[#777169]">
                Account for <strong className="text-[#0c0a09] font-semibold">{businessName}</strong> has been provisioned.
              </p>
            </div>

            {createdInfo?.emailSent ? (
              <div className="p-4 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-xs text-[#166534] flex items-start gap-3">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="font-medium text-[#15803d]">Verification Email Sent to Client</p>
                  <p className="mt-0.5 text-[#166534]">An onboarding verification email has been dispatched to <strong>{email}</strong>.</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#fffbeb] border border-[#fde68a] rounded-xl text-xs text-[#92400e] space-y-2">
                <p className="font-medium text-[#b45309]">Client created, but email dispatch requires domain verification</p>
                <p className="text-[11px] text-[#78350f]">You can copy the direct email verification link below to send to the client:</p>
                {createdInfo?.verificationLink && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      readOnly
                      value={createdInfo.verificationLink}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#d6d3d1] rounded text-[11px] font-mono text-[#0c0a09]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 bg-[#0c0a09] text-white text-xs rounded hover:bg-[#262626] transition-colors shrink-0 font-medium"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate('/admin/clients', { state: { message: `Client ${name} created. Email notification sent to ${email}.` } })}
                className="w-full el-btn-primary h-10 text-xs font-medium"
              >
                Go to Client Directory
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  setName('');
                  setEmail('');
                  setBusinessName('');
                }}
                className="w-full el-btn-outline h-9 text-xs"
              >
                Add Another Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
