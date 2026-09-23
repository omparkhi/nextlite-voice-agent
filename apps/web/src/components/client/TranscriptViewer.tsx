import { useState } from 'react';
import { formatPhoneNumber } from '@/utils/formatPhoneNumber';

interface Turn {
  speaker: 'AI' | 'Caller' | 'Agent' | string;
  text: string;
  timestamp?: number | string;
  durationMs?: number;
}

interface TranscriptViewerProps {
  transcriptText?: string | null;
  turnsJson?: any[] | null;
  agentName?: string;
  callerNumber?: string | null;
}

export function TranscriptViewer({
  transcriptText,
  turnsJson,
  agentName = 'AI Assistant',
  callerNumber = 'Caller',
}: TranscriptViewerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const parsedTurns: Turn[] = Array.isArray(turnsJson) && turnsJson.length > 0
    ? turnsJson.flatMap((t: any) => {
      if (t.speaker && t.text) {
        return [{
          speaker: t.speaker,
          text: t.text,
          timestamp: t.timestamp,
          durationMs: t.durationMs,
        }];
      }
      const list: Turn[] = [];
      if (t.user?.transcript) {
        list.push({
          speaker: 'Caller',
          text: t.user.transcript,
          timestamp: t.user.timestamp || t.startTime,
        });
      }
      if (t.agent?.response) {
        list.push({
          speaker: 'AI',
          text: t.agent.response,
          timestamp: t.agent.timestamp || t.endTime,
        });
      }
      return list;
    })
    : transcriptText
      ? transcriptText.split('\n').filter(Boolean).map((line) => {
        const isAgent = line.startsWith('AI:') || line.startsWith('Agent:') || line.startsWith('Assistant:');
        const text = line.replace(/^(AI|Agent|Assistant|Caller|User):\s*/i, '');
        return {
          speaker: isAgent ? 'AI' : 'Caller',
          text,
        };
      })
      : [];

  const filteredTurns = searchQuery.trim()
    ? parsedTurns.filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : parsedTurns;

  const formatTimestamp = (ts?: number | string) => {
    if (ts === undefined || ts === null || ts === '') return '';
    if (typeof ts === 'number') {
      if (ts > 100000000000) {
        const d = new Date(ts);
        return !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      }
      const seconds = Math.floor(ts / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return String(ts);
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      {/* <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777169]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search within conversation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#e7e5e4] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#0c0a09] placeholder-[#a8a29e] focus:outline-none focus:border-[#0c0a09]"
          />
        </div>
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-[#777169] hover:text-[#0c0a09]"
          >
            Clear
          </button>
        )}
      </div> */}

      {/* {filteredTurns.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#777169] bg-[#fafafa] rounded-xl border border-dashed border-[#e7e5e4]">
          {searchQuery ? 'No matching statements found in transcript.' : 'No transcript recorded for this conversation.'}
        </div>
      ) : ( */}
      <div className="space-y-3 max-h-[500px] overflow-hidden pr-1">
        {filteredTurns.map((turn, index) => {
          const isAgent = turn.speaker.toUpperCase() === 'AI' || turn.speaker.toUpperCase() === 'AGENT' || turn.speaker.toUpperCase() === 'ASSISTANT';

          return (
            <div
              key={index}
              className={`flex flex-col ${isAgent ? 'items-start' : 'items-end'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#777169]">
                <span className="font-semibold text-[#0c0a09]">
                  {isAgent ? agentName : (callerNumber ? formatPhoneNumber(callerNumber) : 'Caller')}
                </span>
                {turn.timestamp && <span>· {formatTimestamp(turn.timestamp)}</span>}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${isAgent
                  ? 'bg-[#f0efed] text-[#0c0a09] border border-[#e7e5e4] rounded-tl-sm'
                  : 'bg-white text-[#0c0a09] border border-[#e7e5e4] rounded-tr-sm'
                  }`}
              >
                {turn.text}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
