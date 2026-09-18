"""Manual Linux acceptance driver: UI input only; never dispatches Loginom operations."""
import fcntl
import json
import os
import pathlib
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time

executable, workspace, evidence, browser_mode = sys.argv[1:5]
resume = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
assert browser_mode in ("--headless", "--no-headless")
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
child = subprocess.Popen(
    [executable, workspace, browser_mode, "--model", "test/test-model"]
    + (["--prompt", "Prepare Loginom only if permission allows it."] if resume.get("permission") else ["--dangerously-skip-permissions"])
    + (["--continue"] if resume.get("latest") else ["--session", resume["session"]] if resume.get("session") else []),
    stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
    env=dict(os.environ, TERM="xterm-256color"),
)
os.close(slave)
def terminate(_signal, _frame):
    raise SystemExit(1)

signal.signal(signal.SIGTERM, terminate)
started = time.monotonic()
selected = 3 if resume.get("permission") else 0
permission_rejected = False
permission_approved = False
reject_next = False
always_pending = False
always_selected_at = None
always_confirmed = False
selected_at = None
finishing = None
exit_step = 0
screen = bytearray()
forced = False
try:
    while child.poll() is None and time.monotonic() - started < 600:
        ready, _, _ = select.select([master, sys.stdin], [], [], 0.1)
        if sys.stdin in ready and finishing is None:
            command = sys.stdin.readline()
            if command.strip() == "finish":
                finishing = time.monotonic()
            elif command.strip() == "reject-next":
                reject_next = True
                screen.clear()
                pathlib.Path(evidence, "permission-next-ready").write_text("ready")
            elif not command:
                # Losing the acceptance owner must not leave its CLI running.
                os.killpg(child.pid, signal.SIGINT)
                finishing = time.monotonic()
        if master in ready:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            sys.stdout.buffer.write(chunk)
            sys.stdout.buffer.flush()
            screen.extend(chunk)
            if resume.get("permission"):
                with open(pathlib.Path(evidence, "terminal-progress.txt"), "ab") as trace:
                    trace.write(chunk)
            if b"\x1b[6n" in chunk:
                os.write(master, b"\x1b[1;1R")
            if b"\x1b[c" in chunk:
                os.write(master, b"\x1b[?1;2c")
        if resume.get("permission") and not permission_rejected and not always_pending and (not permission_approved or reject_next) and b"Permission required" in screen and b"Reject" in screen:
            if resume.get("permission") == "always" and not reject_next:
                os.write(master, b"\x1b[C")
                always_selected_at = time.monotonic()
                always_pending = True
                screen.clear()
            elif resume.get("permission") == "once" and not reject_next:
                os.write(master, b"\r")
                permission_approved = True
            else:
                os.write(master, b"\x1b")
                permission_rejected = True
                finishing = time.monotonic()
        if always_pending and always_selected_at is not None and time.monotonic() - always_selected_at > 0.5:
            os.write(master, b"\r")
            always_selected_at = None
            screen.clear()
        if always_pending and always_selected_at is None and b"Confirm" in screen and b"Cancel" in screen:
            os.write(master, b"\r")
            always_pending = False
            always_confirmed = True
            permission_approved = True
        if selected == 0 and resume and b"CLI oracle completed" in screen:
            os.write(master, (resume["prompt"] + "\r").encode())
            selected = 3
        elif selected == 0 and not resume and b"Ask anything" in screen:
            os.write(master, b"@sales.csv")
            selected = 1
            selected_at = time.monotonic()
        elif selected == 1 and time.monotonic() - selected_at > 3:
            os.write(master, b"\r")
            selected = 2
            selected_at = time.monotonic()
        elif selected == 2 and time.monotonic() - selected_at > 2:
            os.write(master, b" Import the attached sales.csv, aggregate its numeric values, save the package, and close it.\r")
            selected = 3
        if finishing is not None and time.monotonic() - finishing > 3 and exit_step == 0:
            os.write(master, b"\x1b")
            exit_step = 1
        if finishing is not None and time.monotonic() - finishing > 5 and exit_step == 1:
            os.write(master, b"\x04")
            exit_step = 2
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        forced = True
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
finally:
    if child.poll() is None:
        forced = True
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
    os.close(master)
    pathlib.Path(evidence, "tui-exit.json").write_text(json.dumps({
        "code": child.returncode, "forced": forced, "input_submitted": selected == 3, "permission_rejected": permission_rejected, "permission_approved": permission_approved, "always_confirmed": always_confirmed,
    }))
sys.exit(child.returncode if child.returncode is not None and child.returncode >= 0 and not forced else 1)
