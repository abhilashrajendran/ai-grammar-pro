/**
 * AI Grammar Pro+ - Background Service Worker v3.1
 */

const CONSTANTS = {
    timeout: 15000,
    maxRetries: 2,
    cacheTimeout: 300000,
    maxCacheSize: 100
};

const DEFAULT_SETTINGS = {
    languageToolUrl: '',
    ollamaUrl: '',
    ollamaModel: 'llama3.2:1b',
    autoCheck: true,
    checkDelay: 1000,
    enabledStyles: ['professional', 'casual', 'short', 'academic', 'creative', 'technical', 'simple', 'expand'],
    defaultStyle: 'professional',
    theme: 'auto',
    showStatistics: true,
    highlightColor: 'rgba(255, 77, 77, 0.3)',
    enableShortcuts: true,
    isFirstRun: true
};

const STYLE_PROMPTS = {
    professional: {
        prompt: 'Rewrite the following text for a corporate audience. Use an active voice, avoid slang, and maintain a respectful, authoritative tone. Ensure the core message remains unchanged while improving clarity and flow.',
        icon: '💼',
        label: 'Professional'
    },
    casual: {
        prompt: 'Rewrite this to sound like a friendly, natural conversation. Use contractions (e.g., "don\'t" instead of "do not") and a warm tone. Keep the message helpful and approachable, as if speaking to a peer.',
        icon: '😊',
        label: 'Casual'
    },
    short: {
        prompt: 'Condense this text into its most essential points. Eliminate all filler words and redundancies. Aim for a "TL;DR" style while preserving every critical piece of information.',
        icon: '✂️',
        label: 'Concise'
    },
    academic: {
        prompt: 'Rephrase this text using formal scholarly conventions. Utilize precise terminology, maintain an objective third-person perspective, and ensure logical transitions between ideas. Avoid anecdotal language.',
        icon: '🎓',
        label: 'Academic'
    },
    creative: {
        prompt: 'Infuse this text with vivid imagery and compelling word choices. Use rhetorical devices or metaphors where appropriate to make the prose more evocative, while strictly adhering to the original facts.',
        icon: '✨',
        label: 'Creative'
    },
    technical: {
        prompt: 'Rewrite this for a technical audience. Focus on precision, specifications, and logical sequence. Use industry-standard terminology and ensure the tone is purely objective and data-driven.',
        icon: '⚙️',
        label: 'Technical'
    },
    simple: {
        prompt: 'Rewrite this for a general audience using a 6th-grade reading level. Break down complex concepts, use short sentences, and replace jargon with common words. The goal is maximum accessibility.',
        icon: '📝',
        label: 'Simple'
    },
    expand: {
        prompt: 'Elaborate on the provided text by adding context, descriptive details, or illustrative examples. Flesh out the reasoning behind the main points without changing the original intent or meaning.',
        icon: '📈',
        label: 'Expand'
    }
};

const grammarCache = new Map();
const aiCache = new Map();

function cleanCache(cache, maxSize = CONSTANTS.maxCacheSize) {
    const now = Date.now();
    
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CONSTANTS.cacheTimeout) {
            cache.delete(key);
        }
    }
    
    if (cache.size > maxSize) {
        const entries = Array.from(cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, cache.size - maxSize);
        toRemove.forEach(([key]) => cache.delete(key));
    }
}

function getCacheKey(text, extra = '') {
    return `${text.substring(0, 100)}_${text.length}_${extra}`;
}

function isValidUrl(string) {
    if (!string || string.trim() === '') {
        return false;
    }
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

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

async function getServiceConfig() {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return settings;
}

async function handleCheckText(request, sendResponse) {
    const { text, style = 'professional', grammarOnly = false } = request;
    
    if (!text || text.trim().length === 0) {
        sendResponse({ grammar: [], ai: '' });
        return;
    }
    
    if (Math.random() < 0.1) {
        cleanCache(grammarCache);
        cleanCache(aiCache);
    }
    
    try {
        const config = await getServiceConfig();
        const promises = [];
        
        if (config.languageToolUrl && isValidUrl(config.languageToolUrl)) {
            promises.push(checkGrammar(text, config));
        } else {
            promises.push(Promise.resolve({ matches: [] }));
        }
        
        if (!grammarOnly && config.ollamaUrl && isValidUrl(config.ollamaUrl)) {
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
        let userMessage = error.message || 'An error occurred during processing';
        
        if (error.message && error.message.includes('Ollama returned 500')) {
            const config = await getServiceConfig();
            userMessage = 'Ollama error: Model may not be available. Try running: ollama pull ' + config.ollamaModel;
        } else if (error.message && error.message.includes('LanguageTool')) {
            userMessage = 'LanguageTool service is not responding. Check if the server is running.';
        }
        
        sendResponse({
            grammar: [],
            ai: '',
            error: userMessage
        });
    }
}

async function checkGrammar(text, config) {
    const cacheKey = getCacheKey(text, 'grammar');
    
    const cached = grammarCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    if (!isValidUrl(config.languageToolUrl)) {
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

async function generateAISuggestion(text, style, config) {
    const cacheKey = getCacheKey(text, style);
    
    const cached = aiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CONSTANTS.cacheTimeout)) {
        return cached.data;
    }
    
    if (!isValidUrl(config.ollamaUrl)) {
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
                let errorDetail = '';
                try {
                    const errorData = await response.json();
                    errorDetail = errorData.error || errorData.message || '';
                } catch (e) {
                    // Ignore
                }
                throw new Error(`Ollama returned ${response.status}${errorDetail ? ': ' + errorDetail : ''}`);
            }
            
            const data = await response.json();
            const result = data.response || '';
            
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

async function handleApplyTheme(request, sendResponse) {
    const { theme } = request;
    
    try {
        await chrome.storage.sync.set({ theme });
        
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'updateTheme',
                    theme: theme
                });
            } catch (e) {
                // Ignore tabs without content script
            }
        }
        
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

async function handleGetSettings(sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
        sendResponse({ settings });
    } catch (error) {
        sendResponse({ error: error.message });
    }
}

async function handleSaveSettings(settings, sendResponse) {
    try {
        if (settings.languageToolUrl && settings.languageToolUrl.trim() !== '' && !isValidUrl(settings.languageToolUrl)) {
            sendResponse({ success: false, error: 'Invalid LanguageTool URL' });
            return;
        }
        
        if (settings.ollamaUrl && settings.ollamaUrl.trim() !== '' && !isValidUrl(settings.ollamaUrl)) {
            sendResponse({ success: false, error: 'Invalid Ollama URL' });
            return;
        }
        
        await chrome.storage.sync.set(settings);
        
        if (settings.theme) {
            await handleApplyTheme({ theme: settings.theme }, () => {});
        }
        
        sendResponse({ success: true });
    } catch (error) {
        sendResponse({ error: error.message });
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
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
