from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import tempfile
import shutil
import pathlib
import sys
import os
import io
import zipfile
import urllib.request
from typing import Optional, Tuple

# Ensure project root is on path so we can import repo_to_single_page
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from repo_to_single_page import (
    git_clone,
    git_head_commit,
    collect_files,
    build_html,
    MAX_DEFAULT_BYTES,
)


def generate_html_from_repo(repo_url: str, max_bytes: int = MAX_DEFAULT_BYTES) -> str:
    tmpdir = tempfile.mkdtemp(prefix="rendergit_")
    repo_dir = pathlib.Path(tmpdir, "repo")
    try:
        effective_repo_dir: Optional[pathlib.Path] = None
        head = "(unknown)"

        # Try git clone first
        try:
            git_clone(repo_url, str(repo_dir))
            effective_repo_dir = repo_dir
            head = git_head_commit(str(repo_dir))
        except Exception:
            # Fallback: try GitHub archive zip
            extracted = try_fetch_github_zip(repo_url, repo_dir)
            if extracted is None:
                raise
            effective_repo_dir = extracted

        infos = collect_files(effective_repo_dir, max_bytes)
        return build_html(repo_url, effective_repo_dir, head, infos)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def try_fetch_github_zip(repo_url: str, dest_dir: pathlib.Path) -> Optional[pathlib.Path]:
    """Attempt to download and extract a GitHub repo archive.zip.

    Supports URLs like https://github.com/owner/repo[.git][/#ref]. We'll attempt main then master if ref missing.
    Returns extracted repo directory or None if fails.
    """
    owner, repo, ref = parse_github(repo_url)
    if owner is None or repo is None:
        return None

    # Try candidate refs: provided ref, then common defaults
    candidates = [r for r in [ref, "main", "master"] if r]
    for r in candidates:
        zip_url = f"https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{r}"
        try:
            with urllib.request.urlopen(zip_url, timeout=20) as resp:
                data = resp.read()
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                zf.extractall(dest_dir)
            # The zip typically contains a single top-level dir like repo-ref/
            subdirs = [p for p in dest_dir.iterdir() if p.is_dir()]
            if subdirs:
                return subdirs[0]
        except Exception:
            continue
    return None


def parse_github(url: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        parsed = urlparse(url)
        parts = [p for p in parsed.path.split('/') if p]
        if len(parts) < 2:
            return None, None, None
        owner = parts[0]
        repo = parts[1]
        if repo.endswith('.git'):
            repo = repo[:-4]
        # Optional ref: /tree/<ref>
        ref = None
        if len(parts) >= 4 and parts[2] in ("tree", "commit", "releases", "tags"):
            ref = parts[3]
        return owner, repo, ref
    except Exception:
        return None, None, None


def parse_body(repo_handler: BaseHTTPRequestHandler) -> dict:
    length_header = repo_handler.headers.get("Content-Length")
    if not length_header:
        return {}
    try:
        length = int(length_header)
    except ValueError:
        return {}
    data = repo_handler.rfile.read(length)
    content_type = repo_handler.headers.get("Content-Type", "")
    if "application/json" in content_type:
        try:
            return json.loads(data.decode("utf-8"))
        except Exception:
            return {}
    elif "application/x-www-form-urlencoded" in content_type:
        try:
            return {k: v[0] for k, v in parse_qs(data.decode("utf-8")).items()}
        except Exception:
            return {}
    else:
        return {}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            url = urlparse(self.path)
            qs = parse_qs(url.query)
            repo_url = (qs.get("repo_url") or [None])[0]
            max_bytes_str = (qs.get("max_bytes") or [None])[0]
            max_bytes = int(max_bytes_str) if max_bytes_str and max_bytes_str.isdigit() else MAX_DEFAULT_BYTES

            if not repo_url:
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>400 Bad Request</h1><p>Missing 'repo_url' query parameter.</p></body></html>"
                )
                return

            if not repo_url.startswith("http://") and not repo_url.startswith("https://"):
                self.send_response(400)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h1>400 Bad Request</h1><p>repo_url must start with http:// or https://</p></body></html>"
                )
                return

            html = generate_html_from_repo(repo_url, max_bytes)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            err = f"<html><body><h1>500 Internal Server Error</h1><pre>{str(e)}</pre></body></html>"
            self.wfile.write(err.encode("utf-8"))

    def do_POST(self):
        try:
            body = parse_body(self)
            repo_url = body.get("repo_url") if isinstance(body, dict) else None
            max_bytes_value = body.get("max_bytes") if isinstance(body, dict) else None
            try:
                max_bytes = int(max_bytes_value) if max_bytes_value is not None else MAX_DEFAULT_BYTES
            except Exception:
                max_bytes = MAX_DEFAULT_BYTES

            if not repo_url:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing 'repo_url' in request body"}).encode("utf-8"))
                return

            html = generate_html_from_repo(str(repo_url), max_bytes)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))


