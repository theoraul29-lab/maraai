import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useAuth } from './contexts/AuthContext';
import './styles/Trading.css';

interface Strategy {
  id: number;
  level: 'beginner' | 'intermediate' | 'advanced';
  free: boolean;
}

const API_URL = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

const FREE_LIMIT = 5;

const ALL_STRATEGIES: Strategy[] = [
  { id: 1, level: 'beginner', free: true },
  { id: 2, level: 'beginner', free: true },
  { id: 3, level: 'beginner', free: true },
  { id: 4, level: 'beginner', free: true },
  { id: 5, level: 'beginner', free: true },
  { id: 6, level: 'beginner', free: false },
  { id: 7, level: 'beginner', free: false },
  { id: 8, level: 'beginner', free: false },
  { id: 9, level: 'beginner', free: false },
  { id: 10, level: 'beginner', free: false },
  { id: 11, level: 'beginner', free: false },
  { id: 12, level: 'beginner', free: false },
  { id: 13, level: 'beginner', free: false },
  { id: 14, level: 'beginner', free: false },
  { id: 15, level: 'beginner', free: false },
  { id: 16, level: 'intermediate', free: false },
  { id: 17, level: 'intermediate', free: false },
  { id: 18, level: 'intermediate', free: false },
  { id: 19, level: 'intermediate', free: false },
  { id: 20, level: 'intermediate', free: false },
  { id: 21, level: 'intermediate', free: false },
  { id: 22, level: 'intermediate', free: false },
  { id: 23, level: 'intermediate', free: false },
  { id: 24, level: 'intermediate', free: false },
  { id: 25, level: 'intermediate', free: false },
  { id: 26, level: 'intermediate', free: false },
  { id: 27, level: 'intermediate', free: false },
  { id: 28, level: 'intermediate', free: false },
  { id: 29, level: 'intermediate', free: false },
  { id: 30, level: 'intermediate', free: false },
  { id: 31, level: 'intermediate', free: false },
  { id: 32, level: 'intermediate', free: false },
  { id: 33, level: 'intermediate', free: false },
  { id: 34, level: 'intermediate', free: false },
  { id: 35, level: 'intermediate', free: false },
  { id: 36, level: 'advanced', free: false },
  { id: 37, level: 'advanced', free: false },
  { id: 38, level: 'advanced', free: false },
  { id: 39, level: 'advanced', free: false },
  { id: 40, level: 'advanced', free: false },
  { id: 41, level: 'advanced', free: false },
  { id: 42, level: 'advanced', free: false },
  { id: 43, level: 'advanced', free: false },
  { id: 44, level: 'advanced', free: false },
  { id: 45, level: 'advanced', free: false },
  { id: 46, level: 'advanced', free: false },
  { id: 47, level: 'advanced', free: false },
  { id: 48, level: 'advanced', free: false },
  { id: 49, level: 'advanced', free: false },
  { id: 50, level: 'advanced', free: false },
];

export const Trading: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isVIP = user?.tier === 'vip' || user?.tier === 'premium';
  const [symbol, setSymbol] = useState('BINANCE:BTCUSDT');
  const [selectedStrat, setSelectedStrat] = useState<Strategy | null>(null);
  const [marketSignal, setMarketSignal] = useState<string>(t('trading.connectingEngine'));
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [askMaraQ, setAskMaraQ] = useState('');
  const [maraAnswer, setMaraAnswer] = useState('');
  const [askingMara, setAskingMara] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/trading/signals`);
        setMarketSignal(res.data.content || t('trading.noSignal'));
      } catch { setMarketSignal(t('trading.dataUnavailable')); }
    };
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (container.current) {
      container.current.innerHTML = '';
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = JSON.stringify({
        autosize: true, symbol, interval: "60", timezone: "Etc/UTC",
        theme: "dark", style: "1", locale: i18n.language || "en", enable_publishing: false,
        allow_symbol_change: true, container_id: "tradingview_chart",
      });
      container.current.appendChild(script);
    }
  }, [symbol]);

  const getStratName = (s: Strategy) => t(`trading.strategies.${s.id}.name`);
  const getStratDesc = (s: Strategy) => t(`trading.strategies.${s.id}.desc`);
  const getStratSteps = (s: Strategy) => t(`trading.strategies.${s.id}.steps`, { returnObjects: true }) as string[];
  const getLevelLabel = (level: string) => t(`trading.${level}`);
  const getLevelColor = (level: string) => level === 'beginner' ? '#00ff7f' : level === 'intermediate' ? '#f59e0b' : '#ef4444';

  const filteredStrategies = filterLevel === 'all'
    ? ALL_STRATEGIES
    : ALL_STRATEGIES.filter(s => s.level === filterLevel);

  const canAccess = (s: Strategy) => s.free || isVIP;

  const selectStrategy = (s: Strategy) => {
    if (canAccess(s)) {
      setSelectedStrat(s);
      setMaraAnswer('');
    }
  };

  const askMara = async () => {
    if (!askMaraQ.trim() || !selectedStrat) return;
    setAskingMara(true);
    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        message: `[Trading Strategy: ${selectedStrat.name}] ${askMaraQ}`,
        userId: user?.id || 'anon',
      });
      setMaraAnswer(res.data.response || res.data.message || t('trading.maraNoResponse'));
    } catch { setMaraAnswer(t('trading.maraError')); }
    finally { setAskingMara(false); setAskMaraQ(''); }
  };

  return (
    <div className="trading-container">
      <div className="trading-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <h2 className="trading-title">{t('trading.title')}</h2>
          <select className="trading-symbol-input" value={symbol} onChange={e => setSymbol(e.target.value)}>
            <option value="BINANCE:BTCUSDT">Bitcoin / USDT</option>
            <option value="BINANCE:ETHUSDT">Ethereum / USDT</option>
            <option value="FX:EURUSD">Euro / Dollar</option>
            <option value="BINANCE:SOLUSDT">Solana / USDT</option>
            <option value="BINANCE:ADAUSDT">Cardano / USDT</option>
            <option value="BINANCE:XRPUSDT">XRP / USDT</option>
            <option value="FX:GBPUSD">GBP / USD</option>
            <option value="TVC:GOLD">Gold</option>
          </select>
        </div>
        <button onClick={onClose} className="trading-close-btn" aria-label={t('trading.closeLabel')}>✕ {t('trading.exit')}</button>
      </div>

      <div className="trading-content">
        <div className="trading-sidebar">
          <p className="trading-label">{t('trading.strategyHub', { count: ALL_STRATEGIES.length })}</p>

          <div className="trading-signal-box">
            <strong style={{ color: '#00ff7f' }}>{t('trading.liveSignal')}</strong><br />
            {marketSignal}
          </div>

          <div className="trading-filter-row">
            {['all', 'beginner', 'intermediate', 'advanced'].map(lv => (
              <button key={lv} onClick={() => setFilterLevel(lv)}
                className={`trading-filter-btn ${filterLevel === lv ? 'active' : ''}`}>
                {lv === 'all' ? t('trading.filterAll') : getLevelLabel(lv)}
              </button>
            ))}
          </div>

          <div className="trading-strategies-list">
            {filteredStrategies.map(s => (
              <button key={s.id} onClick={() => selectStrategy(s)}
                className={`trading-strategy-item ${selectedStrat?.id === s.id ? 'active' : ''} ${!canAccess(s) ? 'locked' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: getLevelColor(s.level) }}>{getLevelLabel(s.level)}</span>
                  {!canAccess(s) && <span style={{ fontSize: '0.7rem', color: '#ff6b6b' }}>{t('trading.vipLocked')}</span>}
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>
                  {s.id}. {canAccess(s) ? getStratName(s) : getStratName(s).substring(0, 20) + '...'}
                </div>
              </button>
            ))}
          </div>

          {!isVIP && (
            <div className="trading-paywall-banner">
              <p>{t('trading.freeLimit', { count: FREE_LIMIT })}</p>
              <p>{t('trading.upgradeMessage', { count: ALL_STRATEGIES.length })}</p>
              <a href="/membership" className="trading-upgrade-link">{t('trading.upgradeLink')}</a>
            </div>
          )}
        </div>

        <div className="trading-chart-area">
          <div ref={container} style={{ height: "100%", width: "100%" }}></div>
        </div>

        <div className="trading-ai-panel">
          <div className="trading-ai-title">{t('trading.mentorTitle')}</div>
          {selectedStrat ? (
            <div className="trading-ai-content">
              <h3 style={{ color: '#00ff7f' }}>{getStratName(selectedStrat)}</h3>
              <span className="trading-strat-badge" style={{
                background: getLevelColor(selectedStrat.level) + '22',
                color: getLevelColor(selectedStrat.level),
              }}>{getLevelLabel(selectedStrat.level)}</span>
              <p style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '10px' }}>{getStratDesc(selectedStrat)}</p>
              <div className="trading-steps-box">
                <p style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{t('trading.stepsToFollow')}</p>
                {getStratSteps(selectedStrat).map((step: string, i: number) => (
                  <div key={i} className="trading-step-item">{i + 1}. {step}</div>
                ))}
              </div>

              <div className="trading-ask-section">
                <input type="text" placeholder={t('trading.askPlaceholder')}
                  value={askMaraQ} onChange={e => setAskMaraQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && askMara()}
                  className="trading-ask-input" />
                <button onClick={askMara} disabled={askingMara} className="trading-ask-btn">
                  {askingMara ? '...' : t('trading.askButton')}
                </button>
              </div>
              {maraAnswer && (
                <div className="trading-mara-answer">
                  <strong>Mara:</strong> {maraAnswer}
                </div>
              )}
            </div>
          ) : (
            <div className="trading-empty-ai">{t('trading.selectStrategy')}</div>
          )}
        </div>
      </div>
    </div>
  );
};