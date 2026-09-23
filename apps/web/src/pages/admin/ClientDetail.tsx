import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { ClientPlanModal } from '../../components/admin/ClientPlanModal';

export function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!id) return;

    api.getClient(id)
      .then(setClient)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleResetData = async () => {
    if (!id) return;
    setResetting(true);
    setResetNotice(null);
    try {
      const res = await api.resetClientData(id);
      setResetNotice(`Success! Deleted ${res.deletedCounts.appointments} appointments, ${res.deletedCounts.leads} leads, and ${res.deletedCounts.callSessions} call logs.`);
      setShowResetModal(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to reset operational data');
    } finally {
      setResetting(false);
    }
  };

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
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${client.status === 'active' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f0efed] text-[#4e4e4e]'
            }`}>
            {client.status}
          </span>
        </div>

        {resetNotice && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center justify-between">
            <span>{resetNotice}</span>
            <button onClick={() => setResetNotice(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">✕</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <Link
            to={`/admin/clients/${id}/agents`}
            className="el-btn-primary text-xs px-5 py-2"
          >
            Manage Agents
          </Link>
          <button
            onClick={() => {
              if (client?.id) {
                navigator.clipboard.writeText(client.id);
                alert(`Copied Tenant ID to clipboard: ${client.id}`);
              }
            }}
            className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
            title="Copy Tenant ID for WhatsApp Bot API (X-Tenant-Key)"
          >
            <span>📋</span> Copy Tenant ID (Key)
          </button>
          <button
            onClick={() => setShowResetModal(true)}
            className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1.5"
          >
            <span>🗑️</span> Reset Operational Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="el-card p-6 bg-white space-y-4">
          <h2 className="font-display-serif text-xl text-[#0c0a09] border-b border-[#f0efed] pb-3">
            Client Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Contact / Owner Name</dt>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ownerNameInput}
                    onChange={(e) => setOwnerNameInput(e.target.value)}
                    placeholder="e.g. Dr. Shadab Mulla"
                    className="px-2.5 py-1 text-xs border border-[#d6d3d1] rounded-lg focus:outline-none focus:border-[#0c0a09]"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      if (!id || !ownerNameInput.trim()) return;
                      setSavingName(true);
                      try {
                        await api.updateClient(id, {
                          name: ownerNameInput.trim(),
                          ownerName: ownerNameInput.trim(),
                          contactName: ownerNameInput.trim(),
                          doctorName: ownerNameInput.trim(),
                          businessName: client.name,
                        });
                        const updated = await api.getClient(id);
                        setClient(updated);
                        setIsEditingName(false);
                      } catch (err: any) {
                        alert(err?.message || 'Failed to update owner name');
                      } finally {
                        setSavingName(false);
                      }
                    }}
                    disabled={savingName || !ownerNameInput.trim()}
                    className="px-2.5 py-1 bg-[#0c0a09] text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {savingName ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="px-2 py-1 border border-[#e7e5e4] text-[#777169] rounded-lg text-xs hover:bg-[#fafafa]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <dd className="font-medium text-[#0c0a09] flex items-center gap-2">
                  <span>{user?.name || '-'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerNameInput(user?.name || '');
                      setIsEditingName(true);
                    }}
                    className="text-[11px] text-[#2563eb] hover:underline font-medium ml-1"
                  >
                    {user?.name ? 'Edit' : '+ Set Name'}
                  </button>
                </dd>
              )}
            </div>
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
          <div className="flex items-center justify-between border-b border-[#f0efed] pb-3">
            <h2 className="font-display-serif text-xl text-[#0c0a09]">
              Subscription & Tier
            </h2>
            <button
              type="button"
              onClick={() => setShowPlanModal(true)}
              className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors flex items-center gap-1"
            >
              <span>💳 Manage Plan</span>
            </button>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between py-1 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Status</dt>
              <dd className="font-medium text-[#0c0a09]">{subscription?.status || 'ACTIVE'}</dd>
            </div>
            <div className="flex justify-between py-1 border-b border-[#f0efed]">
              <dt className="text-[#777169]">Assigned Plan</dt>
              <dd className="font-medium text-emerald-700">{subscription?.planName || 'Growth Plan (Monthly)'}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-[#777169]">Pay As You Go</dt>
              <dd className="font-medium text-[#0c0a09]">₹7.0 / min</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-amber-200">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2.5 bg-amber-100 rounded-full">
                <span className="text-xl">⚠️</span>
              </div>
              <h3 className="font-display-serif text-xl font-semibold text-stone-900">
                Reset Clinic Operational Data?
              </h3>
            </div>

            <p className="text-sm text-stone-600 leading-relaxed">
              Are you sure you want to clear all test & operational data for <strong className="text-stone-900">{client.name}</strong>?
            </p>

            <div className="bg-amber-50 p-3.5 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-2">
              <p className="font-semibold text-amber-900 flex items-center gap-1">
                <span>🧹</span> What will be permanently DELETED:
              </p>
              <ul className="list-disc list-inside space-y-1 text-amber-800 font-medium">
                <li>All Receptionist & AI Appointments</li>
                <li>All CRM Leads</li>
                <li>All Call Sessions & Logs</li>
              </ul>
            </div>

            <div className="bg-stone-50 p-3.5 rounded-lg border border-stone-200 text-xs text-stone-700 space-y-1">
              <p className="font-semibold text-stone-900 flex items-center gap-1">
                <span>🛡️</span> What will be PRESERVED (Not touched):
              </p>
              <p className="text-stone-600">
                Agent prompt configuration, system instructions, voice settings, knowledge base files, and receptionist login accounts.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-xs font-medium hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetData}
                disabled={resetting}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
              >
                {resetting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Clearing Data...
                  </>
                ) : (
                  'Yes, Reset Operational Data'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Assignment Modal */}
      {id && (
        <ClientPlanModal
          clientId={id}
          clientName={client?.name}
          isOpen={showPlanModal}
          onClose={() => setShowPlanModal(false)}
          onSuccess={(updatedSub) => {
            if (client) {
              setClient({
                ...client,
                subscriptions: [updatedSub]
              });
            }
          }}
        />
      )}
    </div>
  );
}
