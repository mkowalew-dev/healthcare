import { useState, useRef, useEffect, useCallback } from 'react';
import { Stethoscope, X, Send, Sparkles, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../context/AuthContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const WELCOME: Record<string, string> = {
  patient: 'Hi! I can help you understand your appointments, lab results, medications, and bills. What would you like to know?',
  provider: 'Hello! I can help you look up patients, pull chart summaries, and review your schedule. What do you need?',
  admin: 'Hello! I can pull system stats and answer questions about platform usage. How can I help?',
};

export function AiChat() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      if (messages.length === 0) {
        const firstName = (profile as any)?.first_name;
        const welcome = `Hi${firstName ? ` ${firstName}` : ''}! ${WELCOME[user?.role ?? 'patient']}`;
        setMessages([{ id: 'welcome', role: 'assistant', content: welcome }]);
      }
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isStreaming) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: input.trim() };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);

    // Build history excluding the welcome message and the streaming placeholder
    const history = messages
      .filter(m => m.id !== 'welcome')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const token = localStorage.getItem('cc_token');
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMsg.content, history }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const patch = (updater: (prev: string) => string) => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: updater(m.content) } : m)
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.t === 'text') {
              patch(prev => prev + data.d);
            } else if (data.t === 'error') {
              patch(() => 'Sorry, something went wrong. Please try again.');
            }
          } catch { /* malformed chunk — skip */ }
        }
      }
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: "I couldn't connect to the AI service. Please try again." }
            : m
        )
      );
    } finally {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-50 w-[380px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{ height: '540px' }}>

          {/* Header */}
          <div className="bg-cisco-dark-blue px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Stethoscope size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-sm leading-tight">CareConnect AI</div>
              <div className="text-white/50 text-xs">Powered by CareConnect</div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={clsx('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-cisco-dark-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Stethoscope size={11} className="text-white" />
                  </div>
                )}
                <div className={clsx(
                  'max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-cisco-blue text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                )}>
                  {msg.content ? (
                    <>
                      {msg.content}
                      {msg.streaming && (
                        <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 align-middle animate-pulse" />
                      )}
                    </>
                  ) : msg.streaming ? (
                    <span className="flex items-center gap-1 h-4">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '160ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '320ms' }} />
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-3 flex items-end gap-2 flex-shrink-0">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={user?.role === 'provider' ? 'Search a patient or ask a question...' : 'Ask about your health records...'}
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cisco-blue/30 focus:border-cisco-blue disabled:opacity-50 max-h-24 overflow-y-auto"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
                input.trim() && !isStreaming
                  ? 'bg-cisco-blue text-white hover:bg-cisco-dark-blue'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              )}
            >
              {isStreaming
                ? <Loader2 size={15} className="animate-spin" />
                : <Send size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Floating trigger */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className={clsx(
          'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200',
          isOpen
            ? 'bg-cisco-dark-blue text-white scale-95'
            : 'bg-cisco-dark-blue text-white hover:bg-cisco-blue hover:shadow-xl hover:scale-105'
        )}
      >
        <Sparkles size={15} />
        <span className="text-sm font-semibold">AI Assistant</span>
      </button>
    </>
  );
}
