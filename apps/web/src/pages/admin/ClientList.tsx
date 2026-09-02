import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../services/api';

export function ClientList() {
  const location = useLocation();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(location.state?.message || null);
  
  useEffect(() => {
    api.getClients()
      .then(setClients)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-[#777169] py-12">
        <svg className="w-5 h-5 animate-spin text-[#0c0a09]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading clients directory...
      </div>
    );
  }
  
  return (
    <div className="space-y-8 font-sans">
      {message && (
        <div className="p-4 bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] rounded-xl text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#16a34a] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-[#166534] hover:text-[#15803d] font-bold text-sm leading-none">
            &times;
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            Client Directory
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Active workspace tenants and user credentials
          </p>
        </div>
        <Link
          to="/admin/clients/new"
          className="el-btn-primary h-9 text-xs"
        >
          + Add New Client
        </Link>
      </div>
      
      {clients.length === 0 ? (
        <div className="el-card text-center py-16 bg-white">
          <div className="w-12 h-12 rounded-full bg-[#f0efed] text-[#777169] flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#0c0a09]">No clients registered yet</p>
          <p className="text-xs text-[#777169] mt-1">Create your first client account to get started.</p>
        </div>
      ) : (
        <div className="el-card bg-white overflow-hidden border border-[#e7e5e4]">
          <table className="min-w-full divide-y divide-[#f0efed]">
            <thead className="bg-[#fafafa]">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-[#777169] uppercase tracking-wider">
                  Client Name
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-[#777169] uppercase tracking-wider">
                  Contact Email
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-[#777169] uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-[#777169] uppercase tracking-wider">
                  Subscription
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-[#777169] uppercase tracking-wider">
                  Created Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-[#f0efed] text-sm">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-[#fafafa] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/admin/clients/${client.id}`}
                      className="font-medium text-[#0c0a09] hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[#4e4e4e]">
                    {client.users?.[0]?.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      client.status === 'active'
                        ? 'bg-[#dcfce7] text-[#15803d]'
                        : 'bg-[#f0efed] text-[#4e4e4e]'
                    }`}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[#777169] text-xs">
                    {client.subscriptions?.[0]?.status || 'PENDING'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-[#777169] text-xs">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
