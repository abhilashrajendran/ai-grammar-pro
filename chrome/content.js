let timer;
let mirrorDiv;
let currentMatches = [];
let currentTarget = null;
let floatingButton = null;
let observedElements = new WeakSet();

// ============================================================================
// EDITABLE ELEMENT DETECTION
// ============================================================================

function isEditableElement(element) {
    if (!element || !element.tagName) return false;
    
    const tagName = element.tagName.toLowerCase();
    const isTextarea = tagName === 'textarea';
    const isTextInput = tagName === 'input' && 
        ['text', 'email', 'search', 'url', 'tel'].includes(element.type || 'text');
    const isContentEditable = element.isContentEditable || 
        element.getAttribute('contenteditable') === 'true' ||
        element.getAttribute('contenteditable') === '';
    
    // Exclude password and hidden fields
    if (tagName === 'input' && ['password', 'hidden', 'file', 'checkbox', 'radio'].includes(element.type)) {
        return false;
    }
    
    return isTextarea || isTextInput || isContentEditable;
}

function getTextFromElement(element) {
    if (!element) return '';
    
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        return element.value || '';
    } else if (element.isContentEditable) {
        return element.innerText || element.textContent || '';
    }
    return '';
}

function setTextInElement(element, text) {
    if (!element) return;
    
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        element.value = text;
    } else if (element.isContentEditable) {
        element.innerText = text;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function replaceTextRange(element, offset, length, replacement) {
    const text = getTextFromElement(element);
    const newText = text.slice(0, offset) + replacement + text.slice(offset + length);
    setTextInElement(element, newText);
}

// ============================================================================
// FLOATING AI BUTTON
// ============================================================================

function createFloatingButton(target) {
    if (!target) return;
    
    // Remove existing button
    removeFloatingButton();
    
    floatingButton = document.createElement('div');
    floatingButton.className = 'ai-grammar-float-btn';
    floatingButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" 
                  fill="currentColor"/>
            <path d="M9 11L11 13L15 9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    floatingButton.title = 'AI Grammar Check & Rephrase (Click to check)';
    
    document.body.appendChild(floatingButton);
    positionFloatingButton(target);
    
    // Click handler for manual invocation
    floatingButton.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const text = getTextFromElement(target);
        
        if (!text || text.trim().length === 0) {
            showQuickToast('Please enter some text first');
            return;
        }
        
        // Show loading state
        if (floatingButton) {
            floatingButton.classList.add('loading');
        }
        
        chrome.runtime.sendMessage(
            { action: "checkText", text: text, style: 'professional' },
            (res) => {
                // Remove loading state (check if button still exists)
                if (floatingButton) {
                    floatingButton.classList.remove('loading');
                }
                
                if (chrome.runtime.lastError) {
                    showQuickToast('Error: Extension disconnected');
                    return;
                }
                
                if (!res) {
                    showQuickToast('Error: No response from extension');
                    return;
                }
                
                currentMatches = res.grammar || [];
                window.lastAiResponse = res.ai;
                
                // Create mirror and highlight if there are grammar errors
                if (currentMatches.length > 0 && target) {
                    createMirror(target);
                    highlightAll(text, currentMatches, target);
                }
                
                // Always show popup with AI suggestions
                if (target) {
                    showManualPopup(target, e);
                }
            }
        );
    };
    
    // Store reference
    target._aiFloatingButton = floatingButton;
}

function positionFloatingButton(target) {
    if (!floatingButton || !target) return;
    
    const rect = target.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    
    // Position in top-right corner of the element
    floatingButton.style.top = `${rect.top + scrollY + 8}px`;
    floatingButton.style.left = `${rect.right + scrollX - 38}px`;
}

function removeFloatingButton() {
    if (floatingButton) {
        floatingButton.remove();
        floatingButton = null;
    }
}

function showQuickToast(message) {
    const toast = document.createElement('div');
    toast.className = 'ai-grammar-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================================================
// MIRROR & HIGHLIGHTING
// ============================================================================

function createMirror(target) {
    if (!target) return;
    if (mirrorDiv) mirrorDiv.remove();

    // Don't create mirror for contentEditable (too complex)
    if (target.isContentEditable) return;

    mirrorDiv = document.createElement('div');
    mirrorDiv.className = 'lt-mirror';
    
    const rect = target.getBoundingClientRect();
    const style = window.getComputedStyle(target);

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
        borderWidth: style.borderWidth,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        wordSpacing: style.wordSpacing,
        textAlign: style.textAlign,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflowWrap: style.overflowWrap,
        color: 'transparent',
        pointerEvents: 'none',
        zIndex: '100000',
        overflow: 'hidden',
        boxSizing: style.boxSizing,
        margin: '0',
        background: 'transparent'
    });

    document.body.appendChild(mirrorDiv);

    // Sync scroll immediately and on scroll
    syncScroll(target);
    const scrollHandler = () => syncScroll(target);
    target.addEventListener('scroll', scrollHandler);
    target._scrollHandler = scrollHandler;
}

function syncScroll(target) {
    if (!mirrorDiv || !target) return;
    mirrorDiv.scrollTop = target.scrollTop || 0;
    mirrorDiv.scrollLeft = target.scrollLeft || 0;
}

function highlightAll(text, matches, target) {
    if (!mirrorDiv) return;

    currentMatches = matches;
    currentTarget = target;
    
    if (matches.length === 0) {
        mirrorDiv.innerHTML = '';
        return;
    }

    // Sort matches by offset (descending)
    const sorted = [...matches].sort((a, b) => b.offset - a.offset);

    let htmlParts = [];
    let lastIndex = text.length;

    sorted.forEach((m) => {
        const index = matches.indexOf(m);
        const endPos = m.offset + m.length;
        
        htmlParts.unshift(escapeHtml(text.slice(endPos, lastIndex)));
        
        const word = text.slice(m.offset, endPos);
        htmlParts.unshift(
            `<span class="lt-underline" data-idx="${index}">${escapeHtml(word)}</span>`
        );
        
        lastIndex = m.offset;
    });

    htmlParts.unshift(escapeHtml(text.slice(0, lastIndex)));

    mirrorDiv.innerHTML = htmlParts.join('');

    // Add click handlers
    mirrorDiv.querySelectorAll('.lt-underline').forEach(span => {
        span.style.pointerEvents = 'auto';
        span.style.cursor = 'pointer';

        span.onclick = (e) => {
            e.stopPropagation();
            const idx = parseInt(span.getAttribute('data-idx'), 10);
            const match = currentMatches[idx];
            const word = text.slice(match.offset, match.offset + match.length);
            showPopup(target, match, word, e);
        };
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// POPUP UI
// ============================================================================

function showManualPopup(target, clickEvent) {
    if (!floatingButton) {
        // Fallback: use mouse position if button is gone
        const fallbackEvent = {
            pageX: clickEvent.pageX,
            pageY: clickEvent.pageY
        };
        showPopup(target, null, null, fallbackEvent, true);
        return;
    }
    
    const rect = floatingButton.getBoundingClientRect();
    const fakeEvent = {
        pageX: rect.left,
        pageY: rect.bottom + 5
    };
    
    showPopup(target, null, null, fakeEvent, true);
}

function showPopup(target, match, wrongWord, e, isManual = false) {
    if (!target) return;
    
    // Remove existing popup
    const existingPopup = document.getElementById('ai-pop');
    if (existingPopup) existingPopup.remove();

    const p = document.createElement('div');
    p.id = 'ai-pop';
    p.className = 'lt-ai-popup';
    
    // Initial positioning
    let posX = e.pageX;
    let posY = e.pageY + 10;

    document.body.appendChild(p);
    
    // Render content first so we can measure the final height
    p.innerHTML = `... your existing popup HTML ...`;

    // 🎯 VIEWPORT ADJUSTMENT
    const popupRect = p.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Flip horizontally if it goes off the right edge
    if (posX + popupRect.width > viewportWidth) {
        posX = viewportWidth - popupRect.width - 20;
    }

    // Flip vertically if it goes off the bottom edge
    if (posY + popupRect.height > viewportHeight + window.scrollY) {
        posY = e.pageY - popupRect.height - 10;
    }

    // Force visible if it goes off the top
    if (posY < window.scrollY) {
        posY = window.scrollY + 10;
    }

    p.style.top = `${posY}px`;
    p.style.left = `${posX}px`;

    const suggestion = match?.replacements?.length ? match.replacements[0].value : null;
    
    let popupHTML = '';
    
    // Grammar section
    if (match && wrongWord) {
        popupHTML += `
            <div class="lt-ai-header">Grammar Fix</div>
            ${suggestion 
                ? `<div class="suggestion-box fix-btn" data-suggestion="${escapeHtml(suggestion)}">
                    Change to: <span class="suggestion-text">${escapeHtml(suggestion)}</span>
                </div>`
                : `<div class="suggestion-box">No suggestions found</div>`
            }`;
    } else if (isManual) {
        popupHTML += `
            <div class="lt-ai-header">AI Grammar Assistant</div>
            ${currentMatches.length > 0 
                ? `<div class="info-box">✓ Found ${currentMatches.length} grammar issue(s)</div>`
                : `<div class="info-box">✓ No grammar issues detected</div>`
            }`;
    }
    
    // AI section
    popupHTML += `
        <button id="toggle-ai" class="ai-toggle-btn">✨ ${isManual ? 'AI Rephrase Options' : 'Show AI Rephrase'}</button>
        
        <div id="ai-area" style="display:${isManual ? 'block' : 'none'}; margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
            <div class="ai-style-group">
                <button class="style-btn" data-style="professional">📝 Professional</button>
                <button class="style-btn" data-style="casual">💬 Casual</button>
                <button class="style-btn" data-style="academic">🎓 Academic</button>
                <button class="style-btn" data-style="short">⚡ Concise</button>
            </div>
            <div style="position: relative; margin-top: 8px;">
                <div class="suggestion-box" id="ai-response-text">
                    ${escapeHtml(window.lastAiResponse || 'Click a style above to rephrase...')}
                </div>
                <button id="copy-ai" title="Copy to clipboard" class="copy-btn">📋</button>
                <button id="apply-ai" title="Replace text" class="apply-btn">✓</button>
            </div>
        </div>
    `;
    
    p.innerHTML = popupHTML;
    document.body.appendChild(p);
    
    // Position adjustment
    setTimeout(() => {
        const popupRect = p.getBoundingClientRect();
        if (popupRect.right > window.innerWidth) {
            p.style.left = `${window.innerWidth - popupRect.width - 10}px`;
        }
        if (popupRect.bottom > window.innerHeight) {
            p.style.top = `${e.pageY - popupRect.height - 10}px`;
        }
    }, 0);

    // Event Handlers
    const toggleBtn = p.querySelector('#toggle-ai');
    const aiArea = p.querySelector('#ai-area');
    if (toggleBtn) {
        toggleBtn.onclick = (ev) => {
            ev.stopPropagation();
            aiArea.style.display = aiArea.style.display === 'none' ? 'block' : 'none';
        };
    }

    // Style buttons
    p.querySelectorAll('.style-btn').forEach(btn => {
        btn.onclick = (ev) => {
            ev.stopPropagation();
            const style = btn.getAttribute('data-style');
            const responseBox = p.querySelector('#ai-response-text');
            const text = getTextFromElement(target);
            
            if (!text || text.trim().length === 0) {
                responseBox.innerText = "Please enter some text first";
                return;
            }
            
            responseBox.innerText = "Generating...";
            
            p.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            chrome.runtime.sendMessage(
                { action: "checkText", text: text, style: style },
                (res) => {
                    if (chrome.runtime.lastError) {
                        if (responseBox) responseBox.innerText = "Error: Extension disconnected";
                        return;
                    }
                    if (!res) {
                        if (responseBox) responseBox.innerText = "Error: No response";
                        return;
                    }
                    if (responseBox) responseBox.innerText = res.ai || "No response";
                    window.lastAiResponse = res.ai;
                }
            );
        };
    });

    // Copy button
    const copyBtn = p.querySelector('#copy-ai');
    if (copyBtn) {
        copyBtn.onclick = (ev) => {
            ev.stopPropagation();
            const responseText = p.querySelector('#ai-response-text').innerText;
            
            if (responseText === "Click a style above to rephrase..." || responseText === "Generating...") {
                return;
            }
            
            navigator.clipboard.writeText(responseText).then(() => {
                copyBtn.innerText = "✅";
                setTimeout(() => { copyBtn.innerText = "📋"; }, 1500);
            }).catch(err => console.error('Copy failed:', err));
        };
    }
    
    // Apply button
    const applyBtn = p.querySelector('#apply-ai');
    if (applyBtn) {
        applyBtn.onclick = (ev) => {
            ev.stopPropagation();
            const responseText = p.querySelector('#ai-response-text').innerText;
            
            if (responseText === "Click a style above to rephrase..." || responseText === "Generating...") {
                return;
            }
            
            setTextInElement(target, responseText);
            showQuickToast('✓ Text replaced');
            p.remove();
        };
    }

    // Grammar fix button
    const gmBtn = p.querySelector('.fix-btn');
    if (gmBtn && suggestion && match) {
        gmBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            replaceTextRange(target, match.offset, match.length, suggestion);
            showQuickToast('✓ Fixed');
            p.remove();
            
            setTimeout(() => {
                const newText = getTextFromElement(target);
                if (newText && newText.length > 3) {
                    checkText(target);
                }
            }, 500);
        };
    }
}

// ============================================================================
// TEXT CHECKING
// ============================================================================

function checkText(target) {
    if (!target) return;
    
    const text = getTextFromElement(target);
    
    if (text && text.length > 3 && chrome.runtime?.id) {
        chrome.runtime.sendMessage(
            { action: "checkText", text: text },
            (res) => {
                if (chrome.runtime.lastError) return;
                if (!res) return;
                
                currentMatches = res.grammar || [];
                window.lastAiResponse = res.ai;
                
                if (currentMatches.length > 0 && target && !target.isContentEditable) {
                    createMirror(target);
                    highlightAll(text, currentMatches, target);
                } else {
                    if (mirrorDiv) mirrorDiv.innerHTML = '';
                }
            }
        );
    } else {
        if (mirrorDiv) mirrorDiv.innerHTML = '';
    }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

document.addEventListener('input', (e) => {
    const target = e.target;
    if (!isEditableElement(target)) return;

    currentTarget = target;
    
    if (!floatingButton || floatingButton._target !== target) {
        createFloatingButton(target);
        if (floatingButton) {
            floatingButton._target = target;
        }
    }
    
    clearTimeout(timer);
    timer = setTimeout(() => checkText(target), 1000);
});

document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!isEditableElement(target)) return;
    
    currentTarget = target;
    createFloatingButton(target);
    if (floatingButton) {
        floatingButton._target = target;
    }
    
    if (!observedElements.has(target)) {
        observedElements.add(target);
    }
});

document.addEventListener('focusout', (e) => {
    const target = e.target;
    if (!isEditableElement(target)) return;
    
    setTimeout(() => {
        // Only remove if the user isn't interacting with our popup
        const activePopup = document.getElementById('ai-pop');
        if (!activePopup && document.activeElement !== target) {
            removeFloatingButton();
            if (mirrorDiv) {
                mirrorDiv.remove();
                mirrorDiv = null;
            }
            currentTarget = null;
        }
    }, 300); // Increased delay slightly for stability
});
window.addEventListener('resize', () => {
    if (currentTarget && floatingButton) positionFloatingButton(currentTarget);
    if (currentTarget && mirrorDiv) {
        const rect = currentTarget.getBoundingClientRect();
        mirrorDiv.style.top = `${rect.top + window.scrollY}px`;
        mirrorDiv.style.left = `${rect.left + window.scrollX}px`;
    }
});

window.addEventListener('scroll', () => {
    if (currentTarget && floatingButton) positionFloatingButton(currentTarget);
    if (currentTarget && mirrorDiv) {
        const rect = currentTarget.getBoundingClientRect();
        mirrorDiv.style.top = `${rect.top + window.scrollY}px`;
        mirrorDiv.style.left = `${rect.left + window.scrollX}px`;
    }
}, true);

window.addEventListener('click', (e) => {
    const popup = document.getElementById('ai-pop');
    if (popup && !popup.contains(e.target)) {
        popup.remove();
    }
});

// Dynamic element detection
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) {
                if (isEditableElement(node) && !observedElements.has(node)) {
                    observedElements.add(node);
                }
                if (node.querySelectorAll) {
                    const editables = node.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="search"], [contenteditable="true"]');
                    editables.forEach(el => {
                        if (isEditableElement(el) && !observedElements.has(el)) {
                            observedElements.add(el);
                        }
                    });
                }
            }
        });
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

window.addEventListener('load', () => {
    const editables = document.querySelectorAll('textarea, input[type="text"], input[type="email"], input[type="search"], input[type="url"], [contenteditable="true"]');
    editables.forEach(el => {
        if (isEditableElement(el)) {
            observedElements.add(el);
        }
    });
});
