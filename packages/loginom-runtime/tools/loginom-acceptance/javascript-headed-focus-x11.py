import ctypes as C
import sys

x = C.CDLL('libX11.so.6')


class Hints(C.Structure):
    _fields_ = [
        ('flags', C.c_long), ('input', C.c_int), ('initial_state', C.c_int),
        ('icon_pixmap', C.c_ulong), ('icon_window', C.c_ulong),
        ('icon_x', C.c_int), ('icon_y', C.c_int), ('icon_mask', C.c_ulong),
        ('window_group', C.c_ulong),
    ]


x.XOpenDisplay.argtypes = [C.c_char_p]
x.XOpenDisplay.restype = C.c_void_p
x.XGetWMHints.argtypes = [C.c_void_p, C.c_ulong]
x.XGetWMHints.restype = C.POINTER(Hints)
x.XSetWMHints.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(Hints)]
x.XInternAtom.argtypes = [C.c_void_p, C.c_char_p, C.c_int]
x.XInternAtom.restype = C.c_ulong
x.XGetWMProtocols.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.POINTER(C.c_ulong)), C.POINTER(C.c_int)]
x.XSetWMProtocols.argtypes = [C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.c_int]
x.XFree.argtypes = [C.c_void_p]
x.XSync.argtypes = [C.c_void_p, C.c_int]
x.XCloseDisplay.argtypes = [C.c_void_p]

display = x.XOpenDisplay(None)
if not display:
    raise RuntimeError('X display unavailable')
window = int(sys.argv[1])
hints = x.XGetWMHints(display, window)
if hints:
    hints.contents.flags |= 1
    hints.contents.input = 0
    x.XSetWMHints(display, window, hints)
    x.XFree(hints)
else:
    fresh = Hints()
    fresh.flags = 1
    fresh.input = 0
    x.XSetWMHints(display, window, C.byref(fresh))

protocols = C.POINTER(C.c_ulong)()
count = C.c_int()
take_focus = x.XInternAtom(display, b'WM_TAKE_FOCUS', False)
if x.XGetWMProtocols(display, window, C.byref(protocols), C.byref(count)):
    kept = [protocols[index] for index in range(count.value) if protocols[index] != take_focus]
    values = (C.c_ulong * len(kept))(*kept)
    x.XSetWMProtocols(display, window, values, len(kept))
    x.XFree(protocols)

x.XSync(display, False)
x.XCloseDisplay(display)
