import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from '@phosphor-icons/react';
import './styles/PrivacyPolicy.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="privacy-page">
      <div className="privacy-container">
        <button className="privacy-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {t('privacyPolicy.back')}
        </button>

        <h1 className="privacy-title">{t('privacyPolicy.title')}</h1>
        <p className="privacy-updated">{t('privacyPolicy.updated')}</p>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s1Title')}</h2>
          <p>{t('privacyPolicy.s1Intro')}</p>
          <ul>
            <li><strong>{t('privacyPolicy.labelEmail', 'Email')}:</strong> {t('privacyPolicy.s1Auth')}</li>
            <li><strong>{t('privacyPolicy.labelContent', 'Content')}:</strong> {t('privacyPolicy.s1Content')}</li>
            <li><strong>{t('privacyPolicy.labelMissions', 'Missions')}:</strong> {t('privacyPolicy.s1Missions')}</li>
            <li><strong>{t('privacyPolicy.labelMessages', 'Messages')}:</strong> {t('privacyPolicy.s1Messages')}</li>
            <li><strong>{t('privacyPolicy.labelSession', 'Session')}:</strong> {t('privacyPolicy.s1Session')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s2Title')}</h2>
          <ul>
            <li>{t('privacyPolicy.s2Li1')}</li>
            <li>{t('privacyPolicy.s2Li2')}</li>
            <li>{t('privacyPolicy.s2Li3')}</li>
            <li>{t('privacyPolicy.s2Li4')}</li>
            <li>{t('privacyPolicy.s2Li5')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s3Title')}</h2>
          <p>{t('privacyPolicy.s3Intro')}</p>
          <ul>
            <li>{t('privacyPolicy.s3Li1')}</li>
            <li>{t('privacyPolicy.s3Li2')}</li>
            <li>{t('privacyPolicy.s3Li3')}</li>
            <li>{t('privacyPolicy.s3Li4')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s4Title')}</h2>
          <ul>
            <li><strong>{t('privacyPolicy.labelMessages', 'Messages')}:</strong> {t('privacyPolicy.s4Li1')}</li>
            <li><strong>{t('privacyPolicy.labelContent', 'Content')}:</strong> {t('privacyPolicy.s4Li2')}</li>
            <li><strong>{t('privacyPolicy.labelDeletion', 'Deletion')}:</strong> {t('privacyPolicy.s4Li3')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s5Title')}</h2>
          <p>{t('privacyPolicy.s5Intro')}</p>
          <ul>
            <li><strong>{t('privacyPolicy.labelAccess', 'Access')}:</strong> {t('privacyPolicy.s5Li1')}</li>
            <li><strong>{t('privacyPolicy.labelRectification', 'Rectification')}:</strong> {t('privacyPolicy.s5Li2')}</li>
            <li><strong>{t('privacyPolicy.labelErasure', 'Erasure')}:</strong> {t('privacyPolicy.s5Li3')}</li>
            <li><strong>{t('privacyPolicy.labelPortability', 'Portability')}:</strong> {t('privacyPolicy.s5Li4')}</li>
            <li><strong>{t('privacyPolicy.labelObjection', 'Objection')}:</strong> {t('privacyPolicy.s5Li5')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s6Title')}</h2>
          <p>{t('privacyPolicy.s6Text')}</p>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s7Title')}</h2>
          <ul>
            <li>{t('privacyPolicy.s7Li1')}</li>
            <li>{t('privacyPolicy.s7Li2')}</li>
            <li>{t('privacyPolicy.s7Li3')}</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>{t('privacyPolicy.s8Title')}</h2>
          <p>
            {t('privacyPolicy.s8Text')}{' '}
            <strong>privacy@hellomara.net</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
