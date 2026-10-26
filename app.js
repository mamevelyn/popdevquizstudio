(() => {
  'use strict';
  const BANK_KEY = 'popdev_studio_bank_v1';
  const HISTORY_KEY = 'popdev_studio_history_v1';
  const THEME_KEY = 'popdev_studio_theme_v1';
  const COACH_MIGRATION_KEY = 'popdev_studio_coach_sets_20261026_v1';
  const THEMES = {
    ocean: { ink: '#17364b', accent: '#328c95', gold: '#f6c466' },
    forest: { ink: '#1f4338', accent: '#478c70', gold: '#f0cf7d' },
    sunset: { ink: '#713e4e', accent: '#d67d60', gold: '#f9d19e' },
    lavender: { ink: '#45385c', accent: '#8471be', gold: '#c5dbde' }
  };
  const el = id => document.getElementById(id);
  const seed = Array.isArray(window.SEED_QUESTIONS) ? window.SEED_QUESTIONS : [];
  const readStorage = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; } catch { return fallback; } };
  const saveStorage = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { toast('Storage is full. Download a backup to keep your changes.'); return false; } };
  const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const html = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tidy = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const formatDate = s => new Date(s).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const validQ = q => q && typeof q.question === 'string' && q.question.trim() && typeof q.answer === 'string' && q.answer.trim();
  const sanitiseQ = q => ({ id: String(q.id || newId()), question: String(q.question).trim(), answer: String(q.answer).trim(), type: q.type === 'mcq' && Array.isArray(q.options) && q.options.length === 4 ? 'mcq' : 'fill', options: Array.isArray(q.options) ? q.options.slice(0,4).map(v=>String(v)) : [], set: String(q.set || 'Imported').trim().slice(0, 90), source: String(q.source || '').trim().slice(0, 120) });
  const storedBank = readStorage(BANK_KEY, null);
  let bank = (Array.isArray(storedBank) ? storedBank : seed).filter(validQ).map(sanitiseQ);
  // Existing visitors already have a browser-local bank. Add the new official
  // Sets 7–9 exactly once, while retaining their edits, custom questions,
  // original Sets 1–6, scores, and attempts without replacing storage.
  if (Array.isArray(storedBank) && !readStorage(COACH_MIGRATION_KEY, false)) {
    const knownIds = new Set(bank.map(q => q.id));
    const knownQA = new Set(bank.map(q => normalize(q.question) + '|' + normalize(q.answer)));
    for (const item of seed) {
      if (!String(item.id || '').startsWith('coach-') || !validQ(item)) continue;
      const key = normalize(item.question) + '|' + normalize(item.answer);
      if (knownIds.has(item.id) || knownQA.has(key)) continue;
      bank.push(sanitiseQ(item));
      knownIds.add(item.id); knownQA.add(key);
    }
    try {
      localStorage.setItem(BANK_KEY, JSON.stringify(bank));
      localStorage.setItem(COACH_MIGRATION_KEY, 'true');
    } catch { /* The new sets remain available in memory this session. */ }
  }
  let history = readStorage(HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];
  let theme = Object.assign({ name: 'ocean', customAccent: '', title: 'POPDEV Knowledge Challenge' }, readStorage(THEME_KEY, {}));
  let route = 'bank', bankPage = 0, editingId = null, active = null, toastTimer = null;
  const PAGE_SIZE = 15;

  function toast(message) {
    const n = el('toast'); n.textContent = message; n.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => n.classList.remove('show'), 3600);
  }
  function getSets() {
    return [...new Set(bank.map(q => q.set || 'Imported'))].sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  function fillSelect(select, selected, anyLabel) {
    select.replaceChildren();
    select.add(new Option(anyLabel, 'all'));
    for (const set of getSets()) select.add(new Option(set, set));
    select.value = [...select.options].some(o => o.value === selected) ? selected : 'all';
  }
  function refreshStats() {
    el('stat-total').textContent = bank.length.toLocaleString();
    el('stat-sets').textContent = getSets().length.toString();
    el('stat-attempts').textContent = history.length.toString();
    const percentages = history.map(h => Number(h.percentage)).filter(Number.isFinite);
    el('stat-latest').textContent = history.length && Number.isFinite(Number(history[0].percentage)) ? Number(history[0].percentage)+'%' : '—';
    el('stat-best').textContent = percentages.length ? Math.max(...percentages)+'%' : '—';
    el('stat-average').textContent = percentages.length ? Math.round(percentages.reduce((a,b)=>a+b,0)/percentages.length)+'%' : '—';
    renderDashboardAttempts();
  }
  function renderDashboardAttempts() {
    const list = el('dashboard-attempt-list');
    list.innerHTML = history.length ? history.slice(0,3).map((h,i) => `
      <div class="dashboard-attempt-row">
        <span class="dashboard-attempt-index">Attempt #${Number(h.attemptNo) || history.length-i}</span>
        <div class="dashboard-attempt-detail"><strong>${html(h.set || 'Quiz')}</strong><small>${html(formatDate(h.date))}</small></div>
        <span class="dashboard-attempt-count">${Number(h.correct)||0} / ${Number(h.total)||0} correct</span>
        <span class="dashboard-attempt-percent">${Number(h.percentage)||0}%</span>
      </div>`).join('') : '<div class="empty-state">No completed attempts yet. Take a quiz to record your first score here.</div>';
  }
  function persistBank() { saveStorage(BANK_KEY, bank); refreshStats(); refreshSelects(); renderBank(); }
  function refreshSelects() {
    fillSelect(el('bank-set-filter'), el('bank-set-filter').value, 'All question sets');
    fillSelect(el('practice-set'), el('practice-set').value, 'All question sets');
    showAvailability();
  }
  function go(target) {
    if (!el('view-' + target)) return;
    if (active && route === 'practice' && target !== 'practice') {
      if (!confirm('Exit the current quiz? Unsaved answers will be lost.')) return;
      clearInterval(active.interval); active = null; showSetup();
    }
    route = target;
    document.querySelectorAll('.view').forEach(n => n.classList.toggle('active', n.id === 'view-' + target));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.toggle('active', n.dataset.route === target));
    el('current-route').textContent = ({ bank: 'Question Bank', practice: 'Take a Quiz', design: 'Design Studio', reports: 'Results & Scores' })[target];
    if (target === 'reports') renderReports();
    if (target === 'practice') {
      if (!active && !el('quiz-finished').classList.contains('hidden')) showSetup();
      else showAvailability();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function filteredQuestions() {
    const filter = el('bank-set-filter').value;
    const keyword = normalize(el('bank-search').value);
    return bank.filter(q => (filter === 'all' || q.set === filter) && (!keyword || normalize(q.question + ' ' + q.answer + ' ' + q.source).includes(keyword)));
  }
  function renderBank() {
    const matches = filteredQuestions(), pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    bankPage = Math.min(bankPage, pages - 1);
    const displayed = matches.slice(bankPage * PAGE_SIZE, (bankPage + 1) * PAGE_SIZE);
    el('bank-count').textContent = matches.length.toLocaleString() + ' items';
    el('question-list').innerHTML = displayed.length ? displayed.map((q, i) => `
      <div class="q-row">
        <div class="q-number">${bankPage * PAGE_SIZE + i + 1}</div>
        <div><div class="q-text">${html(q.question)}</div><div class="q-answer">ANSWER: ${html(q.answer)}</div></div>
        <div class="q-set" title="${html(q.set)}">${html(q.set)}</div>
        <div class="q-actions"><button class="icon-btn" aria-label="Edit question" title="Edit" data-edit="${html(q.id)}">✎</button><button class="icon-btn danger" aria-label="Delete question" title="Delete" data-delete="${html(q.id)}">×</button></div>
      </div>`).join('') : '<div class="empty-state">No matching questions yet. Try a different search or import a file.</div>';
    el('page-label').textContent = matches.length ? `Showing ${bankPage * PAGE_SIZE + 1}–${Math.min((bankPage+1)*PAGE_SIZE, matches.length)} of ${matches.length}` : '0 questions';
    el('page-prev').disabled = bankPage === 0;
    el('page-next').disabled = bankPage >= pages - 1;
  }
  function editQuestion(id = null) {
    editingId = id;
    const q = bank.find(x => x.id === id);
    el('question-dialog-title').textContent = q ? 'Edit question' : 'Add a question';
    el('edit-type').value = q && q.type === 'mcq' ? 'mcq' : 'fill';
    el('edit-question').value = q ? q.question : '';
    el('edit-answer').value = q && q.type !== 'mcq' ? q.answer : '';
    for (let i=0;i<4;i++) el('edit-option-'+String.fromCharCode(97+i)).value = q && Array.isArray(q.options) ? (q.options[i]||'') : '';
    el('edit-mcq-correct').value = q && q.type === 'mcq' ? String(Math.max(0,(q.options||[]).indexOf(q.answer))) : '0';
    el('edit-set').value = q ? q.set : (getSets()[0] || 'My Questions');
    updateQuestionType();
    el('question-dialog').showModal();
  }
  function updateQuestionType() {
    const mcq = el('edit-type').value === 'mcq';
    el('edit-mcq-options').classList.toggle('hidden',!mcq);
    el('edit-fill-answer').classList.toggle('hidden',mcq);
    el('edit-answer').required = !mcq;
    for (const letter of ['a','b','c','d']) el('edit-option-'+letter).required = mcq;
  }
  function handleEditSubmit(event) {
    event.preventDefault();
    const question = el('edit-question').value.trim();
    const type = el('edit-type').value === 'mcq' ? 'mcq' : 'fill';
    const options = type === 'mcq' ? ['a','b','c','d'].map(c=>el('edit-option-'+c).value.trim()) : [];
    const answer = type === 'mcq' ? options[Number(el('edit-mcq-correct').value)] : el('edit-answer').value.trim();
    const set = el('edit-set').value.trim() || 'My Questions';
    if (!question || !answer) return;
    if (type === 'mcq' && (options.some(v=>!v) || new Set(options.map(normalize)).size !== 4)) return toast('Please enter four different answer choices.');
    if (editingId) {
      const i = bank.findIndex(q => q.id === editingId);
      if (i >= 0) bank[i] = Object.assign({}, bank[i], { question, answer, type, options, set });
    } else bank.unshift({ id: newId(), question, answer, type, options, set, source: 'Manually added' });
    el('question-dialog').close(); persistBank(); toast('Question saved successfully.');
  }
  function showAvailability() {
    const set = el('practice-set').value;
    const count = bank.filter(q => set === 'all' || q.set === set).length;
    el('setup-availability').textContent = count + ' questions available from this selection.';
    el('practice-count').max = Math.max(1, count);
    el('start-quiz').disabled = count === 0;
  }
  function showSetup() {
    el('quiz-setup').classList.remove('hidden');
    el('quiz-active').classList.add('hidden');
    el('quiz-finished').classList.add('hidden');
    showAvailability();
  }
  function startQuiz() {
    const set = el('practice-set').value;
    let candidates = bank.filter(q => set === 'all' || q.set === set);
    if (!candidates.length) return toast('Please import or add a question first.');
    const requested = Math.floor(Number(el('practice-count').value)) || 20;
    const count = Math.min(Math.max(1, requested), candidates.length);
    if (el('practice-shuffle').checked) {
      candidates = [...candidates];
      for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i],candidates[j]] = [candidates[j],candidates[i]]; }
    }
    const duration = Number(el('practice-timer').value) * 60;
    active = { questions: candidates.slice(0,count), answers: Array(count).fill(''), checked: Array(count).fill(false), correct: Array(count).fill(false), index: 0, set: set === 'all' ? 'All Sets' : set, duration, deadline: duration ? Date.now()+duration*1000 : null, interval: null };
    el('quiz-setup').classList.add('hidden');
    el('quiz-finished').classList.add('hidden');
    el('quiz-active').classList.remove('hidden');
    if (duration) active.interval = setInterval(updateTimer, 350);
    renderQuestion(); updateTimer();
  }
  function renderQuestion() {
    if (!active) return;
    const q = active.questions[active.index];
    const reviewed = active.checked[active.index];
    el('quiz-position').textContent = `Question ${active.index + 1} of ${active.questions.length}`;
    el('quiz-subtitle').textContent = q.type === 'mcq' ? 'Multiple choice' : 'Fill in the blank';
    el('quiz-progress').style.width = Math.round(((active.index+1)/active.questions.length)*100) + '%';
    const mcq = q.type === 'mcq';
    el('stage-source').textContent = (q.set || 'REVIEWER') + (mcq ? ' · MULTIPLE CHOICE' : ' · FILL IN THE BLANK');
    el('stage-question').textContent = q.question;
    el('quiz-fill-answer').classList.toggle('hidden', mcq);
    el('quiz-mcq-answer').classList.toggle('hidden', !mcq);
    if (mcq) {
      el('quiz-choices').innerHTML = q.options.map((option,i)=>{
        const selected = active.answers[active.index] === option;
        const answerClass = reviewed && option === q.answer ? 'is-correct' : reviewed && selected ? 'is-incorrect' : '';
        return `<label class="choice-item ${answerClass}"><input type="radio" name="quiz-choice" value="${html(option)}" ${selected?'checked':''} ${reviewed?'disabled':''}><span class="choice-letter">${'ABCD'[i]}.</span><span class="choice-copy">${html(option)}</span></label>`;
      }).join('');
    } else {
      el('quiz-answer').value = active.answers[active.index];
      el('quiz-answer').disabled = reviewed;
    }
    el('quiz-back').disabled = active.index === 0;
    el('quiz-next').textContent = !reviewed ? 'Check Answer ✓' : active.index === active.questions.length - 1 ? 'Finish Quiz ✓' : 'Next Question →';
    if (reviewed) renderImmediateFeedback();
    else { el('quiz-feedback').className='instant-feedback hidden'; el('quiz-feedback').textContent=''; }
    updateLiveScore();
    if (!mcq && !reviewed)el('quiz-answer').focus();
  }
  function updateLiveScore() {
    if (!active) return;
    const reviewed = active.checked.filter(Boolean).length;
    const correct = active.correct.filter(Boolean).length;
    el('quiz-live-score').textContent = correct+' correct · '+reviewed+' reviewed';
  }
  function renderImmediateFeedback() {
    if (!active || !active.checked[active.index]) return;
    const i = active.index, q = active.questions[i], correct = active.correct[i];
    const box = el('quiz-feedback');
    box.className = 'instant-feedback '+(correct?'correct':'incorrect');
    box.innerHTML = `<div class="feedback-status">${correct?'✓ Correct answer!':'✕ Not quite — let us review.'}</div>
      <div class="feedback-detail">Your answer: <strong>${html(active.answers[i]||'—')}</strong></div>
      <div class="feedback-detail">Correct answer: <strong>${html(q.answer)}</strong></div>
      <div class="feedback-hint">Press Enter again or click ${i === active.questions.length-1?'Finish Quiz':'Next Question'} when you are ready.</div>`;
  }
  function checkCurrentAnswer() {
    if (!active || active.checked[active.index]) return false;
    const answer = currentAnswer();
    if (!answer) { toast(active.questions[active.index].type==='mcq'?'Choose one answer first.':'Type your answer before checking.'); return false; }
    const i = active.index;
    active.answers[i] = answer;
    active.checked[i] = true;
    active.correct[i] = acceptedAnswer(active.questions[i], answer);
    renderQuestion();
    el('quiz-next').focus();
    return true;
  }
  function currentAnswer() {
    if (!active) return '';
    return active.questions[active.index].type === 'mcq' ? (document.querySelector('input[name="quiz-choice"]:checked')?.value || '') : el('quiz-answer').value.trim();
  }
  function updateTimer() {
    if (!active) return;
    const clock = el('quiz-clock');
    if (!active.deadline) { clock.textContent = '⏱ Untimed'; clock.classList.remove('warning'); return; }
    const left = Math.max(0, Math.ceil((active.deadline - Date.now())/1000));
    const m = Math.floor(left/60), s = left%60;
    clock.textContent = '⏱ ' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    clock.classList.toggle('warning', left < 61);
    if (left <= 0) finishQuiz('Time is up!');
  }
  function acceptedAnswer(q, attempt) {
    const given = normalize(attempt);
    return !!given && String(q.answer).split('|').some(answer => given === normalize(answer));
  }
  function finishQuiz(reason = '') {
    if (!active) return;
    clearInterval(active.interval);
    const results = active.questions.map((q,i) => ({ q, answer: active.checked[i] ? active.answers[i] : '', correct: active.checked[i] && active.correct[i] }));
    const correct = results.filter(x => x.correct).length;
    const record = { id: newId(), attemptNo: history.length+1, date: new Date().toISOString(), set: active.set, total: results.length, reviewed: active.checked.filter(Boolean).length, correct, percentage: Math.round(correct*100/results.length) };
    history.unshift(record); saveStorage(HISTORY_KEY, history); refreshStats();
    el('quiz-active').classList.add('hidden'); el('quiz-finished').classList.remove('hidden');
    el('quiz-finished').innerHTML = `
      <div class="results-hero"><div class="section-kicker" style="color:#a9e1dc">QUIZ COMPLETE</div><h2>${reason ? html(reason) : 'Well done for showing up!'}</h2><div class="results-score">${record.percentage}%</div>
        <p>Attempt #${record.attemptNo} · You answered <strong>${correct} out of ${results.length}</strong> questions correctly.</p>
        <div class="results-actions"><button class="btn btn-light" id="try-again">Try Another Quiz</button><button class="btn btn-hero-outline" id="see-history">View Results</button></div></div>
      <div class="section-heading" style="margin:27px 0 15px"><div><span class="section-kicker">ANSWER REVIEW</span><h2>Check your work</h2></div></div>
      <div class="review-list">${results.map((entry,i) => `<div class="review-item"><div class="review-head"><span>${String(i+1).padStart(2,'0')}</span><span class="review-pill ${entry.correct?'':'incorrect'}">${entry.correct?'✓ Correct':'✕ Review'}</span></div>
      <p>${html(entry.q.question)}</p><div class="review-answer">Your answer: ${html(entry.answer || '—')}<br>Correct answer: <strong>${html(entry.q.answer)}</strong></div></div>`).join('')}</div>`;
    el('try-again').addEventListener('click', () => { active = null; showSetup(); });
    el('see-history').addEventListener('click', () => { active = null; go('reports'); });
    active = null; el('quiz-finished').scrollIntoView({ behavior: 'smooth' });
  }
  function renderReports() {
    const avg = history.length ? Math.round(history.reduce((n,h)=>n+(Number(h.percentage)||0),0)/history.length) : null;
    const best = history.length ? Math.max(...history.map(h=>Number(h.percentage)||0)) : null;
    el('report-count').textContent = history.length;
    el('report-average').textContent = avg == null ? '—' : avg+'%';
    el('report-best').textContent = best == null ? '—' : best+'%';
    el('report-list').innerHTML = history.length ? history.slice(0,30).map((h,i) => `<div class="report-row"><div><strong>Attempt #${Number(h.attemptNo)||history.length-i} · ${html(h.set)}</strong><small>${html(formatDate(h.date))}</small></div><div>${Number(h.correct)} / ${Number(h.total)} correct</div><div>${Number(h.total)} questions</div><div class="report-percent">${Number(h.percentage)}%</div></div>`).join('') : '<div class="empty-state">No quiz attempts yet. Take your first quiz to see the results here.</div>';
  }
  function applyTheme() {
    const palette = THEMES[theme.name] || THEMES.ocean;
    document.documentElement.style.setProperty('--ink', palette.ink);
    document.documentElement.style.setProperty('--accent', theme.customAccent || palette.accent);
    document.documentElement.style.setProperty('--gold', palette.gold);
    document.querySelector('meta[name="theme-color"]').content = palette.ink;
    document.querySelectorAll('.theme-choice').forEach(n => n.classList.toggle('selected', n.dataset.theme === theme.name));
    el('design-title').value = theme.title;
    el('design-accent').value = theme.customAccent || palette.accent;
    el('preview-heading').textContent = theme.title || 'Knowledge Challenge';
    document.title = theme.title ? theme.title + ' · POPDEV Quiz Studio' : 'POPDEV Quiz Studio';
  }
  function saveTheme() {
    theme.title = el('design-title').value.trim() || 'Knowledge Challenge';
    saveStorage(THEME_KEY, theme); applyTheme(); toast('Your quiz design has been saved.');
  }
  function download(text, name, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  const csvCell = v => '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"';
  function csvExport(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'); }
  function backup() {
    download(JSON.stringify({ application: 'POPDEV Quiz Studio', version: 1, exportedAt: new Date().toISOString(), questions: bank, history, theme }, null, 2), 'POPDEV_Quiz_Studio_Backup.json', 'application/json');
    toast('Full backup downloaded.');
  }
  function exportResults() {
    if (!history.length) return toast('No results to export yet.');
    download(csvExport([['Attempt','Date','Set','Correct','Total','Reviewed','Percentage'],...history.map((h,i)=>[h.attemptNo||history.length-i,h.date,h.set,h.correct,h.total,h.reviewed??h.total,h.percentage])]), 'POPDEV_Quiz_Results.csv', 'text/csv;charset=utf-8');
  }
  function parseCSV(text, delimiter) {
    const rows = []; let row = [], cell = '', quoted = false;
    const content = text.replace(/^\uFEFF/,'');
    for (let i=0;i<content.length;i++) {
      const c = content[i];
      if (quoted) {
        if (c === '"' && content[i+1] === '"') { cell+='"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === delimiter) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/,'')); if(row.some(v=>v.trim()))rows.push(row); row=[]; cell=''; }
      else cell += c;
    }
    row.push(cell.replace(/\r$/,''));
    if(row.some(v=>v.trim())) rows.push(row);
    return rows;
  }
  function fromFlatRows(records, filename) {
    if (!records.length) return [];
    let headerIndex = -1, qCol = -1, aCol = -1, setCol = -1, srcCol = -1;
    const canonical = v => normalize(v).replace(/\s+/g,'');
    for (let i=0;i<Math.min(15,records.length);i++) {
      const row = records[i].map(canonical);
      const qi = row.findIndex(x => /^(question|fillintheblankquestion|tanong|item|quizquestion)$/.test(x));
      const ai = row.findIndex(x => /^(acceptedanswer|correctanswer|answer|sagot|answers)$/.test(x));
      if (qi >= 0 && ai >= 0) {
        headerIndex=i; qCol=qi; aCol=ai;
        setCol=row.findIndex(x => /^(set|questionset|reviewer|topic)$/.test(x));
        srcCol=row.findIndex(x => /^(sourcereviewer|source)$/.test(x));
        break;
      }
    }
    if (headerIndex < 0) {
      if (records[0].length < 2) throw new Error('No Question / Answer columns found. Add headers named Question and Answer.');
      headerIndex=-1;qCol=0;aCol=1;
    }
    const label = filename.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ').slice(0,80);
    return records.slice(headerIndex+1).filter(r => tidy(r[qCol]) && tidy(r[aCol])).map(r => ({ id:newId(), question:tidy(r[qCol]), answer:tidy(r[aCol]), set:tidy(setCol>=0?r[setCol]:'') || label, source:tidy(srcCol>=0?r[srcCol]:'') || filename }));
  }
  function xmlChildren(node, local) { return [...node.getElementsByTagNameNS('*',local)]; }
  function colIndex(ref) {
    const letters=(ref.match(/^[A-Z]+/i)||[])[0]||'';
    return [...letters.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
  }
  async function fromXlsx(bytes, filename) {
    const zip = await JSZip.loadAsync(bytes);
    const sharedXml = zip.file('xl/sharedStrings.xml') ? new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'),'text/xml') : null;
    const shared = sharedXml ? xmlChildren(sharedXml,'si').map(si=>xmlChildren(si,'t').map(t=>t.textContent).join('')) : [];
    const sheets = Object.keys(zip.files).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort((a,b)=>Number(a.match(/sheet(\d+)/)[1])-Number(b.match(/sheet(\d+)/)[1]));
    if (!sheets.length) throw new Error('No Excel worksheets found.');
    const parsed = [];
    for (const name of sheets) {
      const doc = new DOMParser().parseFromString(await zip.file(name).async('string'),'text/xml');
      const rows = [];
      for (const cell of xmlChildren(doc,'c')) {
        const ref = cell.getAttribute('r') || '';
        const rowNumber = Number((ref.match(/\d+/)||[])[0]);
        const column = colIndex(ref);
        if (!rowNumber || column < 0) continue;
        const v=xmlChildren(cell,'v')[0],t=cell.getAttribute('t');
        let value=t==='inlineStr'?xmlChildren(cell,'t').map(n=>n.textContent).join(''):(v?v.textContent:'');
        if (t==='s')value=shared[Number(value)]||'';
        if (!rows[rowNumber])rows[rowNumber]=[];
        rows[rowNumber][column]=value;
      }
      parsed.push(rows);
    }
    const newQuestions = [];
    const label = filename.replace(/\.[^.]+$/,'').replace(/[_-]/g,' ').slice(0,80);
    for (const rows of parsed) {
      const isTemplate = rows.some((row,i)=>i>0 && String((row||[])[1]||'').trim()==='90004' && tidy((row||[])[2]));
      if (isTemplate) {
        for (let i=1;i<rows.length;i++) {
          const row=rows[i]||[];
          if(String(row[1]||'').trim()!=='90004')continue;
          const question=tidy(row[2]),answer=tidy((rows[i+1]||[])[2]);
          if(question && answer)newQuestions.push({ id:newId(),question,answer,set:label,source:filename });
        }
      } else {
        const flat = rows.filter(Boolean);
        if(flat.length) {
          try { newQuestions.push(...fromFlatRows(flat,filename)); }
          catch { /* Other non-question sheets are ignored. */ }
        }
      }
    }
    return newQuestions;
  }
  async function importFile(file) {
    if(!file)return;
    const feedback=el('import-feedback'); feedback.classList.remove('error'); feedback.textContent='Reading '+file.name+'...';
    try {
      const name=file.name.toLowerCase();
      let incoming=[], fullBackup=null;
      if (name.endsWith('.json')) {
        const data=JSON.parse(await file.text());
        if(Array.isArray(data))incoming=data;
        else if (Array.isArray(data.questions)) { incoming=data.questions; fullBackup=data; }
        else throw new Error('JSON file must contain a questions array.');
      } else if(name.endsWith('.csv') || name.endsWith('.tsv')) {
        const text=await file.text();
        incoming=fromFlatRows(parseCSV(text,name.endsWith('.tsv')?'\t':','),file.name);
      } else if(name.endsWith('.xlsx')||name.endsWith('.xls')) {
        const bytes=await file.arrayBuffer();
        const lead=new Uint8Array(bytes.slice(0,4));
        if(lead[0]===0xD0 && lead[1]===0xCF)throw new Error('This is an older binary .xls file. Open it in Excel and choose Save As → Excel Workbook (.xlsx), then import the .xlsx file.');
        incoming=await fromXlsx(bytes,file.name);
      } else throw new Error('Please choose an Excel, CSV, TSV or JSON file.');
      const cleaned=incoming.filter(validQ).map(sanitiseQ);
      if (!cleaned.length) throw new Error('No complete Question + Answer pairs were found. Check the file or its column headings.');
      const replace=el('import-replace').checked;
      if (replace && !confirm('Replace your entire current question bank with '+cleaned.length+' imported questions? Download a backup first if you need the existing questions.')){feedback.textContent='Import cancelled.';return;}
      if (replace)bank=[];
      const seen = new Set(bank.map(q=>normalize(q.question)+'|'+normalize(q.answer)));
      let added=0, duplicates=0;
      for (const q of cleaned) {
        const key=normalize(q.question)+'|'+normalize(q.answer);
        if(seen.has(key)){duplicates++;continue;}
        seen.add(key);bank.push(q);added++;
      }
      if (replace && fullBackup) {
        if(Array.isArray(fullBackup.history)) { history=fullBackup.history;saveStorage(HISTORY_KEY,history); }
        if(fullBackup.theme && typeof fullBackup.theme==='object') { theme=Object.assign(theme,fullBackup.theme);saveStorage(THEME_KEY,theme);applyTheme(); }
      }
      persistBank();
      feedback.innerHTML='<strong>✓ Import complete:</strong> '+added+' question(s) added. '+duplicates+' duplicate(s) skipped. Total bank: '+bank.length+'.';
      toast('Imported '+added+' questions successfully.');
    } catch (err) {
      feedback.classList.add('error'); feedback.textContent='Unable to import: '+(err.message||String(err));
    }
  }
  function openImport() {
    el('import-feedback').textContent='';
    el('import-feedback').classList.remove('error');
    el('file-upload').value='';
    el('import-dialog').showModal();
  }
  function wire() {
    document.querySelectorAll('[data-coach-set]').forEach(button=>button.addEventListener('click',()=>{
      go('practice');
      el('practice-set').value = button.dataset.coachSet;
      el('practice-count').value = 150;
      // A full 150-item mastery round should not end after the default 15 minutes.
      el('practice-timer').value = '0';
      showAvailability();
    }));
    document.querySelectorAll('[data-route]').forEach(n=>n.addEventListener('click',()=>go(n.dataset.route)));
    document.querySelectorAll('[data-go]').forEach(n=>n.addEventListener('click',()=>go(n.dataset.go)));
    ['top-import','hero-import'].forEach(id=>el(id).addEventListener('click',openImport));
    el('add-question').addEventListener('click',()=>editQuestion());
    el('question-form').addEventListener('submit',handleEditSubmit);
    el('edit-type').addEventListener('change',updateQuestionType);
    document.querySelectorAll('[data-close]').forEach(n=>n.addEventListener('click',()=>el(n.dataset.close).close()));
    el('question-list').addEventListener('click',e=>{
      const edit=e.target.closest('[data-edit]'), del=e.target.closest('[data-delete]');
      if(edit)editQuestion(edit.dataset.edit);
      if(del && confirm('Delete this question from your bank?')){
        bank=bank.filter(q=>q.id!==del.dataset.delete); persistBank(); toast('Question deleted.');
      }
    });
    el('bank-search').addEventListener('input',()=>{bankPage=0;renderBank();});
    el('bank-set-filter').addEventListener('change',()=>{bankPage=0;renderBank();});
    el('page-prev').addEventListener('click',()=>{bankPage--;renderBank();});
    el('page-next').addEventListener('click',()=>{bankPage++;renderBank();});
    el('practice-set').addEventListener('change',showAvailability);
    el('start-quiz').addEventListener('click',startQuiz);
    el('quiz-answer').addEventListener('input',()=>{if(active&&!active.checked[active.index])active.answers[active.index]=el('quiz-answer').value;});
    el('quiz-choices').addEventListener('change',()=>{if(active&&!active.checked[active.index])active.answers[active.index]=currentAnswer();});
    el('quiz-answer').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!e.repeat)el('quiz-next').click();}});
    el('quiz-choices').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(!e.repeat)el('quiz-next').click();}});
    el('quiz-back').addEventListener('click',()=>{if(active&&active.index>0){if(!active.checked[active.index])active.answers[active.index]=currentAnswer();active.index--;renderQuestion();}});
    el('quiz-next').addEventListener('click',()=>{
      if(!active)return;
      if(!active.checked[active.index]) { checkCurrentAnswer(); return; }
      if(active.index===active.questions.length-1)finishQuiz();
      else {active.index++;renderQuestion();}
    });
    el('quit-quiz').addEventListener('click',()=>{if(active&&confirm('Exit without saving this attempt?')){clearInterval(active.interval);active=null;showSetup();}});
    document.querySelectorAll('.theme-choice').forEach(n=>n.addEventListener('click',()=>{theme.name=n.dataset.theme;theme.customAccent='';applyTheme();saveStorage(THEME_KEY,theme);}));
    el('design-accent').addEventListener('input',e=>{theme.customAccent=e.target.value;applyTheme();});
    el('design-title').addEventListener('input',e=>{el('preview-heading').textContent=e.target.value||'Knowledge Challenge';});
    el('save-design').addEventListener('click',saveTheme);
    el('reset-design').addEventListener('click',()=>{theme={name:'ocean',customAccent:'',title:'POPDEV Knowledge Challenge'};saveStorage(THEME_KEY,theme);applyTheme();toast('Default theme restored.');});
    el('export-results').addEventListener('click',exportResults);
    el('download-backup').addEventListener('click',backup);
    el('file-upload').addEventListener('change',e=>importFile(e.target.files[0]));
    el('upload-zone').addEventListener('dragover',e=>{e.preventDefault();el('upload-zone').style.borderColor='var(--accent)';});
    el('upload-zone').addEventListener('dragleave',()=>el('upload-zone').style.borderColor='');
    el('upload-zone').addEventListener('drop',e=>{e.preventDefault();el('upload-zone').style.borderColor='';importFile(e.dataTransfer.files[0]);});
  }
  refreshStats();refreshSelects();renderBank();applyTheme();wire();
  if (location.protocol === 'file:') document.querySelector('.offline-download')?.remove();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  }
})();
