import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from '@phosphor-icons/react';
import './styles/TermsOfService.css';

export default function TermsOfService() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="terms-page">
      <div className="terms-container">
        <button className="terms-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {t('termsOfService.back', 'Back')}
        </button>

        <h1 className="terms-title">{t('termsOfService.title', 'Terms of Service')}</h1>
        <p className="terms-updated">{t('termsOfService.updated', 'Last updated: September 23, 2026')}</p>

        <section className="terms-section">
          <h2>{t('termsOfService.s1Title', '1. What MaraAI offers')}</h2>
          <p>{t('termsOfService.s1Intro', 'MaraAI (hellomara.net) is a platform combining an AI companion, daily self-improvement missions, a social feed ("Sparks"), and a writing/publishing hub. It is offered in three ways:')}</p>
          <ul>
            <li><strong>{t('termsOfService.labelExplorer', 'Explorer')}:</strong> {t('termsOfService.s1Explorer', 'free, no card required — chat with Mara, watch Sparks, read public articles, join the community, and the two starter programs (New Mindset, New Habit).')}</li>
            <li><strong>{t('termsOfService.labelVip', 'VIP subscription')}:</strong> {t('termsOfService.s1Vip', '€21/month, billed automatically until cancelled — unlimited Mara AI with a custom personality, HD uploads, and VIP-only content.')}</li>
            <li><strong>{t('termsOfService.labelPrograms', 'Individual programs')}:</strong> {t('termsOfService.s1Programs', 'one-time payments from €8, independent of VIP — unlock a specific transformation program permanently.')}</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s2Title', '2. VIP subscription — billing and cancellation')}</h2>
          <ul>
            <li>{t('termsOfService.s2Li1', 'The VIP subscription renews automatically every month at the then-current price until you cancel it.')}</li>
            <li>{t('termsOfService.s2Li2', 'You can cancel at any time from your account settings. There is no cancellation fee.')}</li>
            <li>{t('termsOfService.s2Li3', 'After cancelling, you keep VIP access until the end of the period you already paid for — no partial refund is issued for the unused remainder, consistent with the withdrawal-right waiver in section 4.')}</li>
            <li>{t('termsOfService.s2Li4', 'Payments are processed by PayPal. MaraAI does not store your payment card or PayPal credentials.')}</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s3Title', '3. Individual programs — one-time purchases')}</h2>
          <p>{t('termsOfService.s3Text', 'Programs, the program bundle, and the book are unlocked with a single one-time payment and remain accessible to your account permanently — they are not subscriptions and do not renew or expire.')}</p>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s4Title', '4. EU right of withdrawal (14 days)')}</h2>
          <p>{t('termsOfService.s4Intro', 'If you are a consumer in the European Union, you normally have a 14-day right to withdraw from an online purchase without giving a reason. For digital content and services delivered immediately (which is how MaraAI works — access is granted right after payment), this right ends as soon as performance has begun, provided you have given your prior express consent to immediate access and acknowledged that you thereby lose the right of withdrawal (Art. 16(m), Directive 2011/83/EU).')}</p>
          <p>{t('termsOfService.s4Consent', 'By completing a VIP subscription or program purchase, you confirm that you want immediate access and acknowledge the loss of the withdrawal right described above.')}</p>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s5Title', '5. Refund policy')}</h2>
          <ul>
            <li><strong>{t('termsOfService.labelVip', 'VIP subscription')}:</strong> {t('termsOfService.s5Li1', 'cancel anytime — no refund for the current billing period, access continues until it ends.')}</li>
            <li><strong>{t('termsOfService.labelPrograms', 'Individual programs')}:</strong> {t('termsOfService.s5Li2', 'not refundable once access has been granted, the same principle as a digital book or course you have already started.')}</li>
            <li>{t('termsOfService.s5Li3', 'If you believe you were charged in error, contact us — see section 8 — and we will look into it.')}</li>
          </ul>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s6Title', '6. Who you are contracting with')}</h2>
          <p>{t('termsOfService.s6Text', 'MaraAI is operated as a sole proprietorship (Einzelunternehmen/Gewerbe) registered in Germany:')}</p>
          <p>
            MaraAi Teodor Raul Laszlo<br />
            Tannenbergstraße 10, 48465 Schüttorf, {t('termsOfService.germany', 'Germany')}
          </p>
          <p>{t('termsOfService.s6Vat', 'As a small business under § 19 UStG (Kleinunternehmerregelung), no VAT is charged on invoices.')}</p>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s7Title', '7. Governing law & dispute resolution')}</h2>
          <p>{t('termsOfService.s7Text', 'These terms are governed by German law. The European Commission provides an online dispute resolution (ODR) platform at')} <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>. {t('termsOfService.s7Text2', 'We are not obliged and not willing to participate in dispute resolution proceedings before a consumer arbitration board.')}</p>
        </section>

        <section className="terms-section">
          <h2>{t('termsOfService.s8Title', '8. Contact')}</h2>
          <p>
            {t('termsOfService.s8Text', 'For questions about these terms, billing, or cancellations, contact us at:')}{' '}
            <strong>maraai@hellomara.net</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
