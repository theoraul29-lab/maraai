#!/usr/bin/env python3
"""
MaraAI Playwright + SQLite + GPT integration.

What this script does:
1) Installs required Python packages if missing.
2) Installs Playwright browser binaries automatically if missing.
3) Opens websites in Playwright (headless by default).
4) Extracts prices, text snippets, and tables (plus optional CSS selector extraction).
5) Saves all web interactions and AI responses in local SQLite.
6) Uses OpenAI GPT API to respond using user prompt + live web data.

Run:
  python maraai_playwright_agent.py --url "https://example.com" --prompt "Summarize key info"

Optional:
  python maraai_playwright_agent.py --url "https://example.com" --prompt "Check price" \
    --selector "price=.product-price" --selector "title=h1"
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


# -----------------------------
# Bootstrap: package installer
# -----------------------------

def _run_command(cmd: List[str]) -> Tuple[int, str, str]:
    """Run a command and return (code, stdout, stderr)."""
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def ensure_package(import_name: str, pip_name: Optional[str] = None) -> None:
    """Install package via pip if import fails."""
    pip_name = pip_name or import_name
    try:
        importlib.import_module(import_name)
        return
    except Exception:
        pass

    print(f"[setup] Installing missing package: {pip_name}")
    code, out, err = _run_command([sys.executable, "-m", "pip", "install", pip_name])
    if code != 0:
        raise RuntimeError(
            f"Failed to install package '{pip_name}'.\nstdout: {out}\nstderr: {err}"
        )


# Ensure runtime dependencies exist.
ensure_package("playwright")
ensure_package("openai")
ensure_package("bs4", "beautifulsoup4")

from bs4 import BeautifulSoup  # noqa: E402
from openai import OpenAI  # noqa: E402
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402


# ----------------------------------------
# Playwright browser installer (auto fix)
# ----------------------------------------

def ensure_playwright_browser(browser_name: str = "chromium") -> None:
    """
    Ensure Playwright browser binary is installed.

    Tries launching quickly; if missing, runs:
      python -m playwright install <browser_name>
    """
    try:
        with sync_playwright() as p:
            browser_type = getattr(p, browser_name)
            browser = browser_type.launch(headless=True)
            browser.close()
        return
    except Exception:
        print(f"[setup] Installing Playwright browser: {browser_name}")

    code, out, err = _run_command(
        [sys.executable, "-m", "playwright", "install", browser_name]
    )
    if code != 0:
        raise RuntimeError(
            "Failed to install Playwright browser.\n"
            f"stdout: {out}\n"
            f"stderr: {err}"
        )


# -----------------------------
# SQLite storage layer
# -----------------------------

class MaraAIDatabase:
    def __init__(self, db_path: str = "maraai.sqlite") -> None:
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        cur = self.conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS web_interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                url TEXT NOT NULL,
                browser TEXT NOT NULL,
                headless INTEGER NOT NULL,
                status TEXT NOT NULL,
                http_status INTEGER,
                error_message TEXT,
                extracted_json TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                user_prompt TEXT NOT NULL,
                interaction_id INTEGER,
                model TEXT NOT NULL,
                ai_response TEXT NOT NULL,
                FOREIGN KEY(interaction_id) REFERENCES web_interactions(id)
            )
            """
        )

        self.conn.commit()

    def save_web_interaction(
        self,
        *,
        url: str,
        browser: str,
        headless: bool,
        status: str,
        http_status: Optional[int],
        error_message: Optional[str],
        extracted: Dict[str, Any],
    ) -> int:
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO web_interactions
            (created_at, url, browser, headless, status, http_status, error_message, extracted_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                utc_now_iso(),
                url,
                browser,
                1 if headless else 0,
                status,
                http_status,
                error_message,
                json.dumps(extracted, ensure_ascii=False),
            ),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def save_ai_response(
        self,
        *,
        user_prompt: str,
        interaction_id: Optional[int],
        model: str,
        ai_response: str,
    ) -> int:
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO ai_responses
            (created_at, user_prompt, interaction_id, model, ai_response)
            VALUES (?, ?, ?, ?, ?)
            """,
            (utc_now_iso(), user_prompt, interaction_id, model, ai_response),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def close(self) -> None:
        self.conn.close()


# -----------------------------
# Data extraction
# -----------------------------

_PRICE_REGEX = re.compile(r"(?<!\w)(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP))(?!\w)")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def extract_tables_from_html(soup: BeautifulSoup, max_tables: int = 5) -> List[List[List[str]]]:
    tables: List[List[List[str]]] = []
    for table in soup.find_all("table")[:max_tables]:
        rows: List[List[str]] = []
        for tr in table.find_all("tr"):
            cells = tr.find_all(["th", "td"])
            row = [normalize_text(cell.get_text(" ")) for cell in cells]
            if row:
                rows.append(row)
        if rows:
            tables.append(rows)
    return tables


def extract_with_selectors(soup: BeautifulSoup, selectors: Dict[str, str]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    for key, css_selector in selectors.items():
        try:
            nodes = soup.select(css_selector)
            if not nodes:
                data[key] = None
            elif len(nodes) == 1:
                data[key] = normalize_text(nodes[0].get_text(" "))
            else:
                data[key] = [normalize_text(n.get_text(" ")) for n in nodes[:20]]
        except Exception as exc:
            data[key] = {"error": f"Selector failed: {exc}"}
    return data


# -----------------------------
# MaraAI agent core
# -----------------------------

@dataclass
class FetchResult:
    ok: bool
    http_status: Optional[int]
    error: Optional[str]
    data: Dict[str, Any]


class MaraAIPlaywrightAgent:
    def __init__(
        self,
        *,
        openai_api_key: str,
        openai_base_url: Optional[str] = None,
        db_path: str = "maraai.sqlite",
        model: str = "gpt-4o-mini",
        browser: str = "chromium",
        headless: bool = True,
        timeout_ms: int = 30000,
    ) -> None:
        self.model = model
        self.browser = browser
        self.headless = headless
        self.timeout_ms = timeout_ms

        self.db = MaraAIDatabase(db_path=db_path)
        self.client = OpenAI(api_key=openai_api_key, base_url=openai_base_url)

        ensure_playwright_browser(browser_name=self.browser)

    def fetch_website_data(
        self,
        *,
        url: str,
        selectors: Optional[Dict[str, str]] = None,
    ) -> Tuple[Optional[int], FetchResult, int]:
        """
        Visit URL, extract useful data, persist interaction, return (interaction_id).
        """
        selectors = selectors or {}
        http_status: Optional[int] = None

        try:
            with sync_playwright() as p:
                browser_type = getattr(p, self.browser)
                browser = browser_type.launch(headless=self.headless)
                context = browser.new_context()
                page = context.new_page()

                response = page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
                http_status = response.status if response else None

                # Wait a bit for dynamic content.
                page.wait_for_timeout(1000)

                html = page.content()
                title = page.title()
                browser.close()

            soup = BeautifulSoup(html, "html.parser")

            visible_text = normalize_text(soup.get_text(" "))
            text_preview = visible_text[:2000]

            prices = list(dict.fromkeys(_PRICE_REGEX.findall(visible_text)))[:30]
            tables = extract_tables_from_html(soup)
            selector_data = extract_with_selectors(soup, selectors)

            extracted: Dict[str, Any] = {
                "url": url,
                "title": title,
                "text_preview": text_preview,
                "prices": prices,
                "tables": tables,
                "selector_data": selector_data,
                "missing_data": {
                    "prices_missing": len(prices) == 0,
                    "tables_missing": len(tables) == 0,
                    "selectors_missing": {
                        k: (v is None) for k, v in selector_data.items()
                    },
                },
            }

            result = FetchResult(ok=True, http_status=http_status, error=None, data=extracted)

            interaction_id = self.db.save_web_interaction(
                url=url,
                browser=self.browser,
                headless=self.headless,
                status="success",
                http_status=http_status,
                error_message=None,
                extracted=extracted,
            )
            return http_status, result, interaction_id

        except PlaywrightTimeoutError as exc:
            msg = f"Timeout while loading website: {exc}"
            result = FetchResult(ok=False, http_status=http_status, error=msg, data={})
            interaction_id = self.db.save_web_interaction(
                url=url,
                browser=self.browser,
                headless=self.headless,
                status="error",
                http_status=http_status,
                error_message=msg,
                extracted={"url": url},
            )
            return http_status, result, interaction_id

        except Exception as exc:
            msg = f"Website fetch/extract failed: {exc}"
            result = FetchResult(ok=False, http_status=http_status, error=msg, data={})
            interaction_id = self.db.save_web_interaction(
                url=url,
                browser=self.browser,
                headless=self.headless,
                status="error",
                http_status=http_status,
                error_message=msg,
                extracted={"url": url, "trace": traceback.format_exc(limit=2)},
            )
            return http_status, result, interaction_id

    def generate_response_with_live_data(
        self,
        *,
        user_prompt: str,
        fetch_result: FetchResult,
        interaction_id: Optional[int],
    ) -> str:
        """
        Use GPT with user prompt + live extracted web data.
        """
        if not fetch_result.ok:
            live_data_summary = {
                "status": "fetch_error",
                "error": fetch_result.error,
                "http_status": fetch_result.http_status,
            }
        else:
            live_data_summary = {
                "status": "ok",
                "http_status": fetch_result.http_status,
                "title": fetch_result.data.get("title"),
                "prices": fetch_result.data.get("prices", []),
                "text_preview": fetch_result.data.get("text_preview", ""),
                "tables": fetch_result.data.get("tables", []),
                "selector_data": fetch_result.data.get("selector_data", {}),
                "missing_data": fetch_result.data.get("missing_data", {}),
            }

        system_msg = (
            "You are MaraAI. Use the provided live website data plus user intent "
            "to give a useful, factual response. If key data is missing, say what is missing "
            "and suggest a next step."
        )

        user_msg = {
            "user_prompt": user_prompt,
            "live_data": live_data_summary,
        }

        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": json.dumps(user_msg, ensure_ascii=False)},
                ],
                temperature=0.2,
            )
            text = completion.choices[0].message.content or "No response generated."
        except Exception as exc:
            text = (
                "I could not generate a GPT response at this moment. "
                f"Underlying error: {exc}"
            )

        self.db.save_ai_response(
            user_prompt=user_prompt,
            interaction_id=interaction_id,
            model=self.model,
            ai_response=text,
        )
        return text

    def run_once(
        self,
        *,
        url: str,
        user_prompt: str,
        selectors: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        http_status, fetch_result, interaction_id = self.fetch_website_data(
            url=url,
            selectors=selectors,
        )

        ai_response = self.generate_response_with_live_data(
            user_prompt=user_prompt,
            fetch_result=fetch_result,
            interaction_id=interaction_id,
        )

        return {
            "interaction_id": interaction_id,
            "fetch_ok": fetch_result.ok,
            "http_status": http_status,
            "fetch_error": fetch_result.error,
            "extracted_data": fetch_result.data,
            "ai_response": ai_response,
        }

    def close(self) -> None:
        self.db.close()


# -----------------------------
# CLI entrypoint
# -----------------------------

def parse_selector_args(selector_args: List[str]) -> Dict[str, str]:
    """
    Parse --selector entries like:
      --selector "price=.product-price"
      --selector "headline=h1"
    """
    selectors: Dict[str, str] = {}
    for item in selector_args:
        if "=" not in item:
            raise ValueError(f"Invalid --selector format: '{item}'. Use key=css_selector")
        key, css = item.split("=", 1)
        key = key.strip()
        css = css.strip()
        if not key or not css:
            raise ValueError(f"Invalid --selector format: '{item}'. Use key=css_selector")
        selectors[key] = css
    return selectors


def resolve_llm_config(
    explicit_base_url: Optional[str] = None,
) -> Tuple[str, Optional[str], str]:
    """
    Resolve API key and base URL.

    Priority:
    1) OPENAI_API_KEY (+ optional OPENAI_BASE_URL or explicit --api-base-url)
    2) GROQ_API_KEY (+ optional explicit --api-base-url)
    3) If OPENAI_API_KEY starts with gsk_, auto-route to Groq-compatible OpenAI endpoint
    """
    openai_key = os.getenv("OPENAI_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")
    env_base_url = os.getenv("OPENAI_BASE_URL")

    if openai_key:
        if openai_key.strip() in {"YOUR_NEW_KEY", "YOUR_API_KEY", "sk-your-key-here"}:
            raise RuntimeError(
                "OPENAI_API_KEY is set to a placeholder value. Replace it with a real key."
            )

        if openai_key.startswith("gsk_"):
            base_url = explicit_base_url or env_base_url or "https://api.groq.com/openai/v1"
            return openai_key, base_url, "groq-compatible"

        base_url = explicit_base_url or env_base_url
        return openai_key, base_url, "openai"

    if groq_key:
        if groq_key.strip() in {"YOUR_NEW_KEY", "YOUR_API_KEY", "gsk-your-key-here"}:
            raise RuntimeError(
                "GROQ_API_KEY is set to a placeholder value. Replace it with a real key."
            )
        base_url = explicit_base_url or "https://api.groq.com/openai/v1"
        return groq_key, base_url, "groq-compatible"

    raise RuntimeError(
        "No API key found. Set OPENAI_API_KEY (or GROQ_API_KEY). "
        "PowerShell example: $env:OPENAI_API_KEY='your_real_key'"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="MaraAI live web data agent with Playwright.")
    parser.add_argument("--url", required=True, help="Target website URL.")
    parser.add_argument("--prompt", required=True, help="User prompt/question for MaraAI.")
    parser.add_argument("--browser", default="chromium", choices=["chromium", "firefox"], help="Playwright browser.")
    parser.add_argument("--headed", action="store_true", help="Run browser with UI (default is headless).")
    parser.add_argument("--db", default="maraai.sqlite", help="SQLite DB file path.")
    parser.add_argument("--model", default="gpt-4o-mini", help="OpenAI model name.")
    parser.add_argument(
        "--api-base-url",
        default=None,
        help="Optional custom OpenAI-compatible API base URL.",
    )
    parser.add_argument(
        "--selector",
        action="append",
        default=[],
        help="Optional selector extraction: key=css_selector (repeatable).",
    )

    args = parser.parse_args()

    api_key, api_base_url, provider_label = resolve_llm_config(args.api_base_url)
    print(f"[setup] LLM provider mode: {provider_label}")

    selectors = parse_selector_args(args.selector)

    agent = MaraAIPlaywrightAgent(
        openai_api_key=api_key,
        openai_base_url=api_base_url,
        db_path=args.db,
        model=args.model,
        browser=args.browser,
        headless=(not args.headed),
    )

    try:
        result = agent.run_once(
            url=args.url,
            user_prompt=args.prompt,
            selectors=selectors,
        )

        print("\n=== MaraAI Result ===")
        print(json.dumps(
            {
                "interaction_id": result["interaction_id"],
                "fetch_ok": result["fetch_ok"],
                "http_status": result["http_status"],
                "fetch_error": result["fetch_error"],
                "title": result["extracted_data"].get("title") if result["extracted_data"] else None,
                "prices_found": len(result["extracted_data"].get("prices", [])) if result["extracted_data"] else 0,
                "tables_found": len(result["extracted_data"].get("tables", [])) if result["extracted_data"] else 0,
            },
            ensure_ascii=False,
            indent=2,
        ))

        print("\n=== AI Response ===")
        print(result["ai_response"])

    finally:
        agent.close()


if __name__ == "__main__":
    main()
