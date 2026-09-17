import { useState, useEffect } from 'react';
import type { Appointment } from '../../types';
import { api } from '../../services/api';

interface AppointmentDetailsDrawerProps {
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: Appointment) => void;
  onOpenWhatsApp?: (appointment: Appointment) => void;
  isReadOnly?: boolean;
}

export function AppointmentDetailsDrawer({
  appointment,
  isOpen,
  onClose,
  onUpdated,
  onOpenWhatsApp,
  isReadOnly = false,
}: AppointmentDetailsDrawerProps) {
  const [status, setStatus] = useState<Appointment['status']>('REQUESTED');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (appointment) {
      setStatus(appointment.status);
      setNotes(appointment.notes || '');
      setSaveSuccess(false);
    }
  }, [appointment]);

  if (!isOpen || !appointment) return null;

  const handleSave = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const updated = await api.updateClientAppointment(appointment.id, {
        status,
        notes,
      });
      onUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      console.error('Failed to update appointment:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyReference = () => {
    if (appointment.appointmentNumber) {
      navigator.clipboard.writeText(appointment.appointmentNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-6 border-b border-[#f0efed] bg-[#fafafa]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2.5 py-1 bg-[#0c0a09] text-white rounded-md tracking-wider">
                  {appointment.appointmentNumber || 'A-???'}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169]">
                  Appointment Booking
                </span>
              </div>

              <button
                onClick={onClose}
                className="p-1 rounded-md text-[#777169] hover:text-[#0c0a09] hover:bg-[#f0efed]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display-serif text-2xl font-light text-[#0c0a09]">
                  {appointment.customerName}
                </h2>
                <p className="text-xs text-[#777169] mt-0.5">{appointment.customerPhone}</p>
              </div>

              <button
                onClick={handleCopyReference}
                className="el-btn-outline h-8 px-3 text-xs bg-white"
              >
                {copied ? '✓ Copied' : 'Copy Reference'}
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-white">
            {saveSuccess && (
              <div className="p-3 bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] rounded-xl text-xs flex items-center gap-2">
                <svg className="w-4 h-4 text-[#16a34a] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Appointment status saved successfully.</span>
              </div>
            )}

            {/* Status Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#0c0a09] uppercase tracking-wider block">
                Booking Status
              </label>
              <select
                disabled={isReadOnly}
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3.5 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
              >
                <option value="SCHEDULED">SCHEDULED (Active Booking)</option>
                <option value="COMPLETED">COMPLETED (Mark as Done / Patient Attended)</option>
                <option value="CANCELLED">CANCELLED (Cancelled / Deleted)</option>
              </select>
            </div>

            {/* Customer Details */}
            <div className="el-card p-4 bg-[#fafafa] space-y-2.5 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block border-b border-[#f0efed] pb-1.5">
                Customer Information
              </span>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Full Name</span>
                <span className="font-semibold text-[#0c0a09]">{appointment.customerName}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Contact Number</span>
                <div className="text-right">
                  <span className="font-mono font-medium text-[#0c0a09]">{appointment.customerPhone}</span>
                  <span className="block text-[10px] text-[#777169]">Telephony Call Metadata</span>
                </div>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Age</span>
                <span className="font-medium text-[#0c0a09]">
                  {appointment.age || (appointment.metadata as any)?.age || '-'}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Place / Location</span>
                <span className="font-medium text-[#0c0a09]">
                  {appointment.place || (appointment.metadata as any)?.place || (appointment.metadata as any)?.location || '-'}
                </span>
              </div>
            </div>

            {/* Appointment Schedule Details */}
            <div className="el-card p-4 bg-[#fafafa] space-y-2.5 text-xs">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#777169] block border-b border-[#f0efed] pb-1.5">
                Schedule & Details
              </span>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Appointment Title</span>
                <span className="font-medium text-[#0c0a09]">{appointment.title}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Date & Time</span>
                <span className="font-semibold text-[#0c0a09]">
                  {appointment.bookingDate} at {appointment.bookingTime}
                </span>
              </div>

              {appointment.resourceName && (
                <div className="flex justify-between py-1">
                  <span className="text-[#777169]">Staff / Resource</span>
                  <span className="font-medium text-[#0c0a09]">{appointment.resourceName}</span>
                </div>
              )}

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Booked Through Agent</span>
                <span className="font-medium text-[#0c0a09]">{appointment.agent?.name || 'AI Assistant'}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-[#777169]">Created</span>
                <span className="font-medium text-[#0c0a09]">{new Date(appointment.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[#0c0a09] uppercase tracking-wider block">
                Booking Notes
              </label>
              <textarea
                disabled={isReadOnly}
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add customer requirements, preparation instructions, or reminder notes..."
                className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl p-3 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] leading-relaxed resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[#f0efed] bg-[#fafafa] flex items-center justify-between gap-3">
            {onOpenWhatsApp ? (
              <button
                onClick={() => {
                  onClose();
                  onOpenWhatsApp(appointment);
                }}
                className="el-btn-outline h-9 px-4 text-xs bg-white flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Send Confirmation
              </button>
            ) : <div />}

            {!isReadOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="el-btn-primary h-9 px-5 text-xs"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
