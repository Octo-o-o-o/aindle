(function () {
  function textOf(sel) {
    var el = document.querySelector(sel);
    return el ? String(el.textContent || '').replace(/^\n+|\n+$/g, '') : '';
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var sel = btn.getAttribute('data-copy');
      copy(textOf(sel)).then(function () {
        btn.setAttribute('data-copied', '1');
        btn.textContent = '已复制';
        window.setTimeout(function () {
          btn.removeAttribute('data-copied');
          btn.textContent = '复制';
        }, 1600);
      }).catch(function () {
        btn.textContent = '请手动复制';
      });
    });
  });

  var photo = document.getElementById('hero-device-photo');
  var caption = document.getElementById('hero-device-caption');
  var switches = document.querySelectorAll('.hero-device-switch [data-device]');
  function selectDevice(btn) {
    if (!photo || !btn) return;
    var src = btn.getAttribute('data-src');
    var alt = btn.getAttribute('data-alt');
    var cap = btn.getAttribute('data-caption');
    if (src) photo.setAttribute('src', src);
    if (alt) photo.setAttribute('alt', alt);
    var width = btn.getAttribute('data-width');
    var height = btn.getAttribute('data-height');
    if (width) photo.setAttribute('width', width);
    if (height) photo.setAttribute('height', height);
    if (caption && cap) caption.textContent = cap;
    switches.forEach(function (item) {
      item.setAttribute('aria-pressed', item === btn ? 'true' : 'false');
    });
  }
  switches.forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectDevice(btn);
    });
  });
})();
