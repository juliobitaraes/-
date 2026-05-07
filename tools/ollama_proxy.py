#!/usr/bin/env python
"""Simple local proxy for Ollama with CORS enabled.
Run: python tools/ollama_proxy.py
Requires Ollama running on http://localhost:11434
"""

import json
import re
import cgi
import io
import os
import shutil
import time
import urllib.error
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import Request, urlopen

try:
    from pdfminer.high_level import extract_text
except Exception:  # pragma: no cover - optional dependency
    extract_text = None

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover - optional dependency
    PdfReader = None

try:
    from pdf2image import convert_from_bytes
    import pytesseract
except Exception:  # pragma: no cover - optional dependency
    convert_from_bytes = None
    pytesseract = None

try:
    from groq import Groq
except Exception:  # pragma: no cover - optional dependency
    Groq = None

OLLAMA_URL = "http://localhost:11434/api/generate"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "11435"))
MAX_OCR_PAGES = 10
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-lite")
GEMINI_MAX_RETRIES = int(os.environ.get("GEMINI_MAX_RETRIES", "3"))
GEMINI_RETRY_SLEEP = float(os.environ.get("GEMINI_RETRY_SLEEP", "1.5"))
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
GROQ_DEFAULT_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")


def call_gemini(model, prompt):
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")
    if model and (model.startswith("gemini-") or model.startswith("models/gemini-")):
        model_name = model
    else:
        model_name = GEMINI_DEFAULT_MODEL
    if model_name.startswith("models/"):
        model_name = model_name.split("/", 1)[1]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "temperature": 0.6,
            "responseMimeType": "application/json"
        }
    }
    req_body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=req_body, headers={"Content-Type": "application/json"})
    attempt = 0
    while True:
        try:
            with urlopen(req, timeout=120) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
            break
        except Exception as exc:
            attempt += 1
            is_rate_limit = "429" in str(exc)
            if is_rate_limit and attempt <= GEMINI_MAX_RETRIES:
                time.sleep(GEMINI_RETRY_SLEEP * attempt)
                continue
            raise
    candidates = resp_data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates")
    parts = candidates[0].get("content", {}).get("parts") or []
    if not parts:
        raise RuntimeError("Gemini returned empty content")
    return parts[0].get("text", "")


def call_groq(model, prompt):
    key = os.environ.get("GROQ_API_KEY") or GROQ_API_KEY
    if not key:
        raise RuntimeError("GROQ_API_KEY not set")
    model_name = model or GROQ_DEFAULT_MODEL
    if model_name.startswith("gemini-") or model_name.startswith("models/gemini-"):
        model_name = GROQ_DEFAULT_MODEL
    if Groq is not None:
        client = Groq(api_key=key)
        resp = client.chat.completions.create(
            model=model_name,
            temperature=0.6,
            messages=[
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt}
            ]
        )
        choices = resp.choices or []
        if not choices:
            raise RuntimeError("Groq returned no choices")
        return choices[0].message.content or ""

    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": model_name,
        "temperature": 0.6,
        "messages": [
            {"role": "system", "content": "Return only valid JSON."},
            {"role": "user", "content": prompt}
        ]
    }
    req_body = json.dumps(payload).encode("utf-8")
    req = Request(url, data=req_body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {key}"
    })
    try:
        with urlopen(req, timeout=120) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""
        detail = f" {body}" if body else ""
        raise RuntimeError(f"Groq HTTP {exc.code}:{detail}") from exc
    choices = resp_data.get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned no choices")
    content = choices[0].get("message", {}).get("content", "")
    return content


def configure_ocr_paths():
    poppler_path = os.environ.get("POPPLER_PATH")
    if poppler_path and os.path.isdir(poppler_path):
        return poppler_path

    if os.name == "nt":
        poppler_defaults = [
            r"C:\Program Files\poppler\Library\bin",
            r"C:\Program Files (x86)\poppler\Library\bin",
        ]
        for path in poppler_defaults:
            if os.path.isdir(path):
                poppler_path = path
                break

    if pytesseract is not None:
        tesseract_cmd = os.environ.get("TESSERACT_CMD")
        if tesseract_cmd and os.path.exists(tesseract_cmd):
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        elif os.name == "nt":
            tesseract_defaults = [
                r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            ]
            for path in tesseract_defaults:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    break

    return poppler_path


OCR_POPPLER_PATH = configure_ocr_paths()


def build_prompt(tema, quantidade, dificuldade):
    return (
        "Voce e um gerador de questoes de prova. "
        "Gere questoes de multipla escolha em portugues brasileiro. "
        f"Tema: {tema}. Dificuldade: {dificuldade}. "
        f"IMPORTANTE: Voce DEVE gerar EXATAMENTE {quantidade} questoes. "
        f"Gere {quantidade} questoes completas no total. "
        "Regras: 4 alternativas por questao (A, B, C, D). "
        "Nao inclua explicacoes nem texto fora do JSON. "
        f"Retorne APENAS um JSON puro com um array de {quantidade} questoes no formato:\n"
        "{\"questions\":[{\"text\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctIndex\":0},{\"text\":\"...\",\"options\":[\"A\",\"B\",\"C\",\"D\"],\"correctIndex\":1}]}"
    )


def build_prompt_with_text(tema, quantidade, dificuldade, texto):
    base = build_prompt(tema or "Conteudo do PDF", quantidade, dificuldade)
    return (
        base
        + "\nUse o texto abaixo como referencia principal:\n"
        + texto
    )


def extract_json(text):
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            return {"questions": []}
    return {"questions": []}


def normalize_questions(data, default_time):
    questions = data if isinstance(data, list) else data.get("questions", [])
    normalized = []
    for q in questions:
        text = str(q.get("text") or q.get("enunciado") or "").strip()
        if not text:
            continue
        options = q.get("options") or q.get("alternativas") or q.get("opcoes")
        if isinstance(options, dict):
            options = list(options.values())
        if not isinstance(options, list):
            continue
        options = [str(o).strip() for o in options if str(o).strip()]
        if len(options) < 4:
            continue
        if len(options) > 4:
            options = options[:4]
        correct = q.get("correctIndex")
        if not isinstance(correct, int):
            c = str(q.get("correct") or q.get("correta") or q.get("answer") or "").strip().upper()
            correct = "ABCDEF".find(c)
        if correct < 0 or correct >= len(options):
            correct = 0
        time_limit = q.get("timeLimit") if isinstance(q.get("timeLimit"), int) else default_time
        normalized.append({
            "text": text,
            "options": options,
            "correctIndex": correct,
            "timeLimit": time_limit
        })
    return normalized


def has_poppler():
    if OCR_POPPLER_PATH and os.path.isdir(OCR_POPPLER_PATH):
        return True
    return shutil.which("pdftoppm") is not None


def has_tesseract():
    if pytesseract is None:
        return False
    cmd = getattr(pytesseract.pytesseract, "tesseract_cmd", None)
    if cmd and os.path.exists(cmd):
        return True
    return shutil.which("tesseract") is not None


def extract_text_with_fallback(pdf_bytes):
    text = ""
    method = ""

    if extract_text is not None:
        try:
            text = extract_text(io.BytesIO(pdf_bytes)) or ""
            method = "pdfminer"
        except Exception:
            text = ""
            method = ""

    if not text and PdfReader is not None:
        try:
            reader = PdfReader(io.BytesIO(pdf_bytes))
            text = "\n".join([page.extract_text() or "" for page in reader.pages])
            method = "pypdf"
        except Exception:
            text = ""

    if not text and convert_from_bytes is not None and pytesseract is not None:
        try:
            if OCR_POPPLER_PATH:
                images = convert_from_bytes(
                    pdf_bytes,
                    first_page=1,
                    last_page=MAX_OCR_PAGES,
                    poppler_path=OCR_POPPLER_PATH
                )
            else:
                images = convert_from_bytes(pdf_bytes, first_page=1, last_page=MAX_OCR_PAGES)
            text = "\n".join([pytesseract.image_to_string(img) for img in images])
            method = "ocr"
        except Exception:
            text = ""

    return text, method


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path == "/api/generate-questions":
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            try:
                payload = json.loads(raw)
            except Exception:
                self._send(400, {"error": "Invalid JSON"})
                return

            tema = str(payload.get("tema") or "").strip()
            quantidade = int(payload.get("quantidade") or 5)
            dificuldade = str(payload.get("dificuldade") or "media").strip()
            tempo = int(payload.get("tempo") or 60)
            modelo = str(payload.get("modelo") or (GROQ_DEFAULT_MODEL if GROQ_API_KEY else GEMINI_DEFAULT_MODEL)).strip()

            if not tema:
                self._send(400, {"error": "Tema vazio"})
                return

            prompt = build_prompt(tema, quantidade, dificuldade)
            try:
                if GROQ_API_KEY:
                    text = call_groq(modelo, prompt)
                elif GEMINI_API_KEY:
                    text = call_gemini(modelo, prompt)
                else:
                    req_body = json.dumps({
                        "model": modelo,
                        "prompt": prompt,
                        "stream": False,
                        "temperature": 0.6,
                        "format": "json"
                    }).encode("utf-8")
                    req = Request(OLLAMA_URL, data=req_body, headers={"Content-Type": "application/json"})
                    with urlopen(req, timeout=120) as resp:
                        resp_data = json.loads(resp.read().decode("utf-8"))
                    text = resp_data.get("response", "")
            except Exception as exc:
                backend = "Groq" if GROQ_API_KEY else ("Gemini" if GEMINI_API_KEY else "Ollama")
                self._send(502, {"error": f"{backend} error: {exc}"})
                return
            data = extract_json(text)
            questions = normalize_questions(data, tempo)
            self._send(200, {"questions": questions})
            return

        if self.path == "/api/generate-questions-from-pdf":
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", "")
                }
            )
            file_item = form["file"] if "file" in form else None
            if file_item is None or not getattr(file_item, "file", None):
                self._send(400, {"error": "Arquivo PDF ausente"})
                return

            tema = str(form.getvalue("tema") or "").strip()
            quantidade = int(form.getvalue("quantidade") or 5)
            dificuldade = str(form.getvalue("dificuldade") or "media").strip()
            tempo = int(form.getvalue("tempo") or 60)
            modelo = str(form.getvalue("modelo") or (GROQ_DEFAULT_MODEL if GROQ_API_KEY else GEMINI_DEFAULT_MODEL)).strip()

            try:
                pdf_bytes = file_item.file.read()
                texto, method = extract_text_with_fallback(pdf_bytes) if pdf_bytes else ("", "")
            except Exception as exc:
                self._send(400, {"error": f"Falha ao ler PDF: {exc}"})
                return

            texto = re.sub(r"\s+", " ", texto or "").strip()
            warning = ""
            if not texto:
                if method:
                    hint = " (OCR nao conseguiu ler imagens)"
                elif convert_from_bytes is None or pytesseract is None:
                    hint = " (OCR nao instalado)"
                elif not has_poppler():
                    hint = " (OCR precisa do Poppler)"
                elif not has_tesseract():
                    hint = " (OCR precisa do Tesseract)"
                else:
                    hint = ""
                warning = f"PDF sem texto extraivel{hint}. Questoes geradas apenas pelo tema."
                texto = "PDF sem texto extraivel. Gere questoes apenas com base no tema informado."

            max_chars = 12000
            texto = texto[:max_chars]
            prompt = build_prompt_with_text(tema, quantidade, dificuldade, texto)
            try:
                if GROQ_API_KEY:
                    text = call_groq(modelo, prompt)
                elif GEMINI_API_KEY:
                    text = call_gemini(modelo, prompt)
                else:
                    req_body = json.dumps({
                        "model": modelo,
                        "prompt": prompt,
                        "stream": False,
                        "temperature": 0.6,
                        "format": "json"
                    }).encode("utf-8")
                    req = Request(OLLAMA_URL, data=req_body, headers={"Content-Type": "application/json"})
                    with urlopen(req, timeout=120) as resp:
                        resp_data = json.loads(resp.read().decode("utf-8"))
                    text = resp_data.get("response", "")
            except Exception as exc:
                backend = "Groq" if GROQ_API_KEY else ("Gemini" if GEMINI_API_KEY else "Ollama")
                self._send(502, {"error": f"{backend} error: {exc}"})
                return
            data = extract_json(text)
            questions = normalize_questions(data, tempo)
            payload = {"questions": questions}
            if warning:
                payload["warning"] = warning
            self._send(200, payload)
            return

        self._send(404, {"error": "Not found"})


def main():
    server = HTTPServer((HOST, PORT), Handler)
    print(f"Ollama proxy listening on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
