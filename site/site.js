(function () {
  var LANG_KEY = 'aindle-lang';
  var THEME_KEY = 'aindle-theme';
  var I18N = {
    zh: {
      skip: '跳到正文',
      nav: '页面',
      'nav.intro': '介绍',
      'nav.cap': '能力',
      'nav.look': '看屏',
      'nav.start': '开始',
      'nav.cover': '封面',
      'pref.lang': '语言',
      'pref.theme': '外观',
      'theme.light': '浅色',
      'theme.dark': '深色',
      'hero.kicker': '桌边看板',
      'hero.title': '让 AI 忙碌，<br>让你从容。',
      'hero.lede': '把分散在不同机器上的 AI 额度、用量和任务，收在一块安静的屏幕里。抬眼掌握进展，安心回到手边的事。',
      'hero.cta': '开始使用',
      'hero.fine': '开源 · 自托管 · 为电子墨水屏而生',
      'hero.alt': '木桌上，手持小屏电子墨水设备和一台大屏设备，两块屏都显示 Aindle 看板示例',
      'hero.caption': '小屏与大屏 · 场景示意 · 示例数据',
      'cap.kicker': '01 · 一块屏',
      'cap.title': '三件事，写在一块屏上',
      'cap.quota.title': '额度一目了然',
      'cap.quota.body': '各台机器、各份订阅还剩多少，一块屏上看清，不必来回切换工具。',
      'cap.progress.title': '进度心中有数',
      'cap.progress.body': '进行中的、待你确认的、在后台跑的，抬眼就知道现在该不该打断手头的事。',
      'cap.read.title': '读书照常继续',
      'cap.read.body': '锁屏上看看板；解锁之后，书架和翻页还在。看板不代替阅读。',
      'look.kicker': '02 · 锁屏上',
      'look.title': '屏上长这样',
      'look.alt': 'Kindle 锁屏示例：限额条、进行中任务和本机电量',
      'look.caption': 'Oasis 1 锁屏 · 1072×1448 · 示例数据',
      'look.lede': '限额还剩多少，哪些在进行中、待确认或后台跑，刚结束的也写在下面。图里是示例数据，不是某台真机。',
      'look.body': '锁屏上看看板，需要越狱后的 Kindle Oasis 1，再按下面的「开始」把 Hub 开在私网里。解锁之后，还是原来的阅读器。',
      'start.kicker': '03 · 开始',
      'start.title': '克隆之后就能看见示例',
      'start.clone.title': '克隆',
      'start.clone.body': '需要 Git，以及 Node.js 20 或更高（Windows 上读 Cursor / Kiro / ZCode 建议 Node.js 22）。请 clone 仓库：包没有发到 npm。',
      'start.hub.title': '启动 Hub',
      'start.hub.body': '默认带一份示例数据，避免空屏。第一次启动若尚未编译，会先编包装（几秒钟）。打开下面两个地址就能对照 README 里的图。不需要数据库或其它本机服务。',
      'start.agent.title': '看自己的机器',
      'start.agent.body': '真实额度从这里来。只开 Hub 的话，屏幕上会一直是示例数据。在<strong>同一个 clone</strong>里另开终端；<code>npx aindle</code> 用的是仓库本地命令，不是 npm 全球包。<code>init</code> 会写成这台电脑的名字，样例主机 <code>mbp</code> 还在。打开 <code>registry.yaml</code>，只取消注释你已登录的工具；不解开就跑，你的那台是空的，样例不会被盖掉。',
      'start.agent.cmd': 'npx aindle init --local\n# 编辑 ./config/registry.yaml，只取消注释你已登录的工具\nnpx aindle agent --loop 60',
      'start.note1': 'Mac 和 Windows 都用这几条命令（PowerShell 或 cmd 即可），不要只打 <code>aindle</code>。锁屏 PNG 也认本机 Chrome / Edge；找不到时设 <code>AINDLE_CHROME</code>。只看网页看板不必装浏览器。只要真数据时设 <code>AINDLE_SEED_MOCK=0</code>（PowerShell：<code>$env:AINDLE_SEED_MOCK=\'0\'</code>）再重启 Hub。',
      'start.note2': '可选：把 <code>kindle/oasis1/</code> 拷到已越狱的 Oasis 1，先把 <code>hub.env.example</code> 复制成 <code>hub.env</code>，再改里面的局域网地址（端口默认 <code>8787</code>），不要写 <code>127.0.0.1</code>。Hub 那台机要放行入站 TCP <code>8787</code>。锁屏看图，解锁读书。给编程 agent 的短说明在仓库 <code>AGENTS.md</code> 与 <a href="/llms.txt">/llms.txt</a>。',
      'start.more': '源码与说明在 <a href="https://github.com/Octo-o-o-o/aindle" rel="noopener noreferrer" target="_blank">GitHub</a>。',
      'footer.meta': 'Aindle · MIT · 示例数据 · 私网自托管',
      copy: '复制',
      copied: '已复制',
      'copy.fail': '请手动复制',
      'doc.title': 'Aindle · 桌边的 AI 工作看板',
      'doc.desc': '把分散在不同机器上的 AI 额度、用量和任务，收在一块安静的屏幕里。开源、自托管，也可放在越狱后的 Kindle Oasis 1 锁屏。示例数据。',
      'notfound.title': '这一页不在书里。',
      'notfound.lede': '回到封面，或去 GitHub 看源码。官网只放介绍，没有私网 Hub。',
      'notfound.home': '回到封面',
      'notfound.doc.title': '没有这一页 · Aindle'
    },
    en: {
      skip: 'Skip to content',
      nav: 'Page',
      'nav.intro': 'Intro',
      'nav.cap': 'Capabilities',
      'nav.look': 'Look',
      'nav.start': 'Start',
      'nav.cover': 'Cover',
      'pref.lang': 'Language',
      'pref.theme': 'Appearance',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'hero.kicker': 'Desk-side board',
      'hero.title': 'Let AI stay busy.<br>You stay unhurried.',
      'hero.lede': 'Gather quotas, usage, and tasks from every machine onto one quiet screen. Glance up, then return to what is in your hands.',
      'hero.cta': 'Get started',
      'hero.fine': 'Open source · Self-hosted · Made for e-ink',
      'hero.alt': 'A small e-ink device in hand and a larger tablet on a desk, both showing an Aindle board',
      'hero.caption': 'Small screen and large · Scene illustration · Sample data',
      'cap.kicker': '01 · One screen',
      'cap.title': 'Three things, on one screen',
      'cap.quota.title': 'Quotas at a glance',
      'cap.quota.body': 'See what is left on every machine and every subscription, without switching tools.',
      'cap.progress.title': 'Progress you can trust',
      'cap.progress.body': 'In progress, waiting on you, or running in the background — a glance tells you whether to interrupt.',
      'cap.read.title': 'Reading stays itself',
      'cap.read.body': 'See the board on the lock screen. Unlock, and the library and pages are still there. The board does not replace reading.',
      'look.kicker': '02 · Lock screen',
      'look.title': 'It looks like this',
      'look.alt': 'Kindle lock-screen sample: quota bars, in-progress tasks, and battery',
      'look.caption': 'Oasis 1 lock screen · 1072×1448 · Sample data',
      'look.lede': 'How much quota is left, what is in progress, waiting, or in the background, and what just finished. The picture is sample data, not a live machine.',
      'look.body': 'A lock-screen board needs a jailbroken Kindle Oasis 1. Follow Start below to run the hub on your private network. Unlock, and it is a Kindle again.',
      'start.kicker': '03 · Start',
      'start.title': 'Clone it, then you will see the sample',
      'start.clone.title': 'Clone',
      'start.clone.body': 'You need Git and Node.js 20 or newer (22 on Windows if you read Cursor / Kiro / ZCode). Clone the repo — the package is not on npm.',
      'start.hub.title': 'Start the hub',
      'start.hub.body': 'The hub seeds sample data so the screen is not empty. The first run compiles packages if needed (a few seconds). Open the two addresses below to match the README pictures. No database or extra local service.',
      'start.agent.title': 'See your own machines',
      'start.agent.body': 'Live quotas come from here. With only the hub, the screen stays on the sample. In the <strong>same clone</strong>, open another terminal. <code>npx aindle</code> is the local bin, not a global npm package. <code>init</code> stamps this computer’s name; the sample host <code>mbp</code> stays. Edit <code>registry.yaml</code> and uncomment only tools you already use. If you run it with everything commented, your host is empty and the sample is not replaced.',
      'start.agent.cmd': 'npx aindle init --local\n# edit ./config/registry.yaml — uncomment only tools you already use\nnpx aindle agent --loop 60',
      'start.note1': 'The same commands work on Mac and Windows (PowerShell or cmd). Do not type a bare <code>aindle</code>. Lock-screen PNG also accepts Chrome / Edge on the hub host; set <code>AINDLE_CHROME</code> if it is not on the default path. A web board does not need a browser install. For live data only, set <code>AINDLE_SEED_MOCK=0</code> (PowerShell: <code>$env:AINDLE_SEED_MOCK=\'0\'</code>) and restart the hub.',
      'start.note2': 'Optional: copy <code>kindle/oasis1/</code> to a jailbroken Oasis 1, copy <code>hub.env.example</code> to <code>hub.env</code>, then set the LAN address (port <code>8787</code> by default). Never <code>127.0.0.1</code> on the device. Allow inbound TCP <code>8787</code> on the hub host. Lock to look; unlock to read. Short notes for coding agents are in <code>AGENTS.md</code> and <a href="/llms.txt">/llms.txt</a>.',
      'start.more': 'Source and docs: <a href="https://github.com/Octo-o-o-o/aindle" rel="noopener noreferrer" target="_blank">GitHub</a>.',
      'footer.meta': 'Aindle · MIT · Sample data · Self-hosted on your LAN',
      copy: 'Copy',
      copied: 'Copied',
      'copy.fail': 'Copy manually',
      'doc.title': 'Aindle · A desk-side AI work board',
      'doc.desc': 'Gather AI quotas, usage, and tasks from every machine onto one quiet screen. Open source, self-hosted, optional on a jailbroken Kindle Oasis 1 lock screen. Sample data.',
      'notfound.title': 'This page is not in the book.',
      'notfound.lede': 'Back to the cover, or read the source on GitHub. This site is an introduction. The hub stays on your private network.',
      'notfound.home': 'Back to the cover',
      'notfound.doc.title': 'No such page · Aindle'
    }
  };

  function queryLang() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'en' || q === 'zh') return q;
    } catch (err) {}
    return '';
  }

  function stored(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (err) {
      return '';
    }
  }

  function store(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {}
  }

  function systemTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function currentLang() {
    var fromQuery = queryLang();
    if (fromQuery) return fromQuery;
    var saved = stored(LANG_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
    return 'zh';
  }

  function currentTheme() {
    var saved = stored(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return systemTheme();
  }

  function t(lang, key) {
    var pack = I18N[lang] || I18N.zh;
    return Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : key;
  }

  function applyLang(lang) {
    var html = document.documentElement;
    html.lang = lang === 'en' ? 'en' : 'zh-CN';
    html.setAttribute('data-lang', lang);
    var pack = I18N[lang] || I18N.zh;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key && Object.prototype.hasOwnProperty.call(pack, key)) el.textContent = pack[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (key && Object.prototype.hasOwnProperty.call(pack, key)) el.innerHTML = pack[key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria');
      if (key && Object.prototype.hasOwnProperty.call(pack, key)) el.setAttribute('aria-label', pack[key]);
    });
    document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-alt');
      if (key && Object.prototype.hasOwnProperty.call(pack, key)) el.setAttribute('alt', pack[key]);
    });
    var titleKey = document.querySelector('#main.sheet') ? 'notfound.doc.title' : 'doc.title';
    if (pack[titleKey]) document.title = pack[titleKey];
    var desc = document.querySelector('meta[name="description"]');
    if (desc && pack['doc.desc']) desc.setAttribute('content', pack['doc.desc']);
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', lang === 'en' ? 'en_US' : 'zh_CN');
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === lang ? 'true' : 'false');
    });
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      if (!btn.getAttribute('data-copied')) btn.textContent = t(lang, 'copy');
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-theme') === theme ? 'true' : 'false');
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1B1914' : '#F4F1E9');
  }

  function syncQuery(lang) {
    try {
      var url = new URL(window.location.href);
      if (lang === 'en') url.searchParams.set('lang', 'en');
      else url.searchParams.delete('lang');
      var next = url.pathname + url.search + url.hash;
      if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState({}, '', next);
      }
    } catch (err) {}
  }

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

  function bind() {
    applyTheme(currentTheme());
    applyLang(currentLang());
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-set-lang') === 'en' ? 'en' : 'zh';
        store(LANG_KEY, lang);
        syncQuery(lang);
        applyLang(lang);
      });
    });
    document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var theme = btn.getAttribute('data-set-theme') === 'dark' ? 'dark' : 'light';
        store(THEME_KEY, theme);
        applyTheme(theme);
      });
    });
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy');
        var lang = currentLang();
        copy(textOf(sel)).then(function () {
          btn.setAttribute('data-copied', '1');
          btn.textContent = t(lang, 'copied');
          window.setTimeout(function () {
            btn.removeAttribute('data-copied');
            btn.textContent = t(currentLang(), 'copy');
          }, 1600);
        }).catch(function () {
          btn.textContent = t(lang, 'copy.fail');
        });
      });
    });
  }

  document.documentElement.setAttribute('data-theme', currentTheme());
  document.documentElement.setAttribute('data-lang', currentLang());
  document.documentElement.lang = currentLang() === 'en' ? 'en' : 'zh-CN';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
