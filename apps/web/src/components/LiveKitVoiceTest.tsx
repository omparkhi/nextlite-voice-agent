import React, { useState } from 'react';
import { api } from '../services/api';

interface LiveKitVoiceTestProps {
  clientId: string;
  agentId: string;
  agentName: string;
  onClose: () => void;
}

export const LiveKitVoiceTest: React.FC<LiveKitVoiceTestProps> = ({
  clientId,
  agentId,
  agentName,
  onClose,
}) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [roomName, setRoomName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  const startTestCall = async () => {
    try {
      setStatus('connecting');
      setErrorMessage('');

      // 1. Fetch short-lived LiveKit token from NextLite API
      const res = await api.getLiveKitToken(clientId, agentId);
      const { token, serverUrl, roomName: rName } = res;
      setRoomName(rName);

      // 2. Connect to LiveKit Room via livekit-client
      const { Room, RoomEvent } = await import('livekit-client');
      const room = new Room();

      room.on(RoomEvent.Connected, () => {
        setStatus('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        setStatus('disconnected');
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setIsSpeaking(speakers.length > 0);
      });

      await room.connect(serverUrl, token);
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch (err: any) {
      console.error('Failed to start LiveKit test call:', err);
      setStatus('error');
      setErrorMessage(err.message || 'Failed to connect LiveKit session');
    }
  };

  const endTestCall = () => {
    setStatus('disconnected');
    setIsSpeaking(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-md">V2 LiveKit Engine</span>
            <h3 className="font-semibold text-zinc-900 text-lg">{agentName}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 text-xl font-bold p-1"
          >
            ✕
          </button>
        </div>

        <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
          <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
            status === 'connected'
              ? isSpeaking
                ? 'bg-emerald-500 text-white animate-pulse shadow-lg shadow-emerald-200'
                : 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50'
              : status === 'connecting'
              ? 'bg-amber-100 text-amber-600 animate-spin'
              : 'bg-zinc-100 text-zinc-400'
          }`}>
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-900 capitalize">
              {status === 'connected' ? (isSpeaking ? 'Agent Speaking...' : 'Listening to caller...') : status}
            </p>
            {roomName && (
              <p className="text-xs text-zinc-500 font-mono mt-1">Room: {roomName}</p>
            )}
            {errorMessage && (
              <p className="text-xs text-red-600 font-medium mt-2">{errorMessage}</p>
            )}
          </div>

          <div className="pt-4 flex space-x-3 w-full">
            {status === 'disconnected' || status === 'error' ? (
              <button
                onClick={startTestCall}
                className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-xl transition shadow-sm"
              >
                Start LiveKit Web Call
              </button>
            ) : (
              <button
                onClick={endTestCall}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition shadow-sm"
              >
                End Session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
