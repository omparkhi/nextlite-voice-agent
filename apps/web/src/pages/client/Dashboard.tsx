import { useState, useEffect } from 'react';
import { api } from '../../services/api';

export function ClientDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    api.getProfile()
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-[#777169] py-12 font-sans">
        <svg className="w-5 h-5 animate-spin text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading workspace dashboard...
      </div>
    );
  }
  
  if (!profile) {
    return <div className="text-sm text-[#dc2626] font-sans">Failed to load profile. Please sign in again.</div>;
  }
  
  const { tenant, subscription } = profile;
  
  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
          Welcome, {tenant.name}
        </h1>
        <p className="text-xs text-[#777169] mt-0.5">
          Workspace overview, agent status, and voice synthesis metrics
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="el-card p-6 bg-white flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#777169]">Account Status</span>
            <p className="font-display-serif text-3xl font-light text-[#16a34a] mt-2">Active</p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0efed] text-xs text-[#777169]">
            Tenant Verified
          </div>
        </div>
        
        <div className="el-card p-6 bg-white flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#777169]">Subscription Tier</span>
            <p className="font-display-serif text-3xl font-light text-[#0c0a09] mt-2">
              {subscription?.planName || 'Free Creator'}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0efed] text-xs text-[#777169]">
            Status: <span className="text-[#0c0a09] font-medium">{subscription?.status || 'Active'}</span>
          </div>
        </div>
        
        <div className="el-card p-6 bg-white flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#777169]">AI Employee Agent</span>
            <p className="font-display-serif text-2xl font-light text-[#a8a29e] mt-2">Not Provisioned</p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0efed] text-xs text-[#777169]">
            Ready for deployment
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="el-card p-6 bg-white">
          <h2 className="font-display-serif text-xl text-[#0c0a09] mb-4">Voice Syntheses & Activity</h2>
          <p className="text-xs text-[#777169]">No synthesis activity logged yet in this billing cycle.</p>
        </div>
        
        <div className="el-card p-6 bg-white">
          <h2 className="font-display-serif text-xl text-[#0c0a09] mb-4">Voice Usage Metrics</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Total Synthesized Characters</dt>
              <dd className="font-medium text-[#0c0a09]">0 / 10,000</dd>
            </div>
            <div className="flex justify-between py-1.5 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Active Voice Agents</dt>
              <dd className="font-medium text-[#0c0a09]">0</dd>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-[#777169]">Custom Cloned Voices</dt>
              <dd className="font-medium text-[#0c0a09]">0 / 3</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
