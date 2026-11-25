# Loginom AI Agent (B2.9j): 0.4's terminal for `run --dashboard` (`v0.4.0:packages/opencode/test/cli/
# standalone-dashboard-pty.py`). Runs the command with a pseudo-terminal as its controlling terminal (and stdin, unless
# the choice pipes it), types `queued` ahead, answers the deletion's question by `choice` once the phrase is shown, and
# prints the run's stdout, stderr, working directory at the question, the phrase and the exit code as JSON.
# Usage: python3 -I standalone-dashboard-pty.py <choice> <queued> <command...>
import fcntl
import json
import os
import pty
import re
import selectors
import signal
import subprocess
import sys
import termios
import time

choice, queued, *command = sys.argv[1:]
master, slave = pty.openpty()
piped = choice in ("no-tty", "pipe-delete")


def control_terminal():
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)


child = subprocess.Popen(
    command, stdin=subprocess.PIPE if piped else slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    start_new_session=True, preexec_fn=None if choice == "no-tty" else control_terminal, pass_fds=(slave,),
)
os.close(slave)
output = {"stdout": bytearray(), "stderr": bytearray()}
cwd = None
phrase = None
partial_cancelled = False

try:
    if queued:
        os.write(master, (queued + "\n").encode())
    if piped:
        child.stdin.write("Удалить\n".encode())
        child.stdin.close()
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout, selectors.EVENT_READ, "stdout")
        selector.register(child.stderr, selectors.EVENT_READ, "stderr")
        # 0.4 gave a run 20 seconds; a run on OpenCode 2 starts its own server and the server its Host.
        deadline = time.monotonic() + 90
        while selector.get_map():
            for key, _ in selector.select(max(0, deadline - time.monotonic())):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                output[key.data].extend(chunk)
                if key.data != "stderr":
                    continue
                prompts = re.findall(r'Введите «(Удалить [0-9a-f]{8})»', output["stderr"].decode(errors="ignore"))
                if cwd is None and prompts:
                    phrase = prompts[0]
                    cwd = os.readlink(f"/proc/{child.pid}/cwd")
                    answers = {
                        "delete": phrase + "\n", "pipe-delete": phrase + "\n", "partial": phrase + "\n", "cancel": "Отмена\n",
                        "eof": "\x04", "interrupt": "\x03", "incomplete": phrase + "\x04",
                    }
                    if choice in answers:
                        os.write(master, answers[choice].encode())
                if choice == "partial" and len(prompts) > 1 and not partial_cancelled:
                    partial_cancelled = True
                    os.write(master, "Отмена\n".encode())
            if time.monotonic() >= deadline:
                raise TimeoutError(choice, output)
    exit_code = child.wait(timeout=10)
    print(json.dumps({**{key: value.decode() for key, value in output.items()}, "cwd": cwd, "phrase": phrase, "exit": exit_code}))
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
    os.close(master)
