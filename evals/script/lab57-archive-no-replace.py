"""Private atomic archive primitive. No lease/admission/completion semantics."""
import ctypes, errno, json, os, stat, sys
root, source, destination, raw = sys.argv[1:]
expected = json.loads(raw)
if os.path.realpath(root) != root or any('/' in n or n in ['', '.', '..'] for n in [source, destination]):
    raise RuntimeError('Noncanonical archive path')
parent = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    info = os.fstat(parent)
    if info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('Archive parent identity changed')
    opened = os.open(source, os.O_PATH | os.O_NOFOLLOW, dir_fd=parent)
    try:
        identity = os.fstat(opened)
        current = os.stat(source, dir_fd=parent, follow_symlinks=False)
        for observed in [identity, current]:
            values = dict(device=observed.st_dev, inode=observed.st_ino, uid=observed.st_uid,
                mode=stat.S_IMODE(observed.st_mode), size=observed.st_size, mtimeNs=str(observed.st_mtime_ns), ctimeNs=str(observed.st_ctime_ns))
            if any(values[k] != expected[k] for k in values) or stat.S_ISLNK(observed.st_mode):
                raise RuntimeError('Archive source identity changed')
        libc = ctypes.CDLL(None, use_errno=True)
        rename = libc.renameat2
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        if rename(parent, os.fsencode(source), parent, os.fsencode(destination), 1):
            error = ctypes.get_errno()
            raise OSError(error, os.strerror(error))
        os.fsync(parent)
    finally:
        os.close(opened)
finally:
    os.close(parent)
