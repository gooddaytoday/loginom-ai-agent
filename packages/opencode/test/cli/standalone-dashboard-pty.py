import fcntl
import json
import os
import pty
import selectors
import signal
import subprocess
import sys
import termios
import time

choice, *command = sys.argv[1:]
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

try:
    if piped:
        child.stdin.write("Удалить\n".encode())
        child.stdin.close()
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout, selectors.EVENT_READ, "stdout")
        selector.register(child.stderr, selectors.EVENT_READ, "stderr")
        deadline = time.monotonic() + 20
        while selector.get_map():
            for key, _ in selector.select(max(0, deadline - time.monotonic())):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                output[key.data].extend(chunk)
                if cwd is None and 'Введите «Удалить»'.encode() in output["stderr"]:
                    cwd = os.readlink(f"/proc/{child.pid}/cwd")
                    answers = {
                        "delete": "Удалить\n", "pipe-delete": "Удалить\n", "cancel": "Отмена\n",
                        "eof": "\x04", "interrupt": "\x03", "incomplete": "Удалить\x04",
                    }
                    os.write(master, answers[choice].encode())
            if time.monotonic() >= deadline:
                raise TimeoutError(output)
    exit_code = child.wait(timeout=2)
    print(json.dumps({**{key: value.decode() for key, value in output.items()}, "cwd": cwd, "exit": exit_code}))
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGKILL)
        child.wait()
    os.close(master)
