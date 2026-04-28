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
    canvas = Image.new("RGBA", (w + 80, h + 80), (0, 0, 0, 0))
    cd = ImageDraw.Draw(canvas)
    box = (40, 40, 40 + w, 40 + h)
    cd.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    return canvas.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)


def sparkle(
    img: Image.Image,
    cx: int,
    cy: int,
    scale: float = 1.0,
    fill: tuple[int, int, int, int] = (255, 255, 255, 255),
):
    d = ImageDraw.Draw(img)
    pts = [
        (cx, cy - 18 * scale),
        (cx + 5 * scale, cy - 5 * scale),
        (cx + 18 * scale, cy),
        (cx + 5 * scale, cy + 5 * scale),
        (cx, cy + 18 * scale),
        (cx - 5 * scale, cy + 5 * scale),
        (cx - 18 * scale, cy),
        (cx - 5 * scale, cy - 5 * scale),
    ]
    d.polygon(pts, fill=fill)
    d.ellipse((cx - 3 * scale, cy - 3 * scale, cx + 3 * scale, cy + 3 * scale), fill=(124, 92, 255, 255))


def main():
    img = Image.new("RGBA", (W, H), (6, 8, 14, 255))
    draw = ImageDraw.Draw(img)

    img = Image.alpha_composite(img, radial_glow(700, 540, 520, (124, 92, 255, 90), 0.9))
    img = Image.alpha_composite(img, radial_glow(250, 600, 340, (54, 220, 190, 35), 0.7))
    img = Image.alpha_composite(img, radial_glow(1120, 610, 360, (255, 120, 210, 35), 0.6))

    phone = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(phone)
    phone_box = (270, 70, 1130, 690)
    pd.rounded_rectangle(phone_box, radius=58, fill=(9, 12, 20, 255), outline=(42, 47, 66, 255), width=2)
    pd.rounded_rectangle((300, 105, 1100, 650), radius=38, fill=(11, 14, 23, 255))
    for i, y in enumerate([145, 222, 299]):
        pd.rounded_rectangle((340, y, 1060, y + 48), radius=18, fill=(18, 22, 34, 190), outline=(42, 47, 66, 120), width=1)
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

    shadow = rotated_rounded_rect((118, 104), 34, (124, 92, 255, 170), angle=-8)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    sx, sy = 700 - shadow.width // 2, 535 - shadow.height // 2
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.alpha_composite(shadow, (sx, sy + 18))
    img = Image.alpha_composite(img, layer)

    button = rotated_rounded_rect((116, 102), 34, (124, 92, 255, 250), outline=(255, 255, 255, 75), width=2, angle=-8)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bx, by = 700 - button.width // 2, 535 - button.height // 2
    layer.alpha_composite(button, (bx, by))
    img = Image.alpha_composite(img, layer)

    gd = ImageDraw.Draw(img)
    gd.rounded_rectangle((666, 501, 734, 569), radius=24, fill=(255, 255, 255, 28), outline=(255, 255, 255, 35), width=1)
    for (dx, dy, a, r) in [(700, 506, 220, 3), (729, 535, 145, 3), (700, 564, 125, 3), (671, 535, 145, 3)]:
        gd.ellipse((dx - r, dy - r, dx + r, dy + r), fill=(255, 255, 255, a))
    sparkle(img, 700, 535, 0.92)
    sparkle(img, 722, 515, 0.33, (255, 255, 255, 210))
    sparkle(img, 678, 554, 0.28, (255, 255, 255, 180))

    draw = ImageDraw.Draw(img)
    draw.text((700, 38), "Command Prism Action Hub", font=f_title, fill=(238, 240, 255, 255), anchor="ma")
    draw.text(
        (700, 86),
        "A premium quick-tools launcher instead of a generic plus button",
        font=f_sub,
        fill=(156, 162, 190, 240),
        anchor="ma",
    )

    preview = Image.new("RGBA", (230, 110), (0, 0, 0, 0))
    pr = ImageDraw.Draw(preview)
    pr.rounded_rectangle((15, 15, 215, 95), radius=28, fill=(13, 16, 25, 235), outline=(124, 92, 255, 90), width=1)
    pr.text((115, 40), "open state", font=font(18), fill=(156, 162, 190, 230), anchor="mm")
    pr.text((115, 68), "×", font=font(38, True), fill=(255, 255, 255, 240), anchor="mm")
    img.alpha_composite(preview, (900, 405))

    out = os.path.join(os.path.dirname(__file__), "..", "action_hub_command_prism_mock.png")
    out = os.path.abspath(out)
    img.convert("RGB").save(out, quality=95)
    print(out)


if __name__ == "__main__":
    main()

