/**
 * AI Grammar Pro+ - Enhanced Background Service Worker v3.1
 * Features: Dynamic configuration, theme management, improved error handling
 */

const CONSTANTS = {
    timeout: 15000,
    maxRetries: 2,
    cacheTimeout: 300000, // 5 minutes
    maxCacheSize: 100 // Limit cache entries
};

const DEFAULT_SETTINGS = {
    // Service URLs - user must configure
    languageToolUrl: '',
    ollamaUrl: '',
    ollamaModel: 'llama3.2:1b',
    
    // UI Settings
    autoCheck: true,
    checkDelay: 1000,
    enabledStyles: ['professional', 'casual', 'short', 'academic', 'creative', 'technical', 'simple', 'expand'],
    defaultStyle: 'professional',
    theme: 'auto', // 'auto', 'light', 'dark'
    showStatistics: true,
    highlightColor: 'rgba(255, 77, 77, 0.3)',
    enableShortcuts: true,
    
    // First run flag
    isFirstRun: true
};

const STYLE_PROMPTS = {
    professional: {
        prompt: 'Rewrite this for a business context. Be clear, formal, and authoritative. Maintain the core message while using professional language.',
        icon: '💼',
        label: 'Professional'
    },
    casual: {
        prompt: 'Rewrite this to sound natural and friendly, like a conversation with a friend. Keep it relaxed and approachable.',
        icon: '😊',
        label: 'Casual'
    },
    short: {
        prompt: 'Shorten this text significantly while keeping the core meaning. Be extremely concise and remove all unnecessary words.',
        icon: '✂️',
        label: 'Concise'
    },
    academic: {
        prompt: 'Rewrite this to sound scholarly and sophisticated. Use advanced vocabulary and formal academic tone.',
        icon: '🎓',
        label: 'Academic'
    },
    creative: {
        prompt: 'Rewrite this with creative flair and engaging language. Make it more vivid and interesting to read.',
        icon: '✨',
        label: 'Creative'
    },
    technical: {
        prompt: 'Rewrite this using precise technical language. Be specific, accurate, and objective.',
        icon: '⚙️',
        label: 'Technical'
    },
    simple: {
        prompt: 'Simplify this text for easy understanding. Use simple words and clear, straightforward sentences.',
        icon: '📝',
        label: 'Simple'
    },
    expand: {
        prompt: 'Expand this text with more detail and elaboration. Add supporting information and examples while keeping the main idea.',
        icon: '📈',
        label: 'Expand'
    }
};

// Caches with size limits
const grammarCache = new Map();
const aiCache = new Map();

/**
 * Clean old cache entries and enforce size limits
 */
function cleanCache(cache, maxSize = CONSTANTS.maxCacheSize) {
    const now = Date.now();
    
    // Remove expired entries
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CONSTANTS.cacheTimeout) {
            cache.delete(key);
        }
    }
    
    // Enforce max size (remove oldest entries)
    if (cache.size > maxSize) {
        const entries = Array.from(cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        const toRemove = entries.slice(0, cache.size - maxSize);
        toRemove.forEach(([key]) => cache.delete(key));
    }
}

/**
 * Generate cache key
 */
function getCacheKey(text, extra = '') {
    return `${text.substring(0, 100)}_${text.length}_${extra}`;
}

/**
 * Validate URL format
 */
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkText') {
        handleCheckText(request, sendResponse);
        return true;
    } else if (request.action === 'getSettings') {
        handleGetSettings(sendResponse);
        return true;
    } else if (request.action === 'saveSettings') {
        handleSaveSettings(request.settings, sendResponse);
        return true;
    } else if (request.action === 'getStylePrompts') {
        sendResponse({ styles: STYLE_PROMPTS });
        return true;
    } else if (request.action === 'testConnection') {
        handleTestConnection(request, sendResponse);
        return true;
    } else if (request.action === 'applyTheme') {
        handleApplyTheme(request, sendResponse);
        return true;
    }
});

/**
 * Get current configuration from storage with fallbacks
 */
async function getServiceConfig() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return settings;
}

/**
 * Handle text checking request
 */
async function handleCheckText(request, sendResponse) {
    const { text, style = 'professional', grammarOnly = false } = request;
    
    if (!text || text.trim().length === 0) {
        sendResponse({ grammar: [], ai: '' });
        return;
    }
    
    // Clean caches periodically
    if (Math.random() < 0.1) {
        cleanCache(grammarCache);
        cleanCache(aiCache);
    }
    
    try {
        const config = await getServiceConfig();
        
        // Validate configuration
        if (!config.languageToolUrl && !grammarOnly) {
            sendResponse({
                grammar: [],
                ai: '',
                error: 'Please configure LanguageTool URL in extension settings',
                needsConfiguration: true
            });
            return;
        }
        
        const promises = [];
        
        if (config.languageToolUrl) {
            promises.push(checkGrammar(text, config));
        } else {
            promises.push(Promise.resolve({ matches: [] }));
        }
        
        if (!grammarOnly && config.ollamaUrl) {
            promises.push(generateAISuggestion(text, style, config));
        } else {
            promises.push(Promise.resolve(''));
        }
        
        const [grammarData, aiData] = await Promise.all(promises);
        
        sendResponse({
            grammar: grammarData.matches || [],
            ai: aiData || '',
            statistics: grammarData.language ? {
                detectedLanguage: grammarData.language.name,
                issuesFound: (grammarData.matches || []).length
            } : null
        });
    } catch (error) {
        console.error('Error in checkText:', error);
        sendResponse({
            grammar: [],
            ai: '',
            error: error.message || 'An error occurred during processing'
        });
    }
}

/**
 * Check grammar using LanguageTool with caching and retry
 */
async function checkGrammar(text, config) {
    const cacheKey = getCacheKey(text, 'grammar');
    
    // Check cache
    const cached = grammarCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    if (!config.languageToolUrl || !isValidUrl(config.languageToolUrl)) {
        throw new Error('Invalid LanguageTool URL');
    }
    
    let lastError;
    
    for (let attempt = 0; attempt < CONSTANTS.maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.timeout);
            
            const response = await fetch(config.languageToolUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    text: text,
                    language: 'auto',
                    enabledOnly: 'false'
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`LanguageTool returned ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache successful result
            grammarCache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            lastError = error;
            
            if (error.name === 'AbortError') {
                lastError = new Error('Request timed out. Check your LanguageTool service.');
            }
            
            if (attempt < CONSTANTS.maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    throw new Error(`Grammar check failed: ${lastError.message}`);
}

/**
 * Generate AI suggestion using Ollama with caching and streaming support
 */
async function generateAISuggestion(text, style, config) {
    const cacheKey = getCacheKey(text, style);
    
    // Check cache
    const cached = aiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    if (!config.ollamaUrl || !isValidUrl(config.ollamaUrl)) {
        throw new Error('Invalid Ollama URL');
    }
    
    const styleConfig = STYLE_PROMPTS[style] || STYLE_PROMPTS.professional;
    let lastError;
    
    for (let attempt = 0; attempt < CONSTANTS.maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.timeout);
            
            const response = await fetch(config.ollamaUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.ollamaModel || 'llama3.2:1b',
                    system: styleConfig.prompt,
                    prompt: text,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        top_p: 0.9,
                        num_predict: 500
                    }
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Ollama returned ${response.status}`);
            }
            
            const data = await response.json();
            const result = data.response || '';
            
            // Cache successful result
            aiCache.set(cacheKey, {
                data: result,
                timestamp: Date.now()
            });
            
            return result;
        } catch (error) {
            lastError = error;
            
            if (error.name === 'AbortError') {
                lastError = new Error('Request timed out. Check your Ollama service.');
            }
            
            if (attempt < CONSTANTS.maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    throw new Error(`AI suggestion failed: ${lastError.message}`);
}

/**
 * Test connection to services
 */
async function handleTestConnection(request, sendResponse) {
    const { service, url } = request;
    
    if (!isValidUrl(url)) {
        sendResponse({ success: false, error: 'Invalid URL format' });
        return;
    }
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        sendResponse({ 
            success: response.ok,
            status: response.status,
            error: response.ok ? null : `HTTP ${response.status}`
        });
    } catch (error) {
        sendResponse({ 
            success: false, 
            error: error.name === 'AbortError' ? 'Connection timeout' : error.message 
        });
    }
}

/**
 * Apply theme to all tabs
 */
async function handleApplyTheme(request, sendResponse) {
    const { theme } = request;
    
    try {
        // Save theme preference
        await chrome.storage.sync.set({ theme });
        
        // Notify all content scripts to update theme
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'updateTheme',
                theme: theme
            }).catch(() => {
                // Ignore errors for tabs where content script isn't loaded
            });
        });
        
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Get user settings
 */
async function handleGetSettings(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        sendResponse({ settings });
    } catch (error) {
        console.error('Error getting settings:', error);
        sendResponse({ error: error.message });
    }
}

/**
 * Save user settings
 */
async function handleSaveSettings(settings, sendResponse) {
    try {
        // Validate URLs before saving
        if (settings.languageToolUrl && !isValidUrl(settings.languageToolUrl)) {
            sendResponse({ success: false, error: 'Invalid LanguageTool URL' });
            return;
        }
        
        if (settings.ollamaUrl && !isValidUrl(settings.ollamaUrl)) {
            sendResponse({ success: false, error: 'Invalid Ollama URL' });
            return;
        }
        
        await chrome.storage.sync.set(settings);
        
        // Apply theme if changed
        if (settings.theme) {
            handleApplyTheme({ theme: settings.theme }, () => {});
        }
        
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error saving settings:', error);
        sendResponse({ error: error.message });
    }
}

/**
 * Context menu setup
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    // Create context menus
    chrome.contextMenus.create({
        id: 'aigrammar-check',
        title: 'Check Grammar & Rephrase',
        contexts: ['editable']
    });
    
    chrome.contextMenus.create({
        id: 'aigrammar-professional',
        title: 'Rephrase: Professional',
        contexts: ['editable']
    });
    
    chrome.contextMenus.create({
        id: 'aigrammar-casual',
        title: 'Rephrase: Casual',
        contexts: ['editable']
    });
    
    chrome.contextMenus.create({
        id: 'aigrammar-short',
        title: 'Rephrase: Concise',
        contexts: ['editable']
    });
    
    // Show onboarding for first install
    if (details.reason === 'install') {
        chrome.tabs.create({
            url: 'options.html?firstRun=true'
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const style = info.menuItemId.replace('aigrammar-', '');
    
    chrome.tabs.sendMessage(tab.id, {
        action: 'contextMenuAction',
        style: style === 'check' ? 'professional' : style
    });
});

/**
 * Keyboard shortcuts
 */
chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'keyboardShortcut',
                command: command
            });
        }
    });
});

console.log('AI Grammar Pro+ Background Service Worker loaded');
