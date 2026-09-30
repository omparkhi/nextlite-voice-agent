import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { CallRecordingResponse } from '../../types';

interface CallAudioPlayerProps {
  recording: CallRecordingResponse | null;
  loading: boolean;
  totalDurationSeconds?: number;
  callId: string;
  onRefresh: () => void;
}

export function CallAudioPlayer({
  recording,
  loading,
  totalDurationSeconds = 0,
  callId,
  onRefresh,
}: CallAudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(totalDurationSeconds || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Synchronize duration
  useEffect(() => {
    if (recording?.durationSeconds && recording.durationSeconds > 0) {
      setDuration(recording.durationSeconds);
    } else if (totalDurationSeconds > 0) {
      setDuration(totalDurationSeconds);
    }
  }, [recording, totalDurationSeconds]);

  // Reset state when switching calls
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [callId]);

  // Format as M:SS (e.g. 0:00 / 0:13) matching reference image
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (seconds: number) => {
    const clamped = Math.max(0, Math.min(seconds, duration || 1));
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || !duration) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
    handleSeek(percentage * duration);
  };

  const cyclePlaybackRate = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextRate = speeds[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRef.current.muted = nextMuted;
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
        audioRef.current.muted = true;
      } else if (isMuted) {
        setIsMuted(false);
        audioRef.current.muted = false;
      }
    }
  };

  // Generate natural speech waveform with realistic bursts & pauses matching user screenshot
  const waveformBars = useMemo(() => {
    const barsCount = 68;
    let seed = 0;
    for (let i = 0; i < callId.length; i++) {
      seed = (seed << 5) - seed + callId.charCodeAt(i);
      seed |= 0;
    }
    const pseudo = (idx: number) => {
      const x = Math.sin(seed + idx * 437.5854) * 10000;
      return x - Math.floor(x);
    };

    // Pre-defined natural conversation rhythm envelopes: clusters of voice & pauses
    return Array.from({ length: barsCount }, (_, idx) => {
      const pos = idx / barsCount;

      // Burst clusters mimicking screenshot (0.08-0.16, 0.20-0.34, 0.38-0.54, pause in middle, 0.78-0.86, 0.88-0.98)
      let clusterFactor = 0;
      if (pos >= 0.08 && pos <= 0.16) {
        clusterFactor = Math.sin(((pos - 0.08) / 0.08) * Math.PI);
      } else if (pos >= 0.18 && pos <= 0.32) {
        clusterFactor = Math.sin(((pos - 0.18) / 0.14) * Math.PI);
      } else if (pos >= 0.34 && pos <= 0.52) {
        clusterFactor = Math.sin(((pos - 0.34) / 0.18) * Math.PI);
      } else if (pos >= 0.76 && pos <= 0.85) {
        clusterFactor = Math.sin(((pos - 0.76) / 0.09) * Math.PI);
      } else if (pos >= 0.87 && pos <= 0.98) {
        clusterFactor = Math.sin(((pos - 0.87) / 0.11) * Math.PI);
      }

      if (clusterFactor <= 0.05) {
        return 0; // Baseline silence
      }

      const noise = 0.55 + pseudo(idx) * 0.45;
      const height = Math.max(14, Math.min(96, Math.round(clusterFactor * noise * 100)));
      return height;
    });
  }, [callId]);

  const progressFraction = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // 1. Loading Skeleton
  if (loading) {
    return (
      <div className="py-2 px-3 bg-[#fafaf9] border border-[#e7e5e4] rounded-xl flex items-center gap-2.5 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-[#e7e5e4] shrink-0" />
        <div className="flex-1 h-6 bg-[#e7e5e4] rounded-lg" />
      </div>
    );
  }

  // 2. Pending Processing
  if (recording?.status === 'PENDING') {
    return (
      <div className="py-2 px-3 bg-[#fafaf9] rounded-xl flex items-center justify-between border border-[#e7e5e4] text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#eab308] animate-ping" />
          <span className="text-[#4e4e4e] text-[11px] font-medium">Recording processing (ready shortly)...</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[11px] text-[#0c0a09] hover:underline font-semibold cursor-pointer"
        >
          Refresh
        </button>
      </div>
    );
  }

  // 3. Unavailable State
  if (recording?.status === 'UNAVAILABLE' || (!recording?.recordingUrl && !loading)) {
    return (
      <div className="py-2 px-3 bg-[#fafaf9] rounded-xl flex items-center justify-between text-[11px] text-[#777169] border border-[#e7e5e4]">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-[#a8a29e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M3 3l18 18" />
          </svg>
          <span>No audio recording available for this call</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[11px] text-[#0c0a09] hover:underline font-medium cursor-pointer"
        >
          Check
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#fbfbfa] border border-[#e7e5e4] rounded-xl p-2.5 shadow-2xs select-none">
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src={recording?.recordingUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        preload="metadata"
      />

      {/* Top Section: Play Button + Waveform Track */}
      <div className="flex items-center gap-2.5">
        {/* Play / Pause Circular Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-gray-400 hover:bg-gray-500 text-white flex items-center justify-center transition active:scale-95 cursor-pointer shrink-0 shadow-2xs"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <rect x="6" y="5" width="3.5" height="14" rx="1" />
              <rect x="14.5" y="5" width="3.5" height="14" rx="1" />
            </svg>
          ) : (
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l10.28-6.86a1 1 0 0 0 0-1.66L9.55 4.31A1 1 0 0 0 8 5.14z" />
            </svg>
          )}
        </button>

        {/* Waveform Track with Center Dashed Line & Needle */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="relative flex-1 h-7 flex items-center cursor-pointer group py-0.5"
        >
          {/* Dashed Center Baseline */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] border-b border-dashed border-[#d6d3d1] z-0" />

          {/* Waveform Bars */}
          <div className="relative z-10 w-full h-full flex items-center justify-between gap-[1.5px]">
            {waveformBars.map((height, idx) => {
              const barPos = idx / waveformBars.length;
              const isPassed = barPos <= progressFraction;

              if (height === 0) {
                return (
                  <div
                    key={idx}
                    className="flex-1 h-0"
                  />
                );
              }

              return (
                <div
                  key={idx}
                  className="flex-1 rounded-full transition-colors duration-75"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isPassed ? '#0c0a09' : '#d6d3d1',
                  }}
                />
              );
            })}
          </div>

          {/* Vertical Playhead Needle Indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-6 bg-[#0c0a09] rounded-full z-20 pointer-events-none transition-all duration-75 shadow-2xs"
            style={{
              left: `${progressFraction * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>

      {/* Bottom Section: Timestamp (Left) & Controls (Right) */}
      <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-[#f0efed]">
        {/* Timestamp */}
        <span className="text-[11px] font-mono font-medium text-[#44403c] tracking-tight">
          {formatTime(currentTime)} <span className="text-[#a8a29e]">/</span> {formatTime(duration || totalDurationSeconds)}
        </span>

        {/* Right Actions: Speed, Volume, Download */}
        <div className="flex items-center gap-1.5">
          {/* Speed Pill */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="px-1.5 py-0.5 rounded-md bg-white border border-[#e7e5e4] text-[#0c0a09] text-[10px] font-mono font-semibold transition active:scale-95 cursor-pointer hover:bg-[#fafafa]"
            title="Toggle Playback Speed"
          >
            {playbackRate}x
          </button>

          {/* Volume Button with Hover Popup */}
          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              type="button"
              onClick={toggleMute}
              className="text-[#777169] hover:text-[#0c0a09] transition cursor-pointer p-1 rounded-md hover:bg-white"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            {/* Volume popup slider */}
            {showVolumeSlider && (
              <div className="absolute right-0 bottom-full mb-1.5 p-2 bg-[#0c0a09] text-white rounded-lg shadow-lg z-30 flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            )}
          </div>

          {/* Download Icon */}
          {recording?.recordingUrl && (
            <a
              href={recording.recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={`recording-${callId}.mp3`}
              className="text-[#777169] hover:text-[#0c0a09] transition cursor-pointer p-1 rounded-md hover:bg-white"
              title="Download Audio Recording"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
