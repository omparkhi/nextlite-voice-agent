import { useState, useRef, useCallback, useEffect } from 'react';
import { getAccessToken } from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface WebVoiceTestProps {
  clientId: string;
  agentId: string;
}

type ConnectionState = 'idle' | 'permission' | 'connecting' | 'connected' | 'listening' | 'thinking' | 'speaking' | 'error' | 'ended';

interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// Convert base64 string to ArrayBuffer in browser
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert PCM16 ArrayBuffer to Web Audio API AudioBuffer
function createPcmAudioBuffer(ctx: AudioContext, buffer: ArrayBuffer, sampleRate: number): AudioBuffer {
  const sampleCount = Math.floor(buffer.byteLength / 2);
  const int16Array = new Int16Array(buffer, 0, sampleCount);
  const audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate);
  const channelData = audioBuffer.getChannelData(0);
  for (let i = 0; i < int16Array.length; i++) {
    channelData[i] = int16Array[i] / 32768.0;
  }
  return audioBuffer;
}

export default function WebVoiceTest({ clientId: _clientId, agentId }: WebVoiceTestProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const playbackSampleRateRef = useRef(16000);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Play audio from queue — sequential playback
  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    if (!audioContextRef.current) return;

    // Ensure AudioContext is running
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    isPlayingRef.current = true;
    const ctx = audioContextRef.current;
    const sampleRate = playbackSampleRateRef.current;

    while (audioQueueRef.current.length > 0) {
      const buffer = audioQueueRef.current.shift()!;
      try {
        // Convert PCM16 ArrayBuffer to AudioBuffer
        const audioBuffer = createPcmAudioBuffer(ctx, buffer, sampleRate);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        await new Promise<void>((resolve) => {
          source.onended = () => resolve();
          source.start(0);
        });
      } catch (err) {
        console.error('Error playing audio chunk:', err);
      }
    }
    isPlayingRef.current = false;
  }, []);

  // Stop playback and clear queue
  const stopPlayback = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // Start voice test
  const handleStart = async () => {
    try {
      setError(null);
      setConnectionState('permission');
      setTranscripts([]);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      setConnectionState('connecting');

      // Get access token from API service (stored in memory)
      const token = getAccessToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Create AudioContext AFTER user interaction (required by browsers)
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = ctx;

      // Resume AudioContext (browsers may suspend it)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create WebSocket connection to backend API
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const apiHost = API_URL.replace(/^https?:\/\//, '');
      const wsUrl = `${protocol}//${apiHost}/api/voice/stream?token=${encodeURIComponent(token)}&agent-id=${encodeURIComponent(agentId)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionState('connected');

        // Create source from microphone
        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;

        // Create processor for capturing audio
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        // Route through silent GainNode to destination so processor fires without feeding mic back into speakers
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        processor.connect(silentGain);
        silentGain.connect(ctx.destination);

        // Send audio to WebSocket as PCM16 base64
        processor.onaudioprocess = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const inputData = event.inputBuffer.getChannelData(0);
          // Convert float32 to int16
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }

          // Convert to base64
          const bytes = new Uint8Array(int16Data.buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = window.btoa(binary);

          ws.send(JSON.stringify({
            type: 'audio',
            data: base64,
          }));
        };

        // Send start event
        ws.send(JSON.stringify({ type: 'start', sampleRate: 16000 }));
        setConnectionState('listening');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'state': {
              const newState = data.state as ConnectionState;
              setConnectionState(newState);
              break;
            }

            case 'transcript':
              setTranscripts(prev => [
                ...prev,
                {
                  role: data.isFinal ? 'assistant' : 'user',
                  text: data.text,
                  timestamp: Date.now(),
                },
              ]);
              break;

            case 'audio': {
              // Decode base64 audio and add to queue for sequential playback
              const sampleRate = data.sampleRate || 16000;
              playbackSampleRateRef.current = sampleRate;
              const audioData = base64ToArrayBuffer(data.data);
              audioQueueRef.current.push(audioData);
              playAudioQueue();
              break;
            }

            case 'error':
              setError(data.message);
              break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        setConnectionState('error');
        cleanup();
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnectionState('ended');
        cleanup();
      };

    } catch (err) {
      console.error('Error starting voice test:', err);
      setError(err instanceof Error ? err.message : 'Failed to start voice test');
      setConnectionState('error');
      cleanup();
    }
  };

  // Stop voice test
  const handleStop = useCallback(() => {
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    setConnectionState('ended');
    cleanup();
  }, [cleanup, stopPlayback]);

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
        return { text: 'Connecting...', color: 'text-[#777169]' };
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
          Web Voice Test
        </h2>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            connectionState === 'listening' ? 'bg-[#22c55e] animate-pulse' :
            connectionState === 'thinking' ? 'bg-[#f59e0b] animate-pulse' :
            connectionState === 'speaking' ? 'bg-[#3b82f6] animate-pulse' :
            connectionState === 'error' ? 'bg-[#ef4444]' :
            'bg-[#777169]'
          }`} />
          <span className={`text-sm ${stateDisplay.color}`}>{stateDisplay.text}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Microphone button */}
        <div className="relative mb-8">
          <button
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            ) : (
              <svg className="w-12 h-12 text-[#0c0a09]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
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
          {connectionState === 'idle' && 'Click the microphone to start a voice test with the agent.'}
          {connectionState === 'permission' && 'Please allow microphone access to continue.'}
          {connectionState === 'connecting' && 'Establishing connection...'}
          {connectionState === 'connected' && 'Connected. Start speaking.'}
          {connectionState === 'listening' && 'Listening... Speak now.'}
          {connectionState === 'thinking' && 'Processing your message...'}
          {connectionState === 'speaking' && 'Agent is speaking... Click mic to interrupt.'}
          {connectionState === 'error' && `Error: ${error}`}
          {connectionState === 'ended' && 'Session ended. Click to start again.'}
        </p>

        {/* Transcript */}
        {transcripts.length > 0 && (
          <div className="w-full max-w-2xl">
            <h3 className="text-sm font-medium text-[#777169] mb-3">Transcript</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transcripts.map((line, index) => (
                <div
                  key={index}
                  className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
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
