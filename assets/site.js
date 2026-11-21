// Small enhancements. The site works without this file: every link is visible, every form posts normally.
(() => {
  'use strict';
  const doc = document;

  // Menu button on small screens
  const btn = doc.querySelector('.menu-btn');
  const nav = doc.getElementById('site-nav');
  if (btn && nav) {
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Close menu' : 'Menu';
      nav.classList.toggle('open', open);
    };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        set(false);
        btn.focus();
      }
    });
  }

  // Forms: record when the page loaded. A form sent within seconds is almost certainly a bot.
  const stamp = String(Date.now());
  doc.querySelectorAll('input[name="ts"]').forEach((i) => {
    i.value = stamp;
  });

  // A program's apply box follows the clock, so a page opened after the deadline shows the closed
  // notice even if the site has not been rebuilt yet. data-closes is the first moment applications are closed:
  // one minute after the stated deadline, so "23:59" really lasts until 23:59:59.
  doc.querySelectorAll('.apply-box').forEach((box) => {
    const opens = Date.parse(box.dataset.opens);
    const closes = Date.parse(box.dataset.closes);
    const now = Date.now();
    const state = opens && now < opens ? 'upcoming' : closes && now >= closes ? 'closed' : 'open';
    box.querySelectorAll('[data-when]').forEach((b) => {
      b.hidden = b.dataset.when !== state;
    });
  });

  // Analytics choice. Nothing loads unless the visitor says yes. Only present when analytics is on.
  const banner = doc.getElementById('consent');
  if (banner) {
    let saved = null;
    try {
      saved = localStorage.getItem('analytics-consent');
    } catch (e) {
      saved = null;
    }
    const load = () => {
      const s = doc.createElement('script');
      s.src = banner.dataset.src;
      s.defer = true;
      doc.head.appendChild(s);
    };
    if (saved === 'yes') load();
    else if (saved !== 'no') banner.hidden = false;
    banner.addEventListener('click', (e) => {
      const b = e.target.closest('[data-consent]');
      if (!b) return;
      const v = b.dataset.consent;
      try {
        localStorage.setItem('analytics-consent', v);
      } catch (err) {
        /* private mode: the choice lasts until the page closes */
      }
      banner.hidden = true;
      if (v === 'yes') load();
    });
  }
})();
