import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import './styles/PrivacyPolicy.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="privacy-page">
      <div className="privacy-container">
        <button className="privacy-back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Înapoi
        </button>

        <h1 className="privacy-title">Politica de Confidențialitate</h1>
        <p className="privacy-updated">Ultima actualizare: 1 iunie 2026</p>

        <section className="privacy-section">
          <h2>1. Ce date colectăm</h2>
          <p>
            HelloMara colectează <strong>exclusiv datele necesare</strong> pentru funcționarea platformei:
          </p>
          <ul>
            <li><strong>Autentificare:</strong> adresă de email și parolă (stocată hashuit cu bcrypt, niciodată în clar)</li>
            <li><strong>Conținut creat:</strong> postări, reels, articole, comentarii pe care le publici voluntar</li>
            <li><strong>Progres misiuni:</strong> XP și misiunile completate</li>
            <li><strong>Mesaje private:</strong> conversațiile din Messenger (șterse automat după 30 de zile)</li>
            <li><strong>Sesiune:</strong> token temporar de sesiune, expiră la deconectare</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>2. Ce NU colectăm</h2>
          <ul>
            <li>Nu folosim Google Analytics, Facebook Pixel sau alte instrumente de tracking extern</li>
            <li>Nu urmărim comportamentul tău în afara platformei</li>
            <li>Nu creăm profiluri publicitare</li>
            <li>Nu vindem și nu împărtășim datele tale cu terți</li>
            <li>Nu stocăm adresa IP în mod permanent</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>3. Cum folosim datele</h2>
          <p>Datele tale sunt folosite exclusiv pentru:</p>
          <ul>
            <li>Autentificarea și securitatea contului tău</li>
            <li>Afișarea conținutului pe care l-ai creat</li>
            <li>Funcționalitățile platformei (misiuni, reels, articole, comunitate)</li>
            <li>Trimiterea notificărilor pe care le-ai activat explicit</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>4. Retenția datelor</h2>
          <ul>
            <li><strong>Mesaje private:</strong> șterse automat după <strong>30 de zile</strong></li>
            <li><strong>Conținut publicat:</strong> păstrat atât timp cât contul este activ</li>
            <li><strong>La ștergerea contului:</strong> toate datele sunt eliminate irevocabil din baza de date</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>5. Drepturile tale (GDPR)</h2>
          <p>Conform Regulamentului General privind Protecția Datelor (GDPR), ai dreptul la:</p>
          <ul>
            <li><strong>Acces:</strong> să știi ce date deținem despre tine</li>
            <li><strong>Rectificare:</strong> să corectezi datele incorecte din profilul tău</li>
            <li><strong>Ștergere:</strong> să îți ștergi complet contul și toate datele asociate (butonul „Șterge contul" din Setări)</li>
            <li><strong>Portabilitate:</strong> să soliciți exportul datelor tale contactându-ne</li>
            <li><strong>Opoziție:</strong> să refuzi anumite tipuri de procesare</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>6. Cookie-uri</h2>
          <p>
            HelloMara folosește <strong>exclusiv cookie-uri esențiale</strong> pentru menținerea sesiunii tale
            de autentificare. Nu folosim cookie-uri de marketing sau analiză.
          </p>
        </section>

        <section className="privacy-section">
          <h2>7. Securitate</h2>
          <ul>
            <li>Parolele sunt hashuite cu bcrypt (salt unic per utilizator)</li>
            <li>Comunicația este criptată prin HTTPS</li>
            <li>Sesiunile sunt securizate și expiră la deconectare</li>
          </ul>
        </section>

        <section className="privacy-section">
          <h2>8. Contact</h2>
          <p>
            Pentru orice întrebare legată de datele tale personale, ne poți contacta la:{' '}
            <strong>privacy@hellomara.net</strong>
          </p>
        </section>
      </div>
    </div>
  );
}
