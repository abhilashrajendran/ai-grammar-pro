/**
 * AI Grammar Pro+ - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
    
    // Help button
    document.getElementById('help-btn').addEventListener('click', () => {
        const helpText = `
AI Grammar Pro+ Help

HOW TO USE:
1. Click on any textarea on a webpage
2. The floating blue button appears in the top-right corner
3. Type your text - grammar errors will be underlined in red
4. Click the blue button to access AI rephrase options
5. Choose a style (Professional, Casual, etc.)
6. Switch between styles without closing the popup!
7. Click "Apply" to replace your text or "Copy" to copy it

KEYBOARD SHORTCUTS:
• Ctrl+Shift+G (Cmd+Shift+G on Mac) - Check grammar
• Ctrl+Shift+R (Cmd+Shift+R on Mac) - Quick rephrase
• Esc - Close popups

FEATURES:
✓ Real-time grammar checking
✓ 8 AI rephrase styles
✓ Live style switching
✓ Context menu support
✓ Keyboard shortcuts
✓ Dark mode support

TIPS:
• Grammar errors show a red wavy underline
• Click on underlined text to see suggestions
• The floating button shows error count
• Settings are saved automatically

For more help, visit the Options page.
        `;
        
        alert(helpText.trim());
    });
    
    // Options link
    document.getElementById('options-link').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });
    
    // Check status
    checkStatus();
});

async function checkStatus() {
    const statusEl = document.getElementById('status');
    
    try {
        // Try to get settings to verify extension is working
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
        
        if (response && response.settings) {
            statusEl.textContent = '✓ Ready';
            statusEl.style.color = '#28a745';
        } else {
            statusEl.textContent = '⚠ Warning';
            statusEl.style.color = '#ffc107';
        }
    } catch (error) {
        statusEl.textContent = '✗ Error';
        statusEl.style.color = '#dc3545';
        console.error('Status check error:', error);
    }
}
