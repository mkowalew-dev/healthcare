import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { billsApi } from '../../services/api';
import { PageLoader } from '../../components/ui/LoadingSpinner';
import { BillStatusBadge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Bill, BillSummary } from '../../types';
import { CreditCard, DollarSign, AlertCircle, CheckCircle, Clock, Filter } from 'lucide-react';

export default function BillPay() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<BillSummary>({ total_owed: 0, overdue: 0, paid_ytd: 0, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'paid'>('all');
  const [payModal, setPayModal] = useState<Bill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('credit_card');
  const [processing, setProcessing] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([billsApi.list(), billsApi.summary()]).then(([billsRes, sumRes]) => {
      setBills(billsRes.data);
      setSummary(sumRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = bills.filter(b => {
    if (filter === 'all') return true;
    if (filter === 'pending') return b.status === 'pending' || b.status === 'partial';
    if (filter === 'overdue') return b.status === 'overdue';
    return b.status === 'paid';
  });

  const openPayModal = (bill: Bill) => {
    setPayModal(bill);
    setPayAmount((Number(bill.patient_amount) - Number(bill.paid_amount)).toFixed(2));
    setConfirmation(null);
  };

  const handlePay = async () => {
    if (!payModal || !payAmount) return;
    setProcessing(true);
    try {
      const res = await billsApi.pay(payModal.id, parseFloat(payAmount), payMethod);
      setConfirmation(res.data.confirmationNumber);
      setBills(prev => prev.map(b => b.id === payModal.id
        ? { ...b, paid_amount: res.data.amountPaid + Number(b.paid_amount), status: res.data.newStatus }
        : b
      ));
      // Refresh summary
      billsApi.summary().then(r => setSummary(r.data));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Payments</h1>
        <p className="text-sm text-gray-500 mt-0.5">View statements and make payments securely</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card border-l-4 border-l-cisco-orange">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Balance Due</span>
            <DollarSign size={16} className="text-cisco-orange" />
          </div>
          <div className="text-2xl font-bold text-gray-900">${Number(summary.total_owed).toFixed(2)}</div>
          <div className="text-xs text-gray-500">{summary.pending_count} statement(s)</div>
        </div>
        <div className="stat-card border-l-4 border-l-cisco-red">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue</span>
            <AlertCircle size={16} className="text-cisco-red" />
          </div>
          <div className="text-2xl font-bold text-gray-900">${Number(summary.overdue).toFixed(2)}</div>
          <div className="text-xs text-gray-500">Past due date</div>
        </div>
        <div className="stat-card border-l-4 border-l-cisco-green">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid This Year</span>
            <CheckCircle size={16} className="text-cisco-green" />
          </div>
          <div className="text-2xl font-bold text-gray-900">${Number(summary.paid_ytd).toFixed(2)}</div>
          <div className="text-xs text-gray-500">Year-to-date payments</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <Filter size={15} className="text-gray-400" />
          {(['all', 'pending', 'overdue', 'paid'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-cisco-blue text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              data-testid={`filter-${f}`}
            >
              {f === 'all' ? 'All Statements' : f}
            </button>
          ))}
        </div>

        <div className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">No bills found</div>
          ) : (
            filtered.map((bill) => {
              const remaining = Number(bill.patient_amount) - Number(bill.paid_amount);
              return (
                <div key={bill.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="bg-gray-100 rounded-lg p-2 flex-shrink-0">
                          <CreditCard size={16} className="text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 text-sm">{bill.description}</div>
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              Service: {bill.service_date ? format(parseISO(bill.service_date), 'MMM d, yyyy') : '—'}
                            </span>
                            <span>Due: {bill.due_date ? format(parseISO(bill.due_date), 'MMM d, yyyy') : '—'}</span>
                            {bill.provider_last && (
                              <span>Provider: Dr. {bill.provider_first} {bill.provider_last}</span>
                            )}
                          </div>

                          <div className="flex gap-6 mt-2.5">
                            <div className="text-xs">
                              <div className="text-gray-400">Total</div>
                              <div className="font-semibold text-gray-700">${Number(bill.total_amount).toFixed(2)}</div>
                            </div>
                            <div className="text-xs">
                              <div className="text-gray-400">Insurance</div>
                              <div className="font-semibold text-cisco-green">${Number(bill.insurance_amount).toFixed(2)}</div>
                            </div>
                            <div className="text-xs">
                              <div className="text-gray-400">Your Portion</div>
                              <div className="font-semibold text-gray-700">${Number(bill.patient_amount).toFixed(2)}</div>
                            </div>
                            {Number(bill.paid_amount) > 0 && (
                              <div className="text-xs">
                                <div className="text-gray-400">Paid</div>
                                <div className="font-semibold text-cisco-green">${Number(bill.paid_amount).toFixed(2)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <BillStatusBadge status={bill.status} />
                      {remaining > 0 && bill.status !== 'paid' && (
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">${remaining.toFixed(2)}</div>
                          <div className="text-xs text-gray-400">remaining</div>
                        </div>
                      )}
                      {remaining > 0 && (
                        <button
                          onClick={() => openPayModal(bill)}
                          className="btn-primary text-xs py-1.5 px-3"
                          data-testid={`bill-pay-button-${bill.id}`}
                        >
                          Pay Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Modal
        isOpen={!!payModal}
        onClose={() => { setPayModal(null); setConfirmation(null); }}
        title="Make a Payment"
        footer={
          confirmation ? (
            <button onClick={() => { setPayModal(null); setConfirmation(null); }} className="btn-primary" data-testid="payment-done-button">
              Done
            </button>
          ) : (
            <>
              <button onClick={() => setPayModal(null)} className="btn-secondary" data-testid="payment-cancel-button">Cancel</button>
              <button onClick={handlePay} disabled={processing} className="btn-primary" data-testid="payment-submit-button">
                {processing ? 'Processing...' : `Pay $${payAmount}`}
              </button>
            </>
          )
        }
      >
        {confirmation ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-cisco-green" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Payment Successful!</h3>
            <p className="text-sm text-gray-500 mb-4">Your payment has been processed.</p>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Confirmation Number</div>
              <div className="font-mono font-semibold text-gray-800">{confirmation}</div>
            </div>
          </div>
        ) : payModal ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-700 mb-1">{payModal.description}</div>
              <div className="text-2xl font-bold text-gray-900">
                ${(Number(payModal.patient_amount) - Number(payModal.paid_amount)).toFixed(2)} due
              </div>
            </div>

            <div>
              <label className="form-label">Payment Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  className="form-input pl-7"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  data-testid="payment-amount-input"
                />
              </div>
            </div>

            <div>
              <label className="form-label">Payment Method</label>
              <select className="form-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} data-testid="payment-method-select">
                <option value="credit_card">Credit Card ending in 4242</option>
                <option value="hsa">HSA Account</option>
                <option value="check">Check</option>
              </select>
            </div>

            <p className="text-xs text-gray-400 mt-2">
              This is a demo environment. No actual charges will be made.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
