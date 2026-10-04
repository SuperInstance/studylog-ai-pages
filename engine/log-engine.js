/* LogEngine v0.1.0 — shared decomposition engine for the log-demos fleet.
 *
 * A decision goes in. It is decomposed into a FIELD of weighted factors
 * (label, weight 0..1, score -1..1, note). The verdict is PROJECTED from the
 * field by a stated rule — never asserted. Every projection and every change
 * is appended to an append-only log. Record the field, not the spike.
 *
 * Plain script, no dependencies, no modules: works from file:// and http://.
 * All state transitions are synchronous DOM updates (CSS handles animation),
 * so the engine is fully exercisable in jsdom.
 *
 * Usage:
 *   LogEngine.mount(el, {
 *     domain: 'activelog.ai',
 *     tagline: 'The log records, the ledger settles.',
 *     forSaleUrl: '#',            // Afternic listing URL when live
 *     scenario: {
 *       prompt: 'Describe a decision…',
 *       decision: 'Should we ship v2 on Friday?',
 *       factors: [
 *         { label:'Team readiness', weight:0.8, score:0.6, note:'…' },
 *         ...
 *       ],
 *       seedLog: [ { text:'…' } ] // optional pre-seeded entries
 *     },
 *     bands: [                     // optional custom verdict bands
 *       { min: 0.34, label:'GO' },
 *       { min: -0.34, label:'HOLD' },
 *       { min: -Infinity, label:'NO-GO' }
 *     ],
 *     adapter: LogEngine.adapters.precomputed, // or .live('/api/decompose')
 *     renderExtra: (root, api) => {…}  // optional skin panel; api = instance
 *   });
 *
 * Decomposition adapter interface:
 *   async (decisionText, scenario) => [{label, weight, score, note}]
 * The precomputed adapter returns scenario.factors. The live adapter POSTs
 * to /api/decompose — the Cloudflare Worker proxy plugs in here; the API
 * key lives server-side, never in this file.
 */
(function (global) {
  'use strict';

  var DEFAULT_BANDS = [
    { min: 0.34, label: 'GO', cls: 'go' },
    { min: -0.34, label: 'HOLD', cls: 'hold' },
    { min: -Infinity, label: 'NO-GO', cls: 'nogo' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  function project(factors, bands) {
    var num = 0, den = 0, i, f;
    for (i = 0; i < factors.length; i++) {
      f = factors[i];
      num += f.weight * f.score;
      den += f.weight;
    }
    var score = den > 0 ? num / den : 0;
    var band = bands[bands.length - 1];
    for (i = 0; i < bands.length; i++) {
      if (score >= bands[i].min) { band = bands[i]; break; }
    }
    return { score: score, band: band, rule: 'Σ w·s / Σw = ' + fmt(score) + ' → ' + band.label };
  }

  function now() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var adapters = {
    precomputed: function () {
      return function (decisionText, scenario) {
        return Promise.resolve(scenario.factors.map(function (f) {
          return { label: f.label, weight: f.weight, score: f.score, note: f.note };
        }));
      };
    },
    // Live backend adapter. POST {decision} → {factors:[…]}.
    // Plug the Cloudflare Worker proxy in here; key stays server-side.
    live: function (endpoint) {
      endpoint = endpoint || '/api/decompose';
      return function (decisionText) {
        return fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: decisionText })
        }).then(function (r) {
          if (!r.ok) throw new Error('decompose failed: ' + r.status);
          return r.json();
        }).then(function (data) { return data.factors; });
      };
    }
  };

  function mount(el, opts) {
    opts = opts || {};
    var scenario = opts.scenario || {};
    var bands = opts.bands || DEFAULT_BANDS;
    var adapter = opts.adapter || adapters.precomputed();
    var domain = opts.domain || 'log';
    var forSaleUrl = opts.forSaleUrl || '#';

    var state = {
      factors: [],
      decomposed: false,
      verdict: null,
      log: []
    };

    // ---- chrome -----------------------------------------------------------
    el.classList.add('le-root');
    el.innerHTML =
      '<div class="le-banner" data-testid="forsale-banner">' +
        '<span class="le-banner-dot"></span>' +
        '<span>This domain + working prototype is for sale.</span>' +
        '<a class="le-banner-cta" data-testid="forsale-link" href="' + esc(forSaleUrl) + '">Make an offer →</a>' +
      '</div>' +
      '<header class="le-head">' +
        '<div class="le-wordmark" data-testid="wordmark">' + esc(domain) + '</div>' +
        (opts.tagline ? '<div class="le-tagline">' + esc(opts.tagline) + '</div>' : '') +
      '</header>' +
      '<main class="le-main">' +
        '<section class="le-compose">' +
          '<label class="le-label" for="le-decision">The decision</label>' +
          '<div class="le-compose-row">' +
            '<input id="le-decision" data-testid="decision-input" class="le-input" type="text" ' +
              'value="' + esc(scenario.decision || '') + '" ' +
              'placeholder="' + esc(scenario.prompt || 'Describe a decision…') + '">' +
            '<button class="le-btn" data-testid="decompose-btn">Decompose</button>' +
          '</div>' +
        '</section>' +
        '<section class="le-field" data-testid="field" hidden>' +
          '<div class="le-field-head"><span class="le-label">The field</span>' +
          '<span class="le-hint">drag a weight — the verdict re-projects live</span></div>' +
          '<div class="le-rows" data-testid="factor-rows"></div>' +
        '</section>' +
        '<section class="le-verdict" data-testid="verdict-panel" hidden>' +
          '<div class="le-label">Projected verdict</div>' +
          '<div class="le-verdict-value" data-testid="verdict-value">—</div>' +
          '<div class="le-verdict-rule" data-testid="verdict-rule"></div>' +
        '</section>' +
        '<section class="le-extra" data-testid="extra-panel"></section>' +
        '<section class="le-logwrap">' +
          '<div class="le-label">Log <span class="le-hint">append-only — nothing is edited, only added</span></div>' +
          '<ol class="le-log" data-testid="log"></ol>' +
        '</section>' +
        '<div class="le-adslot" data-testid="ad-slot" data-ad-slot="demo-top">' +
          '<!-- AdSense: paste responsive display ad unit here (one per page, no popups) -->' +
        '</div>' +
      '</main>' +
      '<!-- Cloudflare Web Analytics: paste beacon snippet here\n' +
      '     <script defer src="https://static.cloudflareinsights.com/beacon.min.js"\n' +
      '             data-cf-beacon=\'{"token":"TOKEN"}\'></script> -->';

    var fieldEl = el.querySelector('[data-testid="field"]');
    var rowsEl = el.querySelector('[data-testid="factor-rows"]');
    var verdictPanel = el.querySelector('[data-testid="verdict-panel"]');
    var verdictValue = el.querySelector('[data-testid="verdict-value"]');
    var verdictRule = el.querySelector('[data-testid="verdict-rule"]');
    var logEl = el.querySelector('[data-testid="log"]');
    var input = el.querySelector('[data-testid="decision-input"]');
    var btn = el.querySelector('[data-testid="decompose-btn"]');

    function addLog(kind, text) {
      var entry = { t: now(), kind: kind, text: text };
      state.log.push(entry);
      var li = document.createElement('li');
      li.className = 'le-logitem le-log-' + kind;
      li.innerHTML = '<span class="le-logtime">' + esc(entry.t) + '</span> ' + esc(entry.text);
      logEl.appendChild(li);
      return entry;
    }

    function renderRows() {
      rowsEl.innerHTML = '';
      state.factors.forEach(function (f, i) {
        var row = document.createElement('div');
        row.className = 'le-row';
        row.setAttribute('data-testid', 'factor-row');
        row.innerHTML =
          '<div class="le-row-top"><span class="le-factor-label">' + esc(f.label) + '</span>' +
          '<span class="le-factor-nums"><span data-testid="weight-val">' + Math.round(f.weight * 100) + '</span>% · ' +
          '<span data-testid="score-val">' + fmt(f.score) + '</span></span></div>' +
          (f.note ? '<div class="le-factor-note">' + esc(f.note) + '</div>' : '') +
          '<div class="le-sliders">' +
            '<label>weight <input type="range" min="0" max="100" value="' + Math.round(f.weight * 100) + '" data-testid="weight-slider" data-i="' + i + '"></label>' +
            '<label>lean <input type="range" min="-100" max="100" value="' + Math.round(f.score * 100) + '" data-testid="score-slider" data-i="' + i + '"></label>' +
          '</div>';
        rowsEl.appendChild(row);
      });
    }

    function renderVerdict(logChange) {
      var p = project(state.factors, bands);
      var prev = state.verdict;
      state.verdict = p;
      verdictValue.textContent = p.band.label;
      verdictValue.className = 'le-verdict-value le-' + (p.band.cls || 'hold');
      verdictRule.textContent = p.rule;
      if (logChange && prev && prev.band.label !== p.band.label) {
        addLog('verdict', 'Verdict re-projected: ' + prev.band.label + ' → ' + p.band.label + ' (' + p.rule + ')');
      }
      return p;
    }

    rowsEl.addEventListener('input', function (ev) {
      var t = ev.target;
      var i = parseInt(t.getAttribute('data-i'), 10);
      if (isNaN(i) || !state.factors[i]) return;
      if (t.getAttribute('data-testid') === 'weight-slider') {
        state.factors[i].weight = t.value / 100;
        var wv = t.closest('.le-row').querySelector('[data-testid="weight-val"]');
        if (wv) wv.textContent = t.value;
      } else if (t.getAttribute('data-testid') === 'score-slider') {
        state.factors[i].score = t.value / 100;
        var sv = t.closest('.le-row').querySelector('[data-testid="score-val"]');
        if (sv) sv.textContent = fmt(t.value / 100);
      }
      renderVerdict(true);
    });

    function decompose() {
      var text = input.value.trim() || scenario.decision || 'Untitled decision';
      btn.disabled = true;
      btn.textContent = 'Decomposing…';
      return adapter(text, scenario).then(function (factors) {
        state.factors = factors;
        state.decomposed = true;
        fieldEl.hidden = false;
        verdictPanel.hidden = false;
        renderRows();
        var p = renderVerdict(false);
        addLog('decompose', 'Decomposed “' + text + '” into ' + factors.length + ' factors → ' + p.band.label);
        btn.disabled = false;
        btn.textContent = 'Re-decompose';
        // post-decompose hook: extra panels refresh here (no MutationObserver needed)
        if (typeof opts.onDecompose === 'function') {
          try { opts.onDecompose(api); } catch (e) { addLog('error', 'onDecompose: ' + e.message); }
        }
        if (typeof CustomEvent === 'function') {
          el.dispatchEvent(new CustomEvent('le:decomposed', {
            detail: { factors: state.factors.slice(), verdict: p }, bubbles: true
          }));
        }
        return p;
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Decompose';
        addLog('error', 'Decomposition failed: ' + err.message);
        throw err;
      });
    }

    btn.addEventListener('click', decompose);

    // seed log
    (scenario.seedLog || []).forEach(function (s) { addLog(s.kind || 'note', s.text); });
    addLog('note', 'Engine ready. The field is primary; verdicts are projections.');

    var extraRoot = el.querySelector('[data-testid="extra-panel"]');
    var api = {
      get factors() { return state.factors; },
      get verdict() { return state.verdict; },
      get log() { return state.log.slice(); },
      addLog: addLog,
      renderVerdict: renderVerdict,
      project: function (f) { return project(f || state.factors, bands); },
      root: extraRoot,
      el: el
    };
    if (typeof opts.renderExtra === 'function') opts.renderExtra(extraRoot, api);

    return api;
  }

  global.LogEngine = { mount: mount, adapters: adapters, version: '0.1.0' };
})(typeof window !== 'undefined' ? window : this);
