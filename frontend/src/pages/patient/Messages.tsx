import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { messagesApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { Modal } from '../../components/ui/Modal';
import { Message } from '../../types';
import { MessageSquare, Send, Inbox, RefreshCw, Plus, Clock } from 'lucide-react';

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox');
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [form, setForm] = useState({ recipientId: '', subject: '', body: '', messageType: 'general' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
    messagesApi.providersList().then(r => setProviders(r.data));
  }, [tab]);

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
      setShowCompose(false);
      setForm({ recipientId: '', subject: '', body: '', messageType: 'general' });
      if (tab === 'sent') loadMessages();
    } finally {
      setSending(false);
    }
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
        <button onClick={() => setShowCompose(true)} className="btn-primary">
          <Plus size={16} /> New Message
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ height: '600px' }}>
        {/* Message list */}
        <div className="card flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {(['inbox', 'sent'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors capitalize ${
                  tab === t ? 'text-cisco-blue border-b-2 border-cisco-blue' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'inbox' ? <Inbox size={15} /> : <Send size={15} />}
                {t}
              </button>
            ))}
          </div>

          {/* List */}
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
                      setForm({
                        recipientId: selected.sender_id,
                        subject: `Re: ${selected.subject}`,
                        body: '',
                        messageType: 'general',
                      });
                      setShowCompose(true);
                    }}
                    className="btn-secondary text-sm"
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
        onClose={() => setShowCompose(false)}
        title="New Secure Message"
        footer={
          <>
            <button onClick={() => setShowCompose(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="btn-primary">
              <Send size={14} />
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="form-label">To *</label>
            <select
              className="form-input"
              value={form.recipientId}
              onChange={(e) => setForm({ ...form, recipientId: e.target.value })}
            >
              <option value="">Select provider</option>
              {providers.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  Dr. {p.first_name} {p.last_name} — {p.specialty}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Message Type</label>
            <select
              className="form-input"
              value={form.messageType}
              onChange={(e) => setForm({ ...form, messageType: e.target.value })}
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
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
