/* ============================================================
   reader.js — LC.reader
   The blur-reveal engine: rendering, the blur model (§3.2),
   the drift-free WPM scheduler (§3.3), and auto-scroll (§3.4).
   ============================================================ */

window.LC = window.LC || {};

LC.reader = (function () {
  var S = LC.settings;

  var container;        // #reader element
  var focusPrompt;      // #focusPrompt overlay
  var quizTrigger;      // #quizTrigger "question me!" button
  var spans = [];       // <span class="word"> nodes
  var headIndex = 0;    // index of first word in the active chunk
  var state = "ready";  // ready | reading | paused | done

  // timing baseline for the drift-free scheduler
  var startTime = 0;    // performance.now() baseline such that elapsed maps to head
  var rafId = null;

  var onUpdate = null;  // callback(progressInfo) for the readout/progress UI

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /* ---------- §3.2 the blur model ---------- */

  // word-distance from word j to the nearest active-chunk word
  function distanceTo(j, i, C) {
    if (j >= i && j <= i + C - 1) return 0;
    if (j < i) return i - j;
    return j - (i + C - 1);
  }

  // blur fraction in [0,1] for a given distance and radius R
  function blurFraction(d, R) {
    if (d === 0) return 0;
    return clamp(d - (R - 1), 0, 1);
  }

  // Pure helper, exposed for testing the worked example (§3.2).
  function computeBlurPx(j, i, C, R, maxBlur) {
    return blurFraction(distanceTo(j, i, C), R) * maxBlur;
  }

  /* ---------- rendering ---------- */

  function render(text) {
    container.innerHTML = "";
    spans = [];
    var words = String(text).trim().split(/\s+/);

    var frag = document.createDocumentFragment();
    words.forEach(function (w, idx) {
      var span = document.createElement("span");
      span.className = "word";
      span.textContent = w;
      spans.push(span);
      frag.appendChild(span);
      if (idx < words.length - 1) frag.appendChild(document.createTextNode(" "));
    });
    container.appendChild(frag);

    headIndex = 0;
    state = "ready";
    container.scrollTop = 0;
    applyBlur();
    showFocusPrompt(true);
    emit();
  }

  function load(text) {
    stopLoop();
    render(text);
  }

  /* Apply per-word blur/opacity for the current head. Cheap enough to
     run on each head change (not every animation frame). */
  function applyBlur() {
    var v = S.values;
    var i = headIndex, C = v.chunkSize, R = v.blurRadius, maxBlur = v.maxBlur;
    var lo = i, hi = i + C - 1;

    for (var j = 0; j < spans.length; j++) {
      var frac = blurFraction(distanceTo(j, i, C), R);
      var px = frac * maxBlur;
      var span = spans[j];
      span.style.filter = px === 0 ? "none" : "blur(" + px.toFixed(2) + "px)";
      span.style.opacity = (1 - 0.35 * frac).toFixed(3);
      var isActive = (j >= lo && j <= hi);
      if (isActive !== span._active) {            // toggle class only on change
        span.classList.toggle("active", isActive);
        span._active = isActive;
      }
    }
  }

  /* ---------- §3.4 auto-scroll ---------- */

  function scrollToHead() {
    var span = spans[headIndex];
    if (!span) return;
    // place the active line ~38% down the container
    var target = span.offsetTop - container.clientHeight * 0.38;
    target = Math.max(0, target);
    if (S.values.smoothScroll) {
      container.scrollTo({ top: target, behavior: "smooth" });
    } else {
      container.scrollTop = target;
    }
  }

  /* ---------- head movement ---------- */

  function lastChunkStart() {
    var C = S.values.chunkSize;
    if (spans.length === 0) return 0;
    return Math.floor((spans.length - 1) / C) * C;
  }

  // Move head and refresh everything. Snaps to a chunk boundary.
  function setHead(idx) {
    var C = S.values.chunkSize;
    idx = clamp(idx, 0, lastChunkStart());
    idx = Math.round(idx / C) * C;          // align to chunk grid
    idx = clamp(idx, 0, lastChunkStart());
    headIndex = idx;
    applyBlur();
    scrollToHead();
    emit();
  }

  // chunk dwell in ms
  function chunkMs() {
    return (60000 / S.values.wpm) * S.values.chunkSize;
  }

  // (re)anchor the timing baseline so `elapsed` maps to the current head
  function rebaseClock() {
    var chunkIndex = headIndex / S.values.chunkSize;
    startTime = performance.now() - chunkIndex * chunkMs();
  }

  /* ---------- §3.3 the drift-free scheduler ---------- */

  function tick(now) {
    if (state !== "reading") return;
    var C = S.values.chunkSize;
    var elapsed = now - startTime;
    var k = Math.floor(elapsed / chunkMs());      // current chunk number
    var lastK = Math.floor((spans.length - 1) / C);

    if (k > lastK) { finish(); return; }

    var target = k * C;
    if (target !== headIndex) {
      headIndex = target;
      applyBlur();
      scrollToHead();
      emit();
    }
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  /* ---------- public controls ---------- */

  function play() {
    if (spans.length === 0) return;
    if (state === "done") { restart(); }
    state = "reading";
    showFocusPrompt(false);
    rebaseClock();
    stopLoop();
    rafId = requestAnimationFrame(tick);
    emit();
  }

  function pause() {
    if (state !== "reading") return;
    state = "paused";
    stopLoop();
    emit();
  }

  function toggle() {
    if (state === "reading") pause();
    else play();
  }

  // Manual mode: advance exactly one chunk per call (no timer).
  function advance() {
    if (spans.length === 0) return;
    // first action just reveals the opening chunk and dismisses the prompt
    if (state === "ready") {
      showFocusPrompt(false);
      state = "paused";
      emit();
      return;
    }
    if (state === "done") return;
    showFocusPrompt(false);
    var next = headIndex + S.values.chunkSize;
    if (next > lastChunkStart()) { finish(); return; }
    setHead(next);
  }

  // ←/→ skip one chunk; keeps the clock consistent if mid-play.
  function skip(dir) {
    if (spans.length === 0) return;
    showFocusPrompt(false);
    setHead(headIndex + dir * S.values.chunkSize);
    if (state === "reading") rebaseClock();
    else if (state === "done") state = "paused";
  }

  function restart() {
    stopLoop();
    state = "ready";
    setHead(0);
    container.scrollTop = 0;
    showFocusPrompt(true);
    emit();
  }

  function finish() {
    stopLoop();
    setHead(lastChunkStart());
    state = "done";
    showFocusPrompt(true);   // subtle "done" overlay (text set by the UI layer)
    emit();
  }

  /* React to a settings change (re-render blur, re-anchor timing). */
  function refresh() {
    if (spans.length === 0) return;
    setHead(headIndex);            // re-snaps to grid + re-applies blur
    if (state === "reading") rebaseClock();
  }

  /* ---------- focus prompt + readout ---------- */

  function showFocusPrompt(show) {
    if (focusPrompt) focusPrompt.classList.toggle("hidden", !show);
  }

  // the quiz trigger only appears once there's something to be quizzed on
  function updateQuizTrigger() {
    if (!quizTrigger) return;
    var show = (state === "paused" || state === "done");
    quizTrigger.classList.toggle("show", show);
  }

  // the text read so far — words[0 .. last revealed word]
  function readText() {
    var read = progress().read;
    var parts = [];
    for (var i = 0; i < read; i++) parts.push(spans[i].textContent);
    return parts.join(" ");
  }

  function progress() {
    var total = spans.length;
    var read = total === 0 ? 0 : Math.min(headIndex + S.values.chunkSize, total);
    return {
      read: read,
      total: total,
      fraction: total === 0 ? 0 : read / total,
      wpm: S.values.wpm,
      state: state
    };
  }

  function emit() {
    updateQuizTrigger();
    if (onUpdate) onUpdate(progress());
  }

  /* ---------- init ---------- */

  function init(opts) {
    container = document.getElementById("reader");
    focusPrompt = document.getElementById("focusPrompt");
    quizTrigger = document.getElementById("quizTrigger");
    onUpdate = opts && opts.onUpdate;

    // settings that affect layout/blur must re-render the reader
    // (settings.set already applied CSS vars before notifying us)
    S.onChange(function () { refresh(); });
  }

  return {
    init: init,
    load: load,
    play: play,
    pause: pause,
    toggle: toggle,
    advance: advance,
    skip: skip,
    restart: restart,
    refresh: refresh,
    progress: progress,
    readText: readText,
    getState: function () { return state; },
    isAuto: function () { return S.values.autoAdvance; },
    // exposed for tests / console verification of §3.2
    _computeBlurPx: computeBlurPx,
    _distanceTo: distanceTo,
    _blurFraction: blurFraction
  };
})();
