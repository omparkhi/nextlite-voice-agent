import { useState, useEffect } from 'react';
import type { Appointment } from '../../types';
import { api } from '../../services/api';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../../utils/dateFormatters';

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
  // Form fields for editing
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [age, setAge] = useState('');
  const [place, setPlace] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<Appointment['status']>('SCHEDULED');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (appointment) {
      setCustomerName(appointment.customerName || '');
      setCustomerPhone(appointment.customerPhone || '');
      setAge(appointment.age || (appointment.metadata as any)?.age || '');
      setPlace(appointment.place || (appointment.metadata as any)?.place || (appointment.metadata as any)?.location || '');
      setBookingDate(appointment.bookingDate || '');
      setBookingTime(appointment.bookingTime || '');
      setTitle(appointment.title || 'General Consultation');
      setStatus(appointment.status || 'SCHEDULED');
      setNotes(appointment.notes || '');
      setSaveSuccess(false);
      setErrorMessage('');
    }
  }, [appointment]);

  if (!isOpen || !appointment) return null;

  const handleSave = async () => {
    if (isReadOnly) return;
    if (!customerName.trim()) {
      setErrorMessage('Patient / Customer Name is required.');
      return;
    }
    if (!bookingDate.trim()) {
      setErrorMessage('Appointment date is required.');
      return;
    }
    if (!bookingTime.trim()) {
      setErrorMessage('Appointment time slot is required.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const payload: any = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        age: age.trim(),
        place: place.trim(),
        bookingDate: bookingDate.trim(),
        bookingTime: bookingTime.trim(),
        title: title.trim() || 'General Consultation',
        status,
        notes: notes.trim(),
      };

      const updated = await api.updateClientAppointment(appointment.id, payload);
      onUpdated(updated);
      onClose();
    } catch (error: any) {
      console.error('Failed to update appointment:', error);
      setErrorMessage(error?.message || 'Failed to update appointment. Please check inputs.');
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

  const isAi = appointment.bookedBy === 'AGENT';
  const isDesk = appointment.bookedBy === 'RECEPTIONIST' || appointment.bookedBy === 'MANUAL_CLIENT';
  const isWhatsapp = appointment.bookedBy === 'WHATSAPP';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-0 sm:pl-10">
        <div className="w-screen max-w-lg bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-[#f0efed] bg-[#fafafa] shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2.5 py-1 bg-[#0c0a09] text-white rounded-md tracking-wider">
                  {appointment.appointmentNumber || 'APT-???'}
                </span>
                
                {/* Origin Tag */}
                {isWhatsapp ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    WhatsApp Bot
                  </span>
                ) : isAi ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    AI Voice Call
                  </span>
                ) : isDesk ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4]">
                    {appointment.bookedByName || 'Front Desk'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#f0efed] text-[#4e4e4e]">
                    Clinic Booking
                  </span>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-1 rounded-md text-[#777169] hover:text-[#0c0a09] hover:bg-[#f0efed] cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display-serif text-xl sm:text-2xl font-light text-[#0c0a09] truncate">
                  Edit Appointment Details
                </h2>
                <p className="text-xs text-[#777169] mt-0.5 truncate">
                  Modify patient records, appointment timing, or consultation status
                </p>
              </div>

              {appointment.appointmentNumber && (
                <button
                  type="button"
                  onClick={handleCopyReference}
                  className="el-btn-outline h-8 px-3 text-xs bg-white shrink-0 cursor-pointer"
                >
                  {copied ? '✓ Copied' : 'Copy ID'}
                </button>
              )}
            </div>
          </div>

          {/* Form Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-white min-h-0 scrollbar-thin">
            
            {/* Feedback Banners */}
            {saveSuccess && (
              <div className="p-3.5 bg-[#f0fdf4] border border-[#bbf7d0] text-[#166534] rounded-xl text-xs flex items-center gap-2">
                <svg className="w-4 h-4 text-[#16a34a] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Appointment changes saved successfully!</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 bg-[#fef2f2] border border-[#fecaca] text-[#991b1b] rounded-xl text-xs flex items-center gap-2">
                <svg className="w-4 h-4 text-[#dc2626] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2" />
                  <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Section 1: Patient Information */}
            <div className="space-y-3.5 border-b border-[#f0efed] pb-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#777169] block">
                1. Patient Identity & Contact
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Patient Name */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#0c0a09]">
                    Patient / Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] font-medium"
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#0c0a09]">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210 (optional)"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-mono text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Age */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#0c0a09]">
                    Patient Age
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="e.g. 34 yrs"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>

                {/* Place / Location */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#0c0a09]">
                    City / Location
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="e.g. Bandra West, Mumbai"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Date, Time & Consultation Type */}
            <div className="space-y-3.5 border-b border-[#f0efed] pb-5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#777169] block">
                2. Schedule & Consultation
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Booking Date */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-[#0c0a09]">
                      Appointment Date <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-[#777169] font-medium">
                      {bookingDate ? formatDateDDMMYYYY(bookingDate) : ''}
                    </span>
                  </div>
                  <input
                    type="date"
                    disabled={isReadOnly}
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] font-medium"
                  />
                </div>

                {/* Time Slot */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#0c0a09]">
                    Time Slot <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isReadOnly}
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    placeholder="e.g. 10:30 AM or 18:00"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] font-mono"
                  />
                </div>
              </div>

              {/* Service / Reason */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#0c0a09]">
                  Consultation Reason / Title
                </label>
                <input
                  type="text"
                  disabled={isReadOnly}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dental Checkup / General Consultation"
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
                />
              </div>

              {/* Status Selector */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#0c0a09]">
                  Booking Status
                </label>
                <select
                  disabled={isReadOnly}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl px-3 py-2 text-xs font-semibold text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                >
                  <option value="SCHEDULED">SCHEDULED (Active Booking)</option>
                  <option value="COMPLETED">COMPLETED (Patient Attended / Done)</option>
                  <option value="CANCELLED">CANCELLED (Slot Freed / Cancelled)</option>
                </select>
              </div>
            </div>

            {/* Section 3: Clinical Notes */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#0c0a09] flex items-center justify-between">
                <span>Clinical Notes & Remarks</span>
                <span className="text-[10px] text-[#777169] font-normal">Internal only</span>
              </label>
              <textarea
                disabled={isReadOnly}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add medical history, treatment remarks, or desk notes..."
                className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl p-3 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09] leading-relaxed resize-none"
              />
            </div>

            {/* Metadata Footer Box */}
            <div className="p-3 bg-[#fafafa] rounded-xl border border-[#f0efed] space-y-1.5 text-[11px] text-[#777169]">
              <div className="flex justify-between">
                <span>Doctor / Provider:</span>
                <span className="font-semibold text-[#0c0a09]">{appointment.resourceName || 'Assigned Doctor'}</span>
              </div>
              <div className="flex justify-between">
                <span>Booked Channel:</span>
                <span className="font-medium text-[#0c0a09]">
                  {isWhatsapp ? 'WhatsApp' : isAi ? 'AI Voice Assistant' : (appointment.bookedByName || 'Front Desk')}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Record Created:</span>
                <span className="font-medium text-[#0c0a09]">{formatDateTimeDDMMYYYY(appointment.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-[#f0efed] bg-[#fafafa] flex items-center justify-between gap-3 shrink-0">
            {onOpenWhatsApp ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWhatsApp(appointment);
                }}
                className="el-btn-outline h-9 px-3.5 text-xs bg-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <svg className="w-3.5 h-3.5 text-[#15803d]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                WhatsApp
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="el-btn-outline h-9 px-4 text-xs bg-white cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="el-btn-primary h-9 px-5 text-xs font-semibold cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

