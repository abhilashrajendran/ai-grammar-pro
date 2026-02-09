# AI Grammar Pro+

**Version:** 1.0.0

AI Grammar Pro+ is an advanced browser extension that combines traditional grammar checking with state-of-the-art AI rephrasing capabilities. It runs entirely locally, ensuring your data remains private while providing professional-grade writing assistance.

## Key Features

- **Local Privacy**: All processing happens on your local machine. No text is sent to external cloud servers.
- **Advanced Grammar Checking**: Powered by a local instance of LanguageTool.
- **AI-Powered Rephrasing**: Uses a local LLM (Ollama with Llama 3.2 1B) to rewrite text in various styles:
    - 💼 **Professional**: For corporate and formal communication.
    - 😊 **Casual**: For friendly, natural tone.
    - ✂️ **Concise**: Shortens text without losing meaning.
    - 🎓 **Academic**: Formal vocabulary and objective tone.
    - ✨ **Creative**: Evocative language and engaging flow.
    - ⚙️ **Technical**: Precise and industry-standard terminology.
    - 📝 **Simple**: Easy-to-understand language.
    - 📈 **Expand**: Adds details and clarifications.
- **Real-time Suggestions**: Context menu integration for quick access.
- **Customizable**: Toggle features, change themes, and adjust settings via the options page.

## System Architecture

The project consists of three main components:
1.  **Chrome Extension**: The frontend user interface (content scripts, popup, options).
2.  **LanguageTool Server**: A Docker container running the grammar check API.
3.  **Ollama Server**: A Docker container running the Large Language Model for rephrasing.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed diagram.

## Prerequisites

Before installing, ensure you have the following software installed:
-   **Google Chrome** (or a Chromium-based browser like Edge, Brave).
-   **Docker Desktop**: Required to run the local servers. [Download Docker](https://www.docker.com/products/docker-desktop/).

See [REQUIREMENTS.md](REQUIREMENTS.md) for detailed version information.

## Installation Guide

### Step 1: Start the Local Servers

1.  Navigate to the `docker` folder in this repository.
    ```bash
    cd docker
    ```
2.  Start the services using Docker Compose.
    ```bash
    docker-compose up -d
    ```
    *This will download the necessary images for LanguageTool and Ollama. It may take some time depending on your internet connection.*

3.  **Important**: You need to pull the specific AI model used by the extension.
    ```bash
    docker exec -it ollama ollama pull llama3.2:1b
    ```

### Step 2: Install the Extension in Chrome

1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** in the top-right corner.
3.  Click **Load unpacked**.
4.  Select the `chrome` folder from this repository (system path: `<path-to-repo>/chrome`).
5.  The extension should now appear in your list with the "AI Grammar Pro+" icon.

## Usage

See [HELP.md](HELP.md) for a detailed user guide, troubleshooting, and FAQ.

## Configuration

You can configure the extension by clicking the extension icon and selecting "Options" or by right-clicking the icon and choosing "Options".
-   **Server URLs**: Default is `http://localhost:8010` (LanguageTool) and `http://localhost:30068` (Ollama). *Note: Ensure your Docker IP matches these or update them in the Options page to `http://localhost:8010` and `http://localhost:30068` if running on the same machine.*
-   **Styles**: Enable/disable specific rewrite styles.

## License

See `COPYING.txt` for license information.
