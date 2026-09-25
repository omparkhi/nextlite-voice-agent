import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  generateGroupedTimeSlots,
  normalizeTimeString,
  parseTimeToMinutes,
  formatMinutesToTime,
} from '../../utils/timeSlots';

interface TimeSlotInputProps {
  value: string;
  onChange: (value: string) => void;
  businessHours?: string;
  slotDuration?: any;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  slotOccupancy?: Record<string, { booked: number; capacity: number }>;
}

export function TimeSlotInput({
  value,
  onChange,
  businessHours,
  slotDuration,
  className = '',
  placeholder = 'e.g. 10:00 AM',
  disabled = false,
  slotOccupancy,
}: TimeSlotInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNativePicker, setIsNativePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Grouped shifts based dynamically on clinic hours
  const groupedShifts = useMemo(() => {
    return generateGroupedTimeSlots(businessHours, slotDuration);
  }, [businessHours, slotDuration]);

  // Convert 12-hour AM/PM to 24-hour "HH:MM" for native time input
  const nativeTimeValue = useMemo(() => {
    const mins = parseTimeToMinutes(value);
    if (mins === null) return '10:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [value]);

  // Handle clicking outside to close the dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectSlot = (slot: string) => {
    onChange(slot);
    setIsOpen(false);
  };

  const handleBlur = () => {
    if (value) {
      const normalized = normalizeTimeString(value);
      if (normalized && normalized !== value) {
        onChange(normalized);
      }
    }
  };

  const handleNativeTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const timeVal = e.target.value; // "14:30"
    if (timeVal) {
      const [h, m] = timeVal.split(':').map(Number);
      const totalMinutes = h * 60 + m;
      onChange(formatMinutesToTime(totalMinutes));
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        {isNativePicker ? (
          <input
            type="time"
            disabled={disabled}
            value={nativeTimeValue}
            onChange={handleNativeTimeChange}
            onBlur={() => setIsNativePicker(false)}
            className={`w-full px-3.5 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] focus:outline-none focus:ring-1 focus:ring-[#0c0a09] focus:border-[#0c0a09] shadow-2xs h-10 transition ${className}`}
          />
        ) : (
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={`w-full pl-3.5 pr-16 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:ring-1 focus:ring-[#0c0a09] focus:border-[#0c0a09] shadow-2xs h-10 transition ${className}`}
          />
        )}

        {/* Action Controls inside input */}
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {/* Custom Time Switch Button */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setIsNativePicker(!isNativePicker);
              setIsOpen(false);
            }}
            className="p-1.5 rounded-lg text-[#78716c] hover:text-[#0c0a09] hover:bg-[#f5f5f4] transition cursor-pointer"
            title={isNativePicker ? 'Switch to standard shift slots' : 'Pick custom exact time'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>

          {/* Dropdown Toggle Chevron */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg text-[#78716c] hover:text-[#0c0a09] hover:bg-[#f5f5f4] transition cursor-pointer"
            title="Open time slots"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Premium 2-Column Split-Shift Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 max-h-80 overflow-y-auto bg-white border border-[#e7e5e4] rounded-2xl shadow-xl p-3 space-y-3 animate-in fade-in zoom-in-95 duration-100 min-w-[320px] sm:min-w-[440px]">
          
          {/* Header */}
          <div className="px-1 flex items-center justify-between border-b border-[#f0efed] pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-[#0c0a09] tracking-tight">
                Clinic Schedule Slots
              </span>
            </div>
            <span className="text-[11px] text-[#a8a29e] font-medium">
              Click to select
            </span>
          </div>

          {/* 2-Column Shift Columns */}
          <div className={`grid gap-3 ${groupedShifts.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {groupedShifts.map((group) => (
              <div
                key={group.id}
                className="bg-[#fafaf9] border border-[#e7e5e4] rounded-xl p-2.5 flex flex-col space-y-2"
              >
                {/* Clean Shift Time Header (No Emojis, No Generic Names) */}
                <div className="flex items-center justify-between px-1 pb-1.5 border-b border-[#e7e5e4]">
                  <div className="flex items-center gap-1.5 text-[#1c1917]">
                    {/* SVG Clock Icon */}
                    <svg className="w-3.5 h-3.5 text-[#78716c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className="text-xs font-semibold tracking-tight text-[#0c0a09]">
                      {group.timeRange}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-[#78716c] bg-white px-2 py-0.5 rounded-full border border-[#e7e5e4] shadow-2xs">
                    {group.slots.length} slots
                  </span>
                </div>

                {/* 2-Col Button Grid inside each shift */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  {group.slots.map((slot) => {
                    const isSelected = value === slot;
                    const occ = slotOccupancy ? slotOccupancy[slot] : undefined;
                    const isFull = occ ? occ.booked >= occ.capacity && occ.capacity > 0 : false;

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={`h-9 px-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between cursor-pointer border ${
                          isSelected
                            ? 'bg-[#0c0a09] text-white border-[#0c0a09] shadow-xs ring-1 ring-[#0c0a09]'
                            : isFull
                            ? 'bg-rose-50/70 text-rose-700 border-rose-200 hover:bg-rose-50 cursor-not-allowed opacity-80'
                            : 'bg-white border-[#e7e5e4] text-[#1c1917] hover:border-[#0c0a09] hover:bg-[#f5f5f4]'
                        }`}
                      >
                        <span className="font-semibold text-[11px] tracking-tight truncate">{slot}</span>
                        {isSelected ? (
                          <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : occ ? (
                          isFull ? (
                            <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-rose-100 text-rose-700">
                              FULL
                            </span>
                          ) : occ.booked > 0 ? (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              {occ.booked}/{occ.capacity}
                            </span>
                          ) : null
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Action Bar */}
          <div className="border-t border-[#f0efed] pt-2.5 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => {
                setIsNativePicker(true);
                setIsOpen(false);
              }}
              className="text-xs font-medium text-[#ea580c] hover:text-[#c2410c] transition flex items-center gap-1.5 cursor-pointer py-1"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Custom / Off-Hours Time</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-medium text-[#78716c] hover:text-[#0c0a09] px-2.5 py-1 rounded-lg hover:bg-[#f5f5f4] transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
