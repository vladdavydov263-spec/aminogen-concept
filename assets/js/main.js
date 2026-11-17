/* AMINOGEN concept — interactions (no dependencies) */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  /* ---------------- demo lot data (sample only) ---------------- */
  var LOTS = {
    'LYTR-20260102': {
      product: 'Tirzepatide 15 mg',
      id: 'AG-TIR-015',
      purity: '99.905%',
      content: '10.59 mg / vial',
      identity: 'Confirmed (LC-MS)',
      lab: 'Janoshik Analytical, CZ',
      report: 'J-26-0412',
      date: '04/2026'
    },
    'TIR015-24A001': {
      product: 'Tirzepatide 15 mg',
      id: 'AG-TIR-015',
      purity: '99.612%',
      content: '15.06 mg / vial',
      identity: 'Confirmed (LC-MS)',
      lab: 'Janoshik Analytical, CZ',
      report: 'J-25-1877',
      date: '11/2025'
    },
    'NAD500-26B014': {
      product: 'NAD+ 500 mg',
      id: 'AG-NAD-500',
      purity: '99.418%',
      content: '502.4 mg / vial',
      identity: 'Confirmed (LC-MS)',
      lab: 'Janoshik Analytical, CZ',
      report: 'J-26-0507',
      date: '05/2026'
    }
  };

  var CHEVRON = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  var WARN = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/></svg>';

  var form = document.getElementById('verifyForm');
  var report = document.getElementById('report');
  var lotInput = document.getElementById('lot');

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderReport(raw) {
    var lot = raw.trim().toUpperCase();
    if (!lot) { report.innerHTML = ''; return; }
    var d = LOTS[lot];
    var hint = document.getElementById('lotHint');
    if (hint) { hint.style.display = d ? 'none' : ''; }
    if (!d) {
      report.innerHTML =
        '<div class="report-empty">' + WARN +
        '<p>No public report is published for lot <strong>' + esc(lot) + '</strong> yet. ' +
        'Private-label and wholesale lots are released without a public record — ' +
        '<a href="#request" style="color:#A8C6F5">ask us</a> and we will send the certificate for that batch.</p></div>';
      return;
    }
    report.innerHTML =
      '<div class="report-card">' +
        '<div class="report-head">' +
          '<span class="report-name">' + esc(d.product) + '</span>' +
          '<span class="report-status">Verified lot</span>' +
        '</div>' +
        '<dl class="report-rows">' +
          '<div><dt>Product ID</dt><dd>' + esc(d.id) + '</dd></div>' +
          '<div><dt>Lot number</dt><dd>' + esc(lot) + '</dd></div>' +
          '<div><dt>Purity (HPLC)</dt><dd>' + esc(d.purity) + '</dd></div>' +
          '<div><dt>Content assay</dt><dd>' + esc(d.content) + '</dd></div>' +
          '<div><dt>Identity</dt><dd>' + esc(d.identity) + '</dd></div>' +
          '<div><dt>Laboratory</dt><dd>' + esc(d.lab) + '</dd></div>' +
        '</dl>' +
        '<div class="report-foot">' +
          '<a href="#documents">Open certificate (PDF) ' + CHEVRON + '</a>' +
          '<span>Report ' + esc(d.report) + ' · ' + esc(d.date) + '</span>' +
        '</div>' +
      '</div>';
  }

  if (form && report) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      renderReport(lotInput.value);
    });
    var preset = new URLSearchParams(window.location.search).get('lot');
    if (preset) {
      lotInput.value = preset;
      renderReport(preset);
    }

    Array.prototype.forEach.call(document.querySelectorAll('.link-demo'), function (btn) {
      btn.addEventListener('click', function () {
        lotInput.value = btn.getAttribute('data-lot');
        renderReport(lotInput.value);
        lotInput.focus();
      });
    });
  }

  /* ---------------- catalog filters ---------------- */
  var chips = document.querySelectorAll('.chip');
  var products = document.querySelectorAll('.product');

  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener('click', function () {
      var filter = chip.getAttribute('data-filter');
      Array.prototype.forEach.call(chips, function (c) {
        var active = c === chip;
        c.classList.toggle('is-active', active);
        c.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Array.prototype.forEach.call(products, function (p) {
        var show = filter === 'all' || p.getAttribute('data-cat') === filter;
        p.hidden = !show;
      });
    });
  });

  /* ---------------- mobile nav ---------------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        nav.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- request form (concept behaviour) ---------------- */
  var reqForm = document.getElementById('requestForm');
  if (reqForm) {
    reqForm.addEventListener('submit', function (e) {
      e.preventDefault();
      reqForm.innerHTML =
        '<div class="form-ok" style="display:block;grid-column:1/-1">' +
          '<p style="font-size:.6875rem;font-weight:650;letter-spacing:.13em;text-transform:uppercase;color:#0E7C5A;margin-bottom:10px">Request prepared</p>' +
          '<p style="font-size:1.0625rem;font-weight:600;line-height:1.45;margin-bottom:8px">Thank you — this is a concept form.</p>' +
          '<p class="fine" style="max-width:46ch">On the live site the request goes to the sales inbox together with the current price list and the COA for the available lot.</p>' +
        '</div>';
    });
  }

  /* ---------------- reveal on scroll ---------------- */
  var targets = document.querySelectorAll('.product, .step, .log-card, .partner, .doc-link, .trust-item');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px 120px 0px', threshold: 0.01 });

    Array.prototype.forEach.call(targets, function (el, i) {
      el.classList.add('reveal');
      el.style.transitionDelay = (Math.min(i % 4, 3) * 60) + 'ms';
      io.observe(el);
    });

    /* safety net: never leave content hidden (print, screenshots, odd browsers) */
    window.setTimeout(function () {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-in'); });
    }, 1400);
  }

  /* ---------------- tabs (product, policies) ---------------- */
  var tabGroups = document.querySelectorAll('.tabs');
  Array.prototype.forEach.call(tabGroups, function (group) {
    var tabs = Array.prototype.slice.call(group.querySelectorAll('.tab'));

    function activate(tab) {
      var panelId = tab.getAttribute('aria-controls');
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) {
        var on = p.id === panelId;
        p.classList.toggle('is-active', on);
        if (on) { p.removeAttribute('hidden'); } else { p.setAttribute('hidden', ''); }
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(tab); });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus(); activate(next);
      });
    });

    var hash = (window.location.hash || '').replace('#', '');
    if (hash) {
      var match = tabs.filter(function (t) { return t.getAttribute('aria-controls') === hash; })[0];
      if (match) { activate(match); }
    }
  });

  /* ---------------- product gallery ---------------- */
  var galleryMain = document.getElementById('galleryMain');
  var thumbs = document.querySelectorAll('.gallery-thumbs button');
  if (galleryMain && thumbs.length) {
    Array.prototype.forEach.call(thumbs, function (btn) {
      btn.addEventListener('click', function () {
        galleryMain.src = btn.getAttribute('data-full');
        Array.prototype.forEach.call(thumbs, function (b) { b.classList.toggle('is-active', b === btn); });
      });
    });
  }
})();
