"""Build every image asset Auris Merge needs, from the source photography.

Nothing under choosed/ or PROMO_Auris/ is committed (they are 320 MB), so this
script is how assets/ is reproduced. When better photography arrives, swap the
`src` filenames in CROPS, nudge the boxes, re-run, and every sprite regenerates.

    python tools/cut.py            # write assets/
    python tools/cut.py --contact  # also write tools/_contact.png to check framing

CROPS boxes are (center_x, center_y, size) in SOURCE pixels. The crop is always
square, so nothing is ever distorted.
"""
import os
import shutil
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

SRC = "choosed"
LOGO_SRC = "PROMO_Auris/Logo/AURIS"
OUT = "assets"
TOKEN = 256  # output px; 2x the ~128px display size, for retina

CROPS = {
    # CASSIOPEA -- rings on red/black. Source is 1667x2500.
    "cassiopea_1": ("AES2711.jpg", 1100, 790, 430),
    "cassiopea_2": ("AES2711.jpg", 800, 1165, 430),
    "cassiopea_3": ("AES2711.jpg", 465, 1550, 430),

    # FARFALLA -- butterflies on skin. Source is 1333x2000.
    # Ordered mono -> pastel -> jewel so the tiers read apart at phone size.
    "farfalla_1": ("dsc07958.jpg", 855, 965, 215),
    "farfalla_2": ("dsc07958.jpg", 722, 1232, 225),
    "farfalla_3": ("dsc07958.jpg", 878, 800, 245),

    # MARCHESA -- sapphire. Source is only 469x444, so these are the soft ones;
    # first candidates for replacement when better photography lands.
    "marchesa_1": ("Screenshot 2026-08-25 071125.png", 175, 275, 95),
    "marchesa_2": ("Screenshot 2026-08-25 071125.png", 325, 185, 95),
    "marchesa_3": ("Screenshot 2026-08-25 071125.png", 127, 88, 185),
}

# Square crop of the portrait as (centre_x, centre_y, size) in source pixels.
# Framed on the face and cut just below the bow tie, wide enough to keep the ear
# stretchers -- he is a piercer, so those are the point.
PORTRAIT_CROP = (320, 215, 400)

# The shot with the hexagonal display cases -- the most recognisable of the three.
STUDIO_SHOT = "Screenshot 2026-08-25 130932.png"

# The Auris logo files are named in Cyrillic; map them to stable ASCII names.
# assets/logo/scalpelburg.png is supplied directly and is not generated here.
LOGOS = {
    "auris-stack-light.png": "лого(гор)_Монтажная область 1-04.png",
    "auris-horiz-dark.png": "лого(гор)_Монтажная область 1-01.png",
    "mark-gold.png": "лого_Монтажная область 1-05.png",
    "mark-dark.png": "лого_Монтажная область 1-07.png",
}


def crop_square(src_name, cx, cy, size):
    im = Image.open(os.path.join(SRC, src_name)).convert("RGB")
    h = size // 2
    # Clamp into the image rather than letting PIL pad the edge with black.
    x0 = max(0, min(cx - h, im.width - size))
    y0 = max(0, min(cy - h, im.height - size))
    return im.crop((x0, y0, x0 + size, y0 + size)).resize((TOKEN, TOKEN), Image.LANCZOS)


def circular(im):
    """Mask to a circle, supersampled so the edge is not aliased.

    The gold ring is deliberately NOT baked in -- it lives in CSS, so the token
    styling can change without recutting every sprite.
    """
    mask = Image.new("L", (TOKEN * 4, TOKEN * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, TOKEN * 4 - 1, TOKEN * 4 - 1), fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask.resize((TOKEN, TOKEN), Image.LANCZOS))
    return out


def build_pieces():
    dest = os.path.join(OUT, "pieces")
    os.makedirs(dest, exist_ok=True)
    tokens = {}
    for name, (src, cx, cy, size) in CROPS.items():
        tok = circular(crop_square(src, cx, cy, size))
        tok.save(os.path.join(dest, name + ".png"))
        tokens[name] = tok
    print("pieces:  %d tokens" % len(tokens))
    return tokens


def build_portrait():
    """The birthday boy, as the catalogue's model plate.

    Cropped square so the page can mask it to a circle without relying on
    object-position, and otherwise unretouched: the grey backdrop already sits
    happily against the cream plate, and the joke depends on it reading as a real
    catalogue shot rather than a treated one.
    """
    dest = os.path.join(OUT, "portrait")
    os.makedirs(dest, exist_ok=True)
    src = os.path.join(SRC, "vlad-.jpg")
    if not os.path.exists(src):
        print("portrait: source missing, skipped")
        return
    im = Image.open(src).convert("RGB")
    cx, cy, size = PORTRAIT_CROP
    h = size // 2
    x0 = max(0, min(cx - h, im.width - size))
    y0 = max(0, min(cy - h, im.height - size))
    im = im.crop((x0, y0, x0 + size, y0 + size)).resize((560, 560), Image.LANCZOS)
    im.save(os.path.join(dest, "vlad.jpg"), quality=88, optimize=True)
    print("portrait: vlad.jpg %dx%d" % im.size)


def build_studio():
    """A band of the Scalpelburg studio for the "see it in real life" footer."""
    dest = os.path.join(OUT, "bg")
    os.makedirs(dest, exist_ok=True)
    src = os.path.join(SRC, "scalpelburg", STUDIO_SHOT)
    if not os.path.exists(src):
        print("studio: source missing, skipped")
        return
    im = Image.open(src).convert("RGB")
    # Crop to a letterbox band around the display cases, away from the ceiling.
    w, h = im.size
    top = int(h * 0.10)
    im = im.crop((0, top, w, top + int(h * 0.68)))
    im.save(os.path.join(dest, "studio.jpg"), quality=84, optimize=True)
    print("studio:  studio.jpg %dx%d" % im.size)


def build_backgrounds():
    """The display-board photo, darkened and softened enough to sit behind text."""
    dest = os.path.join(OUT, "bg")
    os.makedirs(dest, exist_ok=True)
    im = Image.open(os.path.join(SRC, "Jewelleries_Display_5.jpg")).convert("RGB")
    im.thumbnail((1600, 1600), Image.LANCZOS)
    im = im.filter(ImageFilter.GaussianBlur(2.5))
    im = ImageEnhance.Brightness(im).enhance(0.42)
    im = ImageEnhance.Color(im).enhance(0.55)
    im.save(os.path.join(dest, "display.jpg"), quality=82, optimize=True)
    print("bg:      display.jpg %dx%d" % im.size)


def build_logos():
    dest = os.path.join(OUT, "logo")
    os.makedirs(dest, exist_ok=True)
    n = 0
    for out_name, src_name in LOGOS.items():
        src = os.path.join(LOGO_SRC, src_name)
        if not os.path.exists(src):
            print("  ! missing logo source: %s" % out_name)
            continue
        im = Image.open(src).convert("RGBA")
        im.thumbnail((900, 900), Image.LANCZOS)
        im.save(os.path.join(dest, out_name))
        n += 1
    print("logo:    %d files" % n)


def contact_sheet(tokens):
    cols, pad, lab = 3, 16, 22
    order = sorted(tokens)
    rows = (len(order) + cols - 1) // cols
    sheet = Image.new(
        "RGB",
        (cols * (TOKEN + pad) + pad, rows * (TOKEN + pad + lab) + pad),
        (18, 18, 20),
    )
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(order):
        x = pad + (i % cols) * (TOKEN + pad)
        y = pad + (i // cols) * (TOKEN + pad + lab)
        sheet.paste(tokens[name], (x, y), tokens[name])
        d.text((x + 4, y + TOKEN + 4), name, fill=(210, 180, 120))
    sheet.save("tools/_contact.png")
    print("contact: tools/_contact.png")


def main():
    tokens = build_pieces()
    build_backgrounds()
    build_portrait()
    build_studio()
    build_logos()
    if "--contact" in sys.argv:
        contact_sheet(tokens)


if __name__ == "__main__":
    main()
