#!/usr/bin/env python3
"""Linux-only synthetic window and optional quiet process-owned test tone."""
import argparse
import ctypes
import math
import os
import struct
import threading
import time
import gi

gi.require_foreign('cairo')
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

parser = argparse.ArgumentParser()
parser.add_argument('--audio', action='store_true')
parser.add_argument('--frequency', type=int, default=440)
args = parser.parse_args()

def tone():
    class Spec(ctypes.Structure):
        _fields_ = [('format', ctypes.c_int), ('rate', ctypes.c_uint32), ('channels', ctypes.c_uint8)]
    lib = ctypes.CDLL('libpulse-simple.so.0')
    lib.pa_simple_new.restype = ctypes.c_void_p
    lib.pa_simple_new.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_char_p, ctypes.POINTER(Spec), ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
    lib.pa_simple_write.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t, ctypes.POINTER(ctypes.c_int)]
    error = ctypes.c_int()
    stream = lib.pa_simple_new(None, b'AquaStar capture fixture', 1, os.environ.get('AQUASTAR_FIXTURE_SINK', '').encode() or None, b'Isolated test tone', ctypes.byref(Spec(5, 48000, 2)), None, None, ctypes.byref(error))
    if not stream:
        print(f'Audio fixture unavailable: {error.value}', flush=True)
        return
    index = 0
    while True:
        values = []
        for offset in range(960):
            value = 0.01 * math.sin(2 * math.pi * args.frequency * (index + offset) / 48000)
            values.extend((value, value))
        index += 960
        samples = struct.pack('<' + 'f' * len(values), *values)
        if lib.pa_simple_write(stream, samples, len(samples), ctypes.byref(error)):
            return

window = Gtk.Window(title='AquaStar capture test fixture')
window.set_default_size(640, 360)
area = Gtk.DrawingArea()
window.add(area)
start = time.monotonic()
def draw(widget, context):
    context.set_source_rgb(0.05, 0.15, 0.3); context.paint()
    context.set_source_rgb(0.95, 0.3, 0.12); context.rectangle(20, 30, 120, 100); context.fill()
    context.set_source_rgb(0.1, 0.85, 0.45); context.rectangle(180 + int((time.monotonic() - start) * 50) % 300, 180, 75, 75); context.fill()
area.connect('draw', draw)
window.connect('destroy', Gtk.main_quit)
GLib.timeout_add(33, lambda: (area.queue_draw(), True)[1])
window.show_all()
if args.audio:
    threading.Thread(target=tone, daemon=True).start()
print(f'Fixture PID: {os.getpid()}', flush=True)
Gtk.main()
