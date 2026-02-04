/**
 * AI Grammar Pro - Background Service Worker
 * Handles communication between content script and local APIs
 */

const CONFIG = {
    languageToolUrl: 'http://192.168.6.2:8010/v2/check',
    ollamaUrl: 'http://192.168.6.2:30068/api/generate',
    ollamaModel: 'llama3.2:1b',
    timeout: 10000
};

const STYLE_PROMPTS = {
    professional: 'Rewrite this for a business context. Be clear, formal, and authoritative.',
    casual: 'Rewrite this to sound natural and friendly, like a text to a friend.',
    short: 'Shorten this text significantly while keeping the core meaning. Be extremely concise.',
    academic: 'Rewrite this to sound scholarly and sophisticated. Use advanced vocabulary.'
};

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkText') {
        handleCheckText(request, sendResponse);
        return true; // Keep channel open for async response
    }
});

/**
 * Handle text checking request
 */
async function handleCheckText(request, sendResponse) {
    const { text, style = 'professional' } = request;
    
    if (!text || text.trim().length === 0) {
        sendResponse({ grammar: [], ai: '' });
        return;
    }
    
    try {
        const [grammarData, aiData] = await Promise.all([
            checkGrammar(text),
            generateAISuggestion(text, style)
        ]);
        
        sendResponse({
            grammar: grammarData.matches || [],
            ai: aiData || 'Unable to generate suggestions'
        });
    } catch (error) {
        console.error('Error in checkText:', error);
        sendResponse({
            grammar: [],
            ai: 'Error occurred during processing'
        });
    }
}

/**
 * Check grammar using LanguageTool
 */
async function checkGrammar(text) {
    try {
        const response = await fetch(CONFIG.languageToolUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                text: text,
                language: 'en-US'
            })
        });
        
        if (!response.ok) {
            throw new Error(`LanguageTool error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.warn('Grammar check failed:', error.message);
        return { matches: [] };
    }
}

/**
 * Generate AI suggestion using Ollama
 */
async function generateAISuggestion(text, style) {
    const stylePrompt = STYLE_PROMPTS[style] || STYLE_PROMPTS.professional;
    
    try {
        const response = await fetch(CONFIG.ollamaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CONFIG.ollamaModel,
                system: stylePrompt,
                prompt: text,
                stream: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.response || '';
    } catch (error) {
        console.warn('AI suggestion failed:', error.message);
        return '';
    }
}
