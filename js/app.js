/* ============================================================
   app.js — init, keyboard shortcuts, and UI wiring (loads LAST)
   ============================================================ */

(function () {
  var sampleIndex = 0;

  /* ---------- readout / progress ---------- */
  function onUpdate(p) {
    set("wordsRead", p.read);
    set("wordsTotal", p.total);
    set("liveWpm", p.wpm);
    var bar = document.getElementById("progressBar");
    if (bar) bar.style.width = (p.fraction * 100).toFixed(1) + "%";

    var ft = document.querySelector("#focusPrompt .focus-text");
    if (ft) {
      ft.innerHTML = (p.state === "done")
        ? 'done · press <kbd>r</kbd> to restart'
        : 'click here or press <kbd>space</kbd> to start';
    }
  }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  /* ---------- primary action (mode-aware) ---------- */
  function primaryAction() {
    if (LC.settings.values.autoAdvance) LC.reader.toggle();
    else LC.reader.advance();
  }

  function bumpWpm(delta) {
    LC.settings.set("wpm", LC.settings.values.wpm + delta);
  }

  /* ---------- overlays ---------- */
  function openOverlay(id) {
    closeOverlays();
    var el = document.getElementById(id);
    if (el) el.hidden = false;
  }
  function closeOverlays() {
    // let the quiz tear down cleanly (stop timers, invalidate in-flight calls)
    if (window.LC && LC.ai && LC.ai.isOpen()) LC.ai.close();
    document.querySelectorAll(".overlay").forEach(function (o) { o.hidden = true; });
  }
  function anyOverlayOpen() { return !!document.querySelector(".overlay:not([hidden])"); }

  function openSettings() { openOverlay("settingsPanel"); }
  function openAbout() { openOverlay("aboutPanel"); }

  // quiz runs on the text read so far (words[0 .. head])
  function openQuiz() {
    var st = LC.reader.getState();
    if (st !== "paused" && st !== "done") return;
    if (window.LC && LC.ai) LC.ai.open(LC.reader.readText());
  }
  function openNewText() {
    openOverlay("newTextPanel");
    var ta = document.getElementById("newTextArea");
    if (ta) { ta.value = ""; setTimeout(function () { ta.focus(); }, 30); }
  }

  /* ---------- new-text overlay actions ---------- */
  function loadSampleIntoTextarea() {
    var ta = document.getElementById("newTextArea");
    var sample = LC.samples[sampleIndex % LC.samples.length];
    sampleIndex++;
    if (ta) { ta.value = sample.text; ta.focus(); }
  }
  function submitNewText() {
    var ta = document.getElementById("newTextArea");
    var text = ta ? ta.value.trim() : "";
    if (!text) { ta && ta.focus(); return; }
    LC.reader.load(text);
    closeOverlays();
  }

  /* ---------- keyboard shortcuts (§4) ---------- */
  function isTyping() {
    var t = document.activeElement;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }

  function onKeyDown(e) {
    // esc always closes any open overlay first (quiz gets a clean teardown)
    if (e.key === "Escape") {
      if (window.LC && LC.ai && LC.ai.isOpen()) { LC.ai.close(); e.preventDefault(); return; }
      if (anyOverlayOpen()) { closeOverlays(); e.preventDefault(); }
      return;
    }
    // never hijack keys while typing in a field
    if (isTyping()) return;
    // the quiz overlay captures its own keys (A–D / 1–4 / enter / space)
    if (window.LC && LC.ai && LC.ai.isOpen()) { LC.ai.handleKey(e); return; }
    // let space/enter activate a focused button or link natively
    var ae = document.activeElement;
    if ((e.key === " " || e.key === "Enter") && ae && (ae.tagName === "BUTTON" || ae.tagName === "A")) return;
    // with an overlay open, only esc is active (handled above)
    if (anyOverlayOpen()) return;

    switch (e.key) {
      case " ":          e.preventDefault(); primaryAction(); break;
      case "r": case "R": LC.reader.restart(); break;
      case "n": case "N": e.preventDefault(); openNewText(); break;
      case "s": case "S": openSettings(); break;
      case "q": case "Q": openQuiz(); break;
      case "ArrowLeft":  e.preventDefault(); LC.reader.skip(-1); break;
      case "ArrowRight": e.preventDefault(); LC.reader.skip(1); break;
      case "ArrowUp":    e.preventDefault(); bumpWpm(25); break;
      case "ArrowDown":  e.preventDefault(); bumpWpm(-25); break;
    }
  }

  /* ---------- top-bar + overlay wiring ---------- */
  function wireUI() {
    // WPM preset chips
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        LC.settings.set("wpm", parseInt(chip.dataset.wpm, 10));
        chip.blur();
      });
    });

    // auto/manual toggle in top bar
    on("modeToggle", "click", function () {
      LC.settings.set("autoAdvance", !LC.settings.values.autoAdvance);
      this.blur();
    });

    on("newBtn", "click", function () { openNewText(); this.blur(); });
    on("settingsBtn", "click", function () { openSettings(); this.blur(); });
    on("infoBtn", "click", function () { openAbout(); this.blur(); });
    on("aboutLink", "click", openAbout);

    // close buttons inside panels
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", closeOverlays);
    });

    // click on the backdrop closes the overlay
    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("mousedown", function (e) {
        if (e.target === ov) closeOverlays();
      });
    });

    // new-text overlay buttons
    on("loadSample", "click", loadSampleIntoTextarea);
    on("loadText", "click", submitNewText);

    // click anywhere in the reading area = primary action
    var readerWrap = document.querySelector(".reader-wrap");
    if (readerWrap) readerWrap.addEventListener("click", primaryAction);

    // "question me!" trigger — stop the click from bubbling to the reader-wrap
    on("quizTrigger", "click", function (e) {
      e.stopPropagation();
      openQuiz();
      this.blur();
    });

    document.addEventListener("keydown", onKeyDown);
  }

  function on(id, evt, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
  }

  /* ---------- boot ---------- */
  function init() {
    LC.settings.init();
    LC.reader.init({ onUpdate: onUpdate });
    LC.ai.init();
    wireUI();
    // first load → first sample
    LC.reader.load(LC.samples[0].text);
    sampleIndex = 1;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
