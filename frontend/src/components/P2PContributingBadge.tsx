// Background compute badge.
//
// Starts a Web Worker when the user is idle AND has enabled background compute
// in their consent settings. No Ollama or external software required — the
// worker runs lightweight JavaScript tasks (text analysis, mission generation,
// content scoring) entirely inside the browser.
//
// Constraints respected:
//   • backgroundNodeEnabled prop is false → never start
//   • Battery < 20% → stop
//   • Cellular / metered connection → stop
//   • User moves mouse or presses key → stop within 2 s
//   • Tab hidden → stop

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './P2PContributingBadge.css';

import P2PWorker from '../pwa/p2pComputeWorker?worker';

const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const BATTERY_MIN = 0.20;
const NODE_ID_KEY = 'mara_p2p_node_id';

const API = import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

type WorkerMsg =
  | { type: 'status'; contributing: boolean; xpEarned: number; tasksCompleted: number }
  | { type: 'reward'; xpGained: number; creditsGained: number; message: string }
  | { type: 'error'; message: string };

function getOrCreateNodeId(): string {
  let id = localStorage.getItem(NODE_ID_KEY);
  if (!id) {
    id = `browser_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(NODE_ID_KEY, id);
  }
  return id;
}

async function isBatteryOk(): Promise<boolean> {
  try {
    const nav = navigator as any;
    if (typeof nav.getBattery !== 'function') return true;
    const battery = await nav.getBattery();
    if (battery.charging) return true;
    return battery.level >= BATTERY_MIN;
  } catch {
    return true;
  }
}

function isConnectionOk(): boolean {
  try {
    const conn = (navigator as any).connection;
    if (!conn) return true;
    const type = conn.effectiveType ?? conn.type ?? '';
    if (['2g', '3g', 'slow-2g'].includes(type)) return false;
    if (conn.saveData) return false;
    return true;
  } catch {
    return true;
  }
}

type Props = {
  backgroundNodeEnabled: boolean;
};

export default function P2PContributingBadge({ backgroundNodeEnabled }: Props) {
  const { t } = useTranslation();
  const workerRef = useRef<Worker | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contributing, setContributing] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [lastReward, setLastReward] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const nodeId = useRef(getOrCreateNodeId());

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'stop' });
    }
    setContributing(false);
  }, []);

  const startWorker = useCallback(async () => {
    if (!backgroundNodeEnabled) return;
    if (!(await isBatteryOk()) || !isConnectionOk()) return;

    if (!workerRef.current) {
      const w = new P2PWorker();
      w.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const msg = e.data;
        if (msg.type === 'status') {
          setContributing(msg.contributing);
          setXpEarned(msg.xpEarned);
          setTasksCompleted(msg.tasksCompleted);
          setVisible(msg.contributing);
        } else if (msg.type === 'reward') {
          setLastReward(msg.message);
          setTimeout(() => setLastReward(null), 5000);
        }
      };
      workerRef.current = w;
    }

    workerRef.current.postMessage({ type: 'start', nodeId: nodeId.current, apiBase: API });
    setContributing(true);
    setVisible(true);
  }, [backgroundNodeEnabled]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (contributing) stopWorker();
    if (backgroundNodeEnabled) {
      idleTimerRef.current = setTimeout(startWorker, IDLE_THRESHOLD_MS);
    }
  }, [contributing, stopWorker, startWorker, backgroundNodeEnabled]);

  useEffect(() => {
    if (!backgroundNodeEnabled) {
      stopWorker();
      return;
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    for (const ev of events) {
      window.addEventListener(ev, resetIdleTimer, { passive: true });
    }
    idleTimerRef.current = setTimeout(startWorker, IDLE_THRESHOLD_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, resetIdleTimer);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [backgroundNodeEnabled, resetIdleTimer, startWorker, stopWorker]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) stopWorker();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopWorker]);

  if (!visible && !lastReward) return null;

  return (
    <>
      {visible && (
        <div className="p2p-badge" title={t('p2p.badgeTitle', { tasks: tasksCompleted, xp: xpEarned })}>
          <span className="p2p-badge-dot" />
          <span className="p2p-badge-text">{t('p2p.contributing')}</span>
          {tasksCompleted > 0 && (
            <span className="p2p-badge-xp">+{xpEarned} XP</span>
          )}
        </div>
      )}
      {lastReward && (
        <div className="p2p-reward-toast">
          {lastReward}
        </div>
      )}
    </>
  );
}
