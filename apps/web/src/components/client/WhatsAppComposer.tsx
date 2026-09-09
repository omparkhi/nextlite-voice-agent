import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import type { Appointment, Lead, CallSession } from '../../types';

interface WhatsAppComposerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialLead?: Lead | null;
  initialAppointment?: Appointment | null;
  initialCall?: CallSession | null;
  initialPhone?: string;
  initialCustomerName?: string;
}

export function WhatsAppComposer({
  isOpen,
  onClose,
  onSuccess,
  initialLead,
  initialAppointment,
  initialCall,
  initialPhone = '',
  initialCustomerName = '',
}: WhatsAppComposerProps) {
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [template, setTemplate] = useState<string>('custom');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; messageId?: string; info?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);

      const phone = initialAppointment?.customerPhone || initialLead?.customerPhone || initialCall?.callerNumber || initialPhone || '';
      const name = initialAppointment?.customerName || initialLead?.customerName || initialCustomerName || 'Valued Customer';
      setCustomerPhone(phone);
      setCustomerName(name);

      if (initialAppointment) {
        if (initialAppointment.status === 'CONFIRMED') {
          setTemplate('appointment_confirmed');
          setMessage(
            `Hello ${name}, your appointment is confirmed for ${initialAppointment.bookingDate} at ${initialAppointment.bookingTime}. Your reference number is ${initialAppointment.appointmentNumber || 'A-001'}. Let us know if you need to reschedule.`
          );
        } else {
          setTemplate('appointment_requested');
          setMessage(
            `Hello ${name}, your appointment request has been recorded for ${initialAppointment.bookingDate} at ${initialAppointment.bookingTime}. Your reference number is ${initialAppointment.appointmentNumber || 'A-001'}. Our team will confirm availability shortly.`
          );
        }
      } else if (initialLead) {
        setTemplate('lead_callback');
        setMessage(
          `Hello ${name}, thank you for your interest in ${initialLead.interestCategory || 'our services'}. We would love to assist you with the next steps. When would be a good time to connect?`
        );
      } else {
        setTemplate('custom');
        setMessage(`Hello ${name}, following up from your recent call with our AI assistant.`);
      }
    }
  }, [isOpen, initialLead, initialAppointment, initialCall, initialPhone, initialCustomerName]);

  const handleTemplateChange = (newTemplate: string) => {
    setTemplate(newTemplate);
    const name = customerName || 'Valued Customer';

    switch (newTemplate) {
      case 'appointment_confirmed':
        setMessage(
          `Hello ${name}, your appointment is confirmed for ${initialAppointment?.bookingDate || 'the scheduled date'} at ${initialAppointment?.bookingTime || 'scheduled time'}. Your reference number is ${initialAppointment?.appointmentNumber || 'A-001'}.`
        );
        break;
      case 'appointment_requested':
        setMessage(
          `Hello ${name}, your appointment request has been recorded. Your reference number is ${initialAppointment?.appointmentNumber || 'A-001'}. Our team will confirm availability shortly.`
        );
        break;
      case 'lead_callback':
        setMessage(
          `Hello ${name}, thank you for contacting us regarding ${initialLead?.interestCategory || 'our services'}. We'd love to assist you with any questions.`
        );
        break;
      case 'custom':
      default:
        setMessage(`Hello ${name}, following up from our recent conversation.`);
        break;
    }
  };

  if (!isOpen) return null;

  const handleSend = async () => {
    if (!customerPhone.trim()) {
      setError('Please provide a valid recipient phone number.');
      return;
    }

    if (!message.trim()) {
      setError('Please provide a message body.');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await api.sendWhatsAppFollowUp({
        customerPhone: customerPhone.trim(),
        customerName: customerName.trim(),
        message: message.trim(),
        leadId: initialLead?.id,
        appointmentId: initialAppointment?.id,
        callSessionId: initialCall?.id,
        provider: 'DEMO',
        messageType: template === 'appointment_confirmed' ? 'APPOINTMENT_CONFIRMATION'
          : template === 'appointment_requested' ? 'APPOINTMENT_REQUEST'
          : template === 'lead_callback' ? 'LEAD_CALLBACK'
          : 'CUSTOM',
      });

      setResult({
        success: true,
        messageId: response.providerMessageId || response.followUpId,
        info: response.message,
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch WhatsApp follow-up');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-[#e7e5e4] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-[#f0efed] bg-[#fafafa] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#dcfce7] text-[#15803d] flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display-serif text-xl font-light text-[#0c0a09]">
                Send WhatsApp Follow-up
              </h3>
              <p className="text-[11px] text-[#777169]">
                Deliver instant updates & booking confirmations
              </p>
            </div>
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

        {/* Demo Mode Notice */}
        <div className="bg-[#fffbeb] border-b border-[#fef3c7] px-6 py-2.5 flex items-center justify-between text-xs text-[#92400e]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#d97706] animate-pulse" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">DEMO PROVIDER ACTIVE</span>
          </div>
          <span className="text-[11px] text-[#b45309]">Simulated Delivery</span>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] rounded-xl text-xs">
              {error}
            </div>
          )}

          {result ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#dcfce7] text-[#15803d] flex items-center justify-center mx-auto">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="font-display-serif text-xl text-[#0c0a09]">Follow-up Dispatched</h4>
              <p className="text-xs text-[#777169] max-w-sm mx-auto">
                {result.info || 'The WhatsApp follow-up has been recorded and simulated successfully.'}
              </p>
              <div className="p-3 bg-[#fafafa] rounded-xl font-mono text-[11px] text-[#4e4e4e] inline-block">
                ID: {result.messageId}
              </div>

              <div className="pt-3">
                <button
                  onClick={onClose}
                  className="el-btn-primary h-9 px-6 text-xs"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Recipient Details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[#777169]">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Name"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-lg px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[#777169]">
                    WhatsApp Phone Number
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-lg px-3 py-2 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                  />
                </div>
              </div>

              {/* Template Selector */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[#777169]">
                  Message Template
                </label>
                <select
                  value={template}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-lg px-3 py-2 text-xs font-medium text-[#0c0a09] focus:outline-none focus:border-[#0c0a09]"
                >
                  <option value="appointment_confirmed">Appointment Confirmation (A-001)</option>
                  <option value="appointment_requested">Appointment Request Acknowledgment</option>
                  <option value="lead_callback">Lead Callback / Interest Follow-up</option>
                  <option value="custom">Custom WhatsApp Message</option>
                </select>
              </div>

              {/* Message Body */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#777169]">
                  <label className="font-semibold uppercase tracking-wider">Message Content</label>
                  <span>{message.length} characters</span>
                </div>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Enter message to dispatch..."
                  className="w-full bg-[#fafafa] border border-[#e7e5e4] rounded-xl p-3 text-xs text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] leading-relaxed resize-none"
                />
              </div>

              {/* Related Reference Tag */}
              {(initialAppointment || initialLead || initialCall) && (
                <div className="p-2.5 bg-[#fafafa] rounded-lg border border-[#f0efed] flex items-center justify-between text-[11px] text-[#777169]">
                  <span>Attached Context</span>
                  <span className="font-mono font-medium text-[#0c0a09]">
                    {initialAppointment?.appointmentNumber || (initialLead ? 'Lead' : 'Call Session')}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="el-btn-outline h-9 px-4 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="el-btn-primary h-9 px-6 text-xs flex items-center gap-2"
                >
                  {sending ? 'Dispatching...' : 'Send WhatsApp'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
