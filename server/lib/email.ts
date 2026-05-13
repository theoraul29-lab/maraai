import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? 'Mara <noreply@hellomara.net>';
const BASE = (process.env.FRONTEND_URL ?? 'https://hellomara.net').replace(/\/$/, '');

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

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const resend = makeResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping welcome email');
    return;
  }
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Welcome to Mara!',
    html: `<p>Hi ${name},</p><p>Welcome to Mara! Your account is ready. <a href="${BASE}">Start exploring</a>.</p>`,
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
