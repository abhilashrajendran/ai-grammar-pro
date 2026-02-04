/**
 * AI Grammar Pro - Content Script
 * Optimized for textarea elements only
 * Inspired by LanguageTool's UI/UX approach
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let checkTimer = null;
let mirrorDiv = null;
let currentMatches = [];
let currentTarget = null;
let floatingButton = null;
const observedTextareas = new WeakSet();

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
           !element.readOnly;
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
    
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Replace specific text range in textarea
 */
function replaceTextRange(textarea, offset, length, replacement) {
    const text = getTextFromTextarea(textarea);
    const newText = text.slice(0, offset) + replacement + text.slice(offset + length);
    setTextInTextarea(textarea, newText);
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
    floatingButton.className = 'lt-float-btn';
    floatingButton.setAttribute('type', 'button');
    floatingButton.setAttribute('title', 'Check grammar and get AI suggestions');
    floatingButton.setAttribute('aria-label', 'Grammar check');
    floatingButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
    floatingButton.style.left = `${rect.right + scrollX - 40}px`;
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
    mirrorDiv.className = 'lt-mirror';
    
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
 * Highlight all errors in mirror
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
        
        // Add error with INLINE highlighting styles
        const errorSpan = document.createElement('span');
        errorSpan.textContent = text.substring(offset, offset + length);
        errorSpan.setAttribute('data-error-index', index);
        errorSpan.setAttribute('data-textarea-id', Math.random().toString(36));
        
        // Apply inline styles directly - no CSS class dependency
        errorSpan.style.cssText = `
            background-color: rgba(255, 77, 77, 0.3) !important;
            text-decoration: underline wavy #d73131 !important;
            text-decoration-thickness: 2px !important;
            text-underline-offset: 2px !important;
            cursor: pointer !important;
            color: inherit !important;
            position: relative !important;
            pointer-events: auto !important;
            display: inline !important;
        `;
        
        // Store match data on the span element
        errorSpan._matchData = match;
        errorSpan._textarea = textarea;
        
        errorSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Error span clicked:', e.target._matchData);
            if (e.target._matchData && e.target._textarea) {
                showSuggestions(e.target._matchData, e.target._textarea);
            }
        });
        
        // Hover effect
        errorSpan.addEventListener('mouseenter', (e) => {
            e.target.style.backgroundColor = 'rgba(255, 77, 77, 0.5) !important';
        });
        
        errorSpan.addEventListener('mouseleave', (e) => {
            e.target.style.backgroundColor = 'rgba(255, 77, 77, 0.3) !important';
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
 * Remove mirror layer
 */
function clearMirror() {
    if (mirrorDiv) {
        mirrorDiv.remove();
        mirrorDiv = null;
    }
}

// ============================================================================
// SUGGESTION POPUP
// ============================================================================

/**
 * Show suggestions for specific error - Light minimal design
 */
function showSuggestions(match, textarea) {
    console.log('showSuggestions called with match:', match);
    
    if (!match) {
        console.error('No match provided to showSuggestions');
        return;
    }
    
    const { offset, length, message, replacements: rawReplacements } = match;
    
    // Remove existing popup
    const existing = document.getElementById('lt-popup');
    if (existing) existing.remove();
    
    const popup = document.createElement('div');
    popup.id = 'lt-popup';
    
    // Light minimal design
    popup.style.cssText = `
        position: fixed !important;
        background: #ffffff !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12) !important;
        z-index: 200000 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        min-width: 280px !important;
        max-width: 400px !important;
        padding: 0 !important;
        margin: 0 !important;
        color: #333 !important;
        font-size: 13px !important;
    `;
    
    // Get current caret position for popup placement
    const rect = textarea.getBoundingClientRect();
    const text = getTextFromTextarea(textarea);
    
    // Estimate position of error in textarea
    const linesBefore = text.substring(0, offset).split('\n').length;
    const topOffset = Math.min(linesBefore * 20, textarea.clientHeight - 120);
    
    popup.style.top = `${rect.top + topOffset}px`;
    popup.style.left = `${Math.max(rect.left + 20, 10)}px`;
    
    // Extract replacement strings from LanguageTool format
    const replacements = rawReplacements
        ? rawReplacements.map(r => typeof r === 'object' ? r.value : r).filter(r => r)
        : [];
    
    console.log('Message:', message);
    console.log('Replacements:', replacements);
    
    // Build popup content
    let content = `
        <div style="padding: 12px 14px;">
            <p style="margin: 0 0 10px 0; color: #333; font-size: 12px; line-height: 1.5;">${escapeHtml(message)}</p>
    `;
    
    if (replacements && replacements.length > 0) {
        content += '<div style="display: flex; flex-direction: column; gap: 4px;">';
        replacements.slice(0, 3).forEach(replacement => {
            if (replacement && typeof replacement === 'string') {
                content += `
                    <button type="button" style="padding: 6px 10px; background: #f0f7ed; border: 1px solid #9ae6b4; border-radius: 4px; color: #22543d; cursor: pointer; font-size: 11px; font-family: inherit; text-align: left; font-weight: 500; text-decoration: none; transition: all 0.2s;" class="lt-suggestion-btn" data-replacement="${escapeHtml(replacement)}">
                        ${escapeHtml(replacement)}
                    </button>
                `;
            }
        });
        content += '</div>';
    }
    
    content += '</div>';
    
    popup.innerHTML = content;
    document.body.appendChild(popup);
    
    console.log('Popup created and added to body');
    
    // Suggestion buttons
    popup.querySelectorAll('.lt-suggestion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const replacement = btn.getAttribute('data-replacement');
            console.log('Suggestion clicked:', replacement);
            replaceTextRange(textarea, offset, length, replacement);
            showToast('✓ Fixed');
            popup.remove();
            
            // Re-check after fix
            setTimeout(() => checkText(textarea), 300);
        });
        
        // Add hover effects
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#e6f7ed';
            btn.style.borderColor = '#7cb305';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#f0f7ed';
            btn.style.borderColor = '#9ae6b4';
        });
    });
}

/**
 * Show AI rephrase popup - Light minimal design
 */
function showAIPopup(textarea, aiResponse) {
    const existing = document.getElementById('lt-ai-popup');
    if (existing) existing.remove();
    
    const popup = document.createElement('div');
    popup.id = 'lt-ai-popup';
    
    const rect = textarea.getBoundingClientRect();
    popup.style.cssText = `
        position: fixed !important;
        background: #ffffff !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12) !important;
        z-index: 200000 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        min-width: 280px !important;
        max-width: 400px !important;
        padding: 0 !important;
        margin: 0 !important;
        color: #333 !important;
        font-size: 13px !important;
        top: ${rect.top + 100}px !important;
        left: ${Math.max(rect.left + 20, 10)}px !important;
    `;
    
    popup.innerHTML = `
        <div style="padding: 12px 14px;">
            <p style="margin: 0 0 12px 0; color: #333; font-size: 13px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap;">${escapeHtml(aiResponse)}</p>
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button type="button" class="lt-btn-copy" style="padding: 6px 10px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; color: #666; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; transition: all 0.2s;">
                    📋 Copy
                </button>
                <button type="button" class="lt-btn-apply" style="padding: 6px 10px; background: #52c41a; border: 1px solid #52c41a; border-radius: 4px; color: white; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; transition: all 0.2s;">
                    ✓ Apply
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Copy button
    popup.querySelector('.lt-btn-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(aiResponse).then(() => {
            showToast('✓ Copied to clipboard');
        });
    });
    
    popup.querySelector('.lt-btn-copy').addEventListener('mouseenter', (e) => {
        e.target.style.background = '#eeeeee';
        e.target.style.borderColor = '#d0d0d0';
    });
    
    popup.querySelector('.lt-btn-copy').addEventListener('mouseleave', (e) => {
        e.target.style.background = '#f5f5f5';
        e.target.style.borderColor = '#e0e0e0';
    });
    
    // Apply button
    popup.querySelector('.lt-btn-apply').addEventListener('click', () => {
        setTextInTextarea(textarea, aiResponse);
        showToast('✓ Text replaced');
        popup.remove();
    });
    
    popup.querySelector('.lt-btn-apply').addEventListener('mouseenter', (e) => {
        e.target.style.background = '#389e0d';
        e.target.style.borderColor = '#389e0d';
    });
    
    popup.querySelector('.lt-btn-apply').addEventListener('mouseleave', (e) => {
        e.target.style.background = '#52c41a';
        e.target.style.borderColor = '#52c41a';
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

/**
 * Show temporary toast notification
 */
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'lt-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================================================
// TEXT CHECKING
// ============================================================================

/**
 * Perform grammar check on textarea
 */
function checkText(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    
    const text = getTextFromTextarea(textarea);
    
    // Don't check if empty or too short
    if (!text || text.trim().length < 3) {
        clearMirror();
        return;
    }
    
    // Send message to background script
    chrome.runtime.sendMessage(
        { action: 'checkText', text: text, style: 'professional' },
        (response) => {
            if (chrome.runtime.lastError) {
                console.warn('Extension disconnected:', chrome.runtime.lastError);
                return;
            }
            
            if (!response) {
                console.warn('No response from background script');
                return;
            }
            
            // Debug: Log API response
            console.log('Grammar check response:', response);
            
            currentMatches = response.grammar || [];
            console.log('Matches found:', currentMatches.length);
            
            // Update highlight layer
            if (currentMatches.length > 0 && textarea) {
                createMirror(textarea);
                highlightErrors(text, currentMatches, textarea);
            } else {
                clearMirror();
            }
        }
    );
}

/**
 * Show style selector popup - Light minimal design
 */
function showStyleSelector(textarea, text) {
    // Remove existing popups
    const existing = document.getElementById('lt-style-popup');
    if (existing) existing.remove();
    
    const popup = document.createElement('div');
    popup.id = 'lt-style-popup';
    
    // Get position
    const rect = textarea.getBoundingClientRect();
    popup.style.cssText = `
        position: fixed !important;
        background: #ffffff !important;
        border: 1px solid #e0e0e0 !important;
        border-radius: 6px !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12) !important;
        z-index: 200000 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        min-width: 320px !important;
        max-width: 400px !important;
        padding: 0 !important;
        margin: 0 !important;
        color: #333 !important;
        font-size: 13px !important;
        top: ${rect.top + 100}px !important;
        left: ${Math.max(rect.left + 20, 10)}px !important;
    `;
    
    // Add content - Minimal light design
    popup.innerHTML = `
        <div style="padding: 12px 14px;">
            <div style="margin-bottom: 12px;">
                <div style="font-size: 11px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">✨ AI Rephrase Options</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    <button type="button" class="lt-style-btn" data-style="professional" style="padding: 8px 10px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; color: #666; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; text-align: center; transition: all 0.2s;">
                        Professional
                    </button>
                    <button type="button" class="lt-style-btn" data-style="casual" style="padding: 8px 10px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; color: #666; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; text-align: center; transition: all 0.2s;">
                        Casual
                    </button>
                    <button type="button" class="lt-style-btn" data-style="academic" style="padding: 8px 10px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; color: #666; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; text-align: center; transition: all 0.2s;">
                        Academic
                    </button>
                    <button type="button" class="lt-style-btn" data-style="short" style="padding: 8px 10px; background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px; color: #666; cursor: pointer; font-size: 11px; font-family: inherit; font-weight: 500; text-align: center; transition: all 0.2s;">
                        Concise
                    </button>
                </div>
            </div>
            <p id="lt-rephrase-status" style="margin: 0; color: #999; font-size: 12px; text-align: center; min-height: 18px;">Click a style to rephrase</p>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Style buttons
    popup.querySelectorAll('.lt-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const style = btn.getAttribute('data-style');
            requestAISuggestion(textarea, text, style, popup);
        });
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#eeeeee';
            btn.style.borderColor = '#d0d0d0';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#f5f5f5';
            btn.style.borderColor = '#e0e0e0';
        });
    });
}

/**
 * Request AI suggestion with specific style
 */
function requestAISuggestion(textarea, text, style, popup) {
    const statusEl = popup.querySelector('#lt-rephrase-status');
    statusEl.textContent = 'Generating...';
    statusEl.style.color = '#7ab8e6';
    
    console.log('Requesting AI suggestion with style:', style);
    
    chrome.runtime.sendMessage(
        { action: 'checkText', text: text, style: style },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError);
                statusEl.textContent = 'Error - ensure Ollama is running';
                statusEl.style.color = '#d73131';
                return;
            }
            
            if (!response || !response.ai) {
                statusEl.textContent = 'No suggestions available';
                statusEl.style.color = '#999';
                return;
            }
            
            console.log('AI Response:', response.ai);
            
            // Show AI popup
            showAIPopup(textarea, response.ai);
            popup.remove();
        }
    );
}

/**
 * Perform full check with AI suggestions
 */
function performCheck(textarea) {
    if (!textarea || !isTextarea(textarea)) return;
    
    const text = getTextFromTextarea(textarea);
    
    if (!text || text.trim().length < 3) {
        showToast('Please enter some text');
        return;
    }
    
    // Show style selector
    showStyleSelector(textarea, text);
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
    checkTimer = setTimeout(() => checkText(e.target), 1000);
});

/**
 * Show floating button on focus
 */
document.addEventListener('focusin', (e) => {
    if (!isTextarea(e.target)) return;
    
    currentTarget = e.target;
    createFloatingButton(e.target);
    observedTextareas.add(e.target);
});

/**
 * Hide floating button on blur
 */
document.addEventListener('focusout', (e) => {
    if (!isTextarea(e.target)) return;
    
    setTimeout(() => {
        const popup = document.getElementById('lt-popup');
        const aiPopup = document.getElementById('lt-ai-popup');
        
        // Only remove if user isn't interacting with popup
        if (!popup && !aiPopup && document.activeElement !== e.target) {
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
    const popup = document.getElementById('lt-popup');
    const aiPopup = document.getElementById('lt-ai-popup');
    
    if (popup && !popup.contains(e.target)) popup.remove();
    if (aiPopup && !aiPopup.contains(e.target)) aiPopup.remove();
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
                        if (!observedTextareas.has(ta)) {
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
        if (!observedTextareas.has(textarea)) {
            observedTextareas.add(textarea);
        }
    });
});