window.SCENARIO = {
  prompt: 'Name the study decision on the table…',
  decision: 'Should I switch to spaced repetition for finals?',
  factors: [
    { label: 'Retention evidence',  weight: 0.85, score: 0.7,  note: 'The research is lopsided. It wins.' },
    { label: 'Time cost',           weight: 0.75, score: -0.4, note: 'Setup eats an evening before it pays.' },
    { label: 'Exam date pressure',  weight: 0.90, score: -0.2, note: 'Eleven days. A new system needs runway.' },
    { label: 'Burnout risk',        weight: 0.65, score: -0.5, note: 'Four subjects. The wall is real.' }
  ],
  seedLog: [
    { kind: 'note', text: 'Decision opened: spaced repetition vs the old way. Put the evidence on the table.' }
  ]
};

window.SKIN_CONFIG = {
  domain: 'studylog.ai',
  tagline: 'Learn like a scientist.',
  forSaleUrl: '#',
  scenario: window.SCENARIO,
  renderExtra: function (root, api) {
    var methods = [
      { name: 'Re-reading',        pct: 22, tag: 'feels productive. isn\u2019t.' },
      { name: 'Highlighting',      pct: 30, tag: 'the comfort food of studying.' },
      { name: 'Cramming',          pct: 35, tag: 'works once, billed twice.' },
      { name: 'Flashcards',        pct: 61, tag: 'retrieval. the engine of memory.' },
      { name: 'Spaced repetition', pct: 83, tag: 'the compound interest of learning.' }
    ];
    root.innerHTML =
      '<div class="sk-study-ledger">' +
        '<div class="le-label">Retention ledger <span class="le-hint">seven-day recall, per method</span></div>' +
        '<div class="sk-study-bars" data-testid="retention-bars">' +
        methods.map(function (m) {
          return '<div class="sk-study-bar" title="' + m.tag + '">' +
            '<span class="sk-study-name">' + m.name + '</span>' +
            '<span class="sk-study-track"><span class="sk-study-fill" style="width:' + m.pct + '%"></span></span>' +
            '<span class="sk-study-pct" data-testid="retention-pct">' + m.pct + '%</span>' +
            '</div>';
        }).join('') +
        '</div>' +
        '<p class="sk-study-foot">The deck is stacked. Whether your calendar cooperates is the question above.</p>' +
      '</div>';
  }
};
