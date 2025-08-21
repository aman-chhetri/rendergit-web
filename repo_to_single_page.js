import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import { marked } from 'marked';
import hljs from 'highlight.js';

export const MAX_DEFAULT_BYTES = 50 * 1024;
const BINARY_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
  ".mp3", ".mp4", ".mov", ".avi", ".mkv", ".wav", ".ogg", ".flac",
  ".ttf", ".otf", ".eot", ".woff", ".woff2",
  ".so", ".dll", ".dylib", ".class", ".jar", ".exe", ".bin"
];
const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkd", ".mkdn"];

export async function git_clone(url, dst) {
  const git = simpleGit();
  await git.clone(url, dst, ['--depth', '1']);
}

export async function git_head_commit(repoDir) {
  try {
    const git = simpleGit(repoDir);
    const hash = await git.revparse(['HEAD']);
    return hash.trim();
  } catch {
    return "(unknown)";
  }
}

function looksBinary(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.includes(ext)) return true;
  return false;
}

async function decideFile(filePath, repoRoot, maxBytes) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, '/');
  let size = 0;
  try {
    const stat = await fs.stat(filePath);
    size = stat.size;
  } catch {
    size = 0;
  }
  if (rel.includes('/.git/') || rel.startsWith('.git/')) {
    return { path: filePath, rel, size, decision: { include: false, reason: "ignored" } };
  }
  if (size > maxBytes) {
    return { path: filePath, rel, size, decision: { include: false, reason: "too_large" } };
  }
  if (looksBinary(filePath)) {
    return { path: filePath, rel, size, decision: { include: false, reason: "binary" } };
  }
  return { path: filePath, rel, size, decision: { include: true, reason: "ok" } };
}

export async function collect_files(repoRoot, maxBytes) {
  const infos = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        infos.push(await decideFile(fullPath, repoRoot, maxBytes));
      }
    }
  }
  await walk(repoRoot);
  return infos;
}

function slugify(str) {
  return str.replace(/[^a-zA-Z0-9\-_]/g, '-');
}

export async function build_html(repo_url, repo_dir, head_commit, infos) {
  const rendered = infos.filter(i => i.decision.include);
  const skipped_binary = infos.filter(i => i.decision.reason === "binary");
  const skipped_large = infos.filter(i => i.decision.reason === "too_large");
  const skipped_ignored = infos.filter(i => i.decision.reason === "ignored");
  const total_files = rendered.length + skipped_binary.length + skipped_large.length + skipped_ignored.length;

  const toc_html = rendered.map(i =>
    `<li><a href="#file-${slugify(i.rel)}">${i.rel}</a> <span class="muted">(${i.size} bytes)</span></li>`
  ).join('');

  // Directory tree
  const tree_text = await generate_tree_fallback(repo_dir);

  // LLM CXML view
  const cxml_text = await generate_cxml_text(infos);

  // Render file sections
  const sections = [];
  for (const i of rendered) {
    const anchor = slugify(i.rel);
    const ext = path.extname(i.path).toLowerCase();
    let body_html = '';
    try {
      const text = await fs.readFile(i.path, 'utf-8');
      if (MARKDOWN_EXTENSIONS.includes(ext)) {
        body_html = marked(text);
      } else {
        const highlighted = hljs.highlightAuto(text).value;
        body_html = `<div class="highlight"><pre><code>${highlighted}</code></pre></div>`;
      }
    } catch (e) {
      body_html = `<pre class="error">Failed to render: ${e.message}</pre>`;
    }
    sections.push(`
<section class="file-section" id="file-${anchor}">
  <h2>${i.rel} <span class="muted">(${i.size} bytes)</span></h2>
  <div class="file-body">${body_html}</div>
  <div class="back-top"><a href="#top">↑ Back to top</a></div>
</section>
`);
  }

  function render_skip_list(title, items) {
    if (!items.length) return "";
    const lis = items.map(i =>
      `<li><code>${i.rel}</code> <span class='muted'>(${i.size} bytes)</span></li>`
    ).join('');
    return `<details open><summary>${title} (${items.length})</summary>
<ul class='skip-list'>${lis}</ul></details>`;
  }
  const skipped_html = render_skip_list("Skipped binaries", skipped_binary) +
    render_skip_list("Skipped large files", skipped_large);

  // HTML with directory tree and LLM view
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Flattened repo – ${repo_url}</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 0; }
  .muted { color: #777; font-size: 0.9em; }
  .highlight { background: #f6f8fa; padding: 0.75rem; border-radius: 6px; }
  .file-section { padding: 1rem; border-top: 1px solid #eee; }
  .file-section h2 { margin: 0 0 0.5rem 0; font-size: 1.1rem; }
  .file-body { margin-bottom: 0.5rem; }
  .back-top { font-size: 0.9rem; }
  .skip-list code { background: #f6f8fa; padding: 0.1rem 0.3rem; border-radius: 4px; }
  .error { color: #b00020; background: #fff3f3; }
  .view-toggle { margin: 1rem 0; display: flex; gap: 0.5rem; align-items: center; }
  .toggle-btn { padding: 0.5rem 1rem; border: 1px solid #d1d9e0; background: white; cursor: pointer; border-radius: 6px; font-size: 0.9rem; }
  .toggle-btn.active { background: #0366d6; color: white; border-color: #0366d6; }
  .toggle-btn:hover:not(.active) { background: #f6f8fa; }
  #llm-view { display: none; }
  #llm-text { width: 100%; height: 70vh; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85em; border: 1px solid #d1d9e0; border-radius: 6px; padding: 1rem; resize: vertical; }
  .copy-hint { margin-top: 0.5rem; color: #666; font-size: 0.9em; }
</style>
</head>
<body>
<a id="top"></a>
<section>
  <div><strong>Repository:</strong> <a href="${repo_url}">${repo_url}</a></div>
  <small><strong>HEAD commit:</strong> ${head_commit}</small>
  <div>
    <strong>Total files:</strong> ${total_files} · <strong>Rendered:</strong> ${rendered.length} · <strong>Skipped:</strong> ${skipped_binary.length + skipped_large.length + skipped_ignored.length}
  </div>
</section>
<div class="view-toggle">
  <strong>View:</strong>
  <button class="toggle-btn active" onclick="showHumanView()">👤 Human</button>
  <button class="toggle-btn" onclick="showLLMView()">🤖 LLM</button>
</div>
<div id="human-view">
  <section>
    <h2>Directory tree</h2>
    <pre>${tree_text}</pre>
  </section>
  <section>
    <h2>Table of contents (${rendered.length})</h2>
    <ul>${toc_html}</ul>
  </section>
  <section>
    <h2>Skipped items</h2>
    ${skipped_html}
  </section>
  ${sections.join('\n')}
</div>
<div id="llm-view">
  <section>
    <h2>🤖 LLM View - CXML Format</h2>
    <p>Copy the text below and paste it to an LLM for analysis:</p>
    <textarea id="llm-text" readonly>${cxml_text.replace(/</g, '&lt;')}</textarea>
    <div class="copy-hint">
      💡 <strong>Tip:</strong> Click in the text area and press Ctrl+A (Cmd+A on Mac) to select all, then Ctrl+C (Cmd+C) to copy.
    </div>
  </section>
</div>
<script>
function showHumanView() {
  document.getElementById('human-view').style.display = 'block';
  document.getElementById('llm-view').style.display = 'none';
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
}
function showLLMView() {
  document.getElementById('human-view').style.display = 'none';
  document.getElementById('llm-view').style.display = 'block';
  document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  setTimeout(() => {
    const textArea = document.getElementById('llm-text');
    textArea.focus();
    textArea.select();
  }, 100);
}
</script>
</body>
</html>
`;
}

function generate_tree_fallback(root) {
  let lines = [];
  function walk(dir, prefix = "") {
    return fs.readdir(dir, { withFileTypes: true }).then(entries => {
      entries = entries.filter(e => e.name !== ".git");
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return Promise.all(entries.map(async (e, i) => {
        const last = i === entries.length - 1;
        const branch = last ? "└── " : "├── ";
        lines.push(prefix + branch + e.name);
        if (e.isDirectory()) {
          const extension = last ? "    " : "│   ";
          await walk(path.join(dir, e.name), prefix + extension);
        }
      }));
    });
  }
  lines.push(path.basename(root));
  return walk(root).then(() => lines.join('\n'));
}

async function generate_cxml_text(infos) {
  let lines = ["<documents>"];
  const rendered = infos.filter(i => i.decision.include);
  let idx = 1;
  for (const i of rendered) {
    lines.push(`<document index="${idx++}">`);
    lines.push(`<source>${i.rel}</source>`);
    lines.push("<document_content>");
    try {
      const text = await fs.readFile(i.path, 'utf-8');
      lines.push(text);
    } catch (e) {
      lines.push(`Failed to read: ${e.message}`);
    }
    lines.push("</document_content>");
    lines.push("</document>");
  }
  lines.push("</documents>");
  return lines.join('\n');
}