/* AMINOGEN Care — intake flow (demo, local only) */
(function () {
  'use strict';

  var STEPS = 6;
  var state = {
    goal: null,
    age: '', height: '', weight: '',
    conditions: [],
    meds: '', allergies: '',
    first: '', last: '', email: '', phone: '', country: 'Poland',
    consents: []
  };

  var PLANS = {
    monthly: { id: 'monthly', label: 'Щомісячно', price: '8 500 ₴ / місяць', note: 'Списання щомісяця, можна скасувати будь-коли' },
    '3m': { id: '3m', label: '3 місяці передоплатою', price: '7 600 ₴ / місяць · 22 800 ₴ разом', note: 'Економія 2 700 ₴' },
    '6m': { id: '6m', label: '6 місяців передоплатою', price: '6 700 ₴ / місяць · 40 200 ₴ разом', note: 'Економія 10 800 ₴' }
  };

  var planId = new URLSearchParams(window.location.search).get('plan') || '3m';
  if (!PLANS[planId]) planId = '3m';

  var step = 1;
  var back = document.getElementById('intakeBack');
  var bar = document.getElementById('intakeBar');
  var countEl = document.getElementById('intakeCount');

  function show(n) {
    step = n;
    Array.prototype.forEach.call(document.querySelectorAll('.intake-step'), function (s) {
      s.classList.toggle('is-active', Number(s.getAttribute('data-step')) === n);
    });
    var top = document.getElementById('intakeTop');
    if (n > STEPS) { top.style.display = 'none'; } else { top.style.display = 'flex'; }
    bar.style.width = Math.min(100, (n / STEPS) * 100) + '%';
    countEl.textContent = n > STEPS ? 'Результат' : n + ' / ' + STEPS;
    back.disabled = n === 1 || n > STEPS;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function err(message) {
    var host = document.querySelector('.intake-step.is-active .intake-foot');
    if (!host) return;
    var el = host.querySelector('.intake-error');
    if (!el) {
      el = document.createElement('p');
      el.className = 'intake-error';
      el.style.cssText = 'color:#B42318;font-size:.8125rem;font-weight:550;margin:0;width:100%';
      host.appendChild(el);
    }
    el.textContent = message;
    window.setTimeout(function () { el.textContent = ''; }, 4000);
  }

  /* ---------------- BMI ---------------- */
  var ageEl = document.getElementById('i-age');
  var heightEl = document.getElementById('i-height');
  var weightEl = document.getElementById('i-weight');
  var bmiBox = document.getElementById('bmiBox');

  function bmi() {
    var h = parseFloat(heightEl.value) / 100;
    var w = parseFloat(weightEl.value);
    if (!h || !w || h < 1.2 || h > 2.3) return null;
    return w / (h * h);
  }

  function updateBmi() {
    var v = bmi();
    if (!v) { bmiBox.hidden = true; return; }
    bmiBox.hidden = false;
    document.getElementById('bmiValue').textContent = v.toFixed(1);
    document.getElementById('bmiNote').textContent =
      v < 25 ? 'Лікар окремо оцінить, чи доцільне призначення взагалі' :
      v < 27 ? 'Нижче діапазону, який зазвичай розглядають для програм зниження ваги' :
      'Зазвичай у межах, які лікарі оцінюють для призначення';
  }

  [heightEl, weightEl].forEach(function (el) { el.addEventListener('input', updateBmi); });

  /* ---------------- options / checks ---------------- */
  document.addEventListener('click', function (e) {
    var opt = e.target.closest('.intake-option');
    if (opt) {
      var key = opt.getAttribute('data-key');
      state[key] = opt.getAttribute('data-value');
      Array.prototype.forEach.call(opt.parentNode.children, function (b) { b.classList.remove('is-picked'); });
      opt.classList.add('is-picked');
      show(step + 1);
      return;
    }

    var next = e.target.closest('[data-next]');
    if (next) { advance(); }
  });

  function advance() {
    if (step === 2) {
      var a = parseInt(ageEl.value, 10);
      var h = parseInt(heightEl.value, 10);
      var w = parseFloat(weightEl.value);
      if (!a || a < 18 || a > 100) { err('Вкажіть вік від 18 до 100 років.'); return; }
      if (!h || h < 120 || h > 230) { err('Вкажіть зріст у сантиметрах.'); return; }
      if (!w || w < 35 || w > 300) { err('Вкажіть вагу в кілограмах.'); return; }
      state.age = a; state.height = h; state.weight = w;
    }

    if (step === 3) {
      state.conditions = Array.prototype.slice.call(document.querySelectorAll('input[name="cond"]:checked')).map(function (i) { return i.value; });
      if (!state.conditions.length) { err('Оберіть хоча б один пункт — зокрема «Жодного з перелічених».'); return; }
    }

    if (step === 4) {
      var meds = document.getElementById('i-meds').value.trim();
      if (!meds) { err('Напишіть, що приймаєте, або «нічого».'); return; }
      state.meds = meds;
      state.allergies = document.getElementById('i-allergies').value.trim();
    }

    if (step === 5) {
      var first = document.getElementById('i-first').value.trim();
      var last = document.getElementById('i-last').value.trim();
      var email = document.getElementById('i-email').value.trim();
      var phone = document.getElementById('i-phone').value.trim();
      if (!first || !last) { err('Вкажіть ім’я та прізвище.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err('Вкажіть коректну електронну адресу.'); return; }
      if (phone.length < 6) { err('Вкажіть номер телефону, за яким лікар зможе з вами зв’язатися.'); return; }
      state.first = first; state.last = last; state.email = email; state.phone = phone;
      state.country = document.getElementById('i-country').value;
    }

    if (step === 6) {
      var consents = Array.prototype.slice.call(document.querySelectorAll('input[name="consent"]:checked'));
      if (consents.length < 4) { err('Потрібні всі чотири підтвердження.'); return; }
      state.consents = consents.map(function (i) { return i.value; });
      buildResult();
      show(7);
      sendIntake();
      return;
    }

    show(step + 1);
  }

  back.addEventListener('click', function () {
    if (step > 1 && step <= STEPS) show(step - 1);
  });

  /* ---------------- "none of the above" exclusivity ---------------- */
  var noneBox = document.querySelector('input[name="cond"][value="none"]');
  var others = document.querySelectorAll('input[name="cond"]:not([value="none"])');
  if (noneBox) {
    noneBox.addEventListener('change', function () {
      if (noneBox.checked) { Array.prototype.forEach.call(others, function (o) { o.checked = false; }); }
    });
    Array.prototype.forEach.call(others, function (o) {
      o.addEventListener('change', function () { if (o.checked) noneBox.checked = false; });
    });
  }

  /* ---------------- result ---------------- */
  var GOALS = { lose: 'Знизити вагу', maintain: 'Утримати результат після зниження ваги', unsure: 'Поки не визначено' };

  function buildResult() {
    var v = bmi();
    var plan = PLANS[planId];
    var host = document.getElementById('resultSummary');
    host.innerHTML =
      '<div><dt>Goal</dt><dd>' + GOALS[state.goal] + '</dd></div>' +
      '<div><dt>BMI</dt><dd>' + (v ? v.toFixed(1) : '—') + '</dd></div>' +
      '<div><dt>Country</dt><dd>' + state.country + '</dd></div>' +
      '<div><dt>Plan</dt><dd>' + plan.label + '</dd></div>' +
      '<div><dt>Price</dt><dd>' + plan.price + '</dd></div>';

    var risky = state.conditions.some(function (c) {
      return ['thyroid', 'pancreatitis', 'pregnancy', 'eating', 'kidney'].indexOf(c) !== -1;
    });

    var text = document.getElementById('resultText');
    if (risky) {
      text.textContent = 'У вашій анкеті є інформація, яку лікар має перевірити особливо уважно. ' +
        'Призначення все ще можливе, але його можуть і не підтвердити — це рішення лікаря, ' +
        'а не цього екрана. Оплата — лише якщо програму призначено.';
    } else if (v && v < 25) {
      text.textContent = 'Ваш ІМТ нижчий за діапазон, який зазвичай розглядають для програм ' +
        'зниження ваги. Лікар усе одно перегляне анкету, але лікування може бути недоцільним — ' +
        'оплата лише якщо програму призначено.';
    } else {
      text.textContent = 'Ліцензований лікар розгляне ваші відповіді протягом одного робочого дня ' +
        'і вирішить, чи доцільне лікування. Оплата — лише якщо програму призначено.';
    }
  }

  /* ---------------- submit to the server ---------------- */
  var serverRef = null;

  function sendIntake() {
    var payload = {
      goal: state.goal,
      age: state.age, height: state.height, weight: state.weight,
      conditions: state.conditions,
      meds: state.meds, allergies: state.allergies,
      first: state.first, last: state.last,
      email: state.email, phone: state.phone, country: state.country,
      plan: planId,
      consents: state.consents
    };

    var note = document.querySelector('#intakeResult .fine');
    if (note) note.textContent = 'Надсилаємо анкету лікарю…';

    fetch('/api/intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.data && res.data.fields || []).join(', ') || 'rejected');
        serverRef = res.data.ref;
        if (note) note.textContent = 'Анкету надіслано. Номер звернення ' + res.data.ref + ' — лікар розгляне її протягом одного робочого дня.';
      })
      .catch(function () {
        if (note) note.textContent = 'Демо-режим: сервер недоступний, тому дані не надіслано. ' +
          'Запустіть `node server.js` у папці концепту, щоб надсилати по-справжньому.';
      });
  }

  var bookBtn = document.getElementById('bookBtn');
  if (bookBtn) {
    bookBtn.addEventListener('click', function () {
      document.getElementById('intakeResult').hidden = true;
      var panel = document.getElementById('bookedPanel');
      panel.hidden = false;
      document.getElementById('bookRef').textContent = serverRef || ('MC-2026-' + String(Math.floor(1000 + Math.random() * 9000)));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  var restart = document.getElementById('restartBtn');
  if (restart) {
    restart.addEventListener('click', function () { window.location.href = 'start.html' + (planId ? '?plan=' + planId : ''); });
  }

  show(1);
  updateBmi();
})();
