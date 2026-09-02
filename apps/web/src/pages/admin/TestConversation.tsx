import { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import type { TestMessage } from '../../types';

interface TestConversationProps {
  clientId: string;
  agentId: string;
}

export default function TestConversation({ clientId, agentId }: TestConversationProps) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedKnowledge, setExpandedKnowledge] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleKnowledge = (index: number) => {
    setExpandedKnowledge(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: TestMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const response = await api.sendTestMessage(clientId, agentId, text, history);
      const assistantMessage: TestMessage = {
        role: 'assistant',
        content: response.reply || response.response || '',
        knowledgeUsed: response.knowledgeUsed,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      const errorMessage: TestMessage = {
        role: 'assistant',
        content: 'An error occurred while processing your message. Please try again.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setExpandedKnowledge({});
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full bg-[#fafaf9]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e7e5e4]">
        <h2 className="text-xl font-semibold text-[#0c0a09] font-display-serif">
          Test Conversation
        </h2>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-sm text-[#777169] hover:text-[#0c0a09] transition-colors"
          >
            Clear history
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[#777169] text-sm">
                Send a message to start testing the agent.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${message.role === 'user' ? 'order-1' : 'order-1'}`}>
                  <div
                    className={
                      message.role === 'user'
                        ? 'bg-[#0c0a09] text-white rounded-2xl rounded-br-sm px-4 py-3'
                        : 'bg-white border border-[#e7e5e4] rounded-2xl rounded-bl-sm px-4 py-3'
                    }
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {message.role === 'assistant' &&
                    message.knowledgeUsed &&
                    message.knowledgeUsed.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleKnowledge(index)}
                          className="text-xs text-[#777169] hover:text-[#0c0a09] transition-colors flex items-center gap-1"
                        >
                          <svg
                            className={`w-3 h-3 transition-transform ${expandedKnowledge[index] ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                          {message.knowledgeUsed.length} source
                          {message.knowledgeUsed.length !== 1 ? 's' : ''} used
                        </button>

                        {expandedKnowledge[index] && (
                          <div className="mt-2 space-y-2">
                            {message.knowledgeUsed.map((item, kIndex) => (
                              <div
                                key={kIndex}
                                className="el-card p-3 text-xs"
                              >
                                <p className="text-[#0c0a09] whitespace-pre-wrap">{item.content}</p>
                                <div className="flex items-center gap-2 mt-2 text-[#777169]">
                                  <span>Score: {item.score != null ? (item.score * 100).toFixed(1) : 'N/A'}%</span>
                                  {item.sourceId && <span>Source: {item.sourceId}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-[#e7e5e4] rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-[#777169] rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-[#777169] rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    />
                    <div
                      className="w-2 h-2 bg-[#777169] rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="px-6 py-4 border-t border-[#e7e5e4]">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 bg-white border border-[#d6d3d1] rounded-xl text-sm px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#0c0a09]/10 focus:border-[#0c0a09]/20 min-h-[44px] max-h-32"
              style={{
                height: 'auto',
                minHeight: '44px',
              }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="el-btn-primary px-4 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-h-[44px]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
