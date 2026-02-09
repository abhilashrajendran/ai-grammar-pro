/**
 * AI Grammar Pro+ - Options Page Script v3.1
 */

const STYLE_INFO = {
    professional: { icon: '💼', label: 'Professional' },
    casual: { icon: '😊', label: 'Casual' },
    short: { icon: '✂️', label: 'Concise' },
    academic: { icon: '🎓', label: 'Academic' },
    creative: { icon: '✨', label: 'Creative' },
    technical: { icon: '⚙️', label: 'Technical' },
    simple: { icon: '📝', label: 'Simple' },
    expand: { icon: '📈', label: 'Expand' }
};

let currentSettings = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    setupEventListeners();
    populateStyleCheckboxes();
});

async function loadSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getSettings' });

        if (response && response.settings) {
            currentSettings = response.settings;
            applySettingsToUI(currentSettings);
        }
    } catch (error) {
        showError('Failed to load settings. Please refresh the page.');
    }
}

function applySettingsToUI(settings) {
    const autoCheckToggle = document.getElementById('auto-check-toggle');
    if (settings.autoCheck) {
        autoCheckToggle.classList.add('active');
    } else {
        autoCheckToggle.classList.remove('active');
    }

    document.getElementById('check-delay').value = settings.checkDelay || 1000;
    document.getElementById('theme-select').value = settings.theme || 'auto';

    const showStatsToggle = document.getElementById('show-stats-toggle');
    if (settings.showStatistics) {
        showStatsToggle.classList.add('active');
    } else {
        showStatsToggle.classList.remove('active');
    }

    const shortcutsToggle = document.getElementById('shortcuts-toggle');
    if (settings.enableShortcuts) {
        shortcutsToggle.classList.add('active');
    } else {
        shortcutsToggle.classList.remove('active');
    }

    const enabledStyles = settings.enabledStyles || Object.keys(STYLE_INFO);
    Object.keys(STYLE_INFO).forEach(styleKey => {
        const checkbox = document.getElementById(`style-${styleKey}`);
        if (checkbox) {
            checkbox.checked = enabledStyles.includes(styleKey);
        }
    });

    document.getElementById('lt-url').value = settings.languageToolUrl || '';
    document.getElementById('ollama-url').value = settings.ollamaUrl || '';
    document.getElementById('ollama-model').value = settings.ollamaModel || 'llama3.2:1b';
}

function populateStyleCheckboxes() {
    const container = document.getElementById('style-checkboxes');

    Object.entries(STYLE_INFO).forEach(([key, info]) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `style-${key}`;
        checkbox.checked = true;

        const label = document.createElement('label');
        label.htmlFor = `style-${key}`;
        label.textContent = `${info.icon} ${info.label}`;

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
    });
}

function setupEventListeners() {
    document.getElementById('auto-check-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
    });

    document.getElementById('show-stats-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
    });

    document.getElementById('shortcuts-toggle').addEventListener('click', function () {
        this.classList.toggle('active');
    });

    document.getElementById('save-general').addEventListener('click', () => saveSection('general'));
    document.getElementById('save-services').addEventListener('click', () => saveSection('services'));
    document.getElementById('save-styles').addEventListener('click', () => saveSection('styles'));
}

async function saveSection(section) {
    const saveButton = document.getElementById(`save-${section}`);
    const successMessage = document.getElementById(`success-${section}`);

    // Create a copy of current settings to modify
    const newSettings = { ...currentSettings };

    // Update only the fields for the specific section
    if (section === 'general') {
        newSettings.autoCheck = document.getElementById('auto-check-toggle').classList.contains('active');
        newSettings.checkDelay = parseInt(document.getElementById('check-delay').value);
        newSettings.theme = document.getElementById('theme-select').value;
        newSettings.showStatistics = document.getElementById('show-stats-toggle').classList.contains('active');
        newSettings.enableShortcuts = document.getElementById('shortcuts-toggle').classList.contains('active');
    } else if (section === 'services') {
        newSettings.languageToolUrl = document.getElementById('lt-url').value.trim();
        newSettings.ollamaUrl = document.getElementById('ollama-url').value.trim();
        newSettings.ollamaModel = document.getElementById('ollama-model').value.trim();
    } else if (section === 'styles') {
        newSettings.enabledStyles = [];
        Object.keys(STYLE_INFO).forEach(styleKey => {
            const checkbox = document.getElementById(`style-${styleKey}`);
            if (checkbox && checkbox.checked) {
                newSettings.enabledStyles.push(styleKey);
            }
        });

        if (newSettings.enabledStyles.length === 0) {
            showError('Please enable at least one rephrase style.');
            return;
        }
    }

    try {
        const originalText = saveButton.textContent;
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        const response = await chrome.runtime.sendMessage({
            action: 'saveSettings',
            settings: newSettings
        });

        if (response && response.success) {
            currentSettings = newSettings;

            // Apply theme immediately if changed
            if (section === 'general') {
                await chrome.runtime.sendMessage({
                    action: 'applyTheme',
                    theme: newSettings.theme
                });
            }

            // Show inline success message
            successMessage.style.display = 'block';
            // Reset animation
            successMessage.style.animation = 'none';
            successMessage.offsetHeight; /* trigger reflow */
            successMessage.style.animation = 'fadeOut 2s forwards';

            saveButton.textContent = originalText;
            saveButton.disabled = false;
        } else {
            throw new Error(response.error || 'Save failed');
        }
    } catch (error) {
        showError('Failed to save settings. Please try again.');
        saveButton.textContent = 'Save';
        saveButton.disabled = false;
    }
}

function showError(message) {
    alert(message);
}
