import React from 'react';

export const Ambient: React.FC = () => {
  return (
    <>
    <style>{`
      @keyframes floating {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-12px); }
      }

      @keyframes glowPulse {
        0% {
          border-color: #00ff7f;
          box-shadow: 0 0 35px rgba(0,255,127,0.28), 0 0 80px rgba(30,144,255,0.12), inset 0 0 38px rgba(255,210,115,0.07);
          color: #c7f5ff;
          background: radial-gradient(circle at 35% 30%, rgba(255,220,140,0.24), rgba(30,144,255,0.12) 42%, rgba(10,11,16,0.98) 74%);
        }
        25% {
          border-color: #8a2be2;
          box-shadow: 0 0 40px rgba(138,43,226,0.32), 0 0 90px rgba(0,255,127,0.12), inset 0 0 45px rgba(255,167,38,0.08);
          color: #e6dbff;
          background: radial-gradient(circle at 35% 30%, rgba(255,220,140,0.26), rgba(138,43,226,0.14) 42%, rgba(10,11,16,0.98) 74%);
        }
        50% {
          border-color: #1e90ff;
          box-shadow: 0 0 44px rgba(30,144,255,0.34), 0 0 95px rgba(0,255,127,0.12), inset 0 0 48px rgba(255,120,50,0.08);
          color: #d9eeff;
          background: radial-gradient(circle at 35% 30%, rgba(255,220,140,0.24), rgba(30,144,255,0.14) 42%, rgba(10,11,16,0.98) 74%);
        }
        75% {
          border-color: #00d4ff;
          box-shadow: 0 0 42px rgba(0,212,255,0.30), 0 0 92px rgba(186,85,211,0.12), inset 0 0 44px rgba(255,190,90,0.07);
          color: #d8fbff;
          background: radial-gradient(circle at 35% 30%, rgba(255,220,140,0.23), rgba(0,212,255,0.13) 42%, rgba(10,11,16,0.98) 74%);
        }
        100% {
          border-color: #00ff7f;
          box-shadow: 0 0 35px rgba(0,255,127,0.28), 0 0 80px rgba(30,144,255,0.12), inset 0 0 38px rgba(255,210,115,0.07);
          color: #c7f5ff;
          background: radial-gradient(circle at 35% 30%, rgba(255,220,140,0.24), rgba(30,144,255,0.12) 42%, rgba(10,11,16,0.98) 74%);
        }
      }

      @keyframes ambientShift {
        0% { filter: hue-rotate(0deg); opacity: 0.22; }
        50% { filter: hue-rotate(28deg); opacity: 0.30; }
        100% { filter: hue-rotate(0deg); opacity: 0.22; }
      }

      .ambient-lights {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }

      .ambient-orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(58px);
        mix-blend-mode: screen;
        animation: ambientShift 42s ease-in-out infinite;
      }

      .float-wrap { animation: floating 6s infinite ease-in-out; }
      .mara-center {
        width: 180px; height: 180px; border-radius: 50%; border: 3px solid;
        display: flex; align-items: center; justify-content: center;
        z-index: 100; font-weight: 900; font-size: 1.2rem;
        animation: glowPulse 28s infinite ease-in-out;
        letter-spacing: 5px;
      }
`}</style>
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-orb" style={{ left: '-6%', top: '20%', width: '32vw', height: '32vw', minWidth: '240px', minHeight: '240px', background: 'radial-gradient(circle, rgba(0,255,127,0.42), rgba(0,255,127,0) 68%)', animationDelay: '0s' }} />
        <div className="ambient-orb" style={{ right: '-8%', top: '8%', width: '35vw', height: '35vw', minWidth: '260px', minHeight: '260px', background: 'radial-gradient(circle, rgba(138,43,226,0.38), rgba(138,43,226,0) 68%)', animationDelay: '4s' }} />
        <div className="ambient-orb" style={{ left: '18%', bottom: '-12%', width: '38vw', height: '38vw', minWidth: '280px', minHeight: '280px', background: 'radial-gradient(circle, rgba(30,144,255,0.34), rgba(30,144,255,0) 70%)', animationDelay: '8s' }} />
        <div className="ambient-orb" style={{ right: '16%', bottom: '-14%', width: '32vw', height: '32vw', minWidth: '240px', minHeight: '240px', background: 'radial-gradient(circle, rgba(0,212,255,0.30), rgba(0,212,255,0) 72%)', animationDelay: '12s' }} />
        <div className="ambient-orb" style={{ left: '38%', top: '-16%', width: '28vw', height: '28vw', minWidth: '220px', minHeight: '220px', background: 'radial-gradient(circle, rgba(186,85,211,0.26), rgba(186,85,211,0) 70%)', animationDelay: '16s' }} />
      </div>
    </>
  );
};