# -*- coding: utf-8 -*-
"""
NoteHub 安卓启动图标生成器
- 前景层收敛到自适应图标安全区内（66/108），避免圆形遮罩切角
- 背景/字形用渐变增加层次
- 同时产出旧版方形图标、真实圆形图标、以及 Android 13+ 的 monochrome 主题图层
"""
import os
from PIL import Image, ImageDraw, ImageFont
import numpy as np

RES = r"C:\Users\rex\NoteHub\android-app\android\app\src\main\res"
ASSETS = r"C:\Users\rex\NoteHub\assets"

TEAL_A = (110, 231, 208)   # 亮端 #6ee7d0
TEAL_B = (23, 168, 150)    # 暗端 #17a896
BG_A = (39, 44, 53)        # 背景亮端 #272c35
BG_B = (20, 22, 26)        # 背景暗端 #14161a

SS = 4                     # 超采样倍数，用于抗锯齿
GLYPH_W_RATIO_ADAPT = 0.50  # 自适应前景：字形宽占 108 画布
GLYPH_W_RATIO_LEGACY = 0.60  # 旧版图标：字形宽占画布
STROKE_RATIO = 0.10         # 笔画粗细 / 字形宽
GLYPH_H_RATIO = 0.72        # 字形高 / 字形宽
# 三个字形在字形框内的横向占位（留出清晰的字间距，避免糊在一起）
POS_LT = (0.00, 0.26)       # <
POS_SLASH = (0.40, 0.60)    # /
POS_GT = (0.74, 1.00)       # >
CHEVRON_Y = (0.10, 0.90)    # 尖括号纵向范围（斜杠则撑满整高）

DENSITIES = [("mdpi", 1.0), ("hdpi", 1.5), ("xhdpi", 2.0), ("xxhdpi", 3.0), ("xxxhdpi", 4.0)]
LEGACY_BASE = 48
FG_BASE = 108


def diag_grad(w, h, c0, c1):
    """左上到右下的线性渐变"""
    xs = np.linspace(0.0, 1.0, w).reshape(1, w)
    ys = np.linspace(0.0, 1.0, h).reshape(h, 1)
    t = (xs + ys) / 2.0
    arr = np.zeros((h, w, 3), np.float64)
    for i in range(3):
        arr[..., i] = c0[i] * (1 - t) + c1[i] * t
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def vert_grad(w, h, c0, c1):
    """上到下的线性渐变"""
    ys = np.linspace(0.0, 1.0, h).reshape(h, 1)
    t = np.broadcast_to(ys, (h, w))
    arr = np.zeros((h, w, 3), np.float64)
    for i in range(3):
        arr[..., i] = c0[i] * (1 - t) + c1[i] * t
    return Image.fromarray(arr.astype(np.uint8), "RGB")


def glyph_mask(size, gw_ratio):
    """画 </> 的白色遮罩，圆头圆角"""
    s = size * SS
    gw = gw_ratio * s
    gh = GLYPH_H_RATIO * gw
    sw = STROKE_RATIO * gw
    x0 = (s - gw) / 2.0
    y0 = (s - gh) / 2.0
    r = sw / 2.0

    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)

    def poly(pts):
        d.line(pts, fill=255, width=max(2, int(round(sw))), joint="curve")
        for px, py in (pts[0], pts[-1]):
            d.ellipse([px - r, py - r, px + r, py + r], fill=255)

    yt, yb = y0 + CHEVRON_Y[0] * gh, y0 + CHEVRON_Y[1] * gh
    # <
    poly([(x0 + POS_LT[1] * gw, yt), (x0 + POS_LT[0] * gw, y0 + gh / 2.0), (x0 + POS_LT[1] * gw, yb)])
    # >
    poly([(x0 + POS_GT[0] * gw, yt), (x0 + POS_GT[1] * gw, y0 + gh / 2.0), (x0 + POS_GT[0] * gw, yb)])
    # / —— 撑满整高，形成 </> 的层次
    poly([(x0 + POS_SLASH[0] * gw, y0 + gh), (x0 + POS_SLASH[1] * gw, y0)])

    return m.resize((size, size), Image.LANCZOS)


def glyph_layer(size, gw_ratio):
    """带渐变的字形层（透明底）"""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(diag_grad(size, size, TEAL_A, TEAL_B), (0, 0), glyph_mask(size, gw_ratio))
    return out


def mono_layer(size, gw_ratio):
    """单色图层：实心形状，交给系统着色"""
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(Image.new("RGB", (size, size), (0, 0, 0)), (0, 0), glyph_mask(size, gw_ratio))
    return out


def legacy_icon(size, round_shape=False, gw_ratio=None):
    """旧版系统用的成品图标：带背景 + 字形"""
    if gw_ratio is None:
        gw_ratio = 0.54 if round_shape else GLYPH_W_RATIO_LEGACY
    s = size * SS
    shp = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(shp)
    if round_shape:
        d.ellipse([0, 0, s - 1, s - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(round(0.22 * s)), fill=255)
    shp = shp.resize((size, size), Image.LANCZOS)

    base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    base.paste(vert_grad(size, size, BG_A, BG_B), (0, 0), shp)
    base.alpha_composite(glyph_layer(size, gw_ratio))
    return base


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)


def main():
    # 对比用的旧图标（before-fg-432.png / before-launcher-192.png）已从旧 APK 中导出，
    # 这里不再覆盖，只负责生成新图标。

    # 各密度下落盘
    for name, scale in DENSITIES:
        d = os.path.join(RES, "mipmap-" + name)
        lg = int(round(LEGACY_BASE * scale))
        fg = int(round(FG_BASE * scale))

        save(legacy_icon(lg, False), os.path.join(d, "ic_launcher.png"))
        save(legacy_icon(lg, True), os.path.join(d, "ic_launcher_round.png"))
        save(glyph_layer(fg, GLYPH_W_RATIO_ADAPT), os.path.join(d, "ic_launcher_foreground.png"))
        save(mono_layer(fg, GLYPH_W_RATIO_ADAPT), os.path.join(d, "ic_launcher_monochrome.png"))
        print("  %-8s legacy=%dpx fg=%dpx" % (name, lg, fg))

    # 主图（桌面端 / 存档用）
    save(legacy_icon(512, False), os.path.join(ASSETS, "icon-master.png"))
    save(glyph_layer(432, GLYPH_W_RATIO_ADAPT), os.path.join(ASSETS, "icon-master-fg.png"))
    save(legacy_icon(256, False), os.path.join(ASSETS, "icon-256.png"))
    save(legacy_icon(48, False), os.path.join(ASSETS, "icon-48.png"))
    print("存档图已更新到 assets/")

    make_preview()


def make_preview():
    """生成前后对比预览图"""
    LIGHT = (233, 236, 239)
    TILE = 192
    PAD = 18
    COLS = 4

    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 19)
    except Exception:
        font = None

    def adaptive_preview(fg_img, bg_color, mask_kind):
        """按启动器真实行为：取 108 画布的中心 2/3，再套用遮罩"""
        canvas = Image.new("RGBA", (432, 432), bg_color + (255,))
        canvas.alpha_composite(fg_img.resize((432, 432), Image.LANCZOS))
        crop = canvas.crop((72, 72, 360, 360)).resize((TILE, TILE), Image.LANCZOS)
        s = TILE * SS
        shp = Image.new("L", (s, s), 0)
        d = ImageDraw.Draw(shp)
        if mask_kind == "circle":
            d.ellipse([0, 0, s - 1, s - 1], fill=255)
        elif mask_kind == "squircle":
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(0.30 * s), fill=255)
        elif mask_kind == "roundrect":
            d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(0.16 * s), fill=255)
        else:
            d.rectangle([0, 0, s - 1, s - 1], fill=255)
        out = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
        out.paste(crop, (0, 0), shp.resize((TILE, TILE), Image.LANCZOS))
        return out

    new_fg = glyph_layer(432, GLYPH_W_RATIO_ADAPT)
    old_fg = Image.open(os.path.join(ASSETS, "before-fg-432.png")).convert("RGBA")

    masks = [("方形", "square"), ("圆形", "circle"), ("圆角方", "squircle"), ("圆角矩", "roundrect")]
    new_row = [adaptive_preview(new_fg, BG_A, k) for _, k in masks]
    old_row = [adaptive_preview(old_fg, (30, 30, 30), k) for _, k in masks]

    ladder = [legacy_icon(s, False) for s in (48, 72, 96, 144, 192)]
    round_icon = legacy_icon(192, True)

    head = 34
    width = PAD + COLS * (TILE + PAD)
    height = PAD + head + TILE + PAD + head + TILE + PAD + head + TILE + PAD
    sheet = Image.new("RGB", (width, height), LIGHT)
    d = ImageDraw.Draw(sheet)

    def label(x, y, text):
        if font:
            d.text((x, y), text, fill=(60, 66, 72), font=font)

    y = PAD
    label(PAD, y, "新版（自适应图标 · 不同启动器遮罩）")
    y += head
    for i, tile in enumerate(new_row):
        x = PAD + i * (TILE + PAD)
        sheet.paste(tile, (x, y), tile)
        label(x + 4, y + TILE + 2, masks[i][0])
    y += TILE + PAD

    label(PAD, y, "旧版（同样的遮罩，可对比尖角裁切）")
    y += head
    for i, tile in enumerate(old_row):
        x = PAD + i * (TILE + PAD)
        sheet.paste(tile, (x, y), tile)
        label(x + 4, y + TILE + 2, masks[i][0])
    y += TILE + PAD

    label(PAD, y, "旧版方形图标 · 各尺寸（48 / 72 / 96 / 144 / 192）与圆形版本")
    y += head
    x = PAD
    for img in ladder:
        sheet.paste(img, (x, y + (TILE - img.width)), img)
        label(x + 2, y + TILE + 2, str(img.width))
        x += img.width + 22
    sheet.paste(round_icon, (x + 20, y), round_icon)
    label(x + 24, y + TILE + 2, "round")

    path = os.path.join(ASSETS, "icon-preview.png")
    sheet.save(path, "PNG", optimize=True)
    print("预览图: " + path)


if __name__ == "__main__":
    main()
