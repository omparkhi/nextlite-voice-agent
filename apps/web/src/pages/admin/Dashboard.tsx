import { Link } from 'react-router-dom';

export function AdminDashboard() {
  return (
    <div className="space-y-8 font-sans">
      <div>
        <h1 className="font-display-serif text-4xl font-light text-[#0c0a09]">
          Platform Administration
        </h1>
        <p className="text-sm text-[#777169] mt-1">
          Manage system clients, agent provisioning, and infrastructure
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/admin/clients"
          className="el-card p-6 bg-white block group hover:border-[#0c0a09] transition-all"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-full bg-[#f0efed] text-[#0c0a09] flex items-center justify-center group-hover:bg-[#0c0a09] group-hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <span className="text-xs text-[#777169] group-hover:text-[#0c0a09]">View All →</span>
          </div>
          <h2 className="font-display-serif text-2xl font-light text-[#0c0a09] mb-1">Clients & Accounts</h2>
          <p className="text-xs text-[#4e4e4e] leading-relaxed">Manage client accounts, onboardings, and organization profiles</p>
        </Link>
        
        <div className="el-card p-6 bg-[#fafafa] border border-[#e7e5e4] opacity-60">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-full bg-[#f0efed] text-[#777169] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
            </div>
            <span className="el-badge text-[10px]">Phase 2</span>
          </div>
          <h2 className="font-display-serif text-2xl font-light text-[#0c0a09] mb-1">Voice AI Agents</h2>
          <p className="text-xs text-[#777169]">Agent builder engine & LLM prompts</p>
        </div>
        
        <div className="el-card p-6 bg-[#fafafa] border border-[#e7e5e4] opacity-60">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-full bg-[#f0efed] text-[#777169] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-6z" />
              </svg>
            </div>
            <span className="el-badge text-[10px]">Phase 6</span>
          </div>
          <h2 className="font-display-serif text-2xl font-light text-[#0c0a09] mb-1">Live Telephony</h2>
          <p className="text-xs text-[#777169]">Twilio & SIP trunking infrastructure</p>
        </div>
      </div>
    </div>
  );
}
