

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('settings-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('help-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'help.html' });
    });

    document.getElementById('options-link').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
    });

    checkStatus();
});

async function checkStatus() {
    const statusEl = document.getElementById('status');

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

        if (response && response.settings) {
            statusEl.textContent = '✓ Ready';
            statusEl.className = 'status-value ready';
        } else {
            statusEl.textContent = '⚠ Warning';
            statusEl.className = 'status-value warning';
        }
    } catch (error) {
        statusEl.textContent = '✗ Error';
        statusEl.className = 'status-value error';
    }
}
