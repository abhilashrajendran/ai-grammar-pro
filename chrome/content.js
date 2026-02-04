/**
 * AI Grammar Pro+ - Enhanced Content Script
 * Features: Live style switching, keyboard shortcuts, context menu, 
 * statistics, better UX, caching, and accessibility
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
const observedTextareas = new WeakSet();
const DEBOUNCE_DELAY = 1000;

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Load user settings
 */
async function loadSettings() {
    try {
        const response = await sendMessage({ action: 'getSettings' });
        if (response && response.settings) {
            userSettings = response.settings;
            return response.settings;
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
    
    // Default settings
    return {
        autoCheck: true,
        checkDelay: 1000,
        enabledStyles: ['professional', 'casual', 'short', 'academic', 'creative', 'technical', 'simple', 'expand'],
        defaultStyle: 'professional',
        showStatistics: true,
        highlightColor: 'rgba(255, 77, 77, 0.3)',
        enableShortcuts: true
    };
}

// Load settings on initialization
loadSettings().then(settings => {
    userSettings = settings;
    currentSelectedStyle = settings.defaultStyle;
});

// ============================================================================
// MESSAGING HELPER
// ============================================================================

/**
 * Send message to background script with promise
 */
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

/**
 * Check if element is a textarea we should monitor
 */
function isTextarea(element) {
    return element && 
           element.tagName === 'TEXTAREA' && 
           !element.disabled && 
           !element.readOnly &&
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
}

/**
 * Get text from textarea
 */
function getTextFromTextarea(textarea) {
    return textarea?.value || '';
}

/**
 * Set text in textarea and trigger change events
 */
function setTextInTextarea(textarea, text) {
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Restore cursor position if possible
    try {
        textarea.setSelectionRange(start, start);
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Replace specific text range in textarea
 */
function replaceTextRange(textarea, offset, length, replacement) {
    const text = getTextFromTextarea(textarea);
    const newText = text.slice(0, offset) + replacement + text.slice(offset + length);
    setTextInTextarea(textarea, newText);
    
    // Update mirror to reflect changes
    setTimeout(() => {
        if (currentTarget === textarea) {
            checkText(textarea);
        }
    }, 100);
}

// ============================================================================
// FLOATING BUTTON
// ============================================================================

/**
 * Create and position floating check button
 */
function createFloatingButton(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    
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

/**
 * Position floating button in top-right corner of textarea
 */
function positionFloatingButton(textarea) {
    if (!floatingButton || !textarea) return;
    
    const rect = textarea.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    
    floatingButton.style.top = `${rect.top + scrollY + 8}px`;
    floatingButton.style.left = `${rect.right + scrollX - 48}px`;
}

/**
 * Update floating button to show error count
 */
function updateFloatingButton(errorCount) {
    if (!floatingButton) return;
    
    // Remove existing badge
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

/**
 * Remove floating button
 */
function removeFloatingButton() {
    if (floatingButton) {
        floatingButton.remove();
        floatingButton = null;
    }
}

// ============================================================================
// MIRROR LAYER FOR HIGHLIGHTING
// ============================================================================

/**
 * Create invisible mirror div to highlight errors
 */
function createMirror(textarea) {
    if (!textarea) return;
    if (mirrorDiv) mirrorDiv.remove();
    
    mirrorDiv = document.createElement('div');
    mirrorDiv.className = 'agp-mirror';
    
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    
    // Copy styling from textarea to mirror
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
    syncMirrorScroll(textarea);
    
    // Sync scroll events
    const scrollHandler = () => syncMirrorScroll(textarea);
    textarea.addEventListener('scroll', scrollHandler);
    textarea._scrollHandler = scrollHandler;
}

/**
 * Sync mirror scroll with textarea
 */
function syncMirrorScroll(textarea) {
    if (!mirrorDiv || !textarea) return;
    mirrorDiv.scrollTop = textarea.scrollTop;
    mirrorDiv.scrollLeft = textarea.scrollLeft;
}

/**
 * Highlight all errors in mirror (NO BACKGROUND HIGHLIGHT)
 */
function highlightErrors(text, matches, textarea) {
    if (!mirrorDiv) return;
    
    mirrorDiv.innerHTML = '';
    let lastIndex = 0;
    
    matches.forEach((match, index) => {
        const { offset, length } = match;
        
        // Add text before error
        if (offset > lastIndex) {
            const span = document.createElement('span');
            span.textContent = text.substring(lastIndex, offset);
            mirrorDiv.appendChild(span);
        }
        
        // Add error with ONLY underline (no background)
        const errorSpan = document.createElement('span');
        errorSpan.className = 'agp-error-highlight';
        errorSpan.textContent = text.substring(offset, offset + length);
        errorSpan.setAttribute('data-error-index', index);
        
        // Store match data
        errorSpan._matchData = match;
        errorSpan._textarea = textarea;
        
        errorSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (e.target._matchData && e.target._textarea) {
                showSuggestions(e.target._matchData, e.target._textarea);
            }
        });
        
        mirrorDiv.appendChild(errorSpan);
        lastIndex = offset + length;
    });
    
    // Add remaining text
    if (lastIndex < text.length) {
        const span = document.createElement('span');
        span.textContent = text.substring(lastIndex);
        mirrorDiv.appendChild(span);
    }
}

/**
 * Clear mirror
 */
function clearMirror() {
    if (mirrorDiv) {
        mirrorDiv.remove();
        mirrorDiv = null;
    }
}

// ============================================================================
// TEXT CHECKING
// ============================================================================

/**
 * Check text for grammar errors
 */
async function checkText(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    if (!userSettings?.autoCheck) return;
    
    const text = getTextFromTextarea(textarea);
    
    if (!text || text.trim().length < 3) {
        clearMirror();
        currentMatches = [];
        updateFloatingButton(0);
        return;
    }
    
    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            grammarOnly: true
        });
        
        if (response && response.grammar) {
            currentMatches = response.grammar;
            updateFloatingButton(response.grammar.length);
            
            // Create mirror and highlight errors
            createMirror(textarea);
            highlightErrors(text, response.grammar, textarea);
        }
    } catch (error) {
        console.error('Error checking text:', error);
    }
}

// ============================================================================
// SUGGESTIONS POPUP
// ============================================================================

/**
 * Show grammar correction suggestions
 */
function showSuggestions(match, textarea) {
    closeAllPopups();
    
    const popup = document.createElement('div');
    popup.id = 'agp-grammar-popup';
    popup.className = 'agp-popup';
    
    const rect = textarea.getBoundingClientRect();
    popup.style.cssText = `
        position: fixed;
        top: ${Math.min(rect.bottom + window.scrollY + 10, window.innerHeight - 300)}px;
        left: ${Math.max(rect.left + window.scrollX, 20)}px;
    `;
    
    const message = match.message || 'Grammar issue detected';
    const replacements = match.replacements || [];
    
    popup.innerHTML = `
        <div class="agp-popup-header">
            <h3 class="agp-popup-title">
                <span class="agp-popup-title-icon">📝</span>
                Grammar Suggestion
            </h3>
            <button type="button" class="agp-close-btn" aria-label="Close">×</button>
        </div>
        <div class="agp-popup-body">
            <div class="agp-suggestion-message">${escapeHtml(message)}</div>
            <div class="agp-suggestions-list" id="suggestions-list"></div>
        </div>
    `;
    
    document.body.appendChild(popup);
    currentPopup = popup;
    
    // Close button
    popup.querySelector('.agp-close-btn').addEventListener('click', () => popup.remove());
    
    // Add suggestions
    const suggestionsList = popup.querySelector('#suggestions-list');
    
    if (replacements.length === 0) {
        suggestionsList.innerHTML = '<p style="color: var(--agp-text-secondary); font-size: 12px;">No suggestions available</p>';
    } else {
        replacements.slice(0, 5).forEach(replacement => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'agp-suggestion-btn';
            btn.textContent = replacement.value;
            
            btn.addEventListener('click', () => {
                replaceTextRange(textarea, match.offset, match.length, replacement.value);
                popup.remove();
                showToast('✓ Applied suggestion', 'success');
            });
            
            suggestionsList.appendChild(btn);
        });
    }
    
    // Add ignore option
    const ignoreBtn = document.createElement('button');
    ignoreBtn.type = 'button';
    ignoreBtn.className = 'agp-suggestion-btn';
    ignoreBtn.textContent = 'Ignore this suggestion';
    ignoreBtn.style.opacity = '0.7';
    ignoreBtn.addEventListener('click', () => {
        popup.remove();
        showToast('Suggestion ignored', 'info');
    });
    suggestionsList.appendChild(ignoreBtn);
}

// ============================================================================
// AI REPHRASE POPUP - WITH LIVE STYLE SWITCHING
// ============================================================================

/**
 * Show AI rephrase popup with live style switching
 */
async function showAIPopup(textarea, initialText = null) {
    closeAllPopups();
    
    const text = getTextFromTextarea(textarea);
    if (!text || text.trim().length < 3) {
        showToast('Please enter some text', 'error');
        return;
    }
    
    const popup = document.createElement('div');
    popup.id = 'agp-ai-popup';
    popup.className = 'agp-popup';
    
    const rect = textarea.getBoundingClientRect();
    popup.style.cssText = `
        position: fixed;
        top: ${Math.min(rect.bottom + window.scrollY + 10, window.innerHeight - 400)}px;
        left: ${Math.max(rect.left + window.scrollX, 20)}px;
        max-width: 500px;
    `;
    
    // Get available styles from background
    const stylesResponse = await sendMessage({ action: 'getStylePrompts' });
    const allStyles = stylesResponse?.styles || {};
    const enabledStyles = userSettings?.enabledStyles || Object.keys(allStyles);
    
    popup.innerHTML = `
        <div class="agp-popup-header">
            <h3 class="agp-popup-title">
                <span class="agp-popup-title-icon">✨</span>
                AI Rephrase
            </h3>
            <button type="button" class="agp-close-btn" aria-label="Close">×</button>
        </div>
        <div class="agp-popup-body">
            <div class="agp-style-selector">
                <div class="agp-section-label">
                    <span>🎨</span> Choose Style
                </div>
                <div class="agp-style-grid" id="style-grid"></div>
            </div>
            <div id="ai-response-area"></div>
        </div>
    `;
    
    document.body.appendChild(popup);
    currentPopup = popup;
    
    // Close button
    popup.querySelector('.agp-close-btn').addEventListener('click', () => popup.remove());
    
    // Add style buttons
    const styleGrid = popup.querySelector('#style-grid');
    const responseArea = popup.querySelector('#ai-response-area');
    
    enabledStyles.forEach(styleKey => {
        if (allStyles[styleKey]) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'agp-style-btn';
            btn.setAttribute('data-style', styleKey);
            
            if (styleKey === currentSelectedStyle) {
                btn.classList.add('active');
            }
            
            btn.innerHTML = `
                <span class="agp-style-icon">${allStyles[styleKey].icon}</span>
                <span>${capitalize(styleKey)}</span>
            `;
            
            btn.addEventListener('click', () => {
                // Update active state
                styleGrid.querySelectorAll('.agp-style-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSelectedStyle = styleKey;
                
                // Generate new suggestion
                generateAndShowAISuggestion(textarea, text, styleKey, responseArea);
            });
            
            styleGrid.appendChild(btn);
        }
    });
    
    // Show initial state or generate first suggestion
    if (initialText) {
        showAIResult(responseArea, initialText, textarea);
    } else {
        generateAndShowAISuggestion(textarea, text, currentSelectedStyle, responseArea);
    }
}

/**
 * Generate and display AI suggestion
 */
async function generateAndShowAISuggestion(textarea, text, style, responseArea) {
    responseArea.innerHTML = `
        <div class="agp-status-message">
            <div class="agp-status-icon">⏳</div>
            <div>Generating ${style} version...</div>
        </div>
    `;
    
    try {
        const response = await sendMessage({
            action: 'checkText',
            text: text,
            style: style,
            grammarOnly: false
        });
        
        if (response && response.ai) {
            currentAIResponse = response.ai;
            showAIResult(responseArea, response.ai, textarea);
        } else {
            responseArea.innerHTML = `
                <div class="agp-status-message">
                    <div class="agp-status-icon">❌</div>
                    <div>No suggestion available. Ensure Ollama is running.</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('AI generation error:', error);
        responseArea.innerHTML = `
            <div class="agp-status-message">
                <div class="agp-status-icon">⚠️</div>
                <div>Error: ${error.message}</div>
            </div>
        `;
    }
}

/**
 * Show AI result with actions
 */
function showAIResult(responseArea, aiText, textarea) {
    responseArea.innerHTML = `
        <div class="agp-ai-response-container">
            <div class="agp-ai-response">${escapeHtml(aiText)}</div>
        </div>
        <div class="agp-popup-actions">
            <button type="button" class="agp-btn" id="copy-btn">
                <span class="agp-btn-icon">📋</span> Copy
            </button>
            <button type="button" class="agp-btn agp-btn-success" id="apply-btn">
                <span class="agp-btn-icon">✓</span> Apply
            </button>
        </div>
    `;
    
    // Copy button
    responseArea.querySelector('#copy-btn').addEventListener('click', () => {
        copyToClipboard(aiText);
        showToast('✓ Copied to clipboard', 'success');
    });
    
    // Apply button
    responseArea.querySelector('#apply-btn').addEventListener('click', () => {
        setTextInTextarea(textarea, aiText);
        currentPopup?.remove();
        showToast('✓ Text applied', 'success');
    });
}

/**
 * Perform full check with AI suggestions
 */
async function performCheck(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    
    const text = getTextFromTextarea(textarea);
    
    if (!text || text.trim().length < 3) {
        showToast('Please enter some text', 'error');
        return;
    }
    
    floatingButton?.classList.add('loading');
    
    try {
        // Show AI popup
        await showAIPopup(textarea);
    } finally {
        floatingButton?.classList.remove('loading');
    }
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

let toastTimeout = null;

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    // Remove existing toast
    const existingToast = document.querySelector('.agp-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    clearTimeout(toastTimeout);
    
    const toast = document.createElement('div');
    toast.className = `agp-toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <span class="agp-toast-icon">${icons[type] || icons.info}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    // Auto-hide after 3 seconds
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Capitalize first letter
 */
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // Fallback method
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

/**
 * Close all open popups
 */
function closeAllPopups() {
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    
    document.querySelectorAll('#agp-grammar-popup, #agp-ai-popup').forEach(p => p.remove());
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Listen for input changes
 */
document.addEventListener('input', (e) => {
    if (!isTextarea(e.target)) return;
    
    currentTarget = e.target;
    
    // Debounce check
    clearTimeout(checkTimer);
    const delay = userSettings?.checkDelay || DEBOUNCE_DELAY;
    checkTimer = setTimeout(() => checkText(e.target), delay);
});

/**
 * Show floating button on focus
 */
document.addEventListener('focusin', (e) => {
    if (!isTextarea(e.target)) return;
    
    currentTarget = e.target;
    createFloatingButton(e.target);
    observedTextareas.add(e.target);
    
    // Check text if auto-check is enabled
    if (userSettings?.autoCheck && getTextFromTextarea(e.target).trim().length > 0) {
        checkText(e.target);
    }
});

/**
 * Hide floating button on blur
 */
document.addEventListener('focusout', (e) => {
    if (!isTextarea(e.target)) return;
    
    setTimeout(() => {
        const popup = document.querySelector('.agp-popup');
        
        // Only remove if user isn't interacting with popup
        if (!popup && document.activeElement !== e.target) {
            removeFloatingButton();
            clearMirror();
            currentTarget = null;
        }
    }, 200);
});

/**
 * Reposition elements on scroll/resize
 */
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

/**
 * Close popups when clicking outside
 */
document.addEventListener('click', (e) => {
    const popup = document.querySelector('.agp-popup');
    
    if (popup && !popup.contains(e.target) && !floatingButton?.contains(e.target)) {
        closeAllPopups();
    }
});

/**
 * Keyboard shortcuts
 */
document.addEventListener('keydown', (e) => {
    if (!userSettings?.enableShortcuts) return;
    
    // Ctrl+Shift+G / Cmd+Shift+G - Check grammar
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
        e.preventDefault();
        if (currentTarget && isTextarea(currentTarget)) {
            performCheck(currentTarget);
        }
    }
    
    // Ctrl+Shift+R / Cmd+Shift+R - Quick rephrase
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        if (currentTarget && isTextarea(currentTarget)) {
            performCheck(currentTarget);
        }
    }
    
    // Escape - Close popups
    if (e.key === 'Escape') {
        closeAllPopups();
    }
});

// ============================================================================
// MESSAGE LISTENER (for context menu & shortcuts)
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
    }
});

// ============================================================================
// DYNAMIC ELEMENT DETECTION
// ============================================================================

/**
 * Detect new textareas added to DOM
 */
const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                // Check if node itself is textarea
                if (isTextarea(node) && !observedTextareas.has(node)) {
                    observedTextareas.add(node);
                }
                
                // Check if node contains textareas
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

/**
 * Initial scan on page load
 */
window.addEventListener('load', () => {
    document.querySelectorAll('textarea').forEach(textarea => {
        if (isTextarea(textarea) && !observedTextareas.has(textarea)) {
            observedTextareas.add(textarea);
        }
    });
});

console.log('AI Grammar Pro+ loaded successfully! 🚀');
