/**
 * AI Grammar Pro+ — Content Script (v2.0 — Professional Rewrite)
 *
 * Architecture overview
 * ─────────────────────
 * PROBLEM (old): A "mirror" <div> was absolutely positioned over the textarea
 *   at (rect.top + scrollY, rect.left + scrollX). When the textarea scrolled
 *   internally the mirror stayed put → underlines stuck at wrong positions.
 *
 * SOLUTION (new):
 *   • <textarea>  → we create a contenteditable OVERLAY (position:fixed, same
 *     viewport rect). Error <span>s live *inside* the overlay so they scroll
 *     with the content automatically. The real textarea is kept hidden and
 *     value-synced for form submission.
 *   • contenteditable → error <span>s are injected *directly* into the DOM
 *     (TreeWalker-based, from end→start so offsets stay valid). They scroll
 *     naturally because they are part of the element's own DOM.
 *   • Both paths preserve the cursor position with a plain-text offset
 *     bookmark (getCursorOffset / setCursorOffset).
 *   • A single floating tooltip appears near the clicked error span to show
 *     the LanguageTool message and one-click suggestions.
 *   • The AI rephrase panel (Ollama) is unchanged in behaviour.
 */

'use strict';

// ─── Extension health ────────────────────────────────────────────────────────

let isExtensionValid = true;

function checkExtensionHealth() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (_) {
    isExtensionValid = false;
    return false;
  }
}
setInterval(() => { isExtensionValid = checkExtensionHealth(); }, 5000);

// ─── Settings ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  languageToolUrl: 'http://localhost:8010/v2/check',
  ollamaUrl: 'http://localhost:11434/api/generate',
  ollamaModel: 'llama3.2:1b',
  autoCheck: true,
  checkDelay: 1200,
  enabledStyles: ['professional','casual','short','academic','creative','technical','simple','expand'],
  theme: 'auto',
  showStatistics: true,
  enableShortcuts: true
};

let userSettings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  try {
    const res = await sendMessage({ action: 'getSettings' });
    if (res && res.settings) {
      userSettings = { ...DEFAULT_SETTINGS, ...res.settings };
      applyTheme(userSettings.theme);
    }
  } catch (_) {}
}
loadSettings();

function applyTheme(theme) {
  document.documentElement.classList.remove('agp-theme-light', 'agp-theme-dark');
  if (theme === 'light') document.documentElement.classList.add('agp-theme-light');
  else if (theme === 'dark') document.documentElement.classList.add('agp-theme-dark');
}

// ─── Messaging ───────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    if (!checkExtensionHealth()) { reject(new Error('Extension invalid')); return; }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(res);
      });
    } catch (e) { reject(e); }
  });
}

// ─── Cursor helpers (plain-text offset bookmarks) ────────────────────────────

/**
 * Returns cursor offset counting only text nodes.
 * Safe to use on REAL contenteditable elements (not our overlay).
 */
function getCursorOffset(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/**
 * Cursor offset for our textarea OVERLAY.
 *
 * Chrome represents new lines in contenteditable as either:
 *   a) <br> elements
 *   b) block <div>/<p> wrappers
 * Both of these are invisible to Range.toString() (which only reads text nodes),
 * so getCursorOffset gives a LOWER number than getOverlayText when BRs/divs
 * are present.  After applyErrorsAsHTML rebuilds the HTML with literal \n chars,
 * setCursorOffset(el, lowerNumber) places the cursor on the PREVIOUS line.
 *
 * This function walks the DOM the same way as getOverlayText — counting <br>
 * as 1 char and each block-boundary as 1 char — so the returned offset is
 * always consistent with the text string getOverlayText produces.
 */
function getOverlayCursorOffset(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const target   = range.startContainer;
  const tOff     = range.startOffset;

  if (target !== el && !el.contains(target)) return null;

  const BLOCK = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE)$/;
  let chars = 0;
  let found = false;

  // Count all chars in a subtree (used when cursor is in an element node
  // and we need to count children before the cursor child-index).
  function countSubtree(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) { chars += node.nodeValue.length; return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();
    if (tag === 'BR' && !node.classList.contains('agp-phantom')) { chars += 1; return; }
    if (tag === 'BR') return;
    for (const c of node.childNodes) countSubtree(c);
  }

  function walk(node) {
    if (found) return;

    // Is this node the cursor's anchor?
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        chars += tOff;
      } else {
        // Cursor in an element node at child-index tOff
        for (let i = 0; i < tOff; i++) countSubtree(node.childNodes[i]);
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      chars += node.nodeValue.length;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toUpperCase();

    // phantom BR added by us for cursor-visibility — not a real character
    if (tag === 'BR' && node.classList.contains('agp-phantom')) return;

    // real BR (Chrome new-line representation)
    if (tag === 'BR') { chars += 1; return; }

    // Block element: Chrome wraps each "line" in a <div> on Enter
    const isBlock = BLOCK.test(tag) && node !== el;
    if (isBlock && node.previousSibling !== null) {
      // Only add a separator newline between sibling blocks, not before the first
      chars += 1;
    }

    for (const child of node.childNodes) {
      walk(child);
      if (found) return;
    }
  }

  // Special-case: cursor IS the overlay element (child-index anchor)
  if (target === el) {
    for (let i = 0; i < tOff; i++) countSubtree(el.childNodes[i]);
    return chars;
  }

  for (const child of el.childNodes) {
    walk(child);
    if (found) break;
  }

  return chars;
}

/**
 * Normalise the overlay DOM after every browser edit.
 *
 * Chrome may produce <br> elements or <div> block wrappers when the user
 * presses Enter.  We convert both to plain \n text characters so the DOM
 * stays a flat stream of text nodes (+ our error spans), making textContent
 * and getOverlayText always agree and making cursor math trivial.
 *
 * A special "phantom" <br class="agp-phantom"> is re-inserted at the very
 * end whenever the text ends with \n so Chrome shows the cursor on the new
 * empty line (without it the trailing newline is invisible in contenteditable).
 */
function normalizeOverlayDOM(div) {
  // 1. Save cursor BEFORE touching the DOM (using the BR/div-aware counter)
  const cursor = getOverlayCursorOffset(div);

  // 2. Remove existing phantom BRs (we will re-add if needed)
  div.querySelectorAll('br.agp-phantom').forEach(br => br.remove());

  // 3. Replace every non-phantom <br> with a \n text node
  div.querySelectorAll('br').forEach(br => {
    if (br.classList.contains('agp-phantom')) return;
    br.replaceWith(document.createTextNode('\n'));
  });

  // 4. Unwrap Chrome's <div> and <p> line wrappers (repeat until none left)
  for (let pass = 0; pass < 10; pass++) {
    const blocks = [...div.querySelectorAll('div:not(.agp-overlay), p')]
      .filter(b => b !== div && !b.closest('.agp-err'));
    if (!blocks.length) break;
    blocks.forEach(block => {
      const parent = block.parentNode;
      if (!parent) return;
      // Insert \n before block content — but only if previous sibling doesn't
      // already end with \n (avoid double newlines)
      const prev = block.previousSibling;
      const needsNL = prev && !(
        prev.nodeType === Node.TEXT_NODE && prev.nodeValue.endsWith('\n')
      );
      if (needsNL) parent.insertBefore(document.createTextNode('\n'), block);
      while (block.firstChild) parent.insertBefore(block.firstChild, block);
      block.remove();
    });
  }

  // 5. Merge adjacent text nodes
  div.normalize();

  // 6. Re-add phantom BR when text ends with \n so cursor appears on new line
  const rawText = div.textContent;
  if (rawText.endsWith('\n')) {
    const ph = document.createElement('br');
    ph.className = 'agp-phantom';
    div.appendChild(ph);
  }

  // 7. Restore cursor (DOM is now clean text nodes + optional phantom br)
  if (cursor !== null) setCursorOffset(div, cursor);
}

/**
 * Moves the cursor to `offset` characters into element's textContent.
 *
 * IMPORTANT: we avoid calling sel.removeAllRanges() if the selection is
 * already at the correct position.  removeAllRanges() can fire a blur event
 * on the focused element in some Chrome builds, which would trigger our
 * focusout handler and hide the floating button unexpectedly.
 */
function setCursorOffset(el, offset) {
  if (offset < 0) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= node.nodeValue.length) {
      const sel = window.getSelection();
      // If selection is already exactly here, do nothing to avoid spurious blur
      if (sel && sel.rangeCount === 1) {
        const cur = sel.getRangeAt(0);
        if (cur.startContainer === node &&
            cur.startOffset === remaining &&
            cur.collapsed) return;
      }
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= node.nodeValue.length;
  }
  // Fallback — put cursor at end
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/**
 * Read plain text from our textarea overlay.
 *
 * After normalizeOverlayDOM() runs on every input event, the DOM contains
 * only text nodes (with literal \n chars for line breaks) plus our own
 * error <span>s and an optional phantom <br class="agp-phantom">.
 *
 * We walk text nodes only — the phantom BR is skipped automatically since
 * it is an element node.  The result is always consistent with the offset
 * numbers getOverlayCursorOffset() produces.
 */
function getOverlayText(el) {
  let text = '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) text += node.nodeValue;
  return text;
}

function getErrorCategory(categoryId) {
  if (!categoryId) return 'grammar';
  const id = categoryId.toUpperCase();
  if (id.includes('SPELL')) return 'spelling';
  if (id.includes('PUNCT') || id.includes('COMMA')) return 'punctuation';
  if (id.includes('STYLE') || id.includes('REDUNDANCY')) return 'style';
  return 'grammar';
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── HTML injection helpers for error spans ───────────────────────────────────

/**
 * Rebuilds an element's innerHTML from plain text + match data.
 * Used for the textarea OVERLAY (which we fully control).
 * Preserves the cursor via getCursorOffset / setCursorOffset.
 */
function applyErrorsAsHTML(el, text, matches) {
  const hasFocus = document.activeElement === el || el.contains(document.activeElement);
  // Use the overlay-aware cursor counter so <br> and <div> elements are
  // treated as \n (matching getOverlayText).  The old getCursorOffset only
  // counted text nodes and returned a lower offset whenever BRs were present,
  // which made setCursorOffset land on the wrong line after the rebuild.
  const cursorPos = hasFocus ? getOverlayCursorOffset(el) : null;

  const sorted = [...matches].sort((a, b) => a.offset - b.offset);
  let html = '';
  let last = 0;

  for (const m of sorted) {
    if (m.offset < last) continue;                        // skip overlaps
    html += escHtml(text.slice(last, m.offset));
    const cat = getErrorCategory(m.rule?.category?.id);
    const mData = escHtml(JSON.stringify({
      message: m.message,
      shortMessage: m.shortMessage || '',
      replacements: (m.replacements || []).slice(0, 6).map(r => r.value),
      offset: m.offset,
      length: m.length
    }));
    html += `<span class="agp-err agp-err-${cat}" data-m="${mData}">${escHtml(text.slice(m.offset, m.offset + m.length))}</span>`;
    last = m.offset + m.length;
  }
  html += escHtml(text.slice(last));

  el.innerHTML = html;

  // Re-add phantom BR when text ends with \n — Chrome won't show the cursor
  // on the trailing empty line without it.
  if (text.endsWith('\n')) {
    const ph = document.createElement('br');
    ph.className = 'agp-phantom';
    el.appendChild(ph);
  }

  if (hasFocus && cursorPos !== null) setCursorOffset(el, cursorPos);
}

/**
 * Remove all error spans from a contenteditable (structural injection).
 * Replaces each span with a plain text node and normalises the tree.
 */
function clearErrorSpans(el) {
  el.querySelectorAll('.agp-err').forEach(span => {
    span.replaceWith(document.createTextNode(span.textContent));
  });
  el.normalize();
}

/**
 * Inject error spans into a REAL contenteditable element using DOM surgery
 * (TreeWalker). Works from end → start so earlier offsets stay valid.
 * Preserves existing HTML structure (headings, lists, bold, etc.).
 */
function injectErrorSpans(el, matches) {
  clearErrorSpans(el);
  if (!matches.length) return;

  // Save cursor as a plain-text offset
  const cursorPos = getCursorOffset(el);

  // Process from end → start
  const sorted = [...matches].sort((a, b) => b.offset - a.offset);

  for (const m of sorted) {
    wrapTextRange(el, m.offset, m.offset + m.length, m);
  }

  setCursorOffset(el, cursorPos);
}

/**
 * Low-level: wraps [charStart, charEnd) of el's text content in an error span.
 */
function wrapTextRange(container, charStart, charEnd, match) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(n) {
        // Skip text inside our own error spans
        return n.parentNode.classList?.contains('agp-err')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let offset = 0;
  let node;

  while ((node = walker.nextNode())) {
    const start = offset;
    const end = offset + node.nodeValue.length;

    if (end <= charStart) { offset = end; continue; }
    if (start >= charEnd) break;

    // This node overlaps the error range
    const localStart = Math.max(charStart - start, 0);
    const localEnd = Math.min(charEnd - start, node.nodeValue.length);

    // Split text node into [before][error][after]
    const afterNode = node.splitText(localEnd);
    const errorNode = node.splitText(localStart);
    // node = before, errorNode = error text, afterNode = rest

    const span = document.createElement('span');
    span.className = `agp-err agp-err-${getErrorCategory(match.rule?.category?.id)}`;
    span.dataset.m = JSON.stringify({
      message: match.message,
      shortMessage: match.shortMessage || '',
      replacements: (match.replacements || []).slice(0, 6).map(r => r.value),
      offset: match.offset,
      length: match.length
    });

    errorNode.parentNode.insertBefore(span, errorNode);
    span.appendChild(errorNode);

    // Only wrap the first overlapping node (grammar errors don't span elements)
    break;
  }
}

// ─── TextareaOverlay ─────────────────────────────────────────────────────────
//
// Creates a contenteditable <div> that sits precisely over a <textarea>,
// making the textarea text transparent. Error spans inside the overlay scroll
// with the content naturally (they are real DOM children).
//
class TextareaOverlay {
  constructor(textarea) {
    this.ta = textarea;
    this.div = null;
    this._rafId = null;
    this._ro = null;        // ResizeObserver
    this._destroyed = false;
    this._lastText = '';
    this._setup();
  }

  _setup() {
    const ta = this.ta;
    const cs = getComputedStyle(ta);

    // ── Create the overlay div ──
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.spellcheck = false;
    div.autocomplete = 'off';
    div.autocorrect = 'off';
    div.autocapitalize = 'off';
    div.className = 'agp-overlay';
    div.setAttribute('data-agp-overlay', 'true');
    div.setAttribute('aria-label', ta.getAttribute('aria-label') || ta.getAttribute('placeholder') || 'Text editor');

    // ── Copy typography + spacing from textarea ──
    const copy = [
      'fontFamily','fontSize','fontWeight','fontStyle','fontVariant',
      'letterSpacing','lineHeight','wordSpacing','textIndent','textAlign',
      'textTransform','paddingTop','paddingRight','paddingBottom','paddingLeft',
      'borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius',
      'boxSizing','tabSize','direction','unicodeBidi',
      'wordBreak','overflowWrap','whiteSpace'
    ];
    copy.forEach(p => { div.style[p] = cs[p]; });

    div.style.backgroundColor = cs.backgroundColor || '#ffffff';
    div.style.color = cs.color || '#000000';
    div.style.borderWidth = cs.borderWidth;
    div.style.borderStyle = cs.borderStyle;
    div.style.borderColor = cs.borderColor;

    // Fixed positioning updated via rAF when page scrolls
    div.style.position = 'fixed';
    div.style.overflow = 'auto';
    div.style.resize   = 'none';
    div.style.outline  = 'none';
    div.style.zIndex   = '99999';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak  = 'break-word';
    div.style.boxSizing  = 'border-box';
    div.style.cursor     = 'text';

    // ── Initial content ──
    div.textContent = ta.value;
    this._lastText = ta.value;

    document.body.appendChild(div);
    this.div = div;

    // ── Make the real textarea invisible but in-layout ──
    ta.dataset.agpHidden = '1';
    ta.style.cssText += ';color:transparent!important;caret-color:transparent!important;-webkit-text-fill-color:transparent!important;background:transparent!important;resize:none!important;';
    // Keep pointer-events on ta so that focus click still works (we forward it)

    this._updatePosition();
    this._bindEvents();

    // ── Observe textarea size changes (user might resize via CSS animation etc.) ──
    this._ro = new ResizeObserver(() => this._schedulePositionUpdate());
    this._ro.observe(ta);
  }

  _updatePosition() {
    const rect = this.ta.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const s = this.div.style;
    s.top    = rect.top    + 'px';
    s.left   = rect.left   + 'px';
    s.width  = rect.width  + 'px';
    s.height = rect.height + 'px';
  }

  _schedulePositionUpdate() {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = null;
      if (!this._destroyed) this._updatePosition();
    });
  }

  _bindEvents() {
    const div = this.div;
    const ta  = this.ta;

    // ── Input → normalize DOM first, then sync to textarea ──
    // Normalization converts any <br>/<div> Chrome inserted into plain \n
    // text nodes so cursor offsets stay consistent before and after grammar
    // check rebuilds the HTML.
    div.addEventListener('input', () => {
      normalizeOverlayDOM(div);
      this._syncToTextarea();
    });

    // ── Paste: force plain text ──
    div.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // ── Enter: intercept via beforeinput (fires before Chrome restructures the DOM)
    //    Use direct Range insertion instead of execCommand to guarantee a literal
    //    \n text character — execCommand can still produce <br> in some builds.
    div.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();                          // remove any selection
        const nl = document.createTextNode('\n');
        range.insertNode(nl);                            // insert literal \n
        range.setStartAfter(nl);                         // move cursor past it
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        // Trigger input so _syncToTextarea + scheduleCheck run
        div.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
      }
    });

    // ── Tab / Escape (keydown is fine for these — no DOM restructuring risk) ──
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) ta.form && [...ta.form.elements].forEach((el, i, arr) => {
          if (el === ta && arr[i-1]) arr[i-1].focus();
        });
        else ta.form && [...ta.form.elements].forEach((el, i, arr) => {
          if (el === ta && arr[i+1]) arr[i+1].focus();
        });
        return;
      }
      if (e.key === 'Escape') ErrorTooltip.hide();
    });

    // ── Clicking the real textarea → forward focus to overlay ──
    ta.addEventListener('click', () => div.focus(), true);
    ta.addEventListener('focus', () => div.focus(), true);

    // ── Forward focus/blur events to textarea for form libraries ──
    div.addEventListener('focus', () => ta.dispatchEvent(new FocusEvent('focus', { bubbles: true })));
    div.addEventListener('blur',  () => ta.dispatchEvent(new FocusEvent('blur',  { bubbles: true })));

    // ── Error span click → show tooltip ──
    div.addEventListener('click', (e) => {
      const span = e.target.closest('.agp-err');
      if (span) {
        e.stopPropagation();
        ErrorTooltip.show(span, (replacement) => this._applyReplacement(span, replacement));
      } else {
        ErrorTooltip.hide();
      }
    });
  }

  // Called when value is changed externally (e.g., form reset)
  syncFromTextarea() {
    const val = this.ta.value;
    if (val !== this._lastText) {
      this.div.textContent = val;
      this._lastText = val;
    }
  }

  _syncToTextarea() {
    const text = getOverlayText(this.div);
    this._lastText = text;

    // Use native setter so React / Vue interceptors fire properly
    const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    nativeSet.call(this.ta, text);
    this.ta.dispatchEvent(new Event('input',  { bubbles: true }));
    this.ta.dispatchEvent(new Event('change', { bubbles: true }));
  }

  getText() { return getOverlayText(this.div); }

  applyErrors(matches) {
    const text = getOverlayText(this.div);
    applyErrorsAsHTML(this.div, text, matches);
    // Re-attach click delegation (innerHTML wipe removed old listeners — they're delegated, OK)
  }

  clearErrors() {
    const hasFocus = document.activeElement === this.div || this.div.contains(document.activeElement);
    const cur = hasFocus ? getOverlayCursorOffset(this.div) : null;
    const rawText = getOverlayText(this.div);
    this.div.textContent = rawText; // strips spans, newlines preserved via pre-wrap
    // Re-add phantom BR if text ends with \n
    if (rawText.endsWith('\n')) {
      const ph = document.createElement('br');
      ph.className = 'agp-phantom';
      this.div.appendChild(ph);
    }
    if (cur !== null) setCursorOffset(this.div, cur);
  }

  onPageScroll() { this._schedulePositionUpdate(); }

  destroy() {
    this._destroyed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._ro) this._ro.disconnect();
    if (this.div) this.div.remove();
    // Restore textarea
    const ta = this.ta;
    ta.style.color = '';
    ta.style.caretColor = '';
    ta.style.webkitTextFillColor = '';
    ta.style.background = '';
    ta.style.resize = '';
    delete ta.dataset.agpHidden;
  }
}

// ─── Error Tooltip ───────────────────────────────────────────────────────────
//
// Singleton. Appears directly below the clicked error <span>.
//
const ErrorTooltip = (() => {
  let el = null;

  function build() {
    el = document.createElement('div');
    el.className = 'agp-tooltip';
    el.setAttribute('data-agp-ui', 'true');
    document.body.appendChild(el);

    // Close on outside click
    document.addEventListener('mousedown', (e) => {
      if (el && !el.contains(e.target) && !e.target.closest('.agp-err')) hide();
    }, true);
  }

  function show(span, onApply) {
    if (!el) build();

    let m;
    try { m = JSON.parse(span.dataset.m); } catch (_) { return; }

    const cat = [...span.classList].find(c => c.startsWith('agp-err-'))?.replace('agp-err-','') || 'grammar';
    const catLabel = { spelling:'Spelling', grammar:'Grammar', punctuation:'Punctuation', style:'Style' }[cat] || 'Issue';
    const catIcon  = { spelling:'🔤', grammar:'📐', punctuation:'✎', style:'🎨' }[cat] || '🔍';

    let html = `
      <div class="agp-tooltip-header">
        <span class="agp-tooltip-category agp-tooltip-cat-${cat}">${catIcon} ${catLabel}</span>
        <button class="agp-tooltip-close" title="Dismiss">×</button>
      </div>
      <div class="agp-tooltip-message">${escHtml(m.message)}</div>`;

    if (m.replacements && m.replacements.length > 0) {
      html += `<div class="agp-tooltip-label">Suggestions</div><div class="agp-tooltip-chips">`;
      m.replacements.forEach((r, i) => {
        html += `<button class="agp-chip" data-idx="${i}">${escHtml(r)}</button>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="agp-tooltip-no-sugg">No suggestions available</div>`;
    }
    html += `<div class="agp-tooltip-actions">
      <button class="agp-tooltip-ignore">Ignore</button>
    </div>`;

    el.innerHTML = html;
    el.style.display = 'block';

    // Position below the span
    const rect = span.getBoundingClientRect();
    const ttW = 280;
    let left = rect.left;
    if (left + ttW > window.innerWidth - 8) left = window.innerWidth - ttW - 8;
    el.style.left = Math.max(8, left) + 'px';
    el.style.top  = (rect.bottom + 6) + 'px';

    // Bind chips
    el.querySelectorAll('.agp-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = m.replacements[+btn.dataset.idx];
        if (txt !== undefined) onApply(txt);
        hide();
      });
    });

    el.querySelector('.agp-tooltip-close').addEventListener('click', hide);
    el.querySelector('.agp-tooltip-ignore').addEventListener('click', () => {
      // Unwrap span, keep text
      span.replaceWith(document.createTextNode(span.textContent));
      span.parentNode?.normalize();
      hide();
    });
  }

  function hide() {
    if (el) el.style.display = 'none';
  }

  return { show, hide };
})();

// ─── Grammar Controller ───────────────────────────────────────────────────────
//
// Manages one check-per-element, debounced, with caching.
//
const overlays  = new WeakMap(); // textarea  → TextareaOverlay
const ceStates  = new WeakSet(); // contenteditable elements we're managing
let   lastChecked = new WeakMap(); // element → last checked text
let   checkTimers = new WeakMap(); // element → timer id

function getOverlay(ta) { return overlays.get(ta) || null; }

function ensureOverlay(textarea) {
  if (overlays.has(textarea)) return overlays.get(textarea);
  const ov = new TextareaOverlay(textarea);
  overlays.set(textarea, ov);
  return ov;
}

async function checkElement(el) {
  const isTA = el.tagName === 'TEXTAREA';
  const ov   = isTA ? getOverlay(el) : null;

  const text = isTA
    ? (ov ? ov.getText() : el.value)
    : (el.textContent || el.innerText || '');

  if (text === lastChecked.get(el)) return;   // nothing changed
  if (text.trim().length < 10) {
    clearErrors(el);
    return;
  }

  lastChecked.set(el, text);

  try {
    const res = await sendMessage({ action: 'checkText', text, grammarOnly: true });
    if (!res || res.error) { clearErrors(el); return; }

    const matches = (res.grammar || []);

    if (isTA && ov) {
      ov.applyErrors(matches);
    } else if (!isTA) {
      injectErrorSpans(el, matches);
    }

    // Update the floating button badge
    FloatingButton.setCount(matches.length);

  } catch (err) {
    clearErrors(el);
  }
}

function scheduleCheck(el) {
  if (checkTimers.has(el)) clearTimeout(checkTimers.get(el));
  const delay = userSettings.checkDelay || 1200;
  checkTimers.set(el, setTimeout(() => checkElement(el), delay));
}

function clearErrors(el) {
  const isTA = el.tagName === 'TEXTAREA';
  if (isTA) {
    const ov = getOverlay(el);
    if (ov) ov.clearErrors();
  } else {
    clearErrorSpans(el);
  }
  FloatingButton.setCount(0);
}

// ─── Apply replacement from tooltip ──────────────────────────────────────────

TextareaOverlay.prototype._applyReplacement = function(span, replacement) {
  // Replace span with plain text
  span.replaceWith(document.createTextNode(replacement));
  this.div.normalize();
  this._syncToTextarea();
  // Re-check after correction
  scheduleCheck(this.ta);
};

function applyReplacementInCE(el, span, replacement) {
  span.replaceWith(document.createTextNode(replacement));
  el.normalize();
  el.dispatchEvent(new Event('input', { bubbles: true }));
  scheduleCheck(el);
}

// ─── Floating Button ─────────────────────────────────────────────────────────
//
// Small icon button that appears near the active field.
// Shows error count badge and opens the AI panel on click.
//
const FloatingButton = (() => {
  let btn = null;
  let currentEl = null;
  let count = 0;
  let rafId = null;

  function build() {
    btn = document.createElement('button');
    btn.className = 'agp-float-btn';
    btn.type = 'button';
    btn.title = 'AI Grammar & Rephrase (Ctrl+Shift+G)';
    btn.setAttribute('data-agp-ui', 'true');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180" width="28" height="28">
        <path fill="#588D3F" stroke="#FFF" stroke-width="10" d="M175 90A85 85 0 0 1 90 175 85 85 0 0 1 5 90a85 85 0 0 1 170 0z"/>
        <path fill="none" stroke="#FFF" stroke-width="10" d="M50 35h80l15 15v80a15 15 0 0 1-15 15H50a15 15 0 0 1-15-15V50a15 15 0 0 1 15-15z"/>
        <path fill="#F4F6F9" d="m80.85 65.63-15.22 48.75h6.32l4.56-15.12H92.1l4.71 15.12h6.47l-15.15-48.75zm-3.16 28.86 4.19-13.6c.88-3.04 1.62-6.36 2.28-9.47h.22c.66 3.04 1.4 6.29 2.35 9.55l4.26 13.52zm35.3-28.65a3.75 3.75 0 0 0-3.82 3.91c0 2.17 1.54 3.83 3.75 3.83h.07a3.66 3.66 0 0 0 3.83-3.83c0-2.24-1.54-3.91-3.83-3.91m-3.02 13.52h6.18v35.01h-6.18z"/>
      </svg>`;
    document.body.appendChild(btn);
    btn.addEventListener('click', () => {
      if (currentEl) AIPanel.open(currentEl);
    });
  }

  function attach(el) {
    if (!btn) build();
    currentEl = el;
    update();
    btn.style.display = 'flex';
  }

  function detach() {
    if (btn) btn.style.display = 'none';
    currentEl = null;
  }

  function update() {
    if (!btn || !currentEl) return;
    const isTA = currentEl.tagName === 'TEXTAREA';
    const source = isTA ? (getOverlay(currentEl)?.div || currentEl) : currentEl;
    const rect = source.getBoundingClientRect
      ? source.getBoundingClientRect()
      : currentEl.getBoundingClientRect();

    btn.style.top  = (rect.top + window.scrollY + 2) + 'px';
    btn.style.left = (rect.right + window.scrollX - 34) + 'px';
  }

  function scheduleUpdate() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; update(); });
  }

  function setCount(n) {
    count = n;
    if (!btn) return;
    btn.querySelector('.agp-badge')?.remove();
    btn.classList.toggle('agp-float-btn--errors', n > 0);
    if (n > 0) {
      const badge = document.createElement('span');
      badge.className = 'agp-badge';
      badge.textContent = n > 99 ? '99+' : n;
      btn.appendChild(badge);
    }
  }

  function setLoading(on) {
    btn?.classList.toggle('agp-float-btn--loading', on);
  }

  return { attach, detach, update, scheduleUpdate, setCount, setLoading };
})();

// ─── AI Panel ────────────────────────────────────────────────────────────────
//
// Centered dialog for rephrase styles + AI output.
//
const AIPanel = (() => {
  let panel = null;
  let currentEl = null;
  let selectedStyle = 'original';
  let originalText = '';
  let aiResult = '';

  function open(el) {
    close();
    currentEl = el;
    originalText = el.tagName === 'TEXTAREA'
      ? (getOverlay(el)?.getText() ?? el.value)
      : (el.textContent || el.innerText || '');

    if (originalText.trim().length < 3) {
      showToast('Please enter some text first', 'warning');
      return;
    }

    panel = document.createElement('div');
    panel.className = 'agp-panel';
    panel.setAttribute('data-agp-ui', 'true');

    panel.innerHTML = `
      <div class="agp-panel-header" data-drag-handle>
        <div class="agp-panel-title">✨ AI Grammar &amp; Rephrase</div>
        <button class="agp-panel-close">×</button>
      </div>
      <div class="agp-panel-body">
        <div class="agp-style-label">REPHRASE STYLE</div>
        <div class="agp-style-grid" id="agp-style-grid"></div>
        <div class="agp-response-box" id="agp-response">
          <span class="agp-response-placeholder">Select a style to rephrase your text</span>
        </div>
      </div>
      <div class="agp-panel-footer">
        <button class="agp-btn agp-btn-secondary" id="agp-copy">📋 Copy</button>
        <button class="agp-btn agp-btn-primary"   id="agp-apply">✓ Apply</button>
      </div>`;

    document.body.appendChild(panel);
    makeDraggable(panel, panel.querySelector('[data-drag-handle]'));

    panel.querySelector('.agp-panel-close').onclick = close;
    panel.querySelector('#agp-copy').onclick = () => {
      const t = aiResult || originalText;
      navigator.clipboard?.writeText(t).catch(() => {}).finally(() => showToast('Copied!', 'success'));
    };
    panel.querySelector('#agp-apply').onclick = () => {
      const t = aiResult || originalText;
      if (!t) return;
      applyTextToElement(currentEl, t);
      close();
      showToast('Applied!', 'success');
    };

    buildStyleGrid();

    // Click outside → close
    setTimeout(() => {
      document.addEventListener('mousedown', outsideClose, true);
    }, 50);
  }

  function outsideClose(e) {
    if (panel && !panel.contains(e.target) && !e.target.closest('[data-agp-ui]')) {
      close();
    }
  }

  function close() {
    document.removeEventListener('mousedown', outsideClose, true);
    panel?.remove();
    panel = null;
  }

  async function buildStyleGrid() {
    const grid = document.getElementById('agp-style-grid');
    if (!grid) return;

    // Original button
    addStyleBtn(grid, 'original', '📄', 'Original', true);

    try {
      const res = await sendMessage({ action: 'getStylePrompts' });
      Object.entries(res.styles || {}).forEach(([key, info]) => {
        addStyleBtn(grid, key, info.icon, info.label, false);
      });
    } catch (_) {}
  }

  function addStyleBtn(grid, key, icon, label, active) {
    const btn = document.createElement('button');
    btn.className = 'agp-style-btn' + (active ? ' agp-style-btn--active' : '');
    btn.dataset.key = key;
    btn.innerHTML = `<span class="agp-style-icon">${icon}</span>${escHtml(label)}`;
    btn.onclick = () => selectStyle(key);
    grid.appendChild(btn);
  }

  async function selectStyle(key) {
    selectedStyle = key;
    document.querySelectorAll('.agp-style-btn').forEach(b => {
      b.classList.toggle('agp-style-btn--active', b.dataset.key === key);
    });

    const box = document.getElementById('agp-response');
    if (!box) return;

    if (key === 'original') {
      aiResult = '';
      box.textContent = originalText;
      return;
    }

    box.innerHTML = '<span class="agp-response-placeholder">⏳ Rephrasing…</span>';
    FloatingButton.setLoading(true);

    try {
      const res = await sendMessage({ action: 'checkText', text: originalText, style: key, grammarOnly: false });
      if (res && res.ai) {
        aiResult = res.ai;
        box.textContent = res.ai;
      } else {
        box.innerHTML = `<span class="agp-response-error">❌ ${escHtml(res?.error || 'Rephrase failed')}</span>`;
      }
    } catch (e) {
      box.innerHTML = `<span class="agp-response-error">❌ ${escHtml(e.message)}</span>`;
    } finally {
      FloatingButton.setLoading(false);
    }
  }

  return { open, close };
})();

// ─── Text apply helper ────────────────────────────────────────────────────────

function applyTextToElement(el, text) {
  if (el.tagName === 'TEXTAREA') {
    const ov = getOverlay(el);
    if (ov) {
      ov.div.textContent = text;
      ov._syncToTextarea();
    } else {
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      nativeSet.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  scheduleCheck(el);
}

// ─── Draggable panel helper ───────────────────────────────────────────────────

function makeDraggable(el, handle) {
  let dragging = false, ox = 0, oy = 0;
  handle.style.cursor = 'move';

  // Center initially
  const vw = window.innerWidth, vh = window.innerHeight;
  el.style.position = 'fixed';
  el.style.left = Math.max(0, (vw - el.offsetWidth)  / 2) + 'px';
  el.style.top  = Math.max(0, (vh - el.offsetHeight) / 2) + 'px';

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    const r = el.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    el.classList.add('agp-panel--dragging');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    el.style.left = Math.max(0, e.clientX - ox) + 'px';
    el.style.top  = Math.max(0, e.clientY - oy) + 'px';
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    el.classList.remove('agp-panel--dragging');
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `agp-toast agp-toast--${type}`;
  t.setAttribute('data-agp-ui', 'true');
  const icon = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' }[type] || 'ℹ';
  t.innerHTML = `<span class="agp-toast-icon">${icon}</span><span>${escHtml(msg)}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('agp-toast--show'));
  setTimeout(() => {
    t.classList.remove('agp-toast--show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// ─── Element helpers ──────────────────────────────────────────────────────────

function isEditableTextarea(el) {
  return el &&
    el.tagName === 'TEXTAREA' &&
    !el.disabled &&
    !el.readOnly &&
    el.offsetWidth > 0 &&
    // Ignore our own overlay-generated textareas (none, but safety)
    !el.dataset.agpInternal;
}

function isEditableContenteditable(el) {
  return el &&
    (el.isContentEditable || el.contentEditable === 'true') &&
    !el.dataset.agpOverlay &&
    !el.getAttribute('data-agp-overlay') &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0;
}

// ─── Focus / input tracking ───────────────────────────────────────────────────

let currentEl = null;

document.addEventListener('focusin', (e) => {
  const target = e.target;

  // Ignore our own UI elements
  if (target.getAttribute('data-agp-ui') || target.getAttribute('data-agp-overlay')) return;
  if (target.closest('[data-agp-ui]')) return;

  if (isEditableTextarea(target)) {
    currentEl = target;
    const ov = ensureOverlay(target);
    ov.div.focus();           // hand off focus to overlay
    FloatingButton.attach(target);

    if (userSettings.autoCheck && target.value.trim().length >= 10) {
      scheduleCheck(target);
    }
    return;
  }

  if (isEditableContenteditable(target)) {
    currentEl = target;
    FloatingButton.attach(target);
    if (userSettings.autoCheck && target.textContent.trim().length >= 10) {
      scheduleCheck(target);
    }
  }
}, true);

document.addEventListener('focusout', (e) => {
  // Use a longer delay to survive micro-blurs caused by DOM manipulation
  // (e.g. normalizeOverlayDOM calling removeAllRanges during input events).
  setTimeout(() => {
    const ae = document.activeElement;

    // Keep everything alive if focus is on ANY of our UI elements
    if (ae && (
      ae.getAttribute('data-agp-overlay') ||
      ae.getAttribute('data-agp-ui')      ||
      ae.closest('[data-agp-ui]')         ||
      ae.closest('[data-agp-overlay]')
    )) return;

    // Keep alive if ae is body/null and currentEl still has meaningful text —
    // this is a micro-blur from DOM normalization, not a real focus departure.
    if ((!ae || ae === document.body) && currentEl) {
      const text = currentEl.tagName === 'TEXTAREA'
        ? (getOverlay(currentEl)?.getText() ?? currentEl.value)
        : (currentEl.textContent || '');
      if (hasSentence(text)) return;   // user is mid-sentence, stay visible
    }

    if (currentEl && ae !== currentEl && !currentEl.contains(ae)) {
      const ov = currentEl.tagName === 'TEXTAREA' ? getOverlay(currentEl) : null;
      if (ov && ae === ov.div) return;

      FloatingButton.detach();
      ErrorTooltip.hide();
      currentEl = null;
    }
  }, 300);   // 300ms — long enough to outlast any DOM-manipulation micro-blur
}, true);

// Helper: does the text contain at least one meaningful sentence?
function hasSentence(text) {
  if (!text || text.trim().length < 8) return false;
  // Must have a word (not just punctuation/spaces)
  return /\w{2,}/.test(text.trim());
}

// ── Input events: normalize (overlay), re-show button if enough text, schedule check ──
document.addEventListener('input', (e) => {
  const target = e.target;

  if (target.getAttribute('data-agp-overlay')) {
    // Find the textarea this overlay belongs to
    const ta = [...document.querySelectorAll('textarea[data-agp-hidden]')]
      .find(t => getOverlay(t)?.div === target);
    if (ta) {
      // Show/keep the floating button whenever there's meaningful text
      if (hasSentence(getOverlayText(target))) {
        FloatingButton.attach(ta);
      }
      scheduleCheck(ta);
    }
    return;
  }

  if (isEditableContenteditable(target)) {
    if (hasSentence(target.textContent)) {
      FloatingButton.attach(target);
    }
    scheduleCheck(target);
  }
}, true);

// ─── Global click: error spans in real contenteditable elements ───────────────
document.addEventListener('click', (e) => {
  const span = e.target.closest('.agp-err');
  if (!span) return;
  const host = span.closest('[contenteditable="true"]');
  if (!host || host.getAttribute('data-agp-overlay')) return;
  e.stopPropagation();
  ErrorTooltip.show(span, (replacement) => applyReplacementInCE(host, span, replacement));
}, true);

// ─── Page scroll / resize: update overlay positions ──────────────────────────

function onPageScroll() {
  // Update ALL active textarea overlays
  overlays && document.querySelectorAll('textarea[data-agp-hidden]').forEach(ta => {
    const ov = getOverlay(ta);
    if (ov) ov.onPageScroll();
  });
  FloatingButton.scheduleUpdate();
}

window.addEventListener('scroll', onPageScroll, { passive: true, capture: true });
window.addEventListener('resize', onPageScroll, { passive: true });

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (!userSettings.enableShortcuts) return;

  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
    e.preventDefault();
    if (currentEl) AIPanel.open(currentEl);
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    if (currentEl) AIPanel.open(currentEl);
  }
  if (e.key === 'Escape') {
    ErrorTooltip.hide();
    AIPanel.close();
  }
});

// ─── Context menu / background messages ──────────────────────────────────────

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === 'contextMenuAction' || req.action === 'keyboardShortcut') {
    if (currentEl) AIPanel.open(currentEl);
  }
  if (req.action === 'updateTheme') applyTheme(req.theme);
});

// ─── MutationObserver: watch for dynamically added textareas ─────────────────

const mutObs = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      // Nothing to do eagerly; overlays are created on focus.
    }
  }
});
mutObs.observe(document.body, { childList: true, subtree: true });

// ─── Extension reload banner ──────────────────────────────────────────────────

let reloadShown = false;
function showReloadBanner() {
  if (reloadShown || document.getElementById('agp-reload')) return;
  reloadShown = true;
  const b = document.createElement('div');
  b.id = 'agp-reload';
  b.setAttribute('data-agp-ui', 'true');
  b.className = 'agp-reload';
  b.innerHTML = `🔄 <strong>Extension updated.</strong> Please <button onclick="location.reload()">refresh the page</button> <button class="agp-reload-x" onclick="this.closest('#agp-reload').remove()">×</button>`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 12000);
}
