# rendergit-web

> Just show me the code.

Tired of clicking around complex file hierarchies of GitHub repos? Do you just want to see all of the code on a single page? Enter `rendergit-web`. Flatten any GitHub repository into a single, searchable HTML page with syntax highlighting, markdown rendering, and a clean sidebar navigation. Perfect for code review, exploration, and an instant Ctrl+F experience.

## 🌐 Live Demo

**Try it now:** [rendergit-web.vercel.app](https://rendergit-web.vercel.app)

## Basic usage

### Web Application (Recommended)
Simply visit the web app and paste any GitHub repository URL:
1. Go to [rendergit-web.vercel.app](https://rendergit-web.vercel.app)
2. Paste a GitHub repository URL (e.g., `https://github.com/karpathy/nanoGPT`)
3. Optionally adjust the max file size (default: 50KB)
4. Click "Render" and wait for processing
5. Browse the flattened code with syntax highlighting and sidebar navigation

### Local Development

Clone and run locally:

```bash
git clone https://github.com/aman-chhetri/rendergit-web
cd rendergit-web
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # Windows
pip install -e .
python serve.py
```

Then visit `http://127.0.0.1:5000`

### CLI Usage (Original)

You can also use the original CLI version:

```bash
pip install -e .
rendergit https://github.com/karpathy/nanoGPT
```

## Features

- **🌐 Web Interface** - No installation required, works in any browser
- **Dual view modes** - toggle between Human and LLM views
  - **👤 Human View**: Pretty interface with syntax highlighting and navigation
  - **🤖 LLM View**: Raw CXML text format - perfect for copying to Claude/ChatGPT for code analysis
- **Syntax highlighting** for code files via Pygments
- **Markdown rendering** for README files and docs
- **Smart filtering** - skips binaries and oversized files
- **Directory tree** overview at the top
- **Sidebar navigation** with file links and sizes
- **Responsive design** that works on mobile
- **Search-friendly** - use Ctrl+F to find anything across all files
- **Git fallback** - Uses GitHub zip archives if git is unavailable


## Deployment

This project is deployed on Vercel with automatic deployments from GitHub:

1. **Fork this repository**
2. **Connect to Vercel**: Import your fork in the Vercel dashboard
3. **Deploy**: Vercel will automatically deploy on every push to main

## Project Structure

```
rendergit-web/
├── index.html          # Frontend UI
├── api/
│   └── render.py       # Serverless function
├── repo_to_single_page.py  # Core rendering logic
├── requirements.txt    # Python dependencies
├── vercel.json        # Vercel configuration
└── README.md          # This file
```

## Contributing

This is a web adaptation of the original [rendergit](https://github.com/karpathy/rendergit) by Andrej Karpathy. Feel free to submit issues and pull requests!

