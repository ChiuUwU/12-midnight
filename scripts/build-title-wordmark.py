"""Generate vector title artwork from the already licensed four-glyph font subset."""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

root = Path(__file__).resolve().parent.parent
font = TTFont(root / 'web/assets/fonts/last-night-title.woff')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
paths = []
for index, char in enumerate('最后一夜'):
    pen = SVGPathPen(glyphs)
    glyphs[cmap[ord(char)]].draw(pen)
    paths.append(f'<path d="{pen.getCommands()}" transform="translate({160 + index * 1070} 1160) scale(1 -1)"/>')

svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4480 1420" role="img" aria-labelledby="title">
<title id="title">最后一夜</title>
<defs>
 <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop stop-color="#fff5d2"/><stop offset=".27" stop-color="#e6bd73"/><stop offset=".43" stop-color="#fff0bd"/>
  <stop offset=".51" stop-color="#a87532"/><stop offset=".64" stop-color="#e7c07d"/><stop offset="1" stop-color="#ad7838"/>
 </linearGradient>
 <linearGradient id="rim" x2="0" y2="1"><stop stop-color="#fff8dc"/><stop offset="1" stop-color="#795023"/></linearGradient>
 <filter id="shadow" x="-12%" y="-25%" width="124%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="18" flood-color="#020b16" flood-opacity=".9"/></filter>
 <filter id="shine" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
 <g id="letters">''' + ''.join(paths) + '''</g>
</defs>
<!-- The image background remains transparent; bevel and depth belong to the letterforms. -->
<g filter="url(#shadow)" stroke-linejoin="miter">
 <use href="#letters" fill="#57381c" stroke="#57381c" stroke-width="48" transform="translate(0 24)"/>
 <use href="#letters" fill="url(#metal)" stroke="url(#rim)" stroke-width="29"/>
 <use href="#letters" fill="none" stroke="#fff3c5" stroke-width="4" transform="translate(-3 -4)" opacity=".8"/>
</g>
<!-- Sparse ornamental cuts frame the title without covering Chinese strokes. -->
<g fill="none" stroke="#d7b67b" stroke-width="7" opacity=".82">
 <path d="M110 1180 L375 1260 L1540 1260 M2940 1260 L4105 1260 L4370 1180"/>
 <path d="M200 1230 L470 1310 L1310 1310 M3170 1310 L4010 1310 L4280 1230" opacity=".48"/>
</g>
<g fill="#fff0bf">
 <path d="M380 190 L391 229 L430 240 L391 251 L380 290 L369 251 L330 240 L369 229Z"/>
 <path d="M4105 790 L4116 829 L4155 840 L4116 851 L4105 890 L4094 851 L4055 840 L4094 829Z"/>
</g>
</svg>
'''
target = root / 'web/assets/branding/last-night-wordmark-v1.svg'
target.write_text(svg, encoding='utf-8')
print(f'Generated {target} ({target.stat().st_size} bytes)')
