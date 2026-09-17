import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

export function CreateClient() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('client123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [createdClient, setCreatedClient] = useState<{ id: string; name: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const res = await api.createClient({ name, email, businessName, password });
      setCreatedClient({
        id: res.id,
        name: res.name || businessName,
        email: res.credentials?.email || email,
        password: res.credentials?.password || password,
      });
      setShowModal(true);
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (createdClient) {
      const creds = `Email: ${createdClient.email}\nPassword: ${createdClient.password}`;
      navigator.clipboard.writeText(creds);
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
          Provision a dedicated client workspace and setup credentials
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
              Contact / Owner Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dr. Rajesh / Amit Kumar"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Client Email Address (or Internal Dummy Email)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="clinic@nextlite.internal or client@example.com"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Business / Clinic Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Medicare Multi-Specialty Clinic"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#4e4e4e] mb-1.5">
              Workspace Login Password
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="client123"
              className="w-full px-4 py-2.5 bg-white border border-[#d6d3d1] rounded-xl text-sm text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] focus:ring-1 focus:ring-[#0c0a09]"
              required
            />
            <p className="text-[11px] text-[#777169] mt-1">
              Pre-verified login for admin setup and testing. Client can change password later.
            </p>
          </div>
          
          <div className="flex items-center gap-3 pt-3">
            <button
              type="submit"
              disabled={loading}
              className="el-btn-primary text-xs px-6"
            >
              {loading ? 'Provisioning...' : 'Create Client Workspace'}
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
      {showModal && createdClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-[#e7e5e4] space-y-5">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#f0fdf4] text-[#16a34a] mx-auto border border-[#bbf7d0]">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-display-serif text-2xl font-light text-[#0c0a09]">
                Workspace Ready!
              </h3>
              <p className="text-xs text-[#777169]">
                Client account for <strong className="text-[#0c0a09] font-semibold">{createdClient.name}</strong> is provisioned and pre-verified.
              </p>
            </div>

            <div className="p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#475569] uppercase tracking-wider text-[10px]">Testing & Setup Login Credentials</span>
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="text-[11px] font-medium text-[#0284c7] hover:underline"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-[#0f172a] bg-white p-2.5 rounded border border-[#e2e8f0]">
                <div><span className="text-[#64748b]">Email:</span> {createdClient.email}</div>
                <div><span className="text-[#64748b]">Password:</span> {createdClient.password}</div>
              </div>
              <p className="text-[11px] text-[#64748b]">
                You can immediately log into the client portal with these credentials to configure agents, phone numbers, and test appointments.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => navigate(`/admin/clients/${createdClient.id}/agents`)}
                className="w-full el-btn-primary h-10 text-xs font-medium"
              >
                Configure Agent for this Client
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/clients')}
                className="w-full el-btn-outline h-9 text-xs"
              >
                Go to Client Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
