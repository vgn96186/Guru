from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os


W, H = 1400, 760


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    bold_candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    ]
    for p in (bold_candidates if bold else candidates):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def radial_glow(cx: int, cy: int, radius: int, color: tuple[int, int, int, int], strength: float = 1.0):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    for r in range(radius, 0, -6):
        alpha = int(color[3] * (1 - r / radius) ** 2 * strength)
        ld.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(color[0], color[1], color[2], alpha))
    return layer


def rotated_rounded_rect(
    size: tuple[int, int],
    radius: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
    angle: float = -8,
):
    w, h = size
    canvas = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
    cd = ImageDraw.Draw(canvas)
    box = (60, 60, 60 + w, 60 + h)
    cd.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    return canvas.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def draw_tesseract(
    base: Image.Image,
    cx: int,
    cy: int,
    size: int,
    offset: tuple[int, int],
    stroke: tuple[int, int, int, int] = (255, 255, 255, 235),
    glow: tuple[int, int, int, int] = (124, 92, 255, 200),
):
    dx, dy = offset
    half = size // 2

    a0 = (cx - half, cy - half)
    a1 = (cx + half, cy - half)
    a2 = (cx + half, cy + half)
    a3 = (cx - half, cy + half)

    b0 = (a0[0] + dx, a0[1] + dy)
    b1 = (a1[0] + dx, a1[1] + dy)
    b2 = (a2[0] + dx, a2[1] + dy)
    b3 = (a3[0] + dx, a3[1] + dy)

    def poly(pts: list[tuple[int, int]]):
        return [pts[0], pts[1], pts[2], pts[3], pts[0]]

    g = Image.new("RGBA", base.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)

    for w in (6, 4):
        gd.line(poly([a0, a1, a2, a3]), fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.32 if w == 6 else 0.24))), width=w)
        gd.line(poly([b0, b1, b2, b3]), fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.28 if w == 6 else 0.2))), width=w)
        gd.line([a0, b0], fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.28 if w == 6 else 0.2))), width=w)
        gd.line([a1, b1], fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.28 if w == 6 else 0.2))), width=w)
        gd.line([a2, b2], fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.28 if w == 6 else 0.2))), width=w)
        gd.line([a3, b3], fill=(glow[0], glow[1], glow[2], int(glow[3] * (0.28 if w == 6 else 0.2))), width=w)

    g = g.filter(ImageFilter.GaussianBlur(5))
    base.alpha_composite(g)

    d = ImageDraw.Draw(base)
    d.line(poly([a0, a1, a2, a3]), fill=stroke, width=3)
    d.line(poly([b0, b1, b2, b3]), fill=(stroke[0], stroke[1], stroke[2], 200), width=3)
    d.line([a0, b0], fill=(stroke[0], stroke[1], stroke[2], 200), width=3)
    d.line([a1, b1], fill=(stroke[0], stroke[1], stroke[2], 200), width=3)
    d.line([a2, b2], fill=(stroke[0], stroke[1], stroke[2], 200), width=3)
    d.line([a3, b3], fill=(stroke[0], stroke[1], stroke[2], 200), width=3)

    for (px, py) in [a0, a1, a2, a3, b0, b1, b2, b3]:
        r = 2
        d.ellipse((px - r, py - r, px + r, py + r), fill=(255, 255, 255, 200))


def main():
    img = Image.new("RGBA", (W, H), (6, 8, 14, 255))
    draw = ImageDraw.Draw(img)

    img = Image.alpha_composite(img, radial_glow(700, 540, 520, (124, 92, 255, 90), 0.9))
    img = Image.alpha_composite(img, radial_glow(260, 610, 360, (54, 220, 190, 30), 0.7))
    img = Image.alpha_composite(img, radial_glow(1130, 620, 380, (255, 120, 210, 28), 0.65))

    phone = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(phone)
    phone_box = (270, 70, 1130, 690)
    pd.rounded_rectangle(phone_box, radius=58, fill=(9, 12, 20, 255), outline=(42, 47, 66, 255), width=2)
    pd.rounded_rectangle((300, 105, 1100, 650), radius=38, fill=(11, 14, 23, 255))

    for i, y in enumerate([145, 222, 299]):
        pd.rounded_rectangle(
            (340, y, 1060, y + 48),
            radius=18,
            fill=(18, 22, 34, 190),
            outline=(42, 47, 66, 120),
            width=1,
        )
        pd.rounded_rectangle((365, y + 16, 560 + 60 * i, y + 26), radius=5, fill=(55, 61, 83, 180))
        pd.rounded_rectangle((810, y + 14, 1020, y + 30), radius=8, fill=(26, 30, 44, 180))

    img = Image.alpha_composite(img, phone)

    bar = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    bar_box = (300, 535, 1100, 650)
    bd.rounded_rectangle(bar_box, radius=34, fill=(8, 10, 18, 245), outline=(68, 64, 100, 130), width=1)
    bd.line((325, 535, 1075, 535), fill=(105, 94, 150, 80), width=1)

    f_label = font(22)
    f_label_b = font(22, True)
    f_icon = font(38)
    f_icon_sm = font(32)
    f_title = font(40, True)
    f_sub = font(22)

    tabs = [
        (390, "⌂", "Home", False),
        (545, "▦", "Syllabus", False),
        (855, "●", "Chat", False),
        (1010, "☰", "Menu", False),
    ]
    for x, icon, label, active in tabs:
        color = (185, 191, 215, 220) if active else (118, 125, 151, 210)
        bd.text((x, 565), icon, font=f_icon if icon != "☰" else f_icon_sm, fill=color, anchor="mm")
        bd.text((x, 615), label, font=f_label, fill=color, anchor="mm")

    bd.text((700, 625), "Actions", font=f_label_b, fill=(156, 131, 255, 255), anchor="mm")
    img = Image.alpha_composite(img, bar)

    shadow = rotated_rounded_rect((122, 108), 36, (124, 92, 255, 150), angle=-10)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    sx, sy = 700 - shadow.width // 2, 535 - shadow.height // 2
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(shadow, (sx, sy + 18))
    img = Image.alpha_composite(img, layer)

    button = rotated_rounded_rect((120, 106), 36, (124, 92, 255, 240), outline=(255, 255, 255, 70), width=2, angle=-10)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bx, by = 700 - button.width // 2, 535 - button.height // 2
    layer.alpha_composite(button, (bx, by))
    img = Image.alpha_composite(img, layer)

    gd = ImageDraw.Draw(img)
    gd.rounded_rectangle((658, 496, 742, 574), radius=26, fill=(255, 255, 255, 24), outline=(255, 255, 255, 32), width=1)

    for (dx, dy, a, r) in [(700, 502, 220, 3), (736, 535, 150, 3), (700, 568, 130, 3), (664, 535, 150, 3)]:
        gd.ellipse((dx - r, dy - r, dx + r, dy + r), fill=(255, 255, 255, a))

    draw_tesseract(img, 700, 535, size=34, offset=(12, -10))

    draw = ImageDraw.Draw(img)
    draw.text((700, 38), "Tesseract Action Hub", font=f_title, fill=(238, 240, 255, 255), anchor="ma")
    draw.text(
        (700, 86),
        "A 4D-cube glyph: reads as a real prism/object, not just a tilted button",
        font=f_sub,
        fill=(156, 162, 190, 240),
        anchor="ma",
    )

    preview = Image.new("RGBA", (250, 120), (0, 0, 0, 0))
    pr = ImageDraw.Draw(preview)
    pr.rounded_rectangle((15, 15, 235, 105), radius=30, fill=(13, 16, 25, 235), outline=(124, 92, 255, 90), width=1)
    pr.text((125, 40), "open state", font=font(18), fill=(156, 162, 190, 230), anchor="mm")
    pr.text((125, 74), "□", font=font(44, True), fill=(255, 255, 255, 235), anchor="mm")
    img.alpha_composite(preview, (885, 400))

    out = os.path.join(os.path.dirname(__file__), "..", "action_hub_tesseract_mock.png")
    out = os.path.abspath(out)
    img.convert("RGB").save(out, quality=95)
    print(out)


if __name__ == "__main__":
    main()

