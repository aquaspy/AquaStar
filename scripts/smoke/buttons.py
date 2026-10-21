"""Find a Play button by its flat color. The label is a hole in the middle."""

ORANGE = (244, 162, 97)  # button.primary, Play (Ruffle) when Ruffle is preferred
BLUE = (67, 97, 238)  # Play (Flash). Site buttons are teal and must not match.
TOLERANCE = 36
MIN_PIXELS = 400


def find_button(image, rgb, tolerance=TOLERANCE):
    """Return the center of the matching button, or None.

    A handful of antialiased pixels elsewhere in the window can share the
    color. The click uses the densest horizontal band, which is the button.
    """
    pixels = image.convert("RGB")
    width, height = pixels.size
    target_r, target_g, target_b = rgb
    limit = tolerance * tolerance
    xs = []
    ys = []
    for index, (red, green, blue) in enumerate(pixels.getdata()):
        dr = red - target_r
        dg = green - target_g
        db = blue - target_b
        if dr * dr + dg * dg + db * db > limit:
            continue
        xs.append(index % width)
        ys.append(index // width)
    if len(xs) < MIN_PIXELS:
        return None
    counts = [0] * height
    for y in ys:
        counts[y] += 1
    prefix = [0]
    for value in counts:
        prefix.append(prefix[-1] + value)
    band = 80
    best_top = 0
    best_count = 0
    last = max(0, height - band)
    for top in range(last + 1):
        count = prefix[min(height, top + band)] - prefix[top]
        if count > best_count:
            best_count = count
            best_top = top
    if best_count < MIN_PIXELS:
        return None
    kept_x = [x for x, y in zip(xs, ys) if best_top <= y < best_top + band]
    kept_y = [y for y in ys if best_top <= y < best_top + band]
    min_x, max_x = min(kept_x), max(kept_x)
    min_y, max_y = min(kept_y), max(kept_y)
    if max_x - min_x < 40 or max_y - min_y < 12:
        return None
    return (min_x + max_x) // 2, (min_y + max_y) // 2
