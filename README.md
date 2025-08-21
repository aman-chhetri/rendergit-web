# RenderGit

> Flatten a GitHub repo into a single static HTML page for fast skimming and understanding.

* Tired of clicking around complex file hierarchies of GitHub repos? 
* Do you just want to see all of the code on a single page? 

No worries! I got you covered with `rendergit-web`. Flatten any GitHub repository into a single, searchable HTML page with syntax highlighting, markdown rendering, and a clean sidebar navigation. Perfect for code review, exploration, and an instant Ctrl+F experience.

## 🌐 Demo

**Try it now:** [rendergit-web.vercel.app](https://rendergit-web.vercel.app)

## Usage

Simply visit the web app and paste any GitHub repository URL:
1. Go to [rendergit-web.vercel.app](https://rendergit-web.vercel.app)
2. Paste a GitHub repository URL (e.g., `https://github.com/user_name/repo_name`)
3. Optionally adjust the max file size (default: 50KB)
4. Click "Render" and wait for processing
5. Browse the flattened code with syntax highlighting and sidebar navigation


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


## Contributing

This is a web app adaptation of the original [rendergit](https://github.com/karpathy/rendergit) by Andrej Karpathy. Feel free to submit issues and pull requests!

