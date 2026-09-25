import React, { useState, useRef, useEffect, useMemo } from 'react';
import { generateTimeSlots, normalizeTimeString, parseTimeToMinutes, formatMinutesToTime } from '../../utils/timeSlots';

interface TimeSlotInputProps {
  value: string;
  onChange: (value: string) => void;
  businessHours?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  slotOccupancy?: Record<string, { booked: number; capacity: number }>;
}

export function TimeSlotInput({
  value,
  onChange,
  businessHours,
  className = '',
  placeholder = 'e.g. 10:00 AM',
  disabled = false,
  slotOccupancy,
}: TimeSlotInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNativePicker, setIsNativePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Generate dynamic slots based on business shifts (or broad default 8 AM - 9:30 PM)
  const availableSlots = useMemo(() => {
    return generateTimeSlots(businessHours, 30);
  }, [businessHours]);

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
            className={`w-full px-3 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10 ${className}`}
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
            className={`w-full pl-3 pr-16 py-2 text-xs font-medium bg-white border border-[#d6d3d1] rounded-xl text-[#0c0a09] placeholder:text-[#a8a29e] focus:outline-none focus:border-[#0c0a09] shadow-2xs h-10 ${className}`}
          />
        )}

        {/* Action Controls inside the input */}
        <div className="absolute right-1.5 flex items-center gap-1">
          {/* Native Picker Switch Button */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setIsNativePicker(!isNativePicker);
              setIsOpen(false);
            }}
            className="p-1 rounded-lg text-[#777169] hover:text-[#0c0a09] hover:bg-[#f0efed] transition"
            title={isNativePicker ? 'Switch to slot dropdown' : 'Pick custom exact time'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>

          {/* Dropdown Chevron */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 rounded-lg text-[#777169] hover:text-[#0c0a09] hover:bg-[#f0efed] transition"
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

      {/* Suggestion Dropdown Panel */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-[#e7e5e4] rounded-xl shadow-lg p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 flex items-center justify-between border-b border-[#f0efed] mb-1">
            <span className="text-[10px] font-semibold text-[#777169] uppercase tracking-wider">
              Clinic Time Slots
            </span>
            <span className="text-[10px] text-[#a8a29e]">or type custom time</span>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {availableSlots.map((slot) => {
              const isSelected = value === slot;
              const occ = slotOccupancy ? slotOccupancy[slot] : undefined;
              const isFull = occ ? occ.booked >= occ.capacity : false;

              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleSelectSlot(slot)}
                  className={`px-2.5 py-1.5 text-xs rounded-lg font-medium text-left transition flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-[#0c0a09] text-white'
                      : isFull
                      ? 'bg-[#fef2f2]/60 text-[#991b1b] hover:bg-[#fef2f2]'
                      : 'text-[#4e4e4e] hover:bg-[#f0efed] hover:text-[#0c0a09]'
                  }`}
                >
                  <span className="truncate">{slot}</span>
                  {isSelected ? (
                    <span className="text-[10px]">✓</span>
                  ) : occ ? (
                    isFull ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-rose-100 text-rose-700">
                        FULL
                      </span>
                    ) : occ.booked > 0 ? (
                      <span className="text-[9px] font-medium px-1 py-0.2 rounded bg-amber-100 text-amber-800">
                        {occ.booked}/{occ.capacity}
                      </span>
                    ) : null
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Quick Custom Time Action */}
          <div className="border-t border-[#f0efed] pt-1 mt-1">
            <button
              type="button"
              onClick={() => {
                setIsNativePicker(true);
                setIsOpen(false);
              }}
              className="w-full px-2.5 py-1.5 text-[11px] font-medium text-[#ea580c] hover:bg-[#fff7ed] rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Custom Time (e.g. 08:15 PM)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
