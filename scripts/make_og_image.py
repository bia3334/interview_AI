"""Generate a 1200x630 social-preview (Open Graph) card for the landing page."""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG1 = (10, 14, 26)
BG2 = (24, 20, 48)
BRAND = (109, 139, 255)
BRAND2 = (157, 123, 255)
WHITE = (255, 255, 255)
MUTED = (152, 162, 184)

OUT = os.path.join("docs", "assets", "og-image.png")


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def font(path_candidates, size):
    for p in path_candidates:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2
            px[x, y] = lerp(BG1, BG2, t)
    d = ImageDraw.Draw(img)

    # Eye logo tile (gradient rounded square) top-left
    tile = 132
    tx, ty = 90, 90
    logo = Image.new("RGBA", (tile, tile), (0, 0, 0, 0))
    lp = logo.load()
    for y in range(tile):
        for x in range(tile):
            lp[x, y] = (*lerp(BRAND, BRAND2, (x + y) / (2 * tile)), 255)
    mask = Image.new("L", (tile, tile), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, tile - 1, tile - 1], radius=int(tile * 0.235), fill=255)
    logo.putalpha(mask)
    ld = ImageDraw.Draw(logo)
    c = tile // 2
    ld.ellipse([c - int(tile*0.30), c - int(tile*0.185), c + int(tile*0.30), c + int(tile*0.185)], outline=WHITE, width=int(tile*0.052))
    ld.ellipse([c - int(tile*0.105), c - int(tile*0.105), c + int(tile*0.105), c + int(tile*0.105)], fill=WHITE)
    img.paste(logo, (tx, ty), logo)

    f_brand = font(["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"], 40)
    d.text((tx + tile + 28, ty + 42), "Screen Genius", font=f_brand, fill=WHITE)

    f_title = font(["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"], 88)
    d.text((90, 280), "Invisible AI", font=f_title, fill=WHITE)
    # gradient-ish second line in brand color
    d.text((90, 380), "screen assistant", font=f_title, fill=BRAND)

    f_sub = font(["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"], 36)
    d.text((92, 500), "Capture your screen, get instant AI answers — hidden from", font=f_sub, fill=MUTED)
    d.text((92, 544), "screen shares.  Free for Windows.", font=f_sub, fill=MUTED)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
