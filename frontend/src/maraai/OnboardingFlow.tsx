// MaraAI installation / onboarding flow.
//
// 5 steps per the spec:
//   1. Welcome (privacy-first AI explainer)
//   2. Auth gate — Google OAuth | Email+Password | Email OTP
//   3. Mode select — Centralized | Hybrid | Advanced
//   4. Consent gate — granular toggles + bandwidth slider (gated by mode)
//   5. Activate — final review + flip the bit
//
// Mode comes BEFORE consent so the P2P/background toggles in the consent
// step can correctly reflect the user's chosen mode (centralized mode
// disables them, hybrid/advanced unlocks them).
//
// Until the flow is completed, every advanced feature is locked. Auth and
// consent state come straight from the existing AuthContext + /api/consent.
// The whole component is intentionally self-contained (single CSS file,
// no portal, no third-party UI lib) so it works on first launch.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  getConsent,
  requestEmailOtp,
  setMode,
  updateConsent,
  verifyEmailOtp,
} from './api';
import type { ConsentView, MaraMode } from './types';
import { localSet, NAMESPACES } from './localStore';
import './OnboardingFlow.css';

type Step = 'welcome' | 'auth' | 'consent' | 'mode' | 'activate' | 'done';

type ConsentFormState = {
  p2pEnabled: boolean;
  bandwidthShareGbMonth: number;
  backgroundNode: boolean;
  advancedAiRouting: boolean;
  notificationsEnabled: boolean;
  acceptTerms: boolean;
};

const DEFAULT_CONSENT_FORM: ConsentFormState = {
  p2pEnabled: false,
  bandwidthShareGbMonth: 0,
  backgroundNode: false,
  advancedAiRouting: false,
  notificationsEnabled: false,
  acceptTerms: false,
};

export type OnboardingFlowProps = {
  onClose: () => void;
  initialStep?: Step;
};

export function OnboardingFlow({ onClose, initialStep = 'welcome' }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [step, setStep] = useState<Step>(initialStep);
  const [consent, setConsentState] = useState<ConsentView | null>(null);
  const [consentForm, setConsentForm] = useState<ConsentFormState>(DEFAULT_CONSENT_FORM);
  const [mode, setSelectedMode] = useState<MaraMode>('centralized');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  // Email-OTP state lives only inside the auth step.
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStage, setOtpStage] = useState<'enter-email' | 'enter-code' | 'verified'>(
    'enter-email',
  );

  // Pull current consent the moment the user is authenticated; we use it
  // both to skip the welcome step on re-entry and to pre-fill the form.
  useEffect(() => {
    cancelled.current = false;
    if (!auth.isAuthenticated) return;
    (async () => {
      try {
        const c = await getConsent();
        if (cancelled.current) return;
        setConsentState(c);
        setConsentForm({
          p2pEnabled: c.p2pEnabled,
          bandwidthShareGbMonth: c.bandwidthShareGbMonth,
          backgroundNode: c.backgroundNode,
          advancedAiRouting: c.advancedAiRouting,
          notificationsEnabled: c.notificationsEnabled,
          acceptTerms: !!c.acceptedTermsAt,
        });
        setSelectedMode(c.mode);
      } catch (err) {
        // It is fine to land in the consent step with default form state.
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [auth.isAuthenticated]);

  const consentLockedReason = useMemo(() => {
    if (mode === 'centralized') {
      return t('onboarding.consentHelper');
    }
    return null;
  }, [mode, t]);

  async function handleEmailPassword(emailRaw: string, password: string, name: string, isSignup: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (isSignup) {
        await auth.signup(emailRaw, password, name || emailRaw.split('@')[0]);
      } else {
        await auth.login(emailRaw, password);
      }
      setStep('mode');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpRequest(emailRaw: string) {
    setError(null);
    setBusy(true);
    try {
      await requestEmailOtp(emailRaw, 'register');
      setOtpEmail(emailRaw);
      setOtpStage('enter-code');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOtpVerify(code: string) {
    setError(null);
    setBusy(true);
    try {
      const out = await verifyEmailOtp(otpEmail, code);
      if (!out.ok) throw new Error(out.reason || 'OTP verification failed.');
      setOtpStage('verified');
      await auth.refresh();
      setStep('mode');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConsentSave() {
    setError(null);
    setBusy(true);
    try {
      const next = await updateConsent({
        p2pEnabled: consentForm.p2pEnabled,
        bandwidthShareGbMonth: consentForm.bandwidthShareGbMonth,
        backgroundNode: consentForm.backgroundNode,
        advancedAiRouting: consentForm.advancedAiRouting,
        notificationsEnabled: consentForm.notificationsEnabled,
        acceptTerms: consentForm.acceptTerms,
      });
      setConsentState(next);
      setStep('activate');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleModeSelect() {
    setError(null);
    setBusy(true);
    try {
      const next = await setMode(mode);
      setConsentState(next);
      setStep('consent');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate() {
    setBusy(true);
    try {
      await localSet(NAMESPACES.ONBOARDING, 'completed', {
        mode,
        completedAtMs: Date.now(),
      });
      setStep('done');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="maraai-onboarding-overlay" role="dialog" aria-modal="true">
      <div className="maraai-onboarding-card">
        <header className="maraai-onboarding-header">
          <span className="maraai-onboarding-step">
            {t('onboarding.stepLabel', { current: stepIndex(step), total: 5 })}
          </span>
          <h1>MaraAI</h1>
          <p className="maraai-onboarding-subtitle">{t('onboarding.welcomeSubtitle')}</p>
        </header>

        {error ? <div className="maraai-onboarding-error">{error}</div> : null}

        {step === 'welcome' ? (
          <WelcomeStep onContinue={() => setStep(auth.isAuthenticated ? 'mode' : 'auth')} />
        ) : null}

        {step === 'auth' ? (
          <AuthStep
            busy={busy}
            otpStage={otpStage}
            otpEmail={otpEmail}
            otpCode={otpCode}
            onOtpEmailChange={setOtpEmail}
            onOtpCodeChange={setOtpCode}
            onOtpRequest={handleOtpRequest}
            onOtpVerify={handleOtpVerify}
            onEmailPassword={handleEmailPassword}
            onGoogle={() => auth.loginWithOAuth('google')}
          />
        ) : null}

        {step === 'mode' ? (
          <ModeStep mode={mode} onSelect={setSelectedMode} onContinue={handleModeSelect} busy={busy} />
        ) : null}

        {step === 'consent' ? (
          <ConsentStep
            form={consentForm}
            mode={mode}
            lockedReason={consentLockedReason}
            onChange={setConsentForm}
            onContinue={handleConsentSave}
            busy={busy}
          />
        ) : null}

        {step === 'activate' ? (
          <ActivateStep
            mode={mode}
            consent={consent}
            onActivate={handleActivate}
            busy={busy}
          />
        ) : null}

        <footer className="maraai-onboarding-footer">
          <button className="maraai-onboarding-skip" onClick={onClose}>
            {step === 'done' ? t('onboarding.skipBtnDone') : t('onboarding.skipBtn')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function stepIndex(step: Step): number {
  return { welcome: 1, auth: 2, mode: 3, consent: 4, activate: 5, done: 5 }[step];
}

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="maraai-onboarding-section">
      <h2>{t('onboarding.welcomeTitle')}</h2>
      <ul className="maraai-onboarding-list">
        <li>{t('onboarding.welcomePoint1')}</li>
        <li>{t('onboarding.welcomePoint2')}</li>
        <li>{t('onboarding.welcomePoint3')}</li>
        <li>{t('onboarding.welcomePoint4')}</li>
      </ul>
      <button className="maraai-onboarding-cta" onClick={onContinue}>
        {t('onboarding.continueBtn')}
      </button>
    </section>
  );
}

type AuthStepProps = {
  busy: boolean;
  otpStage: 'enter-email' | 'enter-code' | 'verified';
  otpEmail: string;
  otpCode: string;
  onOtpEmailChange: (s: string) => void;
  onOtpCodeChange: (s: string) => void;
  onOtpRequest: (email: string) => void;
  onOtpVerify: (code: string) => void;
  onEmailPassword: (email: string, password: string, name: string, isSignup: boolean) => void;
  onGoogle: () => void;
};

function AuthStep(p: AuthStepProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'password' | 'otp'>('password');

  return (
    <section className="maraai-onboarding-section">
      <h2>{t('onboarding.authTitle')}</h2>
      <p className="maraai-onboarding-helper">{t('onboarding.authHelper')}</p>

      <button
        className="maraai-onboarding-cta maraai-onboarding-cta--google"
        onClick={p.onGoogle}
        disabled={p.busy}
      >
        {t('onboarding.authGoogle')}
      </button>

      <div className="maraai-onboarding-tabs">
        <button
          className={tab === 'password' ? 'is-active' : ''}
          onClick={() => setTab('password')}
        >
          {t('onboarding.authEmailTab')}
        </button>
        <button className={tab === 'otp' ? 'is-active' : ''} onClick={() => setTab('otp')}>
          {t('onboarding.authOtpTab')}
        </button>
      </div>

      {tab === 'password' ? (
        <form
          className="maraai-onboarding-form"
          onSubmit={(e) => {
            e.preventDefault();
            p.onEmailPassword(email, password, name, true);
          }}
        >
          <label>
            <span>{t('onboarding.authEmailLabel')}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            <span>{t('onboarding.authNameLabel')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} type="text" />
          </label>
          <label>
            <span>{t('onboarding.authPasswordLabel')}</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={6}
            />
          </label>
          <button className="maraai-onboarding-cta" disabled={p.busy} type="submit">
            {t('onboarding.authCreateAccount')}
          </button>
        </form>
      ) : null}

      {tab === 'otp' ? (
        <div className="maraai-onboarding-form">
          {p.otpStage === 'enter-email' ? (
            <>
              <label>
                <span>{t('onboarding.authEmailLabel')}</span>
                <input
                  value={p.otpEmail}
                  onChange={(e) => p.onOtpEmailChange(e.target.value)}
                  type="email"
                  required
                />
              </label>
              <button
                className="maraai-onboarding-cta"
                disabled={p.busy || !p.otpEmail.includes('@')}
                onClick={() => p.onOtpRequest(p.otpEmail)}
                type="button"
              >
                {t('onboarding.authSendCode')}
              </button>
            </>
          ) : (
            <>
              <p className="maraai-onboarding-helper">
                {t('onboarding.authOtpSent', { email: p.otpEmail })}
              </p>
              <label>
                <span>{t('onboarding.authOtpLabel')}</span>
                <input
                  value={p.otpCode}
                  onChange={(e) => p.onOtpCodeChange(e.target.value)}
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  required
                />
              </label>
              <button
                className="maraai-onboarding-cta"
                disabled={p.busy || p.otpCode.length < 4}
                onClick={() => p.onOtpVerify(p.otpCode)}
                type="button"
              >
                {t('onboarding.authVerifyCode')}
              </button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

type ConsentStepProps = {
  form: ConsentFormState;
  mode: MaraMode;
  lockedReason: string | null;
  onChange: (next: ConsentFormState) => void;
  onContinue: () => void;
  busy: boolean;
};

function ConsentStep(p: ConsentStepProps) {
  const { t } = useTranslation();
  const lockedForCentralized = p.mode === 'centralized';
  return (
    <section className="maraai-onboarding-section">
      <h2>{t('onboarding.consentTitle')}</h2>
      <p className="maraai-onboarding-helper">{t('onboarding.consentHelper')}</p>
      {p.lockedReason ? (
        <div className="maraai-onboarding-info">{p.lockedReason}</div>
      ) : null}

      <Toggle
        label={t('onboarding.p2pLabel')}
        description={t('onboarding.p2pDesc')}
        checked={p.form.p2pEnabled}
        onChange={(v) => p.onChange({ ...p.form, p2pEnabled: v })}
        disabled={lockedForCentralized}
      />
      <Toggle
        label={t('onboarding.backgroundLabel')}
        description={t('onboarding.backgroundDesc')}
        checked={p.form.backgroundNode}
        onChange={(v) => p.onChange({ ...p.form, backgroundNode: v })}
        disabled={lockedForCentralized || !p.form.p2pEnabled}
      />
      <Toggle
        label={t('onboarding.aiRoutingLabel')}
        description={t('onboarding.aiRoutingDesc')}
        checked={p.form.advancedAiRouting}
        onChange={(v) => p.onChange({ ...p.form, advancedAiRouting: v })}
        disabled={lockedForCentralized}
      />
      <Toggle
        label={t('onboarding.notificationsLabel')}
        description={t('onboarding.notificationsDesc')}
        checked={p.form.notificationsEnabled}
        onChange={(v) => p.onChange({ ...p.form, notificationsEnabled: v })}
      />

      <label className="maraai-onboarding-slider">
        <span>
          {t('onboarding.bandwidthLabel', { gb: p.form.bandwidthShareGbMonth })}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={p.form.bandwidthShareGbMonth}
          onChange={(e) =>
            p.onChange({ ...p.form, bandwidthShareGbMonth: Number(e.target.value) })
          }
          disabled={lockedForCentralized || !p.form.p2pEnabled}
        />
      </label>

      <label className="maraai-onboarding-checkbox">
        <input
          type="checkbox"
          checked={p.form.acceptTerms}
          onChange={(e) => p.onChange({ ...p.form, acceptTerms: e.target.checked })}
        />
        <span>{t('onboarding.consentTerms')}</span>
      </label>

      <button
        className="maraai-onboarding-cta"
        onClick={p.onContinue}
        disabled={p.busy || !p.form.acceptTerms}
      >
        {t('onboarding.agreeBtn')}
      </button>
    </section>
  );
}

type ToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
};

function Toggle(p: ToggleProps) {
  return (
    <label className={`maraai-onboarding-toggle${p.disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={p.checked}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.checked)}
      />
      <span className="maraai-onboarding-toggle-label">{p.label}</span>
      <span className="maraai-onboarding-toggle-desc">{p.description}</span>
    </label>
  );
}

type ModeStepProps = {
  mode: MaraMode;
  onSelect: (m: MaraMode) => void;
  onContinue: () => void;
  busy: boolean;
};

function ModeStep(p: ModeStepProps) {
  const { t } = useTranslation();

  // MODE_DESCRIPTIONS must be inside the component so t() is available.
  const modeDescriptions: Record<MaraMode, { title: string; body: string; tag: string }> = {
    centralized: {
      title: t('onboarding.modeCentralizedTitle'),
      body: t('onboarding.modeCentralizedBody'),
      tag: t('onboarding.modeCentralizedTag'),
    },
    hybrid: {
      title: t('onboarding.modeHybridTitle'),
      body: t('onboarding.modeHybridBody'),
      tag: t('onboarding.modeHybridTag'),
    },
    advanced: {
      title: t('onboarding.modeAdvancedTitle'),
      body: t('onboarding.modeAdvancedBody'),
      tag: t('onboarding.modeAdvancedTag'),
    },
  };

  return (
    <section className="maraai-onboarding-section">
      <h2>{t('onboarding.modeTitle')}</h2>
      <p className="maraai-onboarding-helper">{t('onboarding.modeHelper')}</p>
      {(Object.keys(modeDescriptions) as MaraMode[]).map((m) => {
        const desc = modeDescriptions[m];
        return (
          <label
            key={m}
            className={`maraai-onboarding-mode${p.mode === m ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name="maraai-mode"
              checked={p.mode === m}
              onChange={() => p.onSelect(m)}
            />
            <div>
              <div className="maraai-onboarding-mode-title">
                {desc.title}
                <span className="maraai-onboarding-tag">{desc.tag}</span>
              </div>
              <div className="maraai-onboarding-mode-body">{desc.body}</div>
            </div>
          </label>
        );
      })}
      <button className="maraai-onboarding-cta" onClick={p.onContinue} disabled={p.busy}>
        {t('onboarding.modeSaveContinue')}
      </button>
    </section>
  );
}

type ActivateStepProps = {
  mode: MaraMode;
  consent: ConsentView | null;
  onActivate: () => void;
  busy: boolean;
};

function ActivateStep(p: ActivateStepProps) {
  const { t } = useTranslation();

  const modeTitle: Record<MaraMode, string> = {
    centralized: t('onboarding.modeCentralizedTitle'),
    hybrid: t('onboarding.modeHybridTitle'),
    advanced: t('onboarding.modeAdvancedTitle'),
  };

  return (
    <section className="maraai-onboarding-section">
      <h2>{t('onboarding.activateTitle')}</h2>
      <ul className="maraai-onboarding-list">
        <li>{t('onboarding.activateMode', { mode: modeTitle[p.mode] })}</li>
        <li>{t('onboarding.activateP2p', { status: p.consent?.p2pEnabled ? t('onboarding.statusOn') : t('onboarding.statusOff') })}</li>
        <li>{t('onboarding.activateBackground', { status: p.consent?.backgroundNode ? t('onboarding.statusOn') : t('onboarding.statusOff') })}</li>
        <li>{t('onboarding.activateAiRouting', { status: p.consent?.advancedAiRouting ? t('onboarding.statusOn') : t('onboarding.statusOff') })}</li>
        <li>{t('onboarding.activateBandwidth', { gb: p.consent?.bandwidthShareGbMonth ?? 0 })}</li>
      </ul>
      <p className="maraai-onboarding-helper">{t('onboarding.activateHelper')}</p>
      <button className="maraai-onboarding-cta" onClick={p.onActivate} disabled={p.busy}>
        {t('onboarding.activateBtn')}
      </button>
    </section>
  );
}

export default OnboardingFlow;
