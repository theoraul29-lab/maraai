import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'Mara <noreply@hellomara.net>';
const BASE = (process.env.FRONTEND_URL ?? 'https://hellomara.net').replace(/\/$/, '');

// User-controlled values (e.g. firstName) must never be interpolated raw into
// email HTML or subject lines — an attacker could inject markup or break the
// header. Escape the five HTML-significant characters.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resend = makeResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping password reset email');
    return;
  }
  const link = `${BASE}/reset-password?token=${encodeURIComponent(token)}`;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your Mara password',
    html: `<p>Click <a href="${link}">here</a> to reset your password. This link expires in 1 hour.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}

export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: 'register' | 'login' | 'reset',
): Promise<void> {
  const resend = makeResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping OTP email');
    return;
  }
  const label =
    purpose === 'register' ? 'registration' : purpose === 'login' ? 'login' : 'password reset';
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Your Mara ${label} code: ${code}`,
    html: `<p>Your verification code is: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
  });
}

export async function sendWelcomeEmail(email: string, firstName?: string): Promise<void> {
  const resend = makeResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping welcome email');
    return;
  }
  // Strip CR/LF (header-injection defence) for the subject and HTML-escape
  // the body interpolation, since firstName is user-controlled.
  const rawName = (firstName ?? 'Prietene').replace(/[\r\n]+/g, ' ').trim() || 'Prietene';
  const name = escapeHtml(rawName);
  const html = `
    <div style="background:#020008;font-family:'Inter',sans-serif;padding:0;margin:0">
      <div style="max-width:560px;margin:0 auto;padding:40px 24px">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:32px">
          <h1 style="background:linear-gradient(135deg,#c084fc,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-size:2rem;font-weight:800;margin:0 0 4px">HelloMara</h1>
          <p style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin:0">Transformarea ta personală, ghidată de AI</p>
        </div>
        <!-- Body -->
        <div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.25);border-radius:20px;padding:32px 28px">
          <p style="color:rgba(255,255,255,0.9);font-size:1.1rem;font-weight:600;margin:0 0 8px">Bun venit, ${name}! 🌱</p>
          <p style="color:rgba(255,255,255,0.6);font-size:0.9rem;line-height:1.6;margin:0 0 28px">Contul tău HelloMara este activ. Mara te cunoaște, îți dă misiuni reale și crește cu tine — în fiecare zi.</p>
          <!-- Steps -->
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px">
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span style="background:rgba(168,85,247,0.3);color:#c084fc;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;flex-shrink:0;line-height:28px;text-align:center">1</span>
              <div><p style="color:rgba(255,255,255,0.85);font-size:0.88rem;font-weight:600;margin:0 0 2px">Descoperă prima ta misiune</p><p style="color:rgba(255,255,255,0.45);font-size:0.8rem;margin:0">Mara a pregătit o misiune personalizată pentru tine.</p></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span style="background:rgba(168,85,247,0.3);color:#c084fc;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;flex-shrink:0;line-height:28px;text-align:center">2</span>
              <div><p style="color:rgba(255,255,255,0.85);font-size:0.88rem;font-weight:600;margin:0 0 2px">Câștigă XP și badge-uri</p><p style="color:rgba(255,255,255,0.45);font-size:0.8rem;margin:0">Fiecare misiune completată îți aduce puncte de experiență.</p></div>
            </div>
            <div style="display:flex;align-items:flex-start;gap:12px">
              <span style="background:rgba(168,85,247,0.3);color:#c084fc;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;flex-shrink:0;line-height:28px;text-align:center">3</span>
              <div><p style="color:rgba(255,255,255,0.85);font-size:0.88rem;font-weight:600;margin:0 0 2px">Crește alături de comunitate</p><p style="color:rgba(255,255,255,0.45);font-size:0.8rem;margin:0">Reels, Writers Hub, Creator Studio — totul într-un singur loc.</p></div>
            </div>
          </div>
          <!-- CTA -->
          <div style="text-align:center;display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
            <a href="${BASE}/missions" style="background:linear-gradient(135deg,#a855f7,#f472b6);color:#fff;text-decoration:none;padding:13px 28px;border-radius:12px;font-weight:700;font-size:0.9rem;display:inline-block">🎯 Prima mea misiune</a>
            <a href="${BASE}/pricing" style="background:transparent;color:#c084fc;text-decoration:none;padding:13px 28px;border-radius:12px;font-weight:700;font-size:0.9rem;border:1px solid rgba(168,85,247,0.5);display:inline-block">💎 Vezi planurile</a>
          </div>
        </div>
        <!-- Footer -->
        <p style="color:rgba(255,255,255,0.2);font-size:0.75rem;text-align:center;margin-top:24px">© 2026 HelloMara · <a href="${BASE}" style="color:rgba(168,85,247,0.6);text-decoration:none">hellomara.net</a></p>
      </div>
    </div>
  `;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Bun venit la HelloMara, ${rawName}! 🌱`,
    html,
  });
}

export async function sendWaitlistConfirmationEmail(email: string): Promise<void> {
  const resend = makeResend();
  if (!resend) {
    console.log('[email] Waitlist confirmation for:', email);
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Ești pe lista MaraAI! 🚀',
    html: `
      <div style="background:#05020f;color:#fff;font-family:sans-serif;
                  padding:40px;border-radius:12px;max-width:480px;margin:0 auto">
        <h2 style="color:#a855f7;margin-bottom:8px">MaraAI</h2>
        <p style="color:rgba(255,255,255,0.8);font-size:16px;margin-bottom:16px">
          Ești pe lista de așteptare! 🎉
        </p>
        <p style="color:rgba(255,255,255,0.6);margin-bottom:24px">
          Te vom anunța primul pe <strong style="color:#a855f7">1 iunie 2026</strong>
          când platforma se lansează.
        </p>
        <div style="background:#1a0533;border:1px solid rgba(168,85,247,0.3);
                    border-radius:8px;padding:16px;margin-bottom:24px">
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0">
            💡 Activează P2P la înregistrare pentru acces complet gratuit —
            100 mesaje/zi, upload video, Trading module 1-3.
          </p>
        </div>
        <p style="color:rgba(255,255,255,0.3);font-size:12px">
          — Echipa Mara · hellomara.net
        </p>
      </div>
    `,
  });
}
