/**
 * AI Grammar Pro+ - Enhanced Content Script v3.1
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let checkTimer = null;
let mirrorDiv = null;
let currentMatches = [];
let currentTarget = null;
let floatingButton = null;
let currentPopup = null;
let currentAIResponse = null;
let currentSelectedStyle = 'professional';
let userSettings = null;
let lastCheckedText = '';
let isCheckingInProgress = false;
const observedTextareas = new WeakSet();
const DEBOUNCE_DELAY = 1000;
const MIN_TEXT_LENGTH = 3;

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('agp-theme-light', 'agp-theme-dark');
    
    if (theme === 'light') {
        root.classList.add('agp-theme-light');
        root.style.setProperty('--agp-text-color', '#1a1a1b');
        root.style.setProperty('--agp-bg-color', '#ffffff');
    } else if (theme === 'dark') {
        root.classList.add('agp-theme-dark');
        root.style.setProperty('--agp-text-color', '#eeeeee');
        root.style.setProperty('--agp-bg-color', '#1a1a1b');
    }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

async function loadSettings() {
    try {
        const response = await sendMessage({ action: 'getSettings' });
        if (response && response.settings) {
            userSettings = response.settings;
            applyTheme(response.settings.theme || 'auto');
            return response.settings;
        }
    } catch (error) {
        // Silent fail
    }
    
    return {
        autoCheck: true,
        checkDelay: 1000,
        enabledStyles: ['professional', 'casual', 'short', 'academic', 'creative', 'technical', 'simple', 'expand'],
        defaultStyle: 'professional',
        theme: 'auto',
        showStatistics: true,
        highlightColor: 'rgba(255, 77, 77, 0.3)',
        enableShortcuts: true
    };
}

loadSettings().then(settings => {
    userSettings = settings;
    currentSelectedStyle = settings.defaultStyle;
});

// ============================================================================
// MESSAGING HELPER
// ============================================================================

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

// ============================================================================
// TEXTAREA DETECTION & TEXT EXTRACTION
// ============================================================================

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
    const end = textarea.selectionEnd;
    
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    try {
        textarea.setSelectionRange(start, start);
    } catch (e) {
        // Ignore
    }
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

// ============================================================================
// FLOATING BUTTON
// ============================================================================

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
    floatingButton.setAttribute('title', 'Check grammar and get AI suggestions (Ctrl+Shift+G)');
    floatingButton.setAttribute('aria-label', 'Grammar check');
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
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    
    floatingButton.style.top = `${rect.top + scrollY + 8}px`;
    floatingButton.style.left = `${rect.right + scrollX - 48}px`;
}

function updateFloatingButton(errorCount) {
    if (!floatingButton) return;
    
    const existingBadge = floatingButton.querySelector('.agp-error-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
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
    
    if (isLoading) {
        floatingButton.classList.add('loading');
        floatingButton.disabled = true;
    } else {
        floatingButton.classList.remove('loading');
        floatingButton.disabled = false;
    }
}

function removeFloatingButton() {
    if (floatingButton) {
        floatingButton.remove();
        floatingButton = null;
    }
}

// ============================================================================
// MIRROR LAYER FOR HIGHLIGHTING
// ============================================================================

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
        paddingTop: style.paddingTop,
        paddingRight: style.paddingRight,
        paddingBottom: style.paddingBottom,
        paddingLeft: style.paddingLeft,
        border: style.border,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflowWrap: style.overflowWrap,
        overflow: 'hidden',
        color: 'transparent',
        pointerEvents: 'none',
        zIndex: '100000',
        boxSizing: style.boxSizing,
        margin: '0',
        background: 'transparent',
        borderRadius: style.borderRadius,
        outline: 'none'
    });
    
    document.body.appendChild(mirrorDiv);
    mirrorDiv._textarea = textarea;
}

function updateMirror(textarea, matches) {
    if (!textarea || !isTextarea(textarea)) return;
    
    if (!matches || matches.length === 0) {
        clearMirror();
        return;
    }
    
    if (!mirrorDiv || mirrorDiv._textarea !== textarea) {
        createMirror(textarea);
    }
    
    const text = getTextFromTextarea(textarea);
    let html = '';
    let lastIndex = 0;
    
    matches.forEach(match => {
        html += escapeHtml(text.slice(lastIndex, match.offset));
        
        const errorText = text.slice(match.offset, match.offset + match.length);
        html += `<span class="agp-error-highlight" data-match-offset="${match.offset}" data-match-length="${match.length}">${escapeHtml(errorText)}</span>`;
        
        lastIndex = match.offset + match.length;
    });
    
    html += escapeHtml(text.slice(lastIndex));
    
    mirrorDiv.innerHTML = html;
    
    mirrorDiv.querySelectorAll('.agp-error-highlight').forEach(span => {
        span.addEventListener('click', (e) => {
            e.stopPropagation();
            const offset = parseInt(span.dataset.matchOffset);
            const matchData = matches.find(m => m.offset === offset);
            if (matchData) {
                showGrammarSuggestion(matchData, textarea);
            }
        });
    });
}

function clearMirror() {
    if (mirrorDiv) {
        mirrorDiv.remove();
        mirrorDiv = null;
    }
}

// ============================================================================
// TEXT CHECKING
// ============================================================================

async function checkText(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    if (isCheckingInProgress) return;
    
    const text = getTextFromTextarea(textarea);
    
    if (text === lastCheckedText) return;
    
    if (text.trim().length < MIN_TEXT_LENGTH) {
        clearMirror();
        updateFloatingButton(0);
        return;
    }
    
    isCheckingInProgress = true;
    lastCheckedText = text;
    setButtonLoading(true);
    
    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            grammarOnly: false
        });
        
        if (response) {
            if (response.error) {
                showToast(response.error, 'error');
            }
            
            currentMatches = response.grammar || [];
            updateMirror(textarea, currentMatches);
            updateFloatingButton(currentMatches.length);
        }
    } catch (error) {
        showToast('Check failed. Please try again.', 'error');
    } finally {
        isCheckingInProgress = false;
        setButtonLoading(false);
    }
}

async function performCheck(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    
    const text = getTextFromTextarea(textarea);
    if (!text || text.trim().length === 0) {
        showToast('Please enter some text first', 'info');
        return;
    }
    
    closeAllPopups();
    setButtonLoading(true);
    
    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            style: currentSelectedStyle
        });
        
        if (response) {
            currentMatches = response.grammar || [];
            currentAIResponse = response.ai || '';
            
            updateMirror(textarea, currentMatches);
            updateFloatingButton(currentMatches.length);
            
            createAIPopup(textarea);
        }
    } catch (error) {
        showToast('Check failed. Please try again.', 'error');
    } finally {
        setButtonLoading(false);
    }
}

// ============================================================================
// GRAMMAR SUGGESTION POPUP
// ============================================================================

function showGrammarSuggestion(match, textarea) {
    closeAllPopups();
    
    const popup = document.createElement('div');
    popup.id = 'agp-grammar-popup';
    popup.className = 'agp-popup';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'agp-popup-header';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'agp-popup-title';
    titleDiv.innerHTML = `<span class="agp-popup-title-icon">✏️</span>${match.message || 'Grammar suggestion'}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'agp-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => popup.remove();
    
    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(closeBtn);
    
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'agp-popup-body';
    
    if (match.replacements && match.replacements.length > 0) {
        match.replacements.slice(0, 5).forEach(replacement => {
            const suggestionBtn = document.createElement('button');
            suggestionBtn.className = 'agp-suggestion-btn';
            suggestionBtn.textContent = replacement.value;
            suggestionBtn.onclick = () => {
                replaceTextRange(textarea, match.offset, match.length, replacement.value);
                popup.remove();
                showToast('Text replaced', 'success');
            };
            bodyDiv.appendChild(suggestionBtn);
        });
    } else {
        bodyDiv.innerHTML = '<div class="agp-suggestion-message">No suggestions available</div>';
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

// ============================================================================
// AI POPUP
// ============================================================================

function createAIPopup(textarea) {
    closeAllPopups();
    
    const popup = document.createElement('div');
    popup.id = 'agp-ai-popup';
    popup.className = 'agp-popup';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'agp-popup-header';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'agp-popup-title';
    titleDiv.innerHTML = '<span class="agp-popup-title-icon">✨</span>AI Grammar & Rephrase';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'agp-close-btn';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => popup.remove();
    
    headerDiv.appendChild(titleDiv);
    headerDiv.appendChild(closeBtn);
    
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'agp-popup-body';
    
    if (currentMatches.length > 0) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'agp-suggestion-message';
        statsDiv.textContent = `Found ${currentMatches.length} grammar issue${currentMatches.length !== 1 ? 's' : ''}. Click on underlined text for suggestions.`;
        bodyDiv.appendChild(statsDiv);
    } else {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'agp-empty-state';
        statsDiv.innerHTML = '<div class="agp-empty-icon">✓</div><h3>No Issues Found</h3><p>Your text looks great!</p>';
        bodyDiv.appendChild(statsDiv);
    }
    
    loadAndDisplayStyleButtons(bodyDiv, textarea);
    
    popup.appendChild(headerDiv);
    popup.appendChild(bodyDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'agp-popup-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'agp-btn';
    copyBtn.innerHTML = '<span class="agp-btn-icon">📋</span>Copy';
    copyBtn.onclick = async () => {
        if (currentAIResponse) {
            await copyToClipboard(currentAIResponse);
            showToast('Copied to clipboard', 'success');
        }
    };
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'agp-btn agp-btn-primary';
    applyBtn.innerHTML = '<span class="agp-btn-icon">✓</span>Apply';
    applyBtn.onclick = () => {
        if (currentAIResponse) {
            setTextInTextarea(textarea, currentAIResponse);
            popup.remove();
            showToast('Text applied', 'success');
        }
    };
    
    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(applyBtn);
    popup.appendChild(actionsDiv);
    
    document.body.appendChild(popup);
    currentPopup = popup;
    
    const rect = textarea.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    
    makeDraggable(popup, headerDiv);
}

async function loadAndDisplayStyleButtons(container, textarea) {
    const stylesDiv = document.createElement('div');
    stylesDiv.className = 'agp-style-section';
    
    const styleLabel = document.createElement('div');
    styleLabel.className = 'agp-style-label';
    styleLabel.textContent = 'Rephrase Style:';
    stylesDiv.appendChild(styleLabel);
    
    const styleGrid = document.createElement('div');
    styleGrid.className = 'agp-style-grid';
    
    try {
        const response = await sendMessage({ action: 'getStylePrompts' });
        const styles = response.styles || {};
        
        Object.keys(styles).forEach(styleKey => {
            const styleInfo = styles[styleKey];
            const btn = document.createElement('button');
            btn.className = 'agp-style-btn';
            if (styleKey === currentSelectedStyle) {
                btn.classList.add('active');
            }
            btn.innerHTML = `<span class="agp-style-icon">${styleInfo.icon}</span>${styleInfo.label}`;
            btn.onclick = () => switchStyle(styleKey, styleGrid, textarea);
            styleGrid.appendChild(btn);
        });
    } catch (error) {
        // Silent fail
    }
    
    stylesDiv.appendChild(styleGrid);
    container.appendChild(stylesDiv);
    
    const responseContainer = document.createElement('div');
    responseContainer.className = 'agp-ai-response-container';
    responseContainer.id = 'agp-ai-response-container';
    
    if (currentAIResponse) {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'agp-ai-response';
        responseDiv.textContent = currentAIResponse;
        responseContainer.appendChild(responseDiv);
    } else {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'agp-status-message';
        statusDiv.innerHTML = '<span class="agp-status-icon">💭</span>Select a style to rephrase your text';
        responseContainer.appendChild(statusDiv);
    }
    
    container.appendChild(responseContainer);
}

async function switchStyle(styleKey, styleGrid, textarea) {
    currentSelectedStyle = styleKey;
    
    styleGrid.querySelectorAll('.agp-style-btn').forEach(btn => btn.classList.remove('active'));
    styleGrid.querySelector(`button:nth-child(${Array.from(styleGrid.children).findIndex(el => el.textContent.includes(styleKey.charAt(0).toUpperCase() + styleKey.slice(1))) + 1})`).classList.add('active');
    
    const container = document.getElementById('agp-ai-response-container');
    if (!container) return;
    
    container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">⏳</span>Rephrasing...</div>';
    
    const text = getTextFromTextarea(textarea);
    
    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            style: styleKey,
            grammarOnly: false
        });
        
        if (response && response.ai) {
            currentAIResponse = response.ai;
            container.innerHTML = '';
            const responseDiv = document.createElement('div');
            responseDiv.className = 'agp-ai-response';
            responseDiv.textContent = response.ai;
            container.appendChild(responseDiv);
        } else {
            container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">❌</span>Failed to rephrase</div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="agp-status-message"><span class="agp-status-icon">❌</span>Error occurred</div>';
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
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

function closeAllPopups() {
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    document.querySelectorAll('#agp-grammar-popup, #agp-ai-popup').forEach(p => p.remove());
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

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('input', (e) => {
    if (!isTextarea(e.target)) return;
    currentTarget = e.target;
    clearTimeout(checkTimer);
    const delay = userSettings?.checkDelay || DEBOUNCE_DELAY;
    checkTimer = setTimeout(() => checkText(e.target), delay);
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
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        mirrorDiv.style.top = `${rect.top + scrollY}px`;
        mirrorDiv.style.left = `${rect.left + scrollX}px`;
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

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

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

// ============================================================================
// DYNAMIC ELEMENT DETECTION
// ============================================================================

const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (isTextarea(node) && !observedTextareas.has(node)) {
                    observedTextareas.add(node);
                }
                if (node.querySelectorAll) {
                    const textareas = node.querySelectorAll('textarea');
                    textareas.forEach(ta => {
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