import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import './styles/VIP.css';

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

interface Props {
  onClose: () => void;
}

interface Order {
  id: number;
  amount: number;
  plan: string;
  status: 'pending' | 'confirmed' | 'rejected';
  method: string;
  reference: string;
  createdAt: string;
}

export const VIP: React.FC<Props> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<'checking' | 'active' | 'inactive'>('checking');
  const [view, setView] = useState<'plans' | 'payment' | 'orders'>('plans');
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'paypal'>('bank');
  const [transferRef, setTransferRef] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expiresAt, setExpiresAt] = useState<string>('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/premium/status`);
        setStatus(res.data.isPremium ? 'active' : 'inactive');
        if (res.data.expiresAt) setExpiresAt(res.data.expiresAt);
        if (Array.isArray(res.data.orders)) setOrders(res.data.orders);
      } catch {
        setStatus('inactive');
      }
    };
    checkSubscription();
  }, []);

  const prices = { monthly: 9, yearly: 89 };

  const handleBankOrder = async () => {
    if (!transferRef.trim()) {
      setError(t('vip.transferRefRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/api/premium/order`, {
        plan: selectedPlan,
        amount: prices[selectedPlan],
        method: 'bank_transfer',
        reference: transferRef.trim(),
      });
      setSuccess(t('vip.orderSent'));
      setTransferRef('');
      if (res.data) setOrders(prev => [res.data, ...prev]);
      setTimeout(() => { setSuccess(''); setView('orders'); }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || t('vip.orderError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayPalOrder = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/api/premium/order`, {
        plan: selectedPlan,
        amount: prices[selectedPlan],
        method: 'paypal',
        reference: `PayPal-${Date.now()}`,
      });
      setSuccess(t('vip.paypalOrderSent'));
      if (res.data) setOrders(prev => [res.data, ...prev]);
      setTimeout(() => { setSuccess(''); setView('orders'); }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || t('vip.paypalError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="vip-container">
      <div className="vip-header">
        <h1 className="vip-title">{t('vip.title')}</h1>
        <button onClick={onClose} className="vip-close-btn" aria-label={t('vip.close')}>✕</button>
      </div>

      <div className="vip-content">
        {status === 'checking' && (
          <div className="vip-checking"><div className="vip-spinner"></div></div>
        )}

        {error && (
          <div className="vip-error">
            <span>⚠️ {error}</span>
            <button onClick={() => setError('')}>✕</button>
          </div>
        )}

        {success && <div className="vip-success">✅ {success}</div>}

        {/* ===== ACTIVE MEMBER VIEW ===== */}
        {status === 'active' && view === 'plans' && (
          <>
            <div className="vip-status-section">
              <h2 className="vip-status-title">{t('vip.welcomeVip')}</h2>
              <p className="vip-status-text">{t('vip.fullAccess')}</p>
              <span className="vip-status-badge">{t('vip.active')}</span>
              {expiresAt && <p className="vip-status-text" style={{ marginTop: '8px', fontSize: '12px' }}>{t('vip.expires', { date: new Date(expiresAt).toLocaleDateString(i18n.language) })}</p>}
            </div>

            <div className="vip-benefits">
              <h3 className="vip-benefits-title">{t('vip.benefits')}</h3>
              <div className="vip-benefit-item"><div className="vip-benefit-icon">⚡</div><div className="vip-benefit-text"><div className="vip-benefit-name">{t('vip.benefitSignals')}</div><div className="vip-benefit-desc">{t('vip.benefitSignalsDesc')}</div></div></div>
              <div className="vip-benefit-item"><div className="vip-benefit-icon">🔮</div><div className="vip-benefit-text"><div className="vip-benefit-name">{t('vip.benefitAI')}</div><div className="vip-benefit-desc">{t('vip.benefitAIDesc')}</div></div></div>
              <div className="vip-benefit-item"><div className="vip-benefit-icon">💬</div><div className="vip-benefit-text"><div className="vip-benefit-name">{t('vip.benefitChat')}</div><div className="vip-benefit-desc">{t('vip.benefitChatDesc')}</div></div></div>
              <div className="vip-benefit-item"><div className="vip-benefit-icon">📊</div><div className="vip-benefit-text"><div className="vip-benefit-name">{t('vip.benefitReports')}</div><div className="vip-benefit-desc">{t('vip.benefitReportsDesc')}</div></div></div>
            </div>

            <button className="vip-action-btn secondary" onClick={() => setView('orders')}>{t('vip.orderHistory')}</button>
          </>
        )}

        {/* ===== INACTIVE: PRICING PLANS ===== */}
        {status === 'inactive' && view === 'plans' && (
          <>
            <div className="vip-status-section">
              <h2 className="vip-status-title">{t('vip.becomeVip')}</h2>
              <p className="vip-status-text">{t('vip.unlockFeatures')}</p>
            </div>

            {/* Compare Free vs VIP */}
            <div className="vip-compare">
              <div className="vip-compare-row header">
                <span>{t('vip.feature')}</span>
                <span>{t('vip.free')}</span>
                <span>{t('vip.vipLabel')}</span>
              </div>
              <div className="vip-compare-row"><span>{t('vip.chatWithMara')}</span><span>{t('vip.chatLimit')}</span><span>{t('vip.unlimited')}</span></div>
              <div className="vip-compare-row"><span>{t('vip.tradingSignals')}</span><span>❌</span><span>{t('vip.realtime')}</span></div>
              <div className="vip-compare-row"><span>{t('vip.tradingStrategies')}</span><span>5</span><span>50+</span></div>
              <div className="vip-compare-row"><span>{t('vip.aiWriterTips')}</span><span>❌</span><span>✅</span></div>
              <div className="vip-compare-row"><span>{t('vip.reelsUpload')}</span><span>{t('vip.reelsLimit')}</span><span>{t('vip.unlimited')}</span></div>
              <div className="vip-compare-row"><span>{t('vip.aiVoice')}</span><span>❌</span><span>✅ {t('vip.voices')}</span></div>
              <div className="vip-compare-row"><span>{t('vip.ads')}</span><span>{t('vip.adsYes')}</span><span>{t('vip.adsNo')}</span></div>
            </div>

            {/* Plan Selection */}
            <div className="vip-plans">
              <button className={`vip-plan-card ${selectedPlan === 'monthly' ? 'selected' : ''}`} onClick={() => setSelectedPlan('monthly')}>
                <div className="vip-plan-name">{t('vip.monthly')}</div>
                <div className="vip-plan-price">{prices.monthly}€<span>{t('vip.perMonth')}</span></div>
                <div className="vip-plan-desc">{t('vip.monthlyCancelAnytime')}</div>
              </button>
              <button className={`vip-plan-card ${selectedPlan === 'yearly' ? 'selected' : ''}`} onClick={() => setSelectedPlan('yearly')}>
                <div className="vip-plan-badge">{t('vip.savings')}</div>
                <div className="vip-plan-name">{t('vip.yearly')}</div>
                <div className="vip-plan-price">{prices.yearly}€<span>{t('vip.perYear')}</span></div>
                <div className="vip-plan-desc">{t('vip.yearlyBestPrice')}</div>
              </button>
            </div>

            <button className="vip-action-btn" onClick={() => setView('payment')}>
              {t('vip.continueToPay', { price: prices[selectedPlan] })}
            </button>

            {orders.length > 0 && (
              <button className="vip-action-btn secondary" onClick={() => setView('orders')}>{t('vip.pendingOrders', { count: orders.filter(o => o.status === 'pending').length })}</button>
            )}
          </>
        )}

        {/* ===== PAYMENT VIEW ===== */}
        {view === 'payment' && (
          <>
            <div className="vip-status-section">
              <h2 className="vip-status-title">{t('vip.paymentTitle')} — {prices[selectedPlan]}€ ({selectedPlan === 'monthly' ? t('vip.monthly') : t('vip.yearly')})</h2>
              <button className="vip-back-link" onClick={() => setView('plans')}>{t('vip.backToPlans')}</button>
            </div>

            {/* Payment Method Tabs */}
            <div className="vip-payment-tabs">
              <button className={`vip-pay-tab ${paymentMethod === 'bank' ? 'active' : ''}`} onClick={() => setPaymentMethod('bank')}>🏦 {t('vip.bankTransfer')}</button>
              <button className={`vip-pay-tab ${paymentMethod === 'paypal' ? 'active' : ''}`} onClick={() => setPaymentMethod('paypal')}>💳 {t('vip.paypal')}</button>
            </div>

            {paymentMethod === 'bank' && (
              <div className="vip-bank-details">
                <h3 className="vip-benefits-title">{t('vip.bankDetails')}</h3>
                <div className="vip-bank-field">
                  <span className="vip-bank-label">{t('vip.accountName')}:</span>
                  <span className="vip-bank-value">Laszlo Raul-Teodor</span>
                </div>
                <div className="vip-bank-field">
                  <span className="vip-bank-label">{t('vip.iban')}:</span>
                  <span className="vip-bank-value">BE83 9741 5006 8915</span>
                </div>
                <div className="vip-bank-field">
                  <span className="vip-bank-label">{t('vip.amount')}:</span>
                  <span className="vip-bank-value">{prices[selectedPlan]}€</span>
                </div>
                <div className="vip-bank-field">
                  <span className="vip-bank-label">{t('vip.reference')}:</span>
                  <span className="vip-bank-value">MaraAI VIP - {selectedPlan}</span>
                </div>

                <label className="vip-form-label">
                  {t('vip.transferRef')}
                  <input
                    type="text"
                    className="vip-form-input"
                    placeholder={t('vip.transferRefPlaceholder')}
                    value={transferRef}
                    onChange={e => setTransferRef(e.target.value)}
                  />
                </label>

                <button className="vip-action-btn" onClick={handleBankOrder} disabled={submitting}>
                  {submitting ? t('vip.submitting') : t('vip.submitOrder')}
                </button>
              </div>
            )}

            {paymentMethod === 'paypal' && (
              <div className="vip-paypal-section">
                <h3 className="vip-benefits-title">{t('vip.paypal')}</h3>
                <p className="vip-status-text">{t('vip.paypalRedirect', { price: prices[selectedPlan] })}</p>
                <button className="vip-action-btn paypal" onClick={handlePayPalOrder} disabled={submitting}>
                  {submitting ? t('vip.submitting') : t('vip.payWithPaypal', { price: prices[selectedPlan] })}
                </button>
              </div>
            )}
          </>
        )}

        {/* ===== ORDERS HISTORY ===== */}
        {view === 'orders' && (
          <>
            <div className="vip-status-section">
              <h2 className="vip-status-title">{t('vip.orders')}</h2>
              <button className="vip-back-link" onClick={() => setView('plans')}>{t('vip.back')}</button>
            </div>

            {orders.length === 0 ? (
              <div className="vip-status-section" style={{ opacity: 0.7 }}>
                <p className="vip-status-text">{t('vip.noOrders')}</p>
              </div>
            ) : (
              <div className="vip-orders-list">
                {orders.map((order, i) => (
                  <div key={order.id || i} className="vip-order-card">
                    <div className="vip-order-header">
                      <span className="vip-order-plan">{order.plan || 'VIP'}</span>
                      <span className={`vip-order-status ${order.status}`}>
                        {order.status === 'pending' ? t('vip.pending') : order.status === 'confirmed' ? t('vip.confirmed') : t('vip.rejected')}
                      </span>
                    </div>
                    <div className="vip-order-details">
                      <span>{order.amount}€ — {order.method}</span>
                      <span>{new Date(order.createdAt).toLocaleDateString(i18n.language)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};