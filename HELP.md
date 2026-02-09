# User Guide & Help

## Functionality Overview

AI Grammar Pro+ assists you in two main ways:
1.  **Grammar Checking**: Automatically scans your text and underlines errors in red. Hover over an error to see suggested corrections.
2.  **AI Rephrasing**: Allows you to select text and rewrite it in a specific style using local AI.

---

## How to Use

### Basic Grammar Check
1.  Navigate to any website with a text input field (e.g., email client, social media, forums).
2.  Type your text.
3.  The extension will automatically check for spelling and grammar errors.
4.  **Click** on any underlined text to accept the suggestion.

### AI Rephrasing
1.  **Select** a sentence or paragraph you want to rewrite.
2.  **Right-click** the selection to open the context menu.
3.  Hover over **Rephrase: [Style]** (e.g., Professional, Casual) or choose **Check Grammar & Rephrase**.
4.  The AI will generate a suggestion. A popup or overlay will appear (depending on configuration) allowing you to replace the text.

### Keyboard Shortcuts
-   `Ctrl+Shift+G` (or `Command+Shift+G` on Mac): Check grammar in the currently focused text area.
-   `Ctrl+Shift+R` (or `Command+Shift+R` on Mac): Quick rephrase with the default style.

---

## Troubleshooting

### "LanguageTool service is not responding"
-   **Cause**: The LanguageTool server container is not running or not reachable.
-   **Fix**:
    1.  Open your terminal/command prompt.
    2.  Run `docker ps` to see if `languagetool` container is active.
    3.  If not, go to the `docker` folder and run `docker-compose up -d`.
    4.  Check if the port `8010` is conflicting with another application.

### "Ollama error: Model may not be available"
-   **Cause**: The AI model `llama3.2:1b` has not been downloaded to your local Ollama instance, or Ollama is not running.
-   **Fix**:
    1.  Ensure Ollama is running (check your system tray or run `ollama serve`).
    2.  Open your terminal.
    3.  Run: `ollama pull llama3.2:1b`
    4.  Wait for the download to complete.

### Extension Icon is Gray / Not Working
-   **Cause**: The extension might need to be reloaded/updated.
-   **Fix**:
    1.  Go to `chrome://extensions`.
    2.  Find "AI Grammar Pro+".
    3.  Click the reload (circular arrow) icon.

### Connection Error / Network Issues
-   **Cause**: The extension is not pointing to the correct local ports.
-   **Fix**:
    1.  Right-click the extension icon > **Options**.
    2.  Ensure URLs are correct:
        -   LanguageTool: `http://localhost:8010/v2/check`
        -   Ollama: `http://localhost:11434/api/generate`
    3.  Click **Save Settings**.
    4.  Click **Test Connection** to verify.

---

## FAQ

**Q: Does this work offline?**
A: Yes! Once Docker is running and the model is pulled in Ollama, you can disconnect from the internet and it will still work.

**Q: Is my data sent to the cloud?**
A: No. All processing involves only your browser and your local services.

**Q: Can I use a different AI model?**
A: Yes. You can change the model name in the **Options** page (e.g., `llama3`, `mistral`), but you must ensure you have pulled that model in Ollama (`ollama pull <model_name>`).
