/* ============================================================
   settings.js — LC.settings
   State, localStorage persistence, and the live settings panel.
   ============================================================ */

window.LC = window.LC || {};

LC.settings = (function () {
  var STORAGE_KEY = "lexicontol.settings";

  var DEFAULTS = {
    wpm: 300,
    chunkSize: 1,
    maxBlur: 5,
    blurRadius: 1.0,
    autoAdvance: true,
    smoothScroll: true,
    windowWidth: 70,   // %
    windowHeight: 320, // px
    fontSize: 32,      // px
    fontFamily: "'Roboto Mono', monospace",
    fontColor: "#d1d0c5",
    bgColor: "#323437",
    textAlign: "left"
  };

  var values = Object.assign({}, DEFAULTS);
  var listeners = [];

  /* ---- persistence ---- */
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) {
          if (saved[k] !== undefined) values[k] = saved[k];
        });
      }
    } catch (e) {
      /* corrupt storage — fall back to defaults silently */
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch (e) { /* storage disabled — settings just won't persist */ }
  }

  /* ---- change notification ---- */
  function onChange(fn) { listeners.push(fn); }
  function notify(key) { listeners.forEach(function (fn) { fn(key, values); }); }

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

  /* Set a value, persist, apply visuals, and notify the reader. */
  function set(key, val, opts) {
    values[key] = val;
    if (key === "wpm") values.wpm = clamp(values.wpm, 50, 1500);
    save();
    applyStyles();
    syncPanel();
    if (!opts || !opts.silent) notify(key);
  }

  /* ---- apply visual settings to the DOM (CSS variables) ---- */
  function applyStyles() {
    var root = document.documentElement.style;
    root.setProperty("--reader-width", values.windowWidth + "%");
    root.setProperty("--reader-height", values.windowHeight + "px");
    root.setProperty("--reader-font-size", values.fontSize + "px");
    root.setProperty("--reader-font-family", values.fontFamily);
    root.setProperty("--reader-color", values.fontColor);
    root.setProperty("--reader-align", values.textAlign);
    root.setProperty("--bg", values.bgColor);
    root.setProperty("--main", values.fontColor);

    // top-bar mode toggle label
    var modeToggle = document.getElementById("modeToggle");
    if (modeToggle) {
      modeToggle.classList.toggle("manual", !values.autoAdvance);
      modeToggle.querySelector(".mode-label").textContent = values.autoAdvance ? "auto" : "manual";
    }
    // active WPM chip
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.classList.toggle("active", parseInt(chip.dataset.wpm, 10) === values.wpm);
    });
  }

  /* ---- settings panel wiring ---- */
  function syncPanel() {
    setVal("set-wpm", values.wpm);          setText("wpmVal", values.wpm);
    setVal("set-chunk", values.chunkSize);  setText("chunkVal", values.chunkSize);
    setVal("set-maxblur", values.maxBlur);  setText("maxBlurVal", values.maxBlur + "px");
    setVal("set-blurradius", values.blurRadius); setText("blurRadiusVal", values.blurRadius.toFixed(1));
    setVal("set-width", values.windowWidth); setText("widthVal", values.windowWidth + "%");
    setVal("set-height", values.windowHeight); setText("heightVal", values.windowHeight + "px");
    setVal("set-fontsize", values.fontSize); setText("fontSizeVal", values.fontSize + "px");
    setVal("set-fontfamily", values.fontFamily);
    setVal("set-fontcolor", values.fontColor);
    setVal("set-bgcolor", values.bgColor);
    setVal("set-align", values.textAlign);
    setSwitch("set-auto", values.autoAdvance);
    setSwitch("set-smooth", values.smoothScroll);
  }

  function setVal(id, v) { var el = document.getElementById(id); if (el && el.value != v) el.value = v; }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function setSwitch(id, on) { var el = document.getElementById(id); if (el) el.setAttribute("aria-checked", on ? "true" : "false"); }

  function bindPanel() {
    bindRange("set-wpm", "wpm", parseInt);
    bindRange("set-chunk", "chunkSize", parseInt);
    bindRange("set-maxblur", "maxBlur", parseInt);
    bindRange("set-blurradius", "blurRadius", parseFloat);
    bindRange("set-width", "windowWidth", parseInt);
    bindRange("set-height", "windowHeight", parseInt);
    bindRange("set-fontsize", "fontSize", parseInt);
    bindSelect("set-fontfamily", "fontFamily");
    bindSelect("set-align", "textAlign");
    bindColor("set-fontcolor", "fontColor");
    bindColor("set-bgcolor", "bgColor");
    bindToggle("set-auto", "autoAdvance");
    bindToggle("set-smooth", "smoothScroll");

    var resetBtn = document.getElementById("resetSettings");
    if (resetBtn) resetBtn.addEventListener("click", reset);
  }

  function bindRange(id, key, parser) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () { set(key, parser(el.value, 10)); });
  }
  function bindSelect(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function () { set(key, el.value); });
  }
  function bindColor(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () { set(key, el.value); });
  }
  function bindToggle(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", function () { set(key, !values[key]); });
  }

  function reset() {
    // mutate in place so the exported `values` reference stays valid
    Object.keys(DEFAULTS).forEach(function (k) { values[k] = DEFAULTS[k]; });
    save();
    applyStyles();
    syncPanel();
    notify("*");
  }

  function init() {
    load();
    bindPanel();
    applyStyles();
    syncPanel();
  }

  return {
    values: values,
    DEFAULTS: DEFAULTS,
    init: init,
    set: set,
    reset: reset,
    onChange: onChange,
    applyStyles: applyStyles,
    syncPanel: syncPanel
  };
})();
