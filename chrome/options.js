/**
 * AI Grammar Pro+ - Options Page Script
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
    // Load current settings
    await loadSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    // Populate style checkboxes
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
        console.error('Error loading settings:', error);
        showError('Failed to load settings. Please refresh the page.');
    }
}

function applySettingsToUI(settings) {
    // Auto check
    const autoCheckToggle = document.getElementById('auto-check-toggle');
    if (settings.autoCheck) {
        autoCheckToggle.classList.add('active');
    } else {
        autoCheckToggle.classList.remove('active');
    }
    
    // Check delay
    document.getElementById('check-delay').value = settings.checkDelay || 1000;
    
    // Default style
    document.getElementById('default-style').value = settings.defaultStyle || 'professional';
    
    // In loadSettings/applySettingsToUI
    document.getElementById('theme-select').value = settings.theme || 'auto';

    // Show statistics
    const showStatsToggle = document.getElementById('show-stats-toggle');
    if (settings.showStatistics) {
        showStatsToggle.classList.add('active');
    } else {
        showStatsToggle.classList.remove('active');
    }
    
    // Shortcuts
    const shortcutsToggle = document.getElementById('shortcuts-toggle');
    if (settings.enableShortcuts) {
        shortcutsToggle.classList.add('active');
    } else {
        shortcutsToggle.classList.remove('active');
    }
    
    // Enabled styles
    const enabledStyles = settings.enabledStyles || Object.keys(STYLE_INFO);
    Object.keys(STYLE_INFO).forEach(styleKey => {
        const checkbox = document.getElementById(`style-${styleKey}`);
        if (checkbox) {
            checkbox.checked = enabledStyles.includes(styleKey);
        }
    });

    document.getElementById('lt-url').value = 
                settings.languageToolUrl || 'http://192.168.6.2:8010/v2/check';
            
    document.getElementById('ollama-url').value = 
        settings.ollamaUrl || 'http://192.168.6.2:30068/api/generate';
        
    document.getElementById('ollama-model').value = 
        settings.ollamaModel || 'llama3.2:1b';
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
    // Toggle switches
    document.getElementById('auto-check-toggle').addEventListener('click', function() {
        this.classList.toggle('active');
    });
    
    document.getElementById('show-stats-toggle').addEventListener('click', function() {
        this.classList.toggle('active');
    });
    
    document.getElementById('shortcuts-toggle').addEventListener('click', function() {
        this.classList.toggle('active');
    });
    
    // Save button
    document.getElementById('save-button').addEventListener('click', saveSettings);
}

async function saveSettings() {
    const saveButton = document.getElementById('save-button');
    const successMessage = document.getElementById('success-message');
    
    // Collect settings
    const settings = {
        autoCheck: document.getElementById('auto-check-toggle').classList.contains('active'),
        checkDelay: parseInt(document.getElementById('check-delay').value),
        defaultStyle: document.getElementById('default-style').value,
        theme: document.getElementById('theme-select').value,
        showStatistics: document.getElementById('show-stats-toggle').classList.contains('active'),
        enableShortcuts: document.getElementById('shortcuts-toggle').classList.contains('active'),
        languageToolUrl: document.getElementById('lt-url').value.trim(),
        ollamaUrl: document.getElementById('ollama-url').value.trim(),
        ollamaModel: document.getElementById('ollama-model').value.trim(),
        enabledStyles: []
    };
    
    // Collect enabled styles
    Object.keys(STYLE_INFO).forEach(styleKey => {
        const checkbox = document.getElementById(`style-${styleKey}`);
        if (checkbox && checkbox.checked) {
            settings.enabledStyles.push(styleKey);
        }
    });
    
    // Ensure at least one style is enabled
    if (settings.enabledStyles.length === 0) {
        showError('Please enable at least one rephrase style.');
        return;
    }
    
    try {
        // Disable button
        saveButton.disabled = true;
        saveButton.textContent = '💾 Saving...';
        
        // Save to storage
        const response = await chrome.runtime.sendMessage({
            action: 'saveSettings',
            settings: settings
        });
        
        if (response && response.success) {
            currentSettings = settings;
            
            // Show success message
            successMessage.style.display = 'block';
            saveButton.textContent = '✓ Saved!';
            
            setTimeout(() => {
                successMessage.style.display = 'none';
                saveButton.textContent = '💾 Save Settings';
                saveButton.disabled = false;
            }, 2000);
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Failed to save settings. Please try again.');
        saveButton.textContent = '💾 Save Settings';
        saveButton.disabled = false;
    }
}

function showError(message) {
    alert(message);
}
