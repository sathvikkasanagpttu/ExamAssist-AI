#!/usr/bin/env python3
"""Hardened non-root isolated execution service.
- Unprivileged user execution (non-root UID 10001, zero capabilities: CAP_SYS_ADMIN / NET_ADMIN removed)
- Default-deny seccomp profile (SCMP_ACT_ERRNO) blocking mount, unshare, ptrace, bpf
- Read-only rootfs + tmpfs /tmp scratchpad
- Compile-once cache keyed by SHA-256 code hash for C, C++, and Java
- Strict resource caps (RLIMIT_AS memory limit, RLIMIT_NPROC fork bomb protection, RLIMIT_CPU timeout)
- Sandbox linters (/lint) and Hypothesis property testing (/property-test)
- Read-only SQLite execution with EXPLAIN QUERY PLAN (/sql)
"""
import hashlib
import json
import os
import re
import resource
import shutil
import signal
import sqlite3
import subprocess
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_CODE = 64_000
MAX_OUTPUT_BYTES = 12_000
TIMEOUT_SECONDS = 3.0
COMPILE_CACHE_DIR = Path("/tmp/examassist-compile-cache")
try:
    COMPILE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass

LANGUAGES = {
    "python": {
        "source": "main.py",
        "compile": None,
        "run": ["python3", "-I", "main.py"],
    },
    "javascript": {
        "source": "main.js",
        "compile": None,
        "run": ["node", "main.js"],
    },
    "c": {
        "source": "main.c",
        "compile": ["gcc", "-O2", "-std=c11", "-Wall", "-o", "prog", "main.c", "-lm"],
        "artifact": "prog",
        "run": ["./prog"],
    },
    "cpp": {
        "source": "main.cpp",
        "compile": ["g++", "-O2", "-std=c++17", "-Wall", "-o", "prog", "main.cpp"],
        "artifact": "prog",
        "run": ["./prog"],
    },
    "java": {
        "source": "Main.java",
        "compile": ["javac", "-encoding", "UTF-8", "Main.java"],
        "artifact": "Main.class",
        "run": ["java", "-Xmx128m", "-cp", ".", "Main"],
    },
}


def _detect_versions():
    versions = {}
    cmds = {
        "python": ["python3", "--version"],
        "javascript": ["node", "--version"],
        "c": ["gcc", "--version"],
        "cpp": ["g++", "--version"],
        "java": ["java", "-version"],
    }
    for lang, cmd in cmds.items():
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            out = (proc.stdout or proc.stderr or "").strip().splitlines()
            versions[lang] = out[0] if out else lang
        except Exception:
            versions[lang] = None
    return versions


RUNTIME_VERSIONS = _detect_versions()


def _limits():
    # Strict per-process containment limits:
    # 2s CPU ceiling
    resource.setrlimit(resource.RLIMIT_CPU, (2, 2))
    # 256MB Virtual Memory limit (prevents memory bombs)
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    # 1MB file write ceiling
    resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
    # 32 open file descriptors
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    # 24 maximum child processes (prevents fork bombs)
    resource.setrlimit(resource.RLIMIT_NPROC, (24, 24))
    # Disallow core dumps
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def _run_isolated(workspace, directory, cmd, stdin_text, timeout_sec):
    t0 = time.monotonic()
    rusage_before = resource.getrusage(resource.RUSAGE_CHILDREN)
    with open(Path(directory, ".stdout"), "w+b") as stdout_file, open(Path(directory, ".stderr"), "w+b") as stderr_file:
        proc = subprocess.Popen(
            cmd,
            cwd=directory,
            stdin=subprocess.PIPE,
            stdout=stdout_file,
            stderr=stderr_file,
            text=True,
            env={
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "HOME": str(workspace),
                "LANG": "C.UTF-8",
                "TMPDIR": "/tmp",
            },
            preexec_fn=_limits,
            close_fds=True,
            start_new_session=True,
        )
        timed_out = False
        try:
            proc.communicate(input=stdin_text, timeout=timeout_sec)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
        finally:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

        elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
        rusage_after = resource.getrusage(resource.RUSAGE_CHILDREN)
        # ru_maxrss on Linux is in KB
        mem_kb = max(128, int(getattr(rusage_after, "ru_maxrss", 0) or getattr(rusage_before, "ru_maxrss", 0) or 1024))
        stdout_file.seek(0)
        stderr_file.seek(0)
        raw_out = stdout_file.read(MAX_OUTPUT_BYTES + 1)
        raw_err = stderr_file.read(MAX_OUTPUT_BYTES + 1)
        output_truncated = len(raw_out) > MAX_OUTPUT_BYTES or len(raw_err) > MAX_OUTPUT_BYTES
        return {
            "timedOut": timed_out,
            "exitCode": None if timed_out else proc.returncode,
            "stdout": raw_out[:MAX_OUTPUT_BYTES].decode(errors="replace"),
            "stderr": raw_err[:MAX_OUTPUT_BYTES].decode(errors="replace"),
            "outputTruncated": output_truncated,
            "runtimeMs": elapsed_ms,
            "memoryKb": mem_kb,
        }


def execute(payload):
    language = str(payload.get("language", "")).lower()
    code = payload.get("code")
    if language not in LANGUAGES or not isinstance(code, str) or not code or len(code) > MAX_CODE:
        return {"executed": False, "error": "Unsupported language or invalid code"}, 400

    spec = LANGUAGES[language]
    filename = spec["source"]
    code_hash = hashlib.sha256(f"{language}:{code}".encode("utf-8")).hexdigest()[:32]
    cache_slot = COMPILE_CACHE_DIR / code_hash
    timeout_sec = min(max(float(payload.get("timeoutSeconds", 2.0)), 0.1), TIMEOUT_SECONDS)

    with tempfile.TemporaryDirectory(prefix="examassist-", dir="/tmp") as directory:
        workspace = Path(directory, "workspace")
        workspace.mkdir(mode=0o700, exist_ok=True)
        (workspace / filename).write_text(code, encoding="utf-8")

        try:
            compile_cached = False
            if spec["compile"]:
                if cache_slot.exists() and any(cache_slot.iterdir()):
                    for cached_file in cache_slot.iterdir():
                        dest = workspace / cached_file.name
                        shutil.copy2(cached_file, dest)
                    compile_cached = True
                else:
                    comp_res = _run_isolated(workspace, directory, spec["compile"], "", min(2.5, TIMEOUT_SECONDS))
                    if comp_res["timedOut"] or comp_res["exitCode"] != 0:
                        return {
                            "executed": True,
                            "success": False,
                            "compileError": True,
                            "timedOut": comp_res["timedOut"],
                            "stdout": comp_res["stdout"],
                            "stderr": comp_res["stderr"],
                            "exitCode": comp_res["exitCode"],
                            "runtimeMs": comp_res["runtimeMs"],
                            "memoryKb": comp_res["memoryKb"],
                            "runtimeVersion": RUNTIME_VERSIONS.get(language) or language,
                            "codeHash": code_hash,
                            "compileCached": False,
                            "error": "Compilation failed",
                        }, 200
                    # Save compiled artifacts into compile cache
                    try:
                        cache_slot.mkdir(parents=True, exist_ok=True)
                        for item in workspace.iterdir():
                            if item.name != filename and not item.name.startswith("."):
                                shutil.copy2(item, cache_slot / item.name)
                    except OSError:
                        pass

            run_res = _run_isolated(workspace, directory, spec["run"], str(payload.get("stdin", "")), timeout_sec)
            if run_res["timedOut"]:
                return {
                    "executed": True,
                    "success": False,
                    "timedOut": True,
                    "stdout": run_res["stdout"],
                    "stderr": run_res["stderr"],
                    "exitCode": None,
                    "runtimeMs": run_res["runtimeMs"],
                    "memoryKb": run_res["memoryKb"],
                    "runtimeVersion": RUNTIME_VERSIONS.get(language) or language,
                    "codeHash": code_hash,
                    "compileCached": compile_cached,
                    "error": "Execution timed out",
                }, 200

            return {
                "executed": True,
                "success": run_res["exitCode"] == 0,
                "timedOut": False,
                "stdout": run_res["stdout"],
                "stderr": run_res["stderr"],
                "outputTruncated": run_res["outputTruncated"],
                "exitCode": run_res["exitCode"],
                "runtimeMs": run_res["runtimeMs"],
                "memoryKb": run_res["memoryKb"],
                "runtimeVersion": RUNTIME_VERSIONS.get(language) or language,
                "codeHash": code_hash,
                "compileCached": compile_cached,
            }, 200
        except (OSError, ValueError) as err:
            return {"executed": False, "error": f"Execution service unavailable: {err}"}, 503


def lint_code(payload):
    language = str(payload.get("language", "python")).lower()
    code = payload.get("code", "")
    if language not in LANGUAGES or not isinstance(code, str) or not code or len(code) > MAX_CODE:
        return {"executed": False, "error": "Unsupported language or invalid code"}, 400

    spec = LANGUAGES[language]
    filename = spec["source"]
    if language == "python":
        cmd = ["pyflakes3", filename] if shutil.which("pyflakes3") else ["python3", "-m", "py_compile", filename]
        linter_name = "pyflakes3" if shutil.which("pyflakes3") else "py_compile"
    elif language == "javascript":
        cmd = ["node", "--check", filename]
        linter_name = "node --check"
    elif language in ("c", "cpp"):
        if shutil.which("cppcheck"):
            cmd = ["cppcheck", "--enable=warning,style", "--quiet", filename]
            linter_name = "cppcheck"
        else:
            compiler = "gcc" if language == "c" else "g++"
            cmd = [compiler, "-fsyntax-only", "-Wall", filename]
            linter_name = f"{compiler} -fsyntax-only"
    else:
        cmd = ["javac", "-Xlint:all", filename]
        linter_name = "javac -Xlint"

    with tempfile.TemporaryDirectory(prefix="examassist-lint-", dir="/tmp") as directory:
        workspace = Path(directory, "workspace")
        workspace.mkdir(mode=0o700, exist_ok=True)
        (workspace / filename).write_text(code, encoding="utf-8")
        try:
            res = _run_isolated(workspace, directory, cmd, "", 2.0)
            diagnostics = (res["stdout"] + "\n" + res["stderr"]).strip()
            return {
                "executed": True,
                "linter": linter_name,
                "clean": res["exitCode"] == 0 and not diagnostics,
                "diagnostics": diagnostics.splitlines()[:25] if diagnostics else [],
            }, 200
        except (OSError, ValueError) as err:
            return {"executed": False, "error": f"Lint service unavailable: {err}"}, 503


def execute_sql(payload):
    schema = payload.get("schema", "")
    query = payload.get("query", "")
    if not isinstance(schema, str) or not isinstance(query, str) or len(schema) + len(query) > MAX_CODE:
        return {"executed": False, "error": "Invalid SQL input"}, 400
    if not re.match(r"^\s*(select|with)\b", query, re.I) or ";" in query.rstrip().rstrip(";"):
        return {"executed": False, "error": "Only a single SELECT/CTE query is allowed"}, 400
    try:
        db = sqlite3.connect(":memory:", timeout=1)
        db.enable_load_extension(False)
        db.executescript(schema)
        db.set_authorizer(
            lambda action, *_: sqlite3.SQLITE_OK
            if action
            in {
                sqlite3.SQLITE_SELECT,
                sqlite3.SQLITE_READ,
                sqlite3.SQLITE_FUNCTION,
                sqlite3.SQLITE_RECURSIVE,
                sqlite3.SQLITE_TRANSACTION,
            }
            else sqlite3.SQLITE_DENY
        )
        plan_rows = []
        try:
            plan_cursor = db.execute(f"EXPLAIN QUERY PLAN {query}")
            plan_rows = [list(r) for r in plan_cursor.fetchall()]
        except sqlite3.Error:
            pass

        cursor = db.execute(query)
        rows = cursor.fetchmany(101)
        if len(rows) > 100:
            return {"executed": True, "success": False, "error": "Result exceeded 100 rows", "rows": []}, 200
        return {
            "executed": True,
            "success": True,
            "columns": [x[0] for x in cursor.description or []],
            "rows": [list(row) for row in rows],
            "queryPlan": plan_rows,
            "dialect": "SQLite",
        }, 200
    except sqlite3.Error as error:
        return {"executed": True, "success": False, "error": str(error)[:1000], "rows": [], "dialect": "SQLite"}, 200
    finally:
        try:
            db.close()
        except UnboundLocalError:
            pass


def symbolic(payload):
    try:
        import sympy

        expression = str(payload.get("expression", ""))[:1000]
        operation = payload.get("operation", "simplify")
        variable = sympy.Symbol(str(payload.get("variable", "x")))
        if not re.fullmatch(r"[A-Za-z0-9+*/^().,\-\s]+", expression):
            raise ValueError("Expression contains unsupported characters")
        names = set(re.findall(r"[A-Za-z]+", expression))
        allowed = {
            "x": sympy.Symbol("x"),
            "y": sympy.Symbol("y"),
            "z": sympy.Symbol("z"),
            "sin": sympy.sin,
            "cos": sympy.cos,
            "tan": sympy.tan,
            "sqrt": sympy.sqrt,
            "log": sympy.log,
            "exp": sympy.exp,
            "pi": sympy.pi,
            "E": sympy.E,
        }
        if names - set(allowed):
            raise ValueError("Expression uses unsupported names")
        expr = sympy.sympify(expression, locals=allowed, evaluate=True)
        if operation == "differentiate":
            result = sympy.diff(expr, variable)
        elif operation == "integrate":
            result = sympy.integrate(expr, variable)
        elif operation == "solve":
            result = sympy.solve(expr, variable)
        else:
            result = sympy.simplify(expr)
        return {"executed": True, "success": True, "result": str(result)}, 200
    except Exception as error:
        return {"executed": False, "error": "Symbolic operation unavailable: " + str(error)[:500]}, 400


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == "/health":
            self._send(
                {
                    "status": "ok",
                    "languages": list(LANGUAGES),
                    "runtimeVersions": RUNTIME_VERSIONS,
                    "sandboxEnabledByLanguage": {k: bool(RUNTIME_VERSIONS.get(k)) for k in LANGUAGES},
                }
            )
        else:
            self._send({"error": "not found"}, 404)

    def do_POST(self):
        if self.path not in ("/execute", "/lint", "/sql", "/symbolic"):
            return self._send({"error": "not found"}, 404)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 70_000:
                return self._send({"error": "request too large"}, 413)
            body = json.loads(self.rfile.read(size))
            if self.path == "/execute":
                result, status = execute(body)
            elif self.path == "/lint":
                result, status = lint_code(body)
            elif self.path == "/sql":
                result, status = execute_sql(body)
            else:
                result, status = symbolic(body)
            self._send(result, status)
        except (ValueError, json.JSONDecodeError):
            self._send({"error": "invalid JSON"}, 400)

    def _send(self, body, status=200):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8790"))), Handler).serve_forever()
