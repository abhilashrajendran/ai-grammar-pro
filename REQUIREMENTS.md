# System Requirements

To run **AI Grammar Pro+**, your system must meet the following requirements.

## Hardware Requirements

Since the AI models run locally, your hardware capabilities will affect performance (speed of suggestions).

-   **RAM**: Minimum 8GB (16GB recommended). The AI model and LanguageTool server combined can use 4-6GB of RAM.
-   **CPU**: Recent multi-core processor (Intel i5/i7/i9 or AMD Ryzen 5/7/9).
-   **Disk Space**: At least 10GB free space for Docker images and AI models.
-   **GPU (Optional but Recommended)**: NVIDIA GPU with CUDA support can significantly speed up the Ollama AI responses.

## Software Requirements

### 1. Web Browser
-   **Google Chrome**: Version 88 or later (Manifest V3 support).
-   **Microsoft Edge**: Recent versions.
-   **Brave**: Recent versions.
-   *Note: Other Chromium-based browsers may work but are not officially tested.*

### 2. Ollama (AI Engine)
-   **Version**: Latest available from [ollama.com](https://ollama.com).
-   **Function**: Runs the local Large Language Model (Llama 3.2 1B).
-   **Installation**: Must be installed directly on the host OS (Windows/Mac/Linux).

### 3. Docker & Docker Compose
-   **Docker Engine**: Version 20.10.0 or higher.
-   **Docker Compose**: Version 1.29.0 or higher (often included with Docker Desktop).
-   *Why?* Docker is used to containerize the LanguageTool server (Java based), ensuring it runs consistently without complex Java dependencies.

## Dependencies

-   **LanguageTool**: Open-source grammar checker (via Docker).
-   **Llama 3.2 1B**: The specific Large Language Model optimized for speed and rephrasing tasks (via Ollama).
