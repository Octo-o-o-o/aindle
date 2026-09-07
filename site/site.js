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
})();
