    // === Stars ===
    (function generateStars() {
      var stars = document.getElementById('stars');
      if (!stars) return;
      stars.innerHTML = '';
      var count = window.innerWidth < 700 ? 50 : 120;
      for (var i = 0; i < count; i++) {
        var s = document.createElement('div');
        s.className = 'star';
        var size = Math.random() * 2 + 0.5;
        s.style.width = size + 'px';
        s.style.height = size + 'px';
        s.style.top = Math.random() * 100 + '%';
        s.style.left = Math.random() * 100 + '%';
        s.style.animationDelay = Math.random() * 3 + 's';
        stars.appendChild(s);
      }
    })();

    // === Cursor ===
    (function setupCursor() {
      var cursor = document.getElementById('cursor');
      if (!cursor) return;

      document.addEventListener('mousemove', function (e) {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      });

      var hoverEls = document.querySelectorAll('a, button, .mod-card');
      hoverEls.forEach(function (el) {
        el.addEventListener('mouseenter', function () { cursor.classList.add('hover'); });
        el.addEventListener('mouseleave', function () { cursor.classList.remove('hover'); });
      });
    })();

    // === Countdown ===
    var LAUNCH_TIMESTAMP = Date.UTC(2026, 5, 1, 0, 0, 0);
    var TOTAL_DURATION = 20 * 24 * 60 * 60 * 1000;
    var REDIRECT_URL = 'https://hellomara.net';
    var launched = false;
    var redirectTimerId = null;
    var countdownIntervalId = null;

    function pad2(n) {
      return n < 10 ? '0' + n : '' + n;
    }

    function setTextById(id, value) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = value;
    }

    function setTextBySelector(selector, value) {
      var el = document.querySelector(selector);
      if (!el) return;
      el.textContent = value;
    }

    function setAndTick(id, value) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.textContent === value) return;

      el.textContent = value;
      el.classList.remove('tick');
      // Without a forced reflow, removing/re-adding 'tick' in one frame won't retrigger CSS animation.
      void el.offsetWidth;
      el.classList.add('tick');
      setTimeout(function () { el.classList.remove('tick'); }, 150);
    }

    function isValidEmail(emailInput, email) {
      if (!emailInput.checkValidity()) return false;
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return false;

      var parts = email.split('@');
      if (parts.length !== 2) return false;
      var local = parts[0];
      var domain = parts[1];

      if (!local || !domain) return false;
      if (local.indexOf('..') !== -1 || domain.indexOf('..') !== -1) return false;
      if (local.charAt(0) === '.' || local.charAt(local.length - 1) === '.') return false;
      if (domain.charAt(0) === '.' || domain.charAt(domain.length - 1) === '.') return false;

      return true;
    }

    function setCountdownValues(days, hours, mins, secs, withTick) {
      var setter = withTick ? setAndTick : setTextById;
      var d = pad2(days);
      var h = pad2(hours);
      var m = pad2(mins);
      var s = pad2(secs);

      setter('lbDays', d);
      setter('lbHours', h);
      setter('lbMins', m);
      setter('lbSecs', s);
      setter('hcDays', d);
      setter('hcHours', h);
      setter('hcMins', m);
      setter('hcSecs', s);
    }

    function scheduleRedirectOnce() {
      if (redirectTimerId !== null) return;
      redirectTimerId = setTimeout(function () {
        window.location.href = REDIRECT_URL;
      }, 3000);
    }

    function applyLaunchState() {
      if (launched) return;
      launched = true;

      setCountdownValues(0, 0, 0, 0, false);
      setTextBySelector('.lb-text', '🚀 WE ARE LIVE');
      setTextBySelector('.hc-label', 'hellomara.net is live!');

      var fill = document.getElementById('lpFill');
      if (fill) fill.style.width = '100%';

      setTextById('lpDaysLeft', '0');
      document.title = 'Live — hellomara.net';

      scheduleRedirectOnce();
    }

    function tick() {
      var now = Date.now();
      var diff = LAUNCH_TIMESTAMP - now;

      if (diff <= 0) {
        applyLaunchState();
        if (countdownIntervalId !== null) {
          clearInterval(countdownIntervalId);
          countdownIntervalId = null;
        }
        return;
      }

      var totalSec = Math.floor(diff / 1000);
      var days = Math.floor(totalSec / 86400);
      var hours = Math.floor((totalSec % 86400) / 3600);
      var mins = Math.floor((totalSec % 3600) / 60);
      var secs = totalSec % 60;

      setCountdownValues(days, hours, mins, secs, true);

      var elapsed = TOTAL_DURATION - diff;
      var pct = Math.min(100, Math.max(0, (elapsed / TOTAL_DURATION) * 100));
      var fill = document.getElementById('lpFill');
      if (fill) fill.style.width = pct + '%';

      setTextById('lpDaysLeft', '' + days);
      document.title = pad2(days) + 'd ' + pad2(hours) + 'h — hellomara.net';
    }

    tick();
    countdownIntervalId = setInterval(tick, 1000);

    // === Waitlist form ===
    var waitlistForm = document.getElementById('waitlistForm');
    if (waitlistForm) {
      waitlistForm.addEventListener('submit', function (e) {
        e.preventDefault();

        var btn = this.querySelector('.wl-btn');
        var emailInput = document.getElementById('wlEmail');
        if (!btn || !emailInput) return;

        var email = (emailInput.value || '').trim();
        var emailIsValid = isValidEmail(emailInput, email);
        if (!emailIsValid) {
          emailInput.setCustomValidity('Please enter a valid email address.');
          emailInput.reportValidity();
          emailInput.style.borderColor = 'rgba(236,72,153,0.8)';
          setTimeout(function () {
            emailInput.style.borderColor = '';
            emailInput.setCustomValidity('');
          }, 1500);
          return;
        }
        emailInput.setCustomValidity('');

        btn.textContent = '...';
        btn.disabled = true;

        var websiteInput = this.querySelector('input[name="website"]');
        var payload = {
          email: email,
          website: websiteInput ? websiteInput.value : '',
          source: 'landing',
          referrer: document.referrer || null,
        };

        fetch('/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            // Waitlist signup is intentionally idempotent; server can return 409 for duplicates.
            // We treat that as success so users don't see a confusing "error" for re-submission.
            return res.ok || res.status === 409;
          })
          .catch(function () {
            return false;
          })
          .then(function (ok) {
            if (ok) {
              btn.textContent = "✓ You're in!";
              btn.style.boxShadow = '0 0 30px rgba(46,204,113,0.5)';
              emailInput.value = '';
              emailInput.placeholder = 'Welcome to hellomara 🌱';
            } else {
              btn.textContent = 'Try again';
              btn.style.background = 'rgba(236,72,153,0.6)';
            }

            setTimeout(function () {
              btn.textContent = 'Join free →';
              btn.style.background = '';
              btn.style.boxShadow = '';
              btn.disabled = false;
              emailInput.placeholder = 'your@email.com';
            }, 4000);
          });
      });
    }
