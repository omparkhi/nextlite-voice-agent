import { useState, useRef, useCallback, useEffect } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant, Participant } from 'livekit-client';
import { api } from '../services/api';

interface WebVoiceTestProps {
  clientId: string;
  agentId: string;
}

type ConnectionState =
  | 'idle'
  | 'permission'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'
  | 'ended';

interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

export default function WebVoiceTest({ clientId, agentId }: WebVoiceTestProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);

  const roomRef = useRef<Room | null>(null);
  const attachedAudioElementsRef = useRef<HTMLMediaElement[]>([]);

  // Detach and clean up all attached audio tracks
  const cleanupAudioElements = useCallback(() => {
    for (const el of attachedAudioElementsRef.current) {
      el.pause();
      el.srcObject = null;
      el.remove();
    }
    attachedAudioElementsRef.current = [];
  }, []);

  // Complete cleanup function
  const cleanup = useCallback(() => {
    cleanupAudioElements();
    if (roomRef.current) {
      roomRef.current.removeAllListeners();
      roomRef.current.disconnect();
      roomRef.current = null;
    }
  }, [cleanupAudioElements]);

  // Start voice test via LiveKit
  const handleStart = async () => {
    try {
      setError(null);
      setConnectionState('connecting');
      setTranscripts([]);

      // 1. Request test token & room from NextLite API
      const { livekitUrl, token } = await api.getTestToken(clientId, agentId);

      // 2. Initialize LiveKit Room
      const room = new Room({
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // 3. Setup Room Events
      room
        .on(RoomEvent.Connected, () => {
          setConnectionState('listening');
        })
        .on(RoomEvent.Disconnected, () => {
          setConnectionState('ended');
          cleanupAudioElements();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: unknown, _participant: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio) {
            const element = track.attach();
            attachedAudioElementsRef.current.push(element);
            // Ensure audio plays
            element.play().catch((playErr: unknown) => {
              console.warn('Audio autoplay failed, user interaction required:', playErr);
            });
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el: HTMLMediaElement) => el.remove());
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const remoteSpeaker = speakers.find((s) => s.identity !== room.localParticipant.identity);
          if (remoteSpeaker) {
            setConnectionState('speaking');
          } else {
            setConnectionState('listening');
          }
        })
        .on(RoomEvent.DataReceived, (payload: Uint8Array, _participant?: RemoteParticipant) => {
          try {
            const decoded = new TextDecoder().decode(payload);
            const data = JSON.parse(decoded);
            if (data?.type === 'transcript' && data?.text) {
              setTranscripts((prev) => [
                ...prev,
                {
                  role: data.role === 'user' ? 'user' : 'assistant',
                  text: data.text,
                  timestamp: Date.now(),
                },
              ]);
            }
          } catch {
            // Ignore non-JSON or unrelated data messages
          }
        });

      // 4. Connect to LiveKit Room
      await room.connect(livekitUrl, token);

      // 5. Enable and publish local microphone track
      setConnectionState('permission');
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setConnectionState('listening');
      } catch (micErr: any) {
        throw new Error(
          micErr?.message?.includes('Permission') || micErr?.name === 'NotAllowedError'
            ? 'Microphone permission denied. Please allow microphone access.'
            : `Failed to enable microphone: ${micErr?.message || micErr}`,
        );
      }
    } catch (err: any) {
      console.error('Error starting LiveKit voice test:', err);
      setError(err instanceof Error ? err.message : 'Failed to start LiveKit voice test');
      setConnectionState('error');
      cleanup();
    }
  };

  // Stop voice test
  const handleStop = useCallback(async () => {
    setConnectionState('ended');
    if (roomRef.current) {
      try {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      } catch {
        // Ignore mic disable error on stop
      }
      roomRef.current.disconnect();
    }
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Get state display info
  const getStateDisplay = () => {
    switch (connectionState) {
      case 'idle':
        return { text: 'Ready to start', color: 'text-[#777169]' };
      case 'permission':
        return { text: 'Requesting microphone permission...', color: 'text-[#777169]' };
      case 'connecting':
        return { text: 'Connecting to LiveKit...', color: 'text-[#777169]' };
      case 'connected':
        return { text: 'Connected', color: 'text-[#22c55e]' };
      case 'listening':
        return { text: 'Listening...', color: 'text-[#22c55e]' };
      case 'thinking':
        return { text: 'Processing...', color: 'text-[#f59e0b]' };
      case 'speaking':
        return { text: 'Agent speaking...', color: 'text-[#3b82f6]' };
      case 'error':
        return { text: 'Error', color: 'text-[#ef4444]' };
      case 'ended':
        return { text: 'Session ended', color: 'text-[#777169]' };
      default:
        return { text: 'Unknown', color: 'text-[#777169]' };
    }
  };

  const stateDisplay = getStateDisplay();
  const isActive = ['connected', 'listening', 'thinking', 'speaking'].includes(connectionState);

  return (
    <div className="flex flex-col h-full bg-[#fafaf9]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7e5e4]">
        <h2 className="text-xl font-semibold text-[#0c0a09] font-display-serif">
          Web Voice Test (LiveKit)
        </h2>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionState === 'listening'
                ? 'bg-[#22c55e] animate-pulse'
                : connectionState === 'thinking'
                ? 'bg-[#f59e0b] animate-pulse'
                : connectionState === 'speaking'
                ? 'bg-[#3b82f6] animate-pulse'
                : connectionState === 'error'
                ? 'bg-[#ef4444]'
                : 'bg-[#777169]'
            }`}
          />
          <span className={`text-sm ${stateDisplay.color}`}>{stateDisplay.text}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Microphone button */}
        <div className="relative mb-8">
          <button
            type="button"
            onClick={isActive ? handleStop : handleStart}
            disabled={connectionState === 'permission' || connectionState === 'connecting'}
            className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
              isActive
                ? 'bg-[#0c0a09] hover:bg-[#1c1917] shadow-lg'
                : 'bg-white border-2 border-[#d6d3d1] hover:border-[#0c0a09] hover:shadow-md'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isActive ? (
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-[#0c0a09]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            )}
          </button>

          {/* Pulse animation when listening */}
          {connectionState === 'listening' && (
            <div className="absolute inset-0 rounded-full border-4 border-[#22c55e] animate-ping opacity-20" />
          )}
        </div>

        {/* Instructions */}
        <p className="text-[#777169] text-sm text-center max-w-md mb-8">
          {connectionState === 'idle' && 'Click the microphone to start a live voice test with the agent.'}
          {connectionState === 'permission' && 'Please allow microphone access to continue.'}
          {connectionState === 'connecting' && 'Connecting to LiveKit room...'}
          {connectionState === 'connected' && 'Connected. Start speaking.'}
          {connectionState === 'listening' && 'Listening... Speak now.'}
          {connectionState === 'thinking' && 'Processing your message...'}
          {connectionState === 'speaking' && 'Agent is speaking... Speak to interrupt.'}
          {connectionState === 'error' && `Error: ${error}`}
          {connectionState === 'ended' && 'Session ended. Click to start again.'}
        </p>

        {/* Transcript Area */}
        {transcripts.length > 0 && (
          <div className="w-full max-w-2xl">
            <h3 className="text-sm font-medium text-[#777169] mb-3">Transcript</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transcripts.map((line, index) => (
                <div key={index} className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                      line.role === 'user'
                        ? 'bg-[#0c0a09] text-white rounded-br-sm'
                        : 'bg-white border border-[#e7e5e4] text-[#0c0a09] rounded-bl-sm'
                    }`}
                  >
                    {line.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer with stop button */}
      {isActive && (
        <div className="px-6 py-4 border-t border-[#e7e5e4]">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleStop}
              className="px-6 py-3 bg-[#0c0a09] text-white rounded-xl hover:bg-[#1c1917] transition-colors"
            >
              Stop Voice Test
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
