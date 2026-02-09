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

### 2. Docker & Docker Compose
-   **Docker Engine**: Version 20.10.0 or higher.
-   **Docker Compose**: Version 1.29.0 or higher (often included with Docker Desktop).
-   *Why?* Docker is used to containerize the LanguageTool and Ollama servers, ensuring they run consistently on any machine without complex dependency installation.

### 3. Local Network Access
-   The extension communicates with local ports:
    -   `8010` (LanguageTool)
    -   `30068` (Ollama)
-   Ensure your firewall allows connections to these ports on `localhost` or your Docker network IP.

## Dependencies (Included via Docker)

These are installed automatically inside the Docker containers:

-   **LanguageTool**: Open-source grammar checker (Java-based).
-   **Ollama**: Local LLM runner.
-   **Llama 3.2 1B**: The specific Large Language Model optimized for speed and rephrasing tasks.
