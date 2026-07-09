from PIL import Image, ImageDraw

img = Image.open('/workspace/src/assets/mod-desk-chassis.png').convert('RGBA')
draw = ImageDraw.Draw(img, 'RGBA')

rects = {
    'topLcd': (1049, 93, 223, 72), 'oscLcd': (95, 286, 229, 71),
    'filterLcd': (475, 285, 218, 72), 'envLcd': (837, 285, 213, 75),
    'delayLcd': (1185, 284, 228, 86),
    'hold': (1038, 842, 30, 29), 'arp': (1038, 921, 30, 28),
    'oscFrequency': (105, 395, 96, 106), 'oscFine': (268, 427, 54, 63),
    'oscPulseWidth': (83, 556, 52, 60), 'oscSub': (195, 556, 51, 60),
    'oscLevel': (299, 556, 52, 60), 'oscWave': (81, 649, 55, 48),
    'oscSync': (159, 648, 53, 49), 'oscOctD': (231, 649, 53, 48),
    'oscOctU': (302, 649, 52, 48), 'filterCutoff': (477, 395, 96, 114),
    'filterRes': (642, 426, 55, 71), 'filterDrive': (464, 556, 51, 64),
    'filterEnvAmt': (561, 556, 51, 64), 'filterEnvTrack': (660, 556, 51, 65),
    'filterType': (463, 648, 59, 49), 'filterSlope': (553, 648, 61, 49),
    'filterCurve': (645, 648, 60, 49),
    'envA': (813, 392, 36, 140), 'envD': (887, 392, 36, 140),
    'envS': (961, 392, 36, 140), 'envR': (1034, 392, 36, 140),
    'envVel': (832, 591, 49, 53), 'envLoop': (717, 667, 82, 41),
    'delayTime': (1186, 410, 82, 97), 'delayFb': (1341, 410, 80, 94),
    'delayMix': (1169, 556, 51, 63), 'delayTone': (1273, 556, 52, 64),
    'delayMod': (1379, 556, 51, 64), 'delaySync': (1174, 648, 60, 49),
    'delayPing': (1268, 649, 63, 48), 'delayDuck': (1365, 649, 61, 48),
    'scale': (241, 857, 47, 50), 'glide': (329, 857, 47, 49),
    'macro1': (1142, 875, 49, 53), 'macro2': (1234, 875, 50, 53),
    'macro3': (1327, 876, 49, 52), 'macro4': (1419, 876, 49, 52),
    'master': (1322, 99, 63, 63),
}
for name, (x, y, w, h) in rects.items():
    draw.rectangle([x, y, x + w, y + h], outline=(255, 0, 128, 255), width=3)

# transport centers
for cx in (670, 764, 860, 954):
    draw.rectangle([cx - 22, 125 - 22, cx + 22, 125 + 22], outline=(0, 120, 255, 255), width=3)

# keyboard
WKS, WKW = 417, 590
for i in range(14):
    x = WKS + i * (WKW / 14)
    draw.rectangle([x, 800, x + WKW / 14, 800 + 175], outline=(0, 200, 0, 255), width=2)
for cx in (470, 514, 559, 627, 671, 742, 784, 828, 898, 940):
    draw.rectangle([cx - 13, 800, cx + 13, 800 + 105], outline=(255, 160, 0, 255), width=3)

img.convert('RGB').save('/opt/cursor/artifacts/assets/overlay-preview.png')
print('saved')
