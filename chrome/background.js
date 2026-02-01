const STYLES = {
    professional: "Rewrite this for a business context. Be clear, formal, and authoritative.",
    casual: "Rewrite this to sound natural and friendly, like a text to a friend.",
    short: "Shorten this text significantly while keeping the core meaning. Be extremely concise.",
    academic: "Rewrite this to sound scholarly and sophisticated. Use advanced vocabulary."
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "checkText") {
        const stylePrompt = STYLES[request.style || 'professional'];
        
        const ltPromise = fetch("http://localhost:8010/v2/check", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({ 
                text: request.text, 
                language: "en-US" 
            })
        })
        .then(res => {
            if (!res.ok) throw new Error(`LanguageTool error: ${res.status}`);
            return res.json();
        })
        .catch(err => {
            console.warn('LanguageTool offline:', err);
            return { matches: [] };
        });

        const ollamaPromise = fetch("http://localhost:11434/api/generate", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "llama3",
                system: stylePrompt,
                prompt: request.text,
                stream: false
            })
        })
        .then(res => {
            if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
            return res.json();
        })
        .catch(err => {
            console.warn('Ollama offline:', err);
            return { response: "AI service offline. Make sure Ollama is running." };
        });

        Promise.all([ltPromise, ollamaPromise])
            .then(([ltData, aiData]) => {
                sendResponse({ 
                    grammar: ltData.matches || [], 
                    ai: aiData.response || "No response from AI"
                });
            })
            .catch(err => {
                console.error('Error in checkText:', err);
                sendResponse({ 
                    grammar: [], 
                    ai: "Error occurred" 
                });
            });
        
        return true; // Keep message channel open for async response
    }
});
