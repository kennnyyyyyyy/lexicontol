/* ============================================================
   ai.js — LC.ai
   Optional, additive AI comprehension quiz.

   Responsibilities:
     • config (apiKey / model / difficulty / count) + localStorage
     • the OpenAI chat-completions call + prompt builder
     • the quiz state machine (generate → answer → score)
     • the on-brand loading controller (caret + phrases + shimmer)

   SECURITY: the API key lives ONLY in localStorage under
   `lexicontol.ai` (property `apiKey`). It is never hardcoded,
   never committed, and never sent anywhere except OpenAI.
   ============================================================ */

window.LC = window.LC || {};

LC.ai = (function () {
  var STORAGE_KEY = "lexicontol.ai";

  var DEFAULTS = {
    apiKey: "",
    model: "gpt-4o-mini",
    difficulty: 3,
    count: "auto"        // "1".."4" or "auto" (= up to AI)
  };

  var config = Object.assign({}, DEFAULTS);

  // difficulty 1–5 → verbatim instruction injected into the prompt
  var DIFFICULTY = {
    1: "Difficulty 1 (gentle): write explicit-recall questions whose answer is almost stated verbatim in the passage. Make the distractors clearly off-topic and easy to eliminate.",
    2: "Difficulty 2 (easy): test the main idea or an explicit detail. Distractors should be plausible at a glance but clearly wrong on a reread.",
    3: "Difficulty 3 (medium): mix explicit recall with light inference. Include one tempting distractor, but keep the others reasonably distinguishable.",
    4: "Difficulty 4 (hard): require inference and attention to fine detail. Make the distractors closely echo the passage's wording and facts so they are tempting and demand careful elimination.",
    5: "Difficulty 5 (UCAT-brutal): use subtle inference and trap logic. Make every wrong option mirror the passage's vocabulary, phrasing, and concepts so the wrong answers blend in and are genuinely hard to distinguish from the correct one. Avoid any obviously-wrong option."
  };

  var DIFF_LABEL = { 1: "gentle", 2: "easy", 3: "medium", 4: "hard", 5: "brutal" };

  var SYSTEM_MSG =
    "You are a UCAT-style reading-comprehension question writer. You produce multiple-choice " +
    "questions with exactly four options (A, B, C, D), one of which is correct, based strictly on a " +
    "passage the user provides. Base every question and option only on information in the passage; do " +
    "not rely on outside knowledge. Respond with ONLY a single valid json object matching the schema " +
    "the user specifies — no markdown, no code fences, no commentary.";

  var PHRASES = [
    "reading what you read…",
    "cooking up questions…",
    "sharpening the tricky ones…",
    "almost there…"
  ];

  /* ---- runtime UI state ---- */
  var ui = {};            // panel, body, progress element refs
  var quiz = null;        // { questions, index, answered, score }
  var currentText = "";   // the text the quiz is based on
  var token = 0;          // generation token — invalidates stale async results
  var phraseTimer = null;

  /* =========================================================
     config persistence
     ========================================================= */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) {
          if (saved[k] !== undefined) config[k] = saved[k];
        });
      }
    } catch (e) { /* corrupt storage → defaults */ }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); }
    catch (e) { /* storage disabled */ }
  }

  function setConfig(key, val) {
    config[key] = val;
    save();
    syncSettings();
  }

  // AI "reset to defaults" — keeps a saved key unless explicitly cleared
  function resetConfig() {
    var keepKey = config.apiKey;
    Object.keys(DEFAULTS).forEach(function (k) { config[k] = DEFAULTS[k]; });
    config.apiKey = keepKey;
    save();
    syncSettings();
  }

  /* =========================================================
     prompt building
     ========================================================= */
  function countInstruction(count) {
    if (count === "auto") {
      return "Choose between 1 and 4 questions based on the passage: fewer for short passages, more " +
             "for dense or long ones. Never produce more than 4 questions.";
    }
    var n = parseInt(count, 10) || 1;
    return "Generate exactly " + n + " question" + (n === 1 ? "" : "s") + ".";
  }

  function buildUserMsg(text) {
    var diff = DIFFICULTY[config.difficulty] || DIFFICULTY[3];
    return (
      "Passage:\n\"\"\"\n" + text + "\n\"\"\"\n\n" +
      diff + "\n" +
      countInstruction(config.count) + "\n\n" +
      "Return ONLY a valid json object with this exact shape:\n" +
      '{ "questions": [ { "question": "string", "options": { "A": "string", "B": "string", "C": "string", "D": "string" }, "answer": "A", "explanation": "one or two sentence explanation" } ] }\n' +
      "Rules: \"answer\" must be exactly one of \"A\", \"B\", \"C\", \"D\" and must mark the correct option. " +
      "Every question must include all four options. Keep options concise. Do not output any text outside the json object."
    );
  }

  /* =========================================================
     OpenAI call + validation
     ========================================================= */
  function callOpenAI(text) {
    var body = {
      model: config.model || "gpt-4o-mini",
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: buildUserMsg(text) }
      ]
    };

    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.apiKey
      },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }).then(function (data) {
      var content = data && data.choices && data.choices[0] &&
                    data.choices[0].message && data.choices[0].message.content;
      return parseQuiz(content);
    });
  }

  function parseQuiz(content) {
    var obj;
    try { obj = JSON.parse(content); }
    catch (e) { var pe = new Error("parse"); pe.code = "parse"; throw pe; }
    if (!validateQuiz(obj)) { var ve = new Error("parse"); ve.code = "parse"; throw ve; }
    obj.questions = obj.questions.slice(0, 4);   // hard cap at 4
    return obj;
  }

  function validateQuiz(obj) {
    if (!obj || !Array.isArray(obj.questions) || obj.questions.length === 0) return false;
    var letters = ["A", "B", "C", "D"];
    for (var i = 0; i < obj.questions.length; i++) {
      var q = obj.questions[i];
      if (!q || typeof q.question !== "string" || !q.question.trim()) return false;
      if (!q.options) return false;
      for (var j = 0; j < letters.length; j++) {
        var v = q.options[letters[j]];
        if (typeof v !== "string" || !v.trim()) return false;
      }
      if (letters.indexOf(q.answer) < 0) return false;
    }
    return true;
  }

  // one auto-retry, but only for malformed JSON (not auth/rate/network)
  function generateWithRetry(text) {
    return callOpenAI(text).catch(function (e) {
      if (e && e.code === "parse") return callOpenAI(text);
      throw e;
    });
  }

  function errCode(e) {
    if (!e) return "network";
    if (e.code === "parse") return "parse";
    if (e.status === 401) return "401";
    if (e.status === 429) return "429";
    if (e.status) return "http";
    return "network";   // fetch rejection (offline, CORS, DNS…)
  }

  /* =========================================================
     overlay control
     ========================================================= */
  function isOpen() { return ui.panel && !ui.panel.hidden; }

  function showPanel() {
    document.querySelectorAll(".overlay").forEach(function (o) { o.hidden = true; });
    ui.panel.hidden = false;
  }

  function open(text) {
    showPanel();
    startQuiz((text || "").trim());
  }

  function close() {
    token++;                 // invalidate any in-flight generation
    stopPhrases();
    quiz = null;
    if (ui.panel) ui.panel.hidden = true;
  }

  /* =========================================================
     quiz flow
     ========================================================= */
  function startQuiz(text) {
    currentText = text;
    quiz = null;
    setProgress("");

    if (!config.apiKey) { renderError("nokey"); return; }
    if (!text) { renderError("notext"); return; }

    var myToken = ++token;
    renderLoading();

    generateWithRetry(text).then(function (data) {
      if (myToken !== token || !isOpen()) return;        // stale / closed
      quiz = { questions: data.questions, index: 0, answered: false, score: 0 };
      stopPhrases();
      renderQuestion();
    }).catch(function (e) {
      if (myToken !== token || !isOpen()) return;
      stopPhrases();
      renderError(errCode(e));
    });
  }

  function select(letter) {
    if (!quiz || quiz.answered) return;
    quiz.answered = true;
    var q = quiz.questions[quiz.index];
    if (letter === q.answer) quiz.score++;

    document.querySelectorAll(".quiz-option").forEach(function (btn) {
      var o = btn.getAttribute("data-opt");
      btn.classList.add("answered");
      btn.disabled = true;
      if (o === q.answer) btn.classList.add("correct");
      else if (o === letter) btn.classList.add("wrong");
    });

    var fb = document.getElementById("quizFeedback");
    if (fb) {
      var last = quiz.index === quiz.questions.length - 1;
      fb.innerHTML =
        '<p class="explanation">' + escapeHtml(q.explanation || "") + "</p>" +
        '<p class="continue-hint">press <kbd>enter</kbd> ' + (last ? "for your score" : "for the next question") + "</p>";
      fb.classList.add("show");
    }
  }

  function next() {
    if (!quiz || !quiz.answered) return;
    if (quiz.index < quiz.questions.length - 1) {
      quiz.index++;
      quiz.answered = false;
      renderQuestion();
    } else {
      renderScore();
    }
  }

  /* =========================================================
     rendering
     ========================================================= */
  function setProgress(t) { if (ui.progress) ui.progress.textContent = t; }

  function renderLoading() {
    setProgress("");
    ui.body.innerHTML =
      '<div class="quiz-loading fade-in">' +
        '<div class="loading-status"><span class="caret">▮</span> <span class="phrase" id="loadPhrase"></span></div>' +
        '<div class="skeleton-card">' +
          '<div class="ghost-line ghost-q"></div>' +
          '<div class="ghost-row"></div><div class="ghost-row"></div>' +
          '<div class="ghost-row"></div><div class="ghost-row"></div>' +
        '</div>' +
      '</div>';
    startPhrases();
  }

  function startPhrases() {
    stopPhrases();
    var el = document.getElementById("loadPhrase");
    var i = 0;
    function cycle() {
      if (!el) return;
      el.style.opacity = "0";
      setTimeout(function () {
        if (!el) return;
        el.textContent = PHRASES[i % PHRASES.length];
        el.style.opacity = "1";
        i++;
      }, 220);
    }
    cycle();
    phraseTimer = setInterval(cycle, 1600);
  }

  function stopPhrases() {
    if (phraseTimer) { clearInterval(phraseTimer); phraseTimer = null; }
  }

  function renderQuestion() {
    var q = quiz.questions[quiz.index];
    setProgress((quiz.index + 1) + " / " + quiz.questions.length);

    var opts = ["A", "B", "C", "D"].map(function (L) {
      return '<button class="quiz-option" data-opt="' + L + '">' +
               '<span class="opt-letter">' + L + "</span>" +
               '<span class="opt-text">' + escapeHtml(q.options[L]) + "</span>" +
             "</button>";
    }).join("");

    ui.body.innerHTML =
      '<div class="quiz-q fade-in">' +
        '<p class="quiz-question">' + escapeHtml(q.question) + "</p>" +
        '<div class="quiz-options">' + opts + "</div>" +
        '<div class="quiz-feedback" id="quizFeedback"></div>' +
      "</div>";

    ui.body.querySelectorAll(".quiz-option").forEach(function (btn) {
      btn.addEventListener("click", function () { select(btn.getAttribute("data-opt")); });
    });
  }

  function renderScore() {
    setProgress("");
    var n = quiz.questions.length, s = quiz.score;
    ui.body.innerHTML =
      '<div class="quiz-score fade-in">' +
        '<div class="score-big"><span class="score-num">' + s + "</span> / " + n + "</div>" +
        '<p class="score-sub">' + scoreLine(s, n) + "</p>" +
        '<div class="score-actions">' +
          '<button class="btn-ghost" id="quizTryAgain">try again</button>' +
          '<button class="btn-accent" id="quizBack">back to reading</button>' +
        "</div>" +
      "</div>";
    document.getElementById("quizTryAgain").addEventListener("click", function () { startQuiz(currentText); });
    document.getElementById("quizBack").addEventListener("click", close);
  }

  function scoreLine(s, n) {
    var r = n ? s / n : 0;
    if (r === 1) return "flawless — you read every word.";
    if (r >= 0.75) return "strong comprehension.";
    if (r >= 0.5) return "decent — worth a reread of the tricky parts.";
    if (r > 0) return "slow down a touch and try again.";
    return "no worries — try a gentler difficulty in settings › ai.";
  }

  function renderError(code) {
    stopPhrases();
    setProgress("");
    var msg, action = "";
    switch (code) {
      case "nokey":
        msg = "add your openai key in settings › ai";
        action = '<button class="btn-accent" id="quizOpenAi">open settings › ai</button>';
        break;
      case "notext":
        msg = "read a little first, then come back for questions";
        action = '<button class="btn-accent" data-close>back to reading</button>';
        break;
      case "401":
        msg = "that key didn't work — check it in settings › ai";
        action = '<button class="btn-accent" id="quizOpenAi">open settings › ai</button>';
        break;
      case "429":
        msg = "openai's busy — try again in a sec";
        action = '<button class="btn-accent" id="quizRetry">try again</button>';
        break;
      case "parse":
        msg = "couldn't shape that into a quiz — try again";
        action = '<button class="btn-accent" id="quizRetry">try again</button>';
        break;
      default:
        msg = "couldn't reach openai — check your connection";
        action = '<button class="btn-accent" id="quizRetry">try again</button>';
    }

    ui.body.innerHTML =
      '<div class="quiz-error fade-in">' +
        '<p class="error-msg">' + msg + "</p>" +
        '<div class="error-actions">' + action + "</div>" +
      "</div>";

    var retry = document.getElementById("quizRetry");
    if (retry) retry.addEventListener("click", function () { startQuiz(currentText); });

    var openAi = document.getElementById("quizOpenAi");
    if (openAi) openAi.addEventListener("click", function () {
      close();
      var sp = document.getElementById("settingsPanel");
      if (sp) sp.hidden = false;
      if (LC.settings.switchTab) LC.settings.switchTab("ai");
      var k = document.getElementById("ai-apikey");
      if (k) setTimeout(function () { k.focus(); }, 30);
    });

    // close buttons inside the error block
    ui.body.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
  }

  /* =========================================================
     keyboard (only while the quiz overlay is open)
     ========================================================= */
  function handleKey(e) {
    var k = e.key;
    var letter = { a: "A", b: "B", c: "C", d: "D", "1": "A", "2": "B", "3": "C", "4": "D" }[String(k).toLowerCase()];

    if (letter && quiz && !quiz.answered && ui.body.querySelector(".quiz-option")) {
      e.preventDefault();
      select(letter);
      return;
    }
    if (k === "Enter" || k === " ") {
      // advance only from an answered question screen
      if (quiz && quiz.answered && ui.body.querySelector(".quiz-q")) {
        e.preventDefault();
        next();
      } else if (ui.body.querySelector(".quiz-score")) {
        e.preventDefault();   // swallow so it doesn't leak to the reader
      }
    }
  }

  /* =========================================================
     settings (ai tab) wiring
     ========================================================= */
  function syncSettings() {
    setV("ai-apikey", config.apiKey);
    setV("ai-model", config.model);
    setV("ai-difficulty", config.difficulty);
    setText("ai-difficulty-label", DIFF_LABEL[config.difficulty] || "medium");
    document.querySelectorAll("#ai-count .seg").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-count") === String(config.count));
    });
  }

  function setV(id, v) { var el = document.getElementById(id); if (el && el.value !== String(v)) el.value = v; }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  function bindSettings() {
    var key = document.getElementById("ai-apikey");
    if (key) key.addEventListener("input", function () { setConfig("apiKey", key.value.trim()); });

    var model = document.getElementById("ai-model");
    if (model) model.addEventListener("input", function () { setConfig("model", model.value.trim()); });

    var diff = document.getElementById("ai-difficulty");
    if (diff) diff.addEventListener("input", function () { setConfig("difficulty", parseInt(diff.value, 10)); });

    document.querySelectorAll("#ai-count .seg").forEach(function (b) {
      b.addEventListener("click", function () { setConfig("count", b.getAttribute("data-count")); });
    });

    bindClearKey();
  }

  // two-step "clear key" so the stored key is never wiped accidentally
  function bindClearKey() {
    var btn = document.getElementById("ai-clearkey");
    if (!btn) return;
    var armed = false, t = null;
    function disarm() { armed = false; btn.textContent = "clear key"; btn.classList.remove("armed"); if (t) { clearTimeout(t); t = null; } }
    btn.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        btn.textContent = "click again to clear";
        btn.classList.add("armed");
        t = setTimeout(disarm, 2500);
        return;
      }
      setConfig("apiKey", "");
      disarm();
    });
  }

  /* =========================================================
     init
     ========================================================= */
  function init() {
    load();
    ui.panel = document.getElementById("quizPanel");
    ui.body = document.getElementById("quizBody");
    ui.progress = document.getElementById("quizProgress");
    bindSettings();
    syncSettings();
  }

  return {
    init: init,
    open: open,
    close: close,
    isOpen: isOpen,
    handleKey: handleKey,
    resetConfig: resetConfig,
    hasKey: function () { return !!config.apiKey; },
    config: config,
    // exposed for tests / console debugging (mirrors reader.js style)
    _parse: parseQuiz,
    _validate: validateQuiz,
    _errCode: errCode,
    _buildUser: buildUserMsg,
    _countInstr: countInstruction,
    _DIFFICULTY: DIFFICULTY
  };
})();
