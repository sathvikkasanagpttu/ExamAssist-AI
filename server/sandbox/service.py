#!/usr/bin/env python3
"""Small isolated execution service. The container is the security boundary."""
import json
import os
import re
import resource
import shutil
import signal
import sqlite3
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_CODE = 64_000
TIMEOUT_SECONDS = 3
LANGUAGES = {
    "python": ("main.py", ["python3", "main.py"]),
    "javascript": ("main.js", ["node", "main.js"]),
    "c": ("main.c", ["sh", "-c", "gcc -O0 -o /tmp/run main.c && /tmp/run"]),
    "cpp": ("main.cpp", ["sh", "-c", "g++ -O0 -o /tmp/run main.cpp && /tmp/run"]),
    "java": ("Main.java", ["sh", "-c", "javac Main.java && java Main"]),
}

def _limits():
    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    resource.setrlimit(resource.RLIMIT_NPROC, (24, 24))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

def execute(payload):
    language = str(payload.get("language", "")).lower()
    code = payload.get("code")
    if language not in LANGUAGES or not isinstance(code, str) or not code or len(code) > MAX_CODE:
        return {"executed": False, "error": "Unsupported language or invalid code"}, 400
    filename, command = LANGUAGES[language]
    with tempfile.TemporaryDirectory(prefix="examassist-") as directory:
        Path(directory, filename).write_text(code, encoding="utf-8")
        os.chown(directory, 10002, 10002)
        os.chown(Path(directory, filename), 10002, 10002)
        disabled_bwrap = Path(directory, ".bwrap-disabled")
        disabled_bwrap.write_text("Sandbox helper is not available inside user code.\n", encoding="utf-8")
        try:
            if not shutil.which("bwrap"):
                return {"executed": False, "error": "Network-isolated sandbox unavailable"}, 503
            isolated_command = ["bwrap", "--die-with-parent", "--unshare-net", "--ro-bind", "/", "/",
                                "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp",
                                "--bind", directory, directory, "--chdir", directory,
                                "--ro-bind", str(disabled_bwrap), "/usr/bin/bwrap",
                                "--uid", "10002", "--gid", "10002", "--", *command]
            with open(Path(directory, ".stdout"), "w+b") as stdout_file, open(Path(directory, ".stderr"), "w+b") as stderr_file:
                proc = subprocess.Popen(isolated_command, cwd=directory, stdin=subprocess.PIPE, stdout=stdout_file,
                                        stderr=stderr_file, text=True, env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": directory, "LANG": "C.UTF-8"},
                                        preexec_fn=_limits, close_fds=True, start_new_session=True)
                try:
                    proc.communicate(input=str(payload.get("stdin", "")), timeout=min(max(float(payload.get("timeoutSeconds", 2)), .1), TIMEOUT_SECONDS))
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()
                    stdout_file.seek(0); stderr_file.seek(0)
                    return {"executed": True, "success": False, "timedOut": True,
                            "stdout": stdout_file.read(12000).decode(errors="replace"),
                            "stderr": stderr_file.read(12000).decode(errors="replace"),
                            "exitCode": None, "error": "Execution timed out"}, 200
                finally:
                    try: os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                stdout_file.seek(0); stderr_file.seek(0)
                return {"executed": True, "success": proc.returncode == 0,
                        "stdout": stdout_file.read(12000).decode(errors="replace"),
                        "stderr": stderr_file.read(12000).decode(errors="replace"), "exitCode": proc.returncode}, 200
        except subprocess.TimeoutExpired as error:
            return {"executed": True, "success": False, "timedOut": True,
                    "stdout": (error.stdout or "")[:12000] if isinstance(error.stdout, str) else "",
                    "stderr": (error.stderr or "")[:12000] if isinstance(error.stderr, str) else "",
                    "exitCode": None, "error": "Execution timed out"}, 200
        except (OSError, ValueError) as error:
            return {"executed": False, "error": "Execution service unavailable"}, 503

def execute_sql(payload):
    schema = payload.get("schema", "")
    query = payload.get("query", "")
    if not isinstance(schema, str) or not isinstance(query, str) or len(schema) + len(query) > MAX_CODE:
        return {"executed": False, "error": "Invalid SQL input"}, 400
    # A fresh in-memory connection confines all writes to this request. Only read queries are accepted.
    if not re.match(r"^\s*(select|with)\b", query, re.I) or ";" in query.rstrip().rstrip(";"):
        return {"executed": False, "error": "Only a single SELECT/CTE query is allowed"}, 400
    try:
        db = sqlite3.connect(":memory:", timeout=1)
        db.enable_load_extension(False)
        db.executescript(schema)
        db.set_authorizer(lambda action, *_: sqlite3.SQLITE_OK if action in {
            sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
            sqlite3.SQLITE_RECURSIVE, sqlite3.SQLITE_TRANSACTION
        } else sqlite3.SQLITE_DENY)
        cursor = db.execute(query)
        rows = cursor.fetchmany(101)
        if len(rows) > 100:
            return {"executed": True, "success": False, "error": "Result exceeded 100 rows", "rows": []}, 200
        return {"executed": True, "success": True, "columns": [x[0] for x in cursor.description or []],
                "rows": [list(row) for row in rows], "dialect": "SQLite"}, 200
    except sqlite3.Error as error:
        return {"executed": True, "success": False, "error": str(error)[:1000], "rows": [], "dialect": "SQLite"}, 200
    finally:
        try: db.close()
        except UnboundLocalError: pass

def symbolic(payload):
    try:
        import sympy
        expression = str(payload.get("expression", ""))[:1000]
        operation = payload.get("operation", "simplify")
        variable = sympy.Symbol(str(payload.get("variable", "x")))
        if not re.fullmatch(r"[A-Za-z0-9+*/^().,\-\s]+", expression):
            raise ValueError("Expression contains unsupported characters")
        names = set(re.findall(r"[A-Za-z]+", expression))
        allowed = {"x": sympy.Symbol("x"), "y": sympy.Symbol("y"), "z": sympy.Symbol("z"),
                   "sin": sympy.sin, "cos": sympy.cos, "tan": sympy.tan, "sqrt": sympy.sqrt,
                   "log": sympy.log, "exp": sympy.exp, "pi": sympy.pi, "E": sympy.E}
        if names - set(allowed): raise ValueError("Expression uses unsupported names")
        expr = sympy.sympify(expression, locals=allowed, evaluate=True)
        if operation == "differentiate": result = sympy.diff(expr, variable)
        elif operation == "integrate": result = sympy.integrate(expr, variable)
        elif operation == "solve": result = sympy.solve(expr, variable)
        else: result = sympy.simplify(expr)
        return {"executed": True, "success": True, "result": str(result)}, 200
    except Exception as error:
        return {"executed": False, "error": "Symbolic operation unavailable: " + str(error)[:500]}, 400

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args): pass
    def do_GET(self):
        if self.path == "/health": self._send({"status": "ok", "languages": list(LANGUAGES)})
        else: self._send({"error": "not found"}, 404)
    def do_POST(self):
        if self.path not in ("/execute", "/sql", "/symbolic"): return self._send({"error": "not found"}, 404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 70_000: return self._send({"error": "request too large"}, 413)
            body = json.loads(self.rfile.read(size))
            result, status = execute(body) if self.path == "/execute" else execute_sql(body) if self.path == "/sql" else symbolic(body)
            self._send(result, status)
        except (ValueError, json.JSONDecodeError): self._send({"error": "invalid JSON"}, 400)
    def _send(self, body, status=200):
        encoded = json.dumps(body).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded))); self.end_headers(); self.wfile.write(encoded)

ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8790"))), Handler).serve_forever()
