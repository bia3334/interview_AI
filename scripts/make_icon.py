"""Generate the Screen Genius app icon (eye mark on a blue->purple gradient).

Renders at 4x supersample for smooth edges, then writes a multi-size .ico.
"""
import os
from PIL import Image, ImageDraw

S = 1024  # supersampled canvas
BRAND = (109, 139, 255)   # #6d8bff
BRAND2 = (157, 123, 255)  # #9d7bff
WHITE = (255, 255, 255)

OUT = os.path.join("assets", "icons", "win", "icon.ico")


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def main():
    # Diagonal gradient (top-left brand -> bottom-right brand2)
    base = Image.new("RGB", (S, S))
    px = base.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * (S - 1))
            px[x, y] = lerp(BRAND, BRAND2, t)

    # Round the corners via alpha
    base = base.convert("RGBA")
    base.putalpha(rounded_mask(S, int(S * 0.235)))

    d = ImageDraw.Draw(base)
    cx = cy = S // 2

    # Eye outline (almond) — wide thin ellipse, white stroke
    hw, hh = int(S * 0.30), int(S * 0.185)
    stroke = int(S * 0.052)
    d.ellipse([cx - hw, cy - hh, cx + hw, cy + hh], outline=WHITE, width=stroke)

    # Iris — filled white circle in the centre
    r = int(S * 0.105)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    icon = base.resize((256, 256), Image.LANCZOS)
    icon.save(OUT, format="ICO", sizes=sizes)
    # Also drop a PNG for the landing page / previews
    base.resize((512, 512), Image.LANCZOS).save(
        os.path.join("assets", "icons", "win", "icon.png"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
