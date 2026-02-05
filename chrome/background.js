/**
 * AI Grammar Pro+ - Enhanced Background Service Worker
 * Features: Request caching, retry logic, performance optimization, settings management
 */

const CONSTANTS = {
    timeout: 15000,
    maxRetries: 2,
    cacheTimeout: 300000 // 5 minutes
};

const STYLE_PROMPTS = {
    professional: {
        prompt: 'Rewrite this for a business context. Be clear, formal, and authoritative. Maintain the core message while using professional language.',
        icon: '💼'
    },
    casual: {
        prompt: 'Rewrite this to sound natural and friendly, like a conversation with a friend. Keep it relaxed and approachable.',
        icon: '😊'
    },
    short: {
        prompt: 'Shorten this text significantly while keeping the core meaning. Be extremely concise and remove all unnecessary words.',
        icon: '✂️'
    },
    academic: {
        prompt: 'Rewrite this to sound scholarly and sophisticated. Use advanced vocabulary and formal academic tone.',
        icon: '🎓'
    },
    creative: {
        prompt: 'Rewrite this with creative flair and engaging language. Make it more vivid and interesting to read.',
        icon: '✨'
    },
    technical: {
        prompt: 'Rewrite this using precise technical language. Be specific, accurate, and objective.',
        icon: '⚙️'
    },
    simple: {
        prompt: 'Simplify this text for easy understanding. Use simple words and clear, straightforward sentences.',
        icon: '📝'
    },
    expand: {
        prompt: 'Expand this text with more detail and elaboration. Add supporting information and examples while keeping the main idea.',
        icon: '📈'
    }
};

// Simple cache for grammar checks
const grammarCache = new Map();
const aiCache = new Map();

/**
 * Clean old cache entries
 */
function cleanCache(cache) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CONSTANTS.cacheTimeout) {
            cache.delete(key);
        }
    }
}

/**
 * Generate cache key
 */
function getCacheKey(text, extra = '') {
    return `${text.substring(0, 100)}_${text.length}_${extra}`;
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
    }
});

/**
 * Get current configuration from storage with fallbacks
 */
async function getServiceConfig() {
    const settings = await chrome.storage.sync.get({
        // Default values if storage is empty
        languageToolUrl: 'http://192.168.6.2:8010/v2/check',
        ollamaUrl: 'http://192.168.6.2:30068/api/generate',
        ollamaModel: 'llama3.2:1b'
    });
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
        const promises = [checkGrammar(text)];
        
        if (!grammarOnly) {
            promises.push(generateAISuggestion(text, style));
        }
        
        const [grammarData, aiData] = await Promise.all(promises);
        
        sendResponse({
            grammar: grammarData.matches || [],
            ai: aiData || (grammarOnly ? '' : 'Unable to generate suggestions'),
            statistics: grammarData.language ? {
                detectedLanguage: grammarData.language.name,
                issuesFound: (grammarData.matches || []).length
            } : null
        });
    } catch (error) {
        console.error('Error in checkText:', error);
        sendResponse({
            grammar: [],
            ai: 'Error occurred during processing',
            error: error.message
        });
    }
}

/**
 * Check grammar using LanguageTool with caching and retry
 */
async function checkGrammar(text) {
    const cacheKey = getCacheKey(text, 'grammar');
    
    // Check cache
    const cached = grammarCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    // --- NEW: Fetch URL dynamically ---
    const config = await getServiceConfig();
    const ltUrl = config.languageToolUrl;

    let lastError;
    
    for (let attempt = 0; attempt < CONSTANTS.maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.timeout);
            
            const response = await fetch(ltUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    text: text,
                    language: 'auto', // Auto-detect language
                    enabledOnly: 'false'
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`LanguageTool error: ${response.status}`);
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
            console.warn(`Grammar check attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt < CONSTANTS.maxRetries - 1) {
                // Wait before retry (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    console.error('Grammar check failed after retries:', lastError);
    return { matches: [] };
}

/**
 * Generate AI suggestion using Ollama with caching and streaming support
 */
async function generateAISuggestion(text, style) {
    const cacheKey = getCacheKey(text, style);
    
    // Check cache
    const cached = aiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    const config = await getServiceConfig();
    const aiUrl = config.ollamaUrl;
    const aiModel = config.ollamaModel;

    const styleConfig = STYLE_PROMPTS[style] || STYLE_PROMPTS.professional;
    
    let lastError;
    
    for (let attempt = 0; attempt < CONSTANTS.maxRetries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.timeout);
            
            const response = await fetch(aiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: aiModel,
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
                throw new Error(`Ollama error: ${response.status}`);
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
            console.warn(`AI suggestion attempt ${attempt + 1} failed:`, error.message);
            
            if (attempt < CONSTANTS.maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    
    console.error('AI suggestion failed after retries:', lastError);
    return '';
}

/**
 * Get user settings
 */
async function handleGetSettings(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get({
            autoCheck: true,
            checkDelay: 1000,
            enabledStyles: Object.keys(STYLE_PROMPTS),
            defaultStyle: 'professional',
            showStatistics: true,
            highlightColor: 'rgba(255, 77, 77, 0.3)',
            enableShortcuts: true
        });
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
        await chrome.storage.sync.set(settings);
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error saving settings:', error);
        sendResponse({ error: error.message });
    }
}

/**
 * Context menu setup
 */
chrome.runtime.onInstalled.addListener(() => {
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
