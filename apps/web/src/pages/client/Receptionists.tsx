import { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import type { ReceptionistUser } from '../../types';
import { TableSkeleton } from '../../components/client/LoadingSkeleton';
import { EmptyState } from '../../components/client/EmptyState';

export function ClientReceptionists() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const { user } = useAuth();
  const portalUrl = user?.tenantSlug ? `/${user.tenantSlug}/receptionist` : '/receptionist';
  const [receptionists, setReceptionists] = useState<ReceptionistUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ReceptionistUser | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Reset Password Modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<ReceptionistUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const loadReceptionists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getClientReceptionists();
      setReceptionists(res.receptionists || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load receptionist accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReceptionists();
  }, [loadReceptionists]);

  const handleOpenAddModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormIsActive(true);
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (u: ReceptionistUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword('');
    setFormIsActive(u.isActive);
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  const handleSaveReceptionist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name and Email are required.');
      return;
    }
    if (!editingUser && !formPassword.trim()) {
      setFormError('Password is required for new accounts.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      if (editingUser) {
        await api.updateClientReceptionist(editingUser.id, {
          name: formName.trim(),
          isActive: formIsActive,
          password: formPassword.trim() || undefined,
        });
        setFormSuccess('Receptionist updated successfully!');
      } else {
        await api.createClientReceptionist({
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPassword.trim(),
        });
        setFormSuccess('Receptionist credential created successfully!');
      }

      setTimeout(() => {
        setModalOpen(false);
        setFormSuccess(null);
        loadReceptionists();
      }, 1000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save receptionist credential.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (u: ReceptionistUser) => {
    try {
      await api.updateClientReceptionist(u.id, {
        isActive: !u.isActive,
      });
      loadReceptionists();
    } catch (err: any) {
      alert(err?.message || 'Failed to update status');
    }
  };

  const handleDelete = async (u: ReceptionistUser) => {
    if (!window.confirm(`Are you sure you want to remove login access for "${u.name}" (${u.email})?`)) {
      return;
    }
    try {
      await api.deleteClientReceptionist(u.id);
      loadReceptionists();
    } catch (err: any) {
      alert(err?.message || 'Failed to remove receptionist credential');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !newPassword.trim()) return;

    setResetSubmitting(true);
    setResetMsg(null);
    try {
      await api.updateClientReceptionist(resetTargetUser.id, {
        password: newPassword.trim(),
      });
      setResetMsg({ text: 'Password reset successfully!', isError: false });
      setTimeout(() => {
        setResetModalOpen(false);
        setResetTargetUser(null);
        setNewPassword('');
        setResetMsg(null);
      }, 1200);
    } catch (err: any) {
      setResetMsg({ text: err?.message || 'Failed to reset password', isError: true });
    } finally {
      setResetSubmitting(false);
    }
  };

  const activeCount = receptionists.filter((r) => r.isActive).length;

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display-serif text-3xl font-light text-[#0c0a09]">
            Receptionist Staff &amp; Desk Credentials
          </h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Create and manage login accounts for your clinic&apos;s human receptionists. Walk-in appointments booked at the desk will sync with your CRM and AI Phone Agent.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="el-btn-outline flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-white text-[#0c0a09] border border-[#e7e5e4] rounded-xl hover:bg-[#fafafa] transition-colors"
          >
            <span>Launch Desk Portal</span>
            <svg className="w-3.5 h-3.5 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>

          {!isViewer && (
            <button
              onClick={handleOpenAddModal}
              className="el-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-[#0c0a09] text-white rounded-xl hover:bg-[#292524] transition-colors shadow-sm cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Add Receptionist Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Info Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="el-card p-4 bg-white border border-[#e7e5e4] rounded-2xl">
          <span className="text-[11px] font-semibold uppercase text-[#777169] block mb-1">
            Total Staff Accounts
          </span>
          <div className="text-2xl font-display-serif font-light text-[#0c0a09]">
            {receptionists.length}
          </div>
          <p className="text-[11px] text-[#a8a29e] mt-1">Configured for your clinic</p>
        </div>

        <div className="el-card p-4 bg-white border border-[#e7e5e4] rounded-2xl">
          <span className="text-[11px] font-semibold uppercase text-[#777169] block mb-1">
            Active Desk Logins
          </span>
          <div className="text-2xl font-display-serif font-light text-[#15803d]">
            {activeCount}
          </div>
          <p className="text-[11px] text-[#a8a29e] mt-1">Authorized to enter walk-ins</p>
        </div>

        <div className="el-card p-4 bg-white border border-[#e7e5e4] rounded-2xl flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase text-[#777169] block mb-1">
              Receptionist Portal URL
            </span>
            <div className="text-xs font-mono font-medium text-[#4f46e5] truncate">
              {portalUrl}
            </div>
          </div>
          <p className="text-[11px] text-[#777169] mt-2">
            Staff can sign in with their email &amp; password on the login page.
          </p>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={4} cols={5} />
      ) : receptionists.length === 0 ? (
        <EmptyState
          title="No receptionist staff credentials created yet"
          description="Click '+ Add Receptionist Staff' above to create login credentials (email and password) for your front-desk receptionist."
        />
      ) : (
        <div className="el-card bg-white overflow-hidden border border-[#e7e5e4] shadow-sm rounded-2xl">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#f0efed] text-left">
              <thead className="bg-[#fafafa] text-[#777169] text-[10px] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Staff Name</th>
                  <th className="px-6 py-3.5">Login Email</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0efed] text-xs">
                {receptionists.map((u) => (
                  <tr key={u.id} className="hover:bg-[#fafafa] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#e0e7ff] text-[#4338ca] flex items-center justify-center font-bold text-xs uppercase">
                          {u.name ? u.name.charAt(0) : 'R'}
                        </div>
                        <span className="font-semibold text-[#0c0a09]">{u.name}</span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap font-mono text-[#44403c]">
                      {u.email}
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]">
                        Desk Receptionist
                      </span>
                    </td>

                    <td className="px-4 py-4 whitespace-nowrap">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#dcfce7] text-[#15803d]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#15803d]"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f4f4f5] text-[#71717a]">
                          Disabled
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-[#777169]">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {!isViewer && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleActive(u)}
                            className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#44403c]"
                            title={u.isActive ? 'Deactivate account' : 'Activate account'}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            onClick={() => {
                              setResetTargetUser(u);
                              setNewPassword('');
                              setResetMsg(null);
                              setResetModalOpen(true);
                            }}
                            className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#4f46e5]"
                            title="Reset password"
                          >
                            Reset Password
                          </button>

                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#0c0a09]"
                            title="Edit details"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleDelete(u)}
                            className="el-btn-outline h-7 px-2 text-[11px] bg-white text-[#b91c1c] hover:bg-[#fef2f2]"
                            title="Remove access"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Receptionist Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#e7e5e4] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0efed]">
              <div>
                <h3 className="font-display-serif text-xl font-medium text-[#0c0a09]">
                  {editingUser ? 'Edit Receptionist Staff' : 'Add Receptionist Staff'}
                </h3>
                <p className="text-xs text-[#777169] mt-0.5">
                  Assign login credentials to your clinic&apos;s human receptionist.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[#a8a29e] hover:text-[#0c0a09] transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReceptionist} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-xs text-[#b91c1c]">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-xs text-[#15803d]">
                  {formSuccess}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  Receptionist Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pooja Patil"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  Login Email / Username *
                </label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingUser)}
                  placeholder="e.g. pooja@apexclinic.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] disabled:bg-[#f5f5f4] disabled:text-[#78716c] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Login Password *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? '••••••••' : 'Enter a secure password'}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs text-[#44403c] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded text-[#0c0a09]"
                  />
                  <span className="text-[11px] font-medium">Account is Active &amp; Allowed to Log in</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0efed]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="el-btn-outline px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="el-btn-primary px-5 py-2 text-xs bg-[#0c0a09] text-white rounded-xl hover:bg-[#292524] disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingUser ? 'Update Staff' : 'Create Credential'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalOpen && resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#e7e5e4] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0efed]">
              <div>
                <h3 className="font-display-serif text-lg font-medium text-[#0c0a09]">
                  Reset Password
                </h3>
                <p className="text-xs text-[#777169] mt-0.5">
                  For {resetTargetUser.name} ({resetTargetUser.email})
                </p>
              </div>
              <button
                onClick={() => setResetModalOpen(false)}
                className="text-[#a8a29e] hover:text-[#0c0a09] transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              {resetMsg && (
                <div
                  className={`p-3 rounded-xl text-xs border ${resetMsg.isError
                      ? 'bg-[#fef2f2] border-[#fecaca] text-[#b91c1c]'
                      : 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]'
                    }`}
                >
                  {resetMsg.text}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[#44403c] mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0efed]">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="el-btn-outline px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="el-btn-primary px-4 py-2 text-xs bg-[#0c0a09] text-white rounded-xl hover:bg-[#292524] disabled:opacity-50"
                >
                  {resetSubmitting ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
