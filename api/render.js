import { git_clone, git_head_commit, collect_files, build_html, MAX_DEFAULT_BYTES } from '../repo_to_single_page.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { tmpdir } from 'os';
import { parse } from 'url';
import { IncomingForm } from 'formidable';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';

async function tryFetchGithubZip(repoUrl, destDir) {
  const { owner, repo, ref } = parseGithub(repoUrl);
  if (!owner || !repo) return null;
  const candidates = [ref, 'main', 'master'].filter(Boolean);
  for (const r of candidates) {
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${r}`;
    try {
      const resp = await fetch(zipUrl, { timeout: 20000 });
      if (!resp.ok) continue;
      const buffer = await resp.buffer();
      const zip = new AdmZip(buffer);
      zip.extractAllTo(destDir, true);
      const subdirs = (await fs.readdir(destDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => path.join(destDir, d.name));
      if (subdirs.length > 0) return subdirs[0];
    } catch {
      continue;
    }
  }
  return null;
}

function parseGithub(urlStr) {
  try {
    const url = new URL(urlStr);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return {};
    let [owner, repo] = parts;
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    let ref = null;
    if (parts.length >= 4 && ['tree', 'commit', 'releases', 'tags'].includes(parts[2])) {
      ref = parts[3];
    }
    return { owner, repo, ref };
  } catch {
    return {};
  }
}

async function generateHtmlFromRepo(repoUrl, maxBytes = MAX_DEFAULT_BYTES) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rendergit-'));
  const repoDir = path.join(tmp, 'repo');
  let effectiveRepoDir = null;
  let head = '(unknown)';
  try {
    try {
      await git_clone(repoUrl, repoDir);
      effectiveRepoDir = repoDir;
      head = await git_head_commit(repoDir);
    } catch {
      const extracted = await tryFetchGithubZip(repoUrl, repoDir);
      if (!extracted) throw new Error('Failed to fetch repo');
      effectiveRepoDir = extracted;
    }
    const infos = await collect_files(effectiveRepoDir, maxBytes);
    return await build_html(repoUrl, effectiveRepoDir, head, infos);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

export default async function handler(req, res) {
  try {
    let repo_url, max_bytes;
    if (req.method === 'GET') {
      const { query } = parse(req.url, true);
      repo_url = query.repo_url;
      max_bytes = parseInt(query.max_bytes) || MAX_DEFAULT_BYTES;
      if (!repo_url) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end("<html><body><h1>400 Bad Request</h1><p>Missing 'repo_url' query parameter.</p></body></html>");
        return;
      }
      if (!/^https?:\/\//.test(repo_url)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end("<html><body><h1>400 Bad Request</h1><p>repo_url must start with http:// or https://</p></body></html>");
        return;
      }
      const html = await generateHtmlFromRepo(repo_url, max_bytes);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          let data = {};
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            data = JSON.parse(body);
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            data = Object.fromEntries(new URLSearchParams(body));
          }
          repo_url = data.repo_url;
          max_bytes = parseInt(data.max_bytes) || MAX_DEFAULT_BYTES;
          if (!repo_url) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: "Missing 'repo_url' in request body" }));
            return;
          }
          const html = await generateHtmlFromRepo(repo_url, max_bytes);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    } else {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
    }
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<html><body><h1>500 Internal Server Error</h1><pre>${e.message}</pre></body></html>`);
  }
}