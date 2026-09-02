import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (!id) return;
    
    api.getClient(id)
      .then(setClient)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);
  
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-[#777169] py-12 font-sans">
        <svg className="w-5 h-5 animate-spin text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading client profile...
      </div>
    );
  }
  
  if (error || !client) {
    return (
      <div className="text-center py-16 font-sans">
        <p className="text-sm text-[#dc2626] mb-4">{error || 'Client not found'}</p>
        <button
          onClick={() => navigate('/admin/clients')}
          className="el-btn-outline text-xs px-4"
        >
          ← Return to Clients Directory
        </button>
      </div>
    );
  }
  
  const user = client.users?.[0];
  const subscription = client.subscriptions?.[0];
  
  return (
    <div className="space-y-8 font-sans">
      <div>
        <button
          onClick={() => navigate('/admin/clients')}
          className="text-xs text-[#777169] hover:text-[#0c0a09] mb-3 flex items-center gap-1"
        >
          ← Back to Client Directory
        </button>
        <div className="flex items-center justify-between">
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            {client.name}
          </h1>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
            client.status === 'active' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f0efed] text-[#4e4e4e]'
          }`}>
            {client.status}
          </span>
        </div>
        <div className="mt-4 flex gap-3">
          <Link
            to={`/admin/clients/${id}/agents`}
            className="el-btn-primary text-xs px-5 py-2"
          >
            Manage Agents
          </Link>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="el-card p-6 bg-white space-y-4">
          <h2 className="font-display-serif text-xl text-[#0c0a09] border-b border-[#f0efed] pb-3">
            Client Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Primary Contact Email</dt>
              <dd className="font-medium text-[#0c0a09]">{user?.email || '-'}</dd>
            </div>
            <div className="flex justify-between py-1 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Email Verification</dt>
              <dd className="font-medium text-[#0c0a09]">{user?.emailVerified ? 'Verified' : 'Pending'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-[#777169]">Created Date</dt>
              <dd className="font-medium text-[#0c0a09]">{new Date(client.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
        
        <div className="el-card p-6 bg-white space-y-4">
          <h2 className="font-display-serif text-xl text-[#0c0a09] border-b border-[#f0efed] pb-3">
            Subscription & Tier
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Status</dt>
              <dd className="font-medium text-[#0c0a09]">{subscription?.status || 'PENDING'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-[#777169]">Assigned Plan</dt>
              <dd className="font-medium text-[#0c0a09]">{subscription?.planName || 'Standard Tier'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
