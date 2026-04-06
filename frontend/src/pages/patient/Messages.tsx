import { useState, useEffect, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { messagesApi } from '../../services/api';
import { Modal } from '../../components/ui/Modal';
import { Message } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Send, Inbox, RefreshCw, Plus, Clock, Search, X } from 'lucide-react';

interface Recipient {
  user_id: string;
  first_name: string;
  last_name: string;
  role: 'provider' | 'patient';
  detail: string;
}

const emptyForm = { recipientId: '', recipientName: '', subject: '', body: '', messageType: 'general' };

export default function Messages() {
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);

  // Recipient search (provider compose)
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientResults, setRecipientResults] = useState<Recipient[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
    if (!isProvider) {
      messagesApi.providersList().then(r => setProviders(r.data));
    }
  }, [tab]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!isProvider || !showCompose || form.recipientId) return;
    if (recipientQuery.length < 2) { setRecipientResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await messagesApi.recipientsSearch(recipientQuery);
        setRecipientResults(res.data);
        setShowResults(true);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [recipientQuery, isProvider, showCompose, form.recipientId]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = tab === 'inbox' ? await messagesApi.inbox() : await messagesApi.sent();
      setMessages(res.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (msg: Message) => {
    setSelected(msg);
    if (!msg.read_at && tab === 'inbox') {
      await messagesApi.markRead(msg.id).catch(() => {});
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: new Date().toISOString() } : m));
    }
  };

  const handleSend = async () => {
    if (!form.recipientId || !form.subject || !form.body) return;
    setSending(true);
    try {
      await messagesApi.send({
        recipientId: form.recipientId,
        subject: form.subject,
        body: form.body,
        messageType: form.messageType,
      });
      closeCompose();
      if (tab === 'sent') loadMessages();
    } finally {
      setSending(false);
    }
  };

  const closeCompose = () => {
    setShowCompose(false);
    setForm(emptyForm);
    setRecipientQuery('');
    setRecipientResults([]);
    setShowResults(false);
  };

  const selectRecipient = (r: Recipient) => {
    const name = r.role === 'provider'
      ? `Dr. ${r.first_name} ${r.last_name} (Provider)`
      : `${r.first_name} ${r.last_name} (Patient)`;
    setForm(f => ({ ...f, recipientId: r.user_id, recipientName: name }));
    setRecipientQuery(name);
    setShowResults(false);
  };

  const clearRecipient = () => {
    setForm(f => ({ ...f, recipientId: '', recipientName: '' }));
    setRecipientQuery('');
    setRecipientResults([]);
  };

  const msgTypeLabel: Record<string, string> = {
    general: 'General',
    prescription_refill: 'Rx Refill',
    appointment: 'Appointment',
    test_result: 'Test Result',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Secure Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">Communicate securely with your care team</p>
        </div>
        <button onClick={() => setShowCompose(true)} className="btn-primary" data-testid="compose-message-button">
          <Plus size={16} /> New Message
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ height: '600px' }}>
        {/* Message list */}
        <div className="card flex flex-col overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(['inbox', 'sent'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors capitalize ${
                  tab === t ? 'text-cisco-blue border-b-2 border-cisco-blue' : 'text-gray-500 hover:text-gray-700'
                }`}
                data-testid={`tab-${t}`}
              >
                {t === 'inbox' ? <Inbox size={15} /> : <Send size={15} />}
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw size={20} className="text-gray-300 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageSquare size={32} className="mb-2" />
                <p className="text-sm">No messages</p>
              </div>
            ) : (
              messages.map((msg) => (
                <button
                  key={msg.id}
                  onClick={() => handleSelect(msg)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selected?.id === msg.id ? 'bg-cisco-blue/5 border-l-2 border-cisco-blue' : ''
                  } ${!msg.read_at && tab === 'inbox' ? 'bg-blue-50/50' : ''}`}
                  data-testid={`message-item-${msg.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm ${!msg.read_at && tab === 'inbox' ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {tab === 'inbox' ? msg.sender_name : `To: ${msg.recipient_name}`}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(parseISO(msg.sent_at), 'MM/dd')}
                    </span>
                  </div>
                  <div className={`text-xs mb-1 ${!msg.read_at && tab === 'inbox' ? 'font-medium text-gray-800' : 'text-gray-600'}`}>
                    {msg.subject}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {msg.body.substring(0, 60)}...
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message detail */}
        <div className="lg:col-span-2 card flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <MessageSquare size={48} className="mb-3" />
              <p className="text-sm">Select a message to read</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-lg">{selected.subject}</h2>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>
                    <strong>{tab === 'inbox' ? 'From:' : 'To:'}</strong>{' '}
                    {tab === 'inbox' ? selected.sender_name : selected.recipient_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {format(parseISO(selected.sent_at), 'MMMM d, yyyy h:mm a')}
                  </span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                    {msgTypeLabel[selected.message_type] || selected.message_type}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="prose prose-sm max-w-none">
                  {selected.body.split('\n').map((line, i) => (
                    <p key={i} className="text-gray-700 text-sm mb-2 last:mb-0 leading-relaxed">
                      {line || <br />}
                    </p>
                  ))}
                </div>
              </div>
              {tab === 'inbox' && (
                <div className="px-6 py-3 border-t border-gray-100">
                  <button
                    onClick={() => {
                      const name = selected.sender_name ?? '';
                      setForm({
                        recipientId: selected.sender_id,
                        recipientName: name,
                        subject: `Re: ${selected.subject}`,
                        body: '',
                        messageType: selected.message_type,
                      });
                      setRecipientQuery(name);
                      setShowCompose(true);
                    }}
                    className="btn-secondary text-sm"
                    data-testid="reply-button"
                  >
                    <Send size={14} /> Reply
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compose Modal */}
      <Modal
        isOpen={showCompose}
        onClose={closeCompose}
        title="New Secure Message"
        footer={
          <>
            <button onClick={closeCompose} className="btn-secondary" data-testid="compose-cancel-button">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="btn-primary" data-testid="compose-send-button">
              <Send size={14} />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="form-label">To *</label>

            {/* Provider: search input */}
            {isProvider ? (
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    className="form-input pl-9 pr-8"
                    placeholder="Search patients or providers..."
                    value={recipientQuery}
                    onChange={(e) => {
                      setRecipientQuery(e.target.value);
                      if (form.recipientId) clearRecipient();
                    }}
                    disabled={!!form.recipientId}
                    autoComplete="off"
                    data-testid="compose-recipient-search"
                  />
                  {recipientQuery && (
                    <button
                      type="button"
                      onClick={clearRecipient}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Clear recipient"
                      data-testid="compose-recipient-clear"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {showResults && recipientResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {searchLoading ? (
                      <li className="px-4 py-3 text-sm text-gray-400">Searching...</li>
                    ) : (
                      recipientResults.map((r) => (
                        <li key={r.user_id}>
                          <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); selectRecipient(r); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                            data-testid={`recipient-result-${r.user_id}`}
                          >
                            <span className="text-sm text-gray-900">
                              {r.role === 'provider' ? `Dr. ${r.first_name} ${r.last_name}` : `${r.first_name} ${r.last_name}`}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              r.role === 'provider' ? 'bg-cisco-blue/10 text-cisco-blue' : 'bg-green-50 text-green-700'
                            }`}>
                              {r.role === 'provider' ? r.detail : 'Patient'}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
                {showResults && recipientResults.length === 0 && !searchLoading && recipientQuery.length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
                    No results found
                  </div>
                )}
              </div>
            ) : (
              /* Patient: providers dropdown */
              form.recipientName ? (
                <input type="text" className="form-input bg-gray-50" value={form.recipientName} readOnly />
              ) : (
                <select
                  className="form-input"
                  value={form.recipientId}
                  onChange={(e) => setForm({ ...form, recipientId: e.target.value })}
                  data-testid="compose-recipient-select"
                >
                  <option value="">Select provider</option>
                  {providers.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      Dr. {p.first_name} {p.last_name} — {p.specialty}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>

          <div>
            <label className="form-label">Message Type</label>
            <select
              className="form-input"
              value={form.messageType}
              onChange={(e) => setForm({ ...form, messageType: e.target.value })}
              data-testid="compose-message-type-select"
            >
              <option value="general">General</option>
              <option value="prescription_refill">Prescription Refill Request</option>
              <option value="appointment">Appointment Question</option>
              <option value="test_result">Test Result Question</option>
            </select>
          </div>
          <div>
            <label className="form-label">Subject *</label>
            <input
              type="text"
              className="form-input"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Message subject"
              data-testid="compose-subject-input"
            />
          </div>
          <div>
            <label className="form-label">Message *</label>
            <textarea
              className="form-input resize-none"
              rows={6}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Write your message here..."
              data-testid="compose-body-textarea"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
