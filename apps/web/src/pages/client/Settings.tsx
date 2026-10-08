import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../services/api';
import type { ClinicHoliday, ClinicHolidayCreatePayload, ClinicScheduleConfig } from '../../types';
import { areEntitiesEqual, areObjectsEqual } from '../../utils/fastDiff';

export function ClientSettings() {
  const { isViewer } = useOutletContext<{ isViewer: boolean }>();
  const [activeTab, setActiveTab] = useState<'holidays' | 'hours'>('holidays');
  const [holidays, setHolidays] = useState<ClinicHoliday[]>([]);
  const [scheduleConfig, setScheduleConfig] = useState<ClinicScheduleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<ClinicHoliday | null>(null);
  const [formName, setFormName] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formIsRange, setFormIsRange] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<ClinicHoliday | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick Action Notification
  const [quickActionMsg, setQuickActionMsg] = useState<string | null>(null);

  // Today ISO in local format YYYY-MM-DD
  const todayIso = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const loadHolidays = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const data = await api.getClinicHolidays(false);
      const sorted = [...(data || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
      setHolidays((prev) => (areEntitiesEqual(prev, sorted) ? prev : sorted));
    } catch (err: any) {
      console.error('Failed to load holidays:', err);
      if (!silent) {
        setError(err?.message || 'Unable to fetch scheduled closures. Please try again.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const loadScheduleConfig = useCallback(async (silent = false) => {
    if (!silent) {
      setScheduleLoading(true);
    }
    try {
      const config = await api.getClinicScheduleConfig();
      setScheduleConfig((prev) => (areObjectsEqual(prev, config) ? prev : config));
    } catch (err) {
      console.error('Failed to load schedule config:', err);
    } finally {
      if (!silent) {
        setScheduleLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadHolidays();
    loadScheduleConfig();

    const handleRefresh = () => {
      loadHolidays(false);
      loadScheduleConfig(false);
    };
    const handleRefreshSilent = () => {
      loadHolidays(true);
      loadScheduleConfig(true);
    };

    window.addEventListener('crm-refresh', handleRefresh);
    window.addEventListener('crm-refresh-silent', handleRefreshSilent);
    return () => {
      window.removeEventListener('crm-refresh', handleRefresh);
      window.removeEventListener('crm-refresh-silent', handleRefreshSilent);
    };
  }, [loadHolidays, loadScheduleConfig]);

  // Derived Metrics
  const activeUpcomingHolidays = useMemo(() => {
    return holidays.filter((h) => h.endDate >= todayIso);
  }, [holidays, todayIso]);

  const nextHoliday = useMemo(() => {
    return activeUpcomingHolidays[0] || null;
  }, [activeUpcomingHolidays]);

  const nextReopeningDate = useMemo(() => {
    if (!nextHoliday) return null;
    try {
      const endDt = new Date(`${nextHoliday.endDate}T00:00:00`);
      endDt.setDate(endDt.getDate() + 1);
      return endDt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Next Business Day';
    }
  }, [nextHoliday]);

  const totalClosedDays = useMemo(() => {
    let days = 0;
    for (const h of activeUpcomingHolidays) {
      const start = new Date(`${h.startDate}T00:00:00`).getTime();
      const end = new Date(`${h.endDate}T00:00:00`).getTime();
      const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
      days += diffDays;
    }
    return days;
  }, [activeUpcomingHolidays]);

  // Modal Handlers
  const handleOpenAddModal = (initialStart?: string, initialEnd?: string, initialName?: string) => {
    setEditingHoliday(null);
    setFormName(initialName || '');
    setFormStartDate(initialStart || todayIso);
    setFormEndDate(initialEnd || initialStart || todayIso);
    setFormIsRange(Boolean(initialEnd && initialEnd !== initialStart));
    setFormNotes('');
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (h: ClinicHoliday) => {
    setEditingHoliday(h);
    setFormName(h.name);
    setFormStartDate(h.startDate);
    setFormEndDate(h.endDate);
    setFormIsRange(h.startDate !== h.endDate);
    setFormNotes(h.notes || '');
    setFormError(null);
    setFormSuccess(null);
    setModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Occasion / Reason name is required.');
      return;
    }
    if (!formStartDate) {
      setFormError('Start date is required.');
      return;
    }

    const effectiveEndDate = formIsRange && formEndDate ? formEndDate : formStartDate;
    if (effectiveEndDate < formStartDate) {
      setFormError('End date cannot be before start date.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    const payload: ClinicHolidayCreatePayload = {
      name: formName.trim(),
      startDate: formStartDate,
      endDate: effectiveEndDate,
      isEntireDay: true,
      notes: formNotes.trim() || undefined,
    };

    try {
      if (editingHoliday) {
        await api.updateClinicHoliday(editingHoliday.id, payload);
        setFormSuccess('Scheduled closure updated successfully.');
      } else {
        await api.createClinicHoliday(payload);
        setFormSuccess('Scheduled closure created successfully.');
      }

      setTimeout(() => {
        setModalOpen(false);
        setFormSuccess(null);
        loadHolidays(true);
      }, 700);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save scheduled closure.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHoliday = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteClinicHoliday(deleteTarget.id);
      setDeleteTarget(null);
      loadHolidays(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete closure.');
    } finally {
      setDeleting(false);
    }
  };

  // 1-Click Quick Preset Handlers
  const handleQuickCloseToday = async () => {
    try {
      await api.createClinicHoliday({
        name: 'Clinic Closed Today',
        startDate: todayIso,
        endDate: todayIso,
        isEntireDay: true,
      });
      setQuickActionMsg('Today has been set as closed. The assistant will inform callers.');
      setTimeout(() => setQuickActionMsg(null), 3500);
      loadHolidays(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to set closure for today.');
    }
  };

  const handleQuickCloseTomorrow = async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowIso = tomorrow.toISOString().split('T')[0];
      await api.createClinicHoliday({
        name: 'Clinic Closed Tomorrow',
        startDate: tomorrowIso,
        endDate: tomorrowIso,
        isEntireDay: true,
      });
      setQuickActionMsg('Tomorrow has been set as closed. The assistant will inform callers.');
      setTimeout(() => setQuickActionMsg(null), 3500);
      loadHolidays(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to set closure for tomorrow.');
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const dt = new Date(`${dateStr}T00:00:00`);
      return dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getDurationDays = (start: string, end: string) => {
    try {
      const s = new Date(`${start}T00:00:00`).getTime();
      const e = new Date(`${end}T00:00:00`).getTime();
      const diff = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
      return diff === 1 ? '1 Day' : `${diff} Days`;
    } catch {
      return '1 Day';
    }
  };

  const getReopeningDayString = (endStr: string) => {
    try {
      const dt = new Date(`${endStr}T00:00:00`);
      dt.setDate(dt.getDate() + 1);
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return 'the following business day';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-[#0c0a09]">Settings &amp; Schedule</h1>
          <p className="text-xs text-[#777169] mt-0.5">
            Manage clinic closures, holiday dates, and review operational shifts.
          </p>
        </div>

        {activeTab === 'holidays' && !isViewer && (
          <button
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#0c0a09] text-white hover:bg-[#292524] rounded-xl text-xs font-medium shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add Closed Dates</span>
          </button>
        )}
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 pb-px overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('holidays')}
          className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${activeTab === 'holidays'
            ? 'border-[#0c0a09] text-[#0c0a09]'
            : 'border-transparent text-[#777169] hover:text-[#0c0a09]'
            }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="4" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>Clinic Closures &amp; Holidays</span>
          {activeUpcomingHolidays.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#f5f5f4] text-[#57534e] border border-[#e7e5e4]">
              {activeUpcomingHolidays.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('hours')}
          className={`px-3.5 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${activeTab === 'hours'
            ? 'border-[#0c0a09] text-[#0c0a09]'
            : 'border-transparent text-[#777169] hover:text-[#0c0a09]'
            }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Operating Shifts &amp; Hours</span>
        </button>
      </div>

      {/* Quick Action Toast Alert */}
      {quickActionMsg && (
        <div className="bg-emerald-50 border border-emerald-200/70 text-emerald-800 px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{quickActionMsg}</span>
          </div>
          <button onClick={() => setQuickActionMsg(null)} className="text-emerald-700 hover:text-emerald-900 text-xs cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: Scheduled Closures & Holidays */}
      {activeTab === 'holidays' && (
        <div className="space-y-5">
          {/* Top 3 Clean Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Metric 1 */}
            <div className="bg-white border border-[#e7e5e4] rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#777169]">Scheduled Closures</span>
                <div className="w-7 h-7 rounded-lg bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center text-[#777169]">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="4" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              <div className="mt-2.5">
                <div className="text-xl font-medium text-[#0c0a09]">
                  {loading && holidays.length === 0 ? '...' : `${totalClosedDays} ${totalClosedDays === 1 ? 'Day' : 'Days'}`}
                </div>
                <p className="text-[11px] text-[#777169] mt-0.5">Upcoming closed dates</p>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-white border border-[#e7e5e4] rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#777169]">Next Holiday</span>
                <div className="w-7 h-7 rounded-lg bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center text-[#777169]">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
              </div>
              <div className="mt-2.5 truncate">
                <div className="text-lg font-medium text-[#0c0a09] truncate" title={nextHoliday?.name || 'None Scheduled'}>
                  {loading && holidays.length === 0 ? '...' : (nextHoliday?.name || 'None Scheduled')}
                </div>
                <p className="text-[11px] text-[#777169] mt-0.5">
                  {nextHoliday ? formatDateDisplay(nextHoliday.startDate) : 'Operating normally'}
                </p>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-white border border-[#e7e5e4] rounded-2xl p-4 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#777169]">Next Reopening</span>
                <div className="w-7 h-7 rounded-lg bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center text-[#777169]">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </div>
              </div>
              <div className="mt-2.5 truncate">
                <div className="text-lg font-medium text-[#0c0a09] truncate" title={nextReopeningDate || 'Open Today'}>
                  {loading && holidays.length === 0 ? '...' : (nextReopeningDate || 'Open Today')}
                </div>
                <p className="text-[11px] text-[#777169] mt-0.5">Offered to callers</p>
              </div>
            </div>
          </div>

          {/* Quick 1-Click Action Bar */}
          {!isViewer && (
            <div className="bg-[#fafaf9] border border-[#e7e5e4] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white border border-[#e7e5e4] flex items-center justify-center text-[#0c0a09] shrink-0">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-medium text-[#0c0a09]">Quick Blackout Shortcuts</h2>
                  <p className="text-[11px] text-[#777169]">1-click action to close clinic for unexpected leaves.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleQuickCloseToday}
                  className="px-3 py-1.5 bg-white border border-[#e7e5e4] text-[#0c0a09] hover:bg-[#f5f5f4] rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Close Today</span>
                </button>

                <button
                  onClick={handleQuickCloseTomorrow}
                  className="px-3 py-1.5 bg-white border border-[#e7e5e4] text-[#0c0a09] hover:bg-[#f5f5f4] rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                  <span>Close Tomorrow</span>
                </button>

                <button
                  onClick={() => handleOpenAddModal(todayIso, todayIso, 'Clinic Holiday')}
                  className="px-3 py-1.5 bg-white border border-[#e7e5e4] text-[#0c0a09] hover:bg-[#f5f5f4] rounded-xl text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Custom Range</span>
                </button>
              </div>
            </div>
          )}

          {/* Holidays & Closures Table */}
          <div className="bg-white border border-[#e7e5e4] rounded-2xl overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-[#e7e5e4] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-[#0c0a09]">Configured Closures &amp; Holidays</h3>
                <p className="text-[11px] text-[#777169]">
                  Dates when the clinic will not accept appointment bookings.
                </p>
              </div>
            </div>

            {loading && holidays.length === 0 ? (
              <div className="p-8 text-center text-[#777169] text-xs">
                <div className="inline-block w-4 h-4 border-2 border-[#0c0a09] border-t-transparent rounded-full animate-spin mr-2" />
                Loading closures...
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-600 text-xs">
                <p>{error}</p>
                <button
                  onClick={() => loadHolidays(false)}
                  className="mt-2.5 px-3 py-1.5 bg-white border border-[#e7e5e4] text-[#0c0a09] rounded-lg text-xs hover:bg-[#f5f5f4]"
                >
                  Retry
                </button>
              </div>
            ) : holidays.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center mx-auto text-[#777169]">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="4" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <h4 className="text-sm font-medium text-[#0c0a09] mt-3">No Holiday Closures Configured</h4>
                <p className="text-xs text-[#777169] mt-0.5 max-w-sm mx-auto">
                  The voice assistant is accepting appointments normally according to operating hours.
                </p>
                {!isViewer && (
                  <button
                    onClick={() => handleOpenAddModal()}
                    className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#0c0a09] text-white hover:bg-[#292524] rounded-xl text-xs font-medium shadow-xs transition-colors cursor-pointer"
                  >
                    <span>Add First Holiday</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#fafaf9] border-b border-[#e7e5e4] text-[10px] text-[#777169] uppercase tracking-wider font-medium">
                      <th className="py-2.5 px-4">Occasion / Reason</th>
                      <th className="py-2.5 px-4">Date Range</th>
                      <th className="py-2.5 px-4">Duration</th>
                      <th className="py-2.5 px-4">AI Informs Callers</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                      {!isViewer && <th className="py-2.5 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f4] text-xs">
                    {holidays.map((h) => {
                      const isPast = h.endDate < todayIso;
                      const isTodayActive = h.startDate <= todayIso && h.endDate >= todayIso;
                      const reopenDay = getReopeningDayString(h.endDate);

                      return (
                        <tr key={h.id} className="hover:bg-[#fafaf9]/70 transition-colors">
                          <td className="py-3 px-4 font-medium text-[#0c0a09]">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center text-[#777169] shrink-0">
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              </div>
                              <div>
                                <span className="text-[#0c0a09]">{h.name}</span>
                                {h.notes && <p className="text-[10px] text-[#777169] truncate max-w-xs">{h.notes}</p>}
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-[#44403c] whitespace-nowrap">
                            {h.startDate === h.endDate ? (
                              <span>{formatDateDisplay(h.startDate)}</span>
                            ) : (
                              <span>
                                {formatDateDisplay(h.startDate)} → {formatDateDisplay(h.endDate)}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-[#777169] whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-[#fafaf9] border border-[#e7e5e4] text-[11px] text-[#44403c]">
                              {getDurationDays(h.startDate, h.endDate)}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-[#777169] text-[11px]">
                            <div className="flex items-center gap-1.5 text-[#57534e]">
                              <svg className="w-3 h-3 text-emerald-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                              </svg>
                              <span className="truncate max-w-xs">
                                Reopens on <span className="text-[#0c0a09] font-medium">{reopenDay}</span>
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isTodayActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/80 inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Closed Today</span>
                              </span>
                            ) : isPast ? (
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-stone-100 text-stone-600 border border-stone-200/80">
                                Expired
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                                Upcoming
                              </span>
                            )}
                          </td>

                          {!isViewer && (
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleOpenEditModal(h)}
                                  className="p-1 text-[#777169] hover:text-[#0c0a09] hover:bg-[#f5f5f4] rounded-lg transition-colors cursor-pointer"
                                  title="Edit Closure"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>

                                <button
                                  onClick={() => setDeleteTarget(h)}
                                  className="p-1 text-[#777169] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete Closure"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Operating Shifts & Hours (Dynamic Real Variable Data) */}
      {activeTab === 'hours' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#e7e5e4] rounded-2xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center gap-3 border-b border-[#e7e5e4] pb-3.5">
              <div className="w-8 h-8 rounded-xl bg-[#fafaf9] border border-[#e7e5e4] flex items-center justify-center text-[#0c0a09]">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-medium text-[#0c0a09]">Configured Operating Schedule</h2>
                <p className="text-xs text-[#777169]">
                  Live operational hours and appointment rules synced from your voice assistant configuration.
                </p>
              </div>
            </div>

            {scheduleLoading && !scheduleConfig ? (
              <div className="p-6 text-center text-[#777169] text-xs">
                <div className="inline-block w-4 h-4 border-2 border-[#0c0a09] border-t-transparent rounded-full animate-spin mr-2" />
                Loading schedule variables...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Weekly Shifts */}
                <div className="p-4 rounded-xl border border-[#e7e5e4] bg-[#fafaf9] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#777169] uppercase tracking-wider">Business Shifts</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white border border-[#e7e5e4] text-[#57534e]">
                      {scheduleConfig?.timezone || 'Asia/Kolkata'}
                    </span>
                  </div>

                  <p className="text-xs text-[#0c0a09] leading-relaxed">
                    {scheduleConfig?.businessHours || 'Monday to Saturday: 10:00 AM - 01:00 PM and 06:00 PM - 09:00 PM (Sunday Closed)'}
                  </p>

                  {scheduleConfig?.shifts && scheduleConfig.shifts.length > 0 && (
                    <div className="pt-2 border-t border-[#e7e5e4]/70 space-y-1.5">
                      <span className="text-[11px] text-[#777169] block">Open Shift Windows:</span>
                      <div className="flex flex-wrap gap-2">
                        {scheduleConfig.shifts.map((s, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg bg-white border border-[#e7e5e4] text-xs text-[#0c0a09] font-medium"
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Appointment Capacity Rules */}
                <div className="p-4 rounded-xl border border-[#e7e5e4] bg-[#fafaf9] space-y-3">
                  <span className="text-[11px] font-medium text-[#777169] uppercase tracking-wider">Appointment Variables</span>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#e7e5e4]/60">
                      <span className="text-[#57534e]">Slot Duration (slotDuration):</span>
                      <span className="font-medium text-[#0c0a09]">{scheduleConfig?.slotDuration || '30 mins'}</span>
                    </div>

                    <div className="flex items-center justify-between py-1.5 border-b border-[#e7e5e4]/60">
                      <span className="text-[#57534e]">Patients Per Slot (patientsPerSlot):</span>
                      <span className="font-medium text-[#0c0a09]">
                        {scheduleConfig?.patientsPerSlot ? `${scheduleConfig.patientsPerSlot} Patient` : '1 Patient'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-[#57534e]">Collision Prevention:</span>
                      <span className="text-emerald-700 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Strict Real-Time Lock</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Holiday Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-[#e7e5e4] rounded-2xl shadow-xl w-full max-w-md p-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#e7e5e4] pb-3">
              <div>
                <h3 className="text-sm font-medium text-[#0c0a09]">
                  {editingHoliday ? 'Edit Scheduled Closure' : 'Schedule Closed Dates'}
                </h3>
                <p className="text-[11px] text-[#777169]">Assistant will not take appointments on these dates.</p>
              </div>

              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-[#777169] hover:text-[#0c0a09] rounded-lg cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="mt-3.5 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">
                  {formSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs text-[#0c0a09] font-medium mb-1">
                  Occasion / Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Diwali Festival, Doctor on Leave, Clinic Off"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09] transition-all bg-white text-[#0c0a09]"
                />
              </div>

              {/* Date Selection Type Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-[#0c0a09] font-medium">Date Duration</label>
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setFormIsRange(false)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] transition-colors cursor-pointer ${!formIsRange ? 'bg-[#0c0a09] text-white border-[#0c0a09]' : 'bg-white text-[#777169] border-[#e7e5e4]'
                        }`}
                    >
                      Single Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIsRange(true)}
                      className={`px-2 py-0.5 rounded-lg border text-[11px] transition-colors cursor-pointer ${formIsRange ? 'bg-[#0c0a09] text-white border-[#0c0a09]' : 'bg-white text-[#777169] border-[#e7e5e4]'
                        }`}
                    >
                      Date Range
                    </button>
                  </div>
                </div>

                {!formIsRange ? (
                  <div>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => {
                        setFormStartDate(e.target.value);
                        setFormEndDate(e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-[#e7e5e4] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09] transition-all bg-white text-[#0c0a09]"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[10px] text-[#777169] block mb-0.5">Start Date</span>
                      <input
                        type="date"
                        required
                        value={formStartDate}
                        onChange={(e) => setFormStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-[#e7e5e4] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09] transition-all bg-white text-[#0c0a09]"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777169] block mb-0.5">End Date</span>
                      <input
                        type="date"
                        required
                        min={formStartDate}
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                        className="w-full px-3 py-2 border border-[#e7e5e4] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09] transition-all bg-white text-[#0c0a09]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-[#0c0a09] font-medium mb-1">
                  Notes <span className="text-[#777169] font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional internal reminder..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-[#e7e5e4] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09] transition-all bg-white resize-none text-[#0c0a09]"
                />
              </div>

              {/* Dynamic Live AI Script Preview */}
              <div className="bg-[#fafaf9] border border-[#e7e5e4] rounded-xl p-3 text-[11px] text-[#57534e]">
                <div className="flex items-center gap-1.5 text-[#0c0a09] font-medium mb-1">
                  <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  </svg>
                  <span>Caller Answer Preview</span>
                </div>
                <p className="italic text-[#44403c] leading-relaxed">
                  &ldquo;The clinic is closed on{' '}
                  {formStartDate ? formatDateDisplay(formStartDate) : 'selected date'}
                  {formIsRange && formEndDate && formEndDate !== formStartDate
                    ? ` through ${formatDateDisplay(formEndDate)}`
                    : ''}{' '}
                  for {formName || 'scheduled holiday'}. We will reopen on{' '}
                  <span className="text-[#0c0a09] font-medium">
                    {getReopeningDayString(formIsRange && formEndDate ? formEndDate : formStartDate)}
                  </span>
                  . Would you like to book for that day instead?&rdquo;
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e7e5e4]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 border border-[#e7e5e4] text-[#0c0a09] hover:bg-[#f5f5f4] rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 bg-[#0c0a09] text-white hover:bg-[#292524] rounded-xl text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {submitting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  <span>{editingHoliday ? 'Update Closure' : 'Save Closure'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-[#e7e5e4] rounded-2xl shadow-xl w-full max-w-sm p-5 text-center space-y-3.5">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>

            <div>
              <h3 className="text-sm font-medium text-[#0c0a09]">Delete Scheduled Closure?</h3>
              <p className="text-xs text-[#777169] mt-0.5">
                Remove <strong>{deleteTarget.name}</strong> ({formatDateDisplay(deleteTarget.startDate)})?
                Appointments will resume normally on this date.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 border border-[#e7e5e4] text-[#0c0a09] hover:bg-[#f5f5f4] rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteHoliday}
                disabled={deleting}
                className="px-3.5 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-xl text-xs font-medium shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {deleting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default ClientSettings;
