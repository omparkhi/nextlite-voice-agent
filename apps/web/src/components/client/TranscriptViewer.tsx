import { formatPhoneNumber } from '@/utils/formatPhoneNumber';
import { parseUtcDate } from '@/utils/dateFormatters';

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
  const searchQuery = '';

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

  const deduplicatedTurns = parsedTurns.filter((turn, idx, arr) => {
    if (idx === 0) return true;
    const prev = arr[idx - 1];
    return !(prev.speaker === turn.speaker && prev.text.trim() === turn.text.trim());
  });

  const filteredTurns = searchQuery.trim()
    ? deduplicatedTurns.filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : deduplicatedTurns;

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
    const d = parseUtcDate(ts);
    if (d && !isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return String(ts);
  };

  return (
    <div className="w-full">
      {filteredTurns.length === 0 ? (
        <div className="py-8 text-center text-xs text-[#777169] bg-white rounded-xl border border-dashed border-[#e7e5e4]">
          No transcript recorded for this conversation.
        </div>
      ) : (
        <div className="space-y-2.5 pb-2">
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
                  {turn.timestamp && <span className="font-mono">· {formatTimestamp(turn.timestamp)}</span>}
                </div>

                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-xl px-3.5 py-2 text-[12px] leading-relaxed shadow-2xs transition-all ${isAgent
                    ? 'bg-[#f0efed] text-[#0c0a09] border border-[#e5e3df] rounded-tl-xs'
                    : 'bg-white text-[#1c1917] border border-[#e7e5e4] rounded-tr-xs'
                    }`}
                >
                  {turn.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
