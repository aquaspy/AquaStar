#!/usr/bin/env python3
"""Linux-only synthetic game window for silent capture tests."""
import time
import os
import gi

gi.require_foreign('cairo')
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib

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
GLib.idle_add(lambda: print(f'AquaStar fixture ready: {os.getpid()}', flush=True))
Gtk.main()
