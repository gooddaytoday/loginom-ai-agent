"""Own helper descendants cannot unlock/relock an inherited flock OFD.

Installed only by the isolated foreground supervisor after the parent acquired
all guards. No daemon, parent, foreign process or system policy is changed.
"""
import ctypes
import errno
import hashlib
import platform


def install():
    numbers = {'x86_64': (0xc000003e, 73), 'aarch64': (0xc00000b7, 32)}
    if platform.machine() not in numbers:
        raise RuntimeError('ACCOUNT_FLOCK_BARRIER_UNAVAILABLE')
    arch, syscall = numbers[platform.machine()]
    # Kill a mismatched ABI (including x32), deny every flock operation, allow
    # other syscalls. The no_new_privs filter survives exec/fork/setsid.
    instructions = [(0x20, 0, 0, 4), (0x15, 1, 0, arch), (0x06, 0, 0, 0x80000000),
                    (0x20, 0, 0, 0), (0x45, 0, 1, 0x40000000), (0x06, 0, 0, 0x80000000),
                    (0x15, 0, 1, syscall), (0x06, 0, 0, 0x50000 | errno.EPERM), (0x06, 0, 0, 0x7fff0000)]
    class Filter(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte), ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]
    program = (Filter * len(instructions))(*(Filter(*item) for item in instructions))
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38, 1, 0, 0, 0) or libc.prctl(22, 2, ctypes.byref(Program(len(program), program)), 0, 0):
        raise RuntimeError('ACCOUNT_FLOCK_BARRIER_UNAVAILABLE')
    return {'schema': 'account-flock-barrier-v1', 'arch': platform.machine(),
            'program_sha256': hashlib.sha256(bytes(program)).hexdigest(), 'flock_policy': 'deny-all-EPERM',
            'no_new_privs': True}
