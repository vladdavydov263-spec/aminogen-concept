/* AMINOGEN shop — cart, drawer, checkout (no dependencies) */
(function () {
  'use strict';

  var PRODUCTS = {
    'tir-15': { name: 'Tirzepatide', dose: '15 mg', price: 3590, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'tir-20': { name: 'Tirzepatide', dose: '20 mg', price: 4490, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'tir-40': { name: 'Tirzepatide', dose: '40 mg', price: 7190, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'ret-10': { name: 'Retatrutide', dose: '10 mg', price: 3990, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'ret-20': { name: 'Retatrutide', dose: '20 mg', price: 6290, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'ret-40': { name: 'Retatrutide', dose: '40 mg', price: 10790, img: '../assets/img/box-front.jpg', cat: 'metabolic' },
    'mot-40': { name: 'Mots-C', dose: '40 mg', price: 5390, img: '../assets/img/box-front.jpg', cat: 'longevity' }
  };

  var FREE_SHIPPING = 5000;
  var SHIPPING = 200;
  var KEY = 'aminogen_cart_v1';

  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cart = {}; }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }

  /* ---------------- deep link: /shop/?cart=tir-15:2,ret-20:1 ---------------- */
  var params = new URLSearchParams(window.location.search);
  var seed = params.get('cart');
  if (seed) {
    var seeded = false;
    seed.split(',').forEach(function (pair) {
      var bits = pair.split(':');
      var id = (bits[0] || '').trim();
      var q = parseInt(bits[1] || '1', 10);
      if (PRODUCTS[id]) {
        cart[id] = (cart[id] || 0) + (isNaN(q) || q < 1 ? 1 : q);
        seeded = true;
      }
    });
    if (seeded) { save(); }
  }

  function plural(n, forms) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  function money(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₴';
  }

  function count() {
    return Object.keys(cart).reduce(function (s, id) { return s + cart[id]; }, 0);
  }

  function subtotal() {
    return Object.keys(cart).reduce(function (s, id) {
      var p = PRODUCTS[id];
      return p ? s + p.price * cart[id] : s;
    }, 0);
  }

  function shippingFee() {
    var sub = subtotal();
    return sub === 0 || sub >= FREE_SHIPPING ? 0 : SHIPPING;
  }

  /* ---------------- rendering ---------------- */
  function renderCount() {
    var badges = document.querySelectorAll('[data-cart-count]');
    var n = count();
    Array.prototype.forEach.call(badges, function (b) {
      b.textContent = n;
      b.setAttribute('data-empty', n === 0 ? 'true' : 'false');
    });
  }

  function renderDrawer() {
    var list = document.getElementById('cartItems');
    if (!list) return;
    var ids = Object.keys(cart);

    if (!ids.length) {
      list.innerHTML = '<p class="cart-empty">Ваш кошик порожній.<br>Оберіть варіант у каталозі, щоб почати замовлення.</p>';
    } else {
      list.innerHTML = ids.map(function (id) {
        var p = PRODUCTS[id];
        if (!p) return '';
        return '' +
          '<div class="ci">' +
            '<div class="ci-thumb">' + p.dose + '</div>' +
            '<div>' +
              '<div class="ci-name">' + p.name + ' ' + p.dose + '</div>' +
              '<div class="ci-meta">10 × 3 мл · COA на партію</div>' +
              '<div class="ci-qty">' +
                '<button type="button" data-dec="' + id + '" aria-label="Зменшити кількість">−</button>' +
                '<span>' + cart[id] + '</span>' +
                '<button type="button" data-inc="' + id + '" aria-label="Збільшити кількість">+</button>' +
              '</div>' +
            '</div>' +
            '<div class="ci-right">' +
              '<div class="ci-price">' + money(p.price * cart[id]) + '</div>' +
              '<button type="button" class="ci-remove" data-remove="' + id + '">Видалити</button>' +
            '</div>' +
          '</div>';
      }).join('');
    }

    var sub = subtotal();
    var ship = shippingFee();
    var subEl = document.getElementById('cartSubtotal');
    var shipEl = document.getElementById('cartShipping');
    var totEl = document.getElementById('cartTotal');
    if (subEl) subEl.textContent = money(sub);
    if (shipEl) shipEl.textContent = ship === 0 ? (sub === 0 ? '—' : 'Безкоштовно') : money(ship);
    if (totEl) totEl.textContent = money(sub + ship);

    var co = document.getElementById('cartCheckout');
    if (co) {
      if (sub === 0) { co.setAttribute('aria-disabled', 'true'); co.style.opacity = '.5'; }
      else { co.removeAttribute('aria-disabled'); co.style.opacity = ''; }
    }
  }

  function renderSummary() {
    var host = document.getElementById('sumItems');
    if (!host) return;
    var ids = Object.keys(cart);
    if (!ids.length) {
      host.innerHTML = '<p class="cart-empty">Ваш кошик порожній.</p>';
    } else {
      host.innerHTML = ids.map(function (id) {
        var p = PRODUCTS[id];
        return p ? '<div class="sum-item"><span>' + p.name + ' ' + p.dose + ' × ' + cart[id] + '</span><span>' + money(p.price * cart[id]) + '</span></div>' : '';
      }).join('');
    }
    var sub = subtotal();
    var ship = shippingFee();
    var el = function (id, v) { var n = document.getElementById(id); if (n) n.textContent = v; };
    el('sumSubtotal', money(sub));
    el('sumShipping', ship === 0 ? (sub === 0 ? '—' : 'Безкоштовно') : money(ship));
    el('sumTotal', money(sub + ship));
    el('sumCount', count() + plural(count(), [' позиція', ' позиції', ' позицій']));
  }

  /* ---------------- drawer ---------------- */
  var drawer = document.getElementById('cartDrawer');
  var overlay = document.getElementById('cartOverlay');

  function openCart() {
    if (!drawer) return;
    drawer.classList.add('is-open');
    if (overlay) overlay.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    drawer.setAttribute('tabindex', '-1');
    drawer.focus();
  }

  function closeCart() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-open-cart]'), function (b) {
    b.addEventListener('click', openCart);
  });
  if (overlay) overlay.addEventListener('click', closeCart);
  Array.prototype.forEach.call(document.querySelectorAll('[data-close-cart]'), function (b) {
    b.addEventListener('click', closeCart);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCart();
  });

  /* ---------------- actions ---------------- */
  function add(id) {
    if (!PRODUCTS[id]) return;
    cart[id] = (cart[id] || 0) + 1;
    save();
    renderCount();
    renderDrawer();
    renderSummary();
    openCart();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add], [data-inc], [data-dec], [data-remove]');
    if (!t) return;
    if (t.hasAttribute('data-add')) { add(t.getAttribute('data-add')); return; }
    if (t.hasAttribute('data-inc')) {
      var idIn = t.getAttribute('data-inc');
      cart[idIn] = (cart[idIn] || 0) + 1;
    } else if (t.hasAttribute('data-dec')) {
      var idDec = t.getAttribute('data-dec');
      cart[idDec] = (cart[idDec] || 0) - 1;
      if (cart[idDec] <= 0) delete cart[idDec];
    } else if (t.hasAttribute('data-remove')) {
      delete cart[t.getAttribute('data-remove')];
    }
    save();
    renderCount();
    renderDrawer();
    renderSummary();
  });

  /* ---------------- catalog filters ---------------- */
  var chips = document.querySelectorAll('[data-filter]');
  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      Array.prototype.forEach.call(chips, function (c) {
        c.classList.toggle('is-active', c === chip);
        c.setAttribute('aria-selected', c === chip ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-cat]'), function (card) {
        card.hidden = !(f === 'all' || card.getAttribute('data-cat') === f);
      });
    });
  });

  /* ---------------- checkout ---------------- */
  var form = document.getElementById('checkoutForm');
  if (form) {
    var submitBtn = document.querySelector('button[form="checkoutForm"]') || form.querySelector('button[type="submit"]');
    if (count() === 0) {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Кошик порожній'; }
      var emptyNote = document.getElementById('checkoutEmpty');
      if (emptyNote) emptyNote.style.display = 'block';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (count() === 0) return;

      var payload = {
        items: Object.keys(cart).map(function (id) { return { id: id, qty: cart[id] }; }),
        payment: (form.querySelector('input[name="pay"]:checked') || {}).value || 'card',
        customer: {
          first: form.querySelector('#c-first').value,
          last: form.querySelector('#c-last').value,
          email: form.querySelector('#c-email').value,
          phone: form.querySelector('#c-phone').value,
          country: form.querySelector('#c-country').value,
          city: form.querySelector('#c-city').value,
          zip: form.querySelector('#c-zip').value,
          address: form.querySelector('#c-address').value,
          notes: form.querySelector('#c-notes').value
        }
      };

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Оформлюємо…'; }

      fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.data && res.data.fields || []).join(', ') || 'rejected');
          finish(res.data.ref, true);
        })
        .catch(function () {
          finish('DEMO-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000)), false);
        });
    });

    function finish(num, recorded) {
      var success = document.getElementById('checkoutSuccess');
      var grid = document.getElementById('checkoutGrid');
      var emptyNote = document.getElementById('checkoutEmpty');
      if (success) success.style.display = 'block';
      if (grid) grid.style.display = 'none';
      if (emptyNote) emptyNote.style.display = 'none';
      var ref = document.getElementById('orderRef');
      if (ref) ref.textContent = num;
      var note = document.getElementById('orderNote');
      if (note) {
        note.textContent = recorded
          ? 'Замовлення зафіксовано на сервері. Оплату не списано — платіжний провайдер підключається наступним кроком, до запуску.'
          : 'Демо-режим: сервер недоступний, тому замовлення не зафіксовано. Запустіть `node server.js` у папці концепту для реального надсилання.';
      }
      cart = {};
      save();
      renderCount();
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Підтвердити замовлення'; }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ---------------- init ---------------- */
  renderCount();
  renderDrawer();
  renderSummary();
  if (seed && Object.keys(cart).length && !document.getElementById('checkoutForm')) { openCart(); }
})();
