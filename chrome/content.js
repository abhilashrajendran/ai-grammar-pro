/**
 * AI Grammar Pro+ - Content Script v4.1
 * With comprehensive error handling and debugging
 */

// State Management
let checkTimer = null;
let mirrorDiv = null;
let currentMatches = [];
let currentTarget = null;
let floatingButton = null;
let currentPopup = null;
let currentAIResponse = null;
let currentSelectedStyle = 'original';
let originalText = '';
let userSettings = null;
let lastCheckedText = '';
let isCheckingInProgress = false;
const observedTextareas = new WeakSet();
const DEBOUNCE_DELAY = 1000;
const MIN_TEXT_LENGTH = 3;

// Extension Health Check
let isExtensionValid = true;
let hasShownReloadPrompt = false;

function checkExtensionHealth() {
    try {
        if (!chrome.runtime || !chrome.runtime.id) {
            isExtensionValid = false;
            return false;
        }
        isExtensionValid = true;
        return true;
    } catch (error) {
        isExtensionValid = false;
        return false;
    }
}

setInterval(checkExtensionHealth, 5000);

// Theme Management
function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('agp-theme-light', 'agp-theme-dark');

    if (theme === 'light') {
        root.classList.add('agp-theme-light');
    } else if (theme === 'dark') {
        root.classList.add('agp-theme-dark');
    }
}

// Settings Management
async function loadSettings() {
    try {
        if (!checkExtensionHealth()) {
            console.warn('[AGP] Extension invalid, using defaults');
            return getDefaultSettings();
        }

        const response = await sendMessage({ action: 'getSettings' });
        if (response && response.settings) {
            userSettings = response.settings;
            applyTheme(response.settings.theme || 'auto');
            console.log('[AGP] Settings loaded');
            return response.settings;
        }
    } catch (error) {
        console.error('[AGP] Load settings failed:', error);
    }

    return getDefaultSettings();
}

function getDefaultSettings() {
    return {
        languageToolUrl: 'http://192.168.6.2:8010/v2/check',
        ollamaUrl: 'http://192.168.6.2:30068/api/generate',
        ollamaModel: 'llama3.2:1b',
        autoCheck: true,
        checkDelay: 1000,
        enabledStyles: ['professional', 'casual', 'short', 'academic', 'creative', 'technical', 'simple', 'expand'],
        theme: 'auto',
        showStatistics: true,
        enableShortcuts: true
    };
}

loadSettings().then(settings => {
    userSettings = settings;
});

// Messaging Helper
function sendMessage(message) {
    return new Promise((resolve, reject) => {
        if (!checkExtensionHealth()) {
            reject(new Error('Extension reloaded. Refresh page.'));
            return;
        }

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    const error = chrome.runtime.lastError;
                    console.error('[AGP] Runtime error:', error);

                    if (error.message && error.message.includes('Extension context invalidated')) {
                        isExtensionValid = false;
                        reject(new Error('Extension reloaded. Refresh page.'));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve(response);
                }
            });
        } catch (error) {
            console.error('[AGP] Send message error:', error);
            reject(error);
        }
    });
}

// Textarea Detection
function isTextarea(element) {
    return element &&
        element.tagName === 'TEXTAREA' &&
        !element.disabled &&
        !element.readOnly &&
        element.offsetWidth > 0 &&
        element.offsetHeight > 0;
}

function getTextFromTextarea(textarea) {
    return textarea?.value || '';
}

function setTextInTextarea(textarea, text) {
    if (!textarea) return;

    const start = textarea.selectionStart;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    try {
        textarea.setSelectionRange(start, start);
    } catch (e) { }
}

function replaceTextRange(textarea, offset, length, replacement) {
    const text = getTextFromTextarea(textarea);
    const newText = text.slice(0, offset) + replacement + text.slice(offset + length);
    setTextInTextarea(textarea, newText);

    setTimeout(() => {
        if (currentTarget === textarea) {
            checkText(textarea);
        }
    }, 100);
}

// Floating Button
function createFloatingButton(textarea) {
    if (!textarea || !isTextarea(textarea)) return;

    if (floatingButton && floatingButton._textarea === textarea) {
        positionFloatingButton(textarea);
        return;
    }

    removeFloatingButton();

    floatingButton = document.createElement('button');
    floatingButton.className = 'agp-float-btn';
    floatingButton.setAttribute('type', 'button');
    floatingButton.setAttribute('title', 'Check grammar (Ctrl+Shift+G)');
    floatingButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
        </svg>
    `;

    document.body.appendChild(floatingButton);
    positionFloatingButton(textarea);

    floatingButton.addEventListener('click', () => performCheck(textarea));
    floatingButton._textarea = textarea;
}

function positionFloatingButton(textarea) {
    if (!floatingButton || !textarea) return;

    const rect = textarea.getBoundingClientRect();
    floatingButton.style.top = `${rect.top + window.scrollY + 8}px`;
    floatingButton.style.left = `${rect.right + window.scrollX - 48}px`;
}

function updateFloatingButton(errorCount) {
    if (!floatingButton) return;

    const existingBadge = floatingButton.querySelector('.agp-error-badge');
    if (existingBadge) existingBadge.remove();

    if (errorCount > 0) {
        floatingButton.classList.add('has-errors');

        const badge = document.createElement('span');
        badge.className = 'agp-error-badge';
        badge.textContent = errorCount > 99 ? '99+' : errorCount;
        floatingButton.appendChild(badge);
    } else {
        floatingButton.classList.remove('has-errors');
    }
}

function setButtonLoading(isLoading) {
    if (!floatingButton) return;
    floatingButton.classList.toggle('loading', isLoading);
    floatingButton.disabled = isLoading;
}

function removeFloatingButton() {
    if (floatingButton) {
        floatingButton.remove();
        floatingButton = null;
    }
}

// Mirror Layer
function createMirror(textarea) {
    if (!textarea) return;
    if (mirrorDiv) mirrorDiv.remove();

    mirrorDiv = document.createElement('div');
    mirrorDiv.className = 'agp-mirror';

    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);

    Object.assign(mirrorDiv.style, {
        position: 'absolute',
        top: `${rect.top + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: style.width,
        height: style.height,
        padding: style.padding,
        border: 'none',
        font: style.font,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflow: 'hidden',
        color: 'transparent',
        background: 'transparent'
    });

    document.body.appendChild(mirrorDiv);
}

function updateMirror(textarea, matches) {
    if (!textarea || !mirrorDiv) return;

    const text = getTextFromTextarea(textarea);

    // Clear current content completely
    mirrorDiv.innerHTML = '';

    let lastIndex = 0;

    matches.forEach((match, idx) => {
        const start = match.offset;
        const end = match.offset + match.length;

        // 1. Append text occurring BEFORE the error
        const textBefore = text.slice(lastIndex, start);
        if (textBefore) {
            mirrorDiv.appendChild(document.createTextNode(textBefore));
        }

        // 2. Create and append the interactive error span
        const errorSpan = document.createElement('span');
        errorSpan.className = 'agp-error-highlight';
        errorSpan.setAttribute('data-match-index', idx);
        errorSpan.textContent = text.slice(start, end);

        // The event listener is preserved because we are appending the Element, not a string
        errorSpan.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from focusing the textarea below immediately
            showGrammarPopup(match, textarea);
        });

        mirrorDiv.appendChild(errorSpan);

        lastIndex = end;
    });

    // 3. Append any remaining text after the last error
    const textAfter = text.slice(lastIndex);
    if (textAfter) {
        mirrorDiv.appendChild(document.createTextNode(textAfter));
    }
}

function clearMirror() {
    if (mirrorDiv) {
        mirrorDiv.remove();
        mirrorDiv = null;
    }
}

// Grammar Checking
async function checkText(textarea) {
    if (!textarea || !isTextarea(textarea) || isCheckingInProgress) return;

    const text = getTextFromTextarea(textarea);

    if (text.trim().length < MIN_TEXT_LENGTH) {
        clearMirror();
        currentMatches = [];
        updateFloatingButton(0);
        return;
    }

    if (text === lastCheckedText) return;

    isCheckingInProgress = true;
    setButtonLoading(true);
    lastCheckedText = text;

    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            grammarOnly: true
        });

        console.log('[AGP] Check response:', response);

        if (response && response.error) {
            console.warn('[AGP] Error:', response.error);
            currentMatches = [];
            clearMirror();
        } else if (response) {
            currentMatches = response.grammar || [];
            createMirror(textarea);
            updateMirror(textarea, currentMatches);
            updateFloatingButton(currentMatches.length);
        }
    } catch (error) {
        console.error('[AGP] Check failed:', error);
        currentMatches = [];
        clearMirror();
        updateFloatingButton(0);
    } finally {
        isCheckingInProgress = false;
        setButtonLoading(false);
    }
}

async function performCheck(textarea) {
    if (!textarea || !isTextarea(textarea)) return;

    if (!checkExtensionHealth()) {
        showPageReloadPrompt();
        return;
    }

    const text = getTextFromTextarea(textarea);

    if (text.trim().length < MIN_TEXT_LENGTH) {
        showToast('Please enter some text first', 'warning');
        return;
    }

    // Store original text for the "Original" button
    originalText = text;
    // Reset to original style when opening popup
    currentSelectedStyle = 'original';
    currentAIResponse = null;

    setButtonLoading(true);

    try {
        console.log('[AGP] Performing check...', {
            textLength: text.length,
            style: currentSelectedStyle
        });

        const response = await sendMessage({
            action: 'checkText',
            text: text,
            style: currentSelectedStyle,
            grammarOnly: true  // Only check grammar initially, no AI processing
        });

        console.log('[AGP] Response:', response);

        if (response && response.error) {
            console.error('[AGP] Error:', response.error);
            showToast(response.error, 'error');
        } else if (response) {
            currentMatches = response.grammar || [];
            currentAIResponse = response.ai || null;

            console.log('[AGP] Results:', {
                grammar: currentMatches.length,
                ai: !!currentAIResponse
            });

            createMirror(textarea);
            updateMirror(textarea, currentMatches);
            updateFloatingButton(currentMatches.length);
            createAIPopup(textarea);
        } else {
            showToast('No response from background', 'error');
        }
    } catch (error) {
        console.error('[AGP] Check failed:', error);

        if (error.message && error.message.includes('refresh')) {
            showPageReloadPrompt();
        } else {
            showToast('Check failed. Verify services are running:\n• http://192.168.6.2:8010\n• http://192.168.6.2:30068', 'error');
        }
    } finally {
        setButtonLoading(false);
    }
}

// Grammar Popup
function showGrammarPopup(match, textarea) {
    closeAllPopups();

    const popup = document.createElement('div');
    popup.id = 'agp-grammar-popup';
    popup.className = 'agp-popup agp-grammar-popup';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'agp-popup-header';
    headerDiv.innerHTML = '<div class="agp-popup-title"><span class="agp-popup-title-icon">🔍</span>Grammar Suggestion</div><button class="agp-close-btn" onclick="this.closest(\'.agp-popup\').remove()">×</button>';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'agp-popup-body';

    const messageDiv = document.createElement('div');
    messageDiv.className = 'agp-suggestion-message';
    messageDiv.textContent = match.message || 'Possible error detected';
    bodyDiv.appendChild(messageDiv);

    if (match.replacements && match.replacements.length > 0) {
        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'agp-suggestions';

        match.replacements.slice(0, 5).forEach(replacement => {
            const suggestionChip = document.createElement('div');
            suggestionChip.className = 'agp-suggestion-value clickable';
            suggestionChip.title = 'Click to apply correction';
            suggestionChip.textContent = replacement.value;

            suggestionChip.onclick = () => {
                replaceTextRange(textarea, match.offset, match.length, replacement.value);
                popup.remove();
                showToast('Applied', 'success');
            };

            suggestionsContainer.appendChild(suggestionChip);
        });

        bodyDiv.appendChild(suggestionsContainer);
    } else {
        bodyDiv.innerHTML += '<div class="agp-empty-state"><p>No suggestions</p></div>';
    }

    popup.appendChild(headerDiv);
    popup.appendChild(bodyDiv);

    document.body.appendChild(popup);
    currentPopup = popup;

    const rect = textarea.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.top + window.scrollY - 10}px`;
    popup.style.left = `${rect.left + window.scrollX + 20}px`;

    makeDraggable(popup, headerDiv);
}

// AI Popup
function createAIPopup(textarea) {
    closeAllPopups();

    const popup = document.createElement('div');
    popup.id = 'agp-ai-popup';
    popup.className = 'agp-popup';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'agp-popup-header';
    headerDiv.innerHTML = '<div class="agp-popup-title"><span class="agp-popup-title-icon">✨</span>AI Grammar & Rephrase</div><button class="agp-close-btn" onclick="this.closest(\'.agp-popup\').remove()">×</button>';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'agp-popup-body';

    if (currentMatches.length > 0) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'agp-error-message';
        statsDiv.textContent = `Found ${currentMatches.length} grammar issue${currentMatches.length !== 1 ? 's' : ''}. Click underlined text for suggestions.`;
        bodyDiv.appendChild(statsDiv);
    }
    loadAndDisplayStyleButtons(bodyDiv, textarea);

    popup.appendChild(headerDiv);
    popup.appendChild(bodyDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'agp-popup-actions';
    actionsDiv.innerHTML = `
        <button class="agp-btn agp-btn-secondary" id="copy-btn"><span class="agp-btn-icon">📋</span>Copy</button>
        <button class="agp-btn agp-btn-primary" id="apply-btn"><span class="agp-btn-icon">✓</span>Apply</button>
    `;

    actionsDiv.querySelector('#copy-btn').onclick = async () => {
        const textToCopy = currentAIResponse || originalText;
        if (textToCopy) {
            await copyToClipboard(textToCopy);
            showToast('Copied', 'success');
        }
    };

    actionsDiv.querySelector('#apply-btn').onclick = () => {
        const textToApply = currentAIResponse || originalText;
        if (textToApply) {
            setTextInTextarea(textarea, textToApply);
            popup.remove();
            showToast('Applied', 'success');
        }
    };

    popup.appendChild(actionsDiv);

    document.body.appendChild(popup);
    currentPopup = popup;

    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';

    makeDraggable(popup, headerDiv);
}

async function loadAndDisplayStyleButtons(container, textarea) {
    const stylesDiv = document.createElement('div');
    stylesDiv.className = 'agp-style-selector';
    stylesDiv.innerHTML = '<div class="agp-style-label">Rephrase Style:</div>';

    const styleGrid = document.createElement('div');
    styleGrid.className = 'agp-style-grid';

    // Always add "Original" button first (hardcoded, not from settings)
    const originalBtn = document.createElement('button');
    originalBtn.className = 'agp-style-btn';
    originalBtn.setAttribute('data-style-key', 'original');
    if (currentSelectedStyle === 'original') {
        originalBtn.classList.add('active');
    }
    originalBtn.innerHTML = `<span class="agp-style-icon">📄</span>Original`;
    originalBtn.onclick = () => switchStyle('original', styleGrid, textarea);
    styleGrid.appendChild(originalBtn);

    // Load AI rephrase styles from settings
    try {
        const response = await sendMessage({ action: 'getStylePrompts' });
        const styles = response.styles || {};

        Object.keys(styles).forEach(styleKey => {
            const styleInfo = styles[styleKey];
            const btn = document.createElement('button');
            btn.className = 'agp-style-btn';
            btn.setAttribute('data-style-key', styleKey);

            if (styleKey === currentSelectedStyle) {
                btn.classList.add('active');
            }

            btn.innerHTML = `<span class="agp-style-icon">${styleInfo.icon}</span>${styleInfo.label}`;
            btn.onclick = () => switchStyle(styleKey, styleGrid, textarea);
            styleGrid.appendChild(btn);
        });
    } catch (error) {
        console.error('[AGP] Load styles failed:', error);
    }

    stylesDiv.appendChild(styleGrid);
    container.appendChild(stylesDiv);

    const responseContainer = document.createElement('div');
    responseContainer.className = 'agp-ai-response-container';
    responseContainer.id = 'agp-ai-response-container';

    if (currentAIResponse) {
        responseContainer.innerHTML = `<div class="agp-ai-response">${escapeHtml(currentAIResponse)}</div>`;
    } else if (originalText) {
        // Show original text when no AI response is available
        responseContainer.innerHTML = `<div class="agp-ai-response">${escapeHtml(originalText)}</div>`;
    } else {
        responseContainer.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">💭</span>Select a style to rephrase</div>';
    }

    container.appendChild(responseContainer);
}

async function switchStyle(styleKey, styleGrid, textarea) {
    currentSelectedStyle = styleKey;

    styleGrid.querySelectorAll('.agp-style-btn').forEach(btn => btn.classList.remove('active'));

    const activeBtn = styleGrid.querySelector(`[data-style-key="${styleKey}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const container = document.getElementById('agp-ai-response-container');
    if (!container) return;

    // Handle "original" style - just show original text without API call
    if (styleKey === 'original') {
        currentAIResponse = null;
        container.innerHTML = `<div class="agp-ai-response">${escapeHtml(originalText)}</div>`;
        return;
    }

    container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">⏳</span>Rephrasing...</div>';

    const text = getTextFromTextarea(textarea);

    try {
        console.log('[AGP] Switching to:', styleKey);

        const response = await sendMessage({
            action: 'checkText',
            text: text,
            style: styleKey,
            grammarOnly: false
        });

        console.log('[AGP] Switch response:', response);

        if (response && response.ai) {
            currentAIResponse = response.ai;
            container.innerHTML = `<div class="agp-ai-response">${escapeHtml(response.ai)}</div>`;
        } else if (response && response.error) {
            console.error('[AGP] Error:', response.error);
            container.innerHTML = `<div class="agp-status-message"><span class="agp-status-icon">❌</span>${escapeHtml(response.error)}</div>`;
        } else {
            container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">❌</span>Failed to rephrase</div>';
        }
    } catch (error) {
        console.error('[AGP] Switch failed:', error);
        container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">❌</span>Error occurred</div>';
    }
}

// Utilities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        return true;
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `agp-toast ${type}`;

    const icon = type === 'success' ? '✓' :
        type === 'error' ? '✕' :
            type === 'warning' ? '⚠' : 'ℹ';

    toast.innerHTML = `<span class="agp-toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;

    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showPageReloadPrompt() {
    if (hasShownReloadPrompt || document.getElementById('agp-reload-prompt')) return;
    hasShownReloadPrompt = true;

    const prompt = document.createElement('div');
    prompt.id = 'agp-reload-prompt';
    prompt.className = 'agp-reload-prompt';
    prompt.innerHTML = `
        <div class="agp-reload-content">
            <span class="agp-reload-icon">🔄</span>
            <div class="agp-reload-text">
                <strong>Extension was updated</strong>
                <p>Please refresh this page</p>
            </div>
            <button class="agp-reload-button" onclick="location.reload()">Refresh</button>
            <button class="agp-reload-close" onclick="this.closest(\'.agp-reload-prompt\').remove()">×</button>
        </div>
    `;

    document.body.appendChild(prompt);
    setTimeout(() => prompt.remove(), 10000);
}

function closeAllPopups() {
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    document.querySelectorAll('.agp-popup').forEach(p => p.remove());
}

function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.style.cursor = 'move';

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        element.style.transform = 'none';
        element.style.margin = '0';
        element.classList.add('agp-dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        element.style.left = `${initialLeft + dx}px`;
        element.style.top = `${initialTop + dy}px`;
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            element.classList.remove('agp-dragging');
        }
    });
}

// Event Listeners
document.addEventListener('input', (e) => {
    if (!isTextarea(e.target)) return;
    currentTarget = e.target;
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => checkText(e.target), userSettings?.checkDelay || DEBOUNCE_DELAY);
});

document.addEventListener('focusin', (e) => {
    if (!isTextarea(e.target)) return;
    currentTarget = e.target;
    createFloatingButton(e.target);
    observedTextareas.add(e.target);

    if (userSettings?.autoCheck && getTextFromTextarea(e.target).trim().length > 0) {
        checkText(e.target);
    }
});

document.addEventListener('focusout', (e) => {
    if (!isTextarea(e.target)) return;

    setTimeout(() => {
        const popup = document.querySelector('.agp-popup');
        if (!popup && document.activeElement !== e.target) {
            removeFloatingButton();
            clearMirror();
            currentTarget = null;
        }
    }, 200);
});

function handleWindowResize() {
    if (!currentTarget || !isTextarea(currentTarget)) return;

    if (floatingButton) positionFloatingButton(currentTarget);

    if (mirrorDiv) {
        const rect = currentTarget.getBoundingClientRect();
        mirrorDiv.style.top = `${rect.top + window.scrollY}px`;
        mirrorDiv.style.left = `${rect.left + window.scrollX}px`;
    }
}

window.addEventListener('scroll', handleWindowResize, true);
window.addEventListener('resize', handleWindowResize);

document.addEventListener('click', (e) => {
    const popup = document.querySelector('.agp-popup');
    if (popup && !popup.contains(e.target) && !floatingButton?.contains(e.target)) {
        closeAllPopups();
    }
});

document.addEventListener('keydown', (e) => {
    if (!userSettings?.enableShortcuts) return;

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        if (currentTarget && isTextarea(currentTarget)) {
            performCheck(currentTarget);
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (currentTarget && isTextarea(currentTarget)) {
            performCheck(currentTarget);
        }
    }

    if (e.key === 'Escape') {
        closeAllPopups();
    }
});

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'contextMenuAction') {
        if (currentTarget && isTextarea(currentTarget)) {
            currentSelectedStyle = request.style;
            performCheck(currentTarget);
        }
    } else if (request.action === 'keyboardShortcut') {
        if (request.command === 'check-grammar' || request.command === 'quick-rephrase') {
            if (currentTarget && isTextarea(currentTarget)) {
                performCheck(currentTarget);
            }
        }
    } else if (request.action === 'updateTheme') {
        applyTheme(request.theme);
    }
});

// Dynamic Element Detection
const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (isTextarea(node) && !observedTextareas.has(node)) {
                    observedTextareas.add(node);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll('textarea').forEach(ta => {
                        if (isTextarea(ta) && !observedTextareas.has(ta)) {
                            observedTextareas.add(ta);
                        }
                    });
                }
            }
        });
    });
});

mutationObserver.observe(document.body, {
    childList: true,
    subtree: true
});

window.addEventListener('load', () => {
    document.querySelectorAll('textarea').forEach(textarea => {
        if (isTextarea(textarea) && !observedTextareas.has(textarea)) {
            observedTextareas.add(textarea);
        }
    });
});

console.log('[AGP] AI Grammar Pro+ v4.1 loaded');
console.log('[AGP] Services: http://192.168.6.2:8010 & http://192.168.6.2:30068');
