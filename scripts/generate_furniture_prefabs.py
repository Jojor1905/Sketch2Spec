"""Generate original low-poly GLB furniture and SVG catalog thumbnails.

No external assets or packages are used. The catalog JSON is the source for
real-world dimensions; geometry is authored in metres with its base at y=0.
"""
import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "lib/furniture-catalog.json").read_text())
MODELS = ROOT / "public/furniture/models"
THUMBS = ROOT / "public/furniture/thumbs"


def box(cx, cy, cz, width, height, depth, color):
    return ("box", cx, cy, cz, width, height, depth, color)


def cylinder(cx, cy, cz, width, height, depth, color):
    return ("cylinder", cx, cy, cz, width, height, depth, color)


def legs(width, depth, height, size, color):
    return [box(x * (width / 2 - size / 2), height / 2, z * (depth / 2 - size / 2), size, height, size, color)
            for x in (-1, 1) for z in (-1, 1)]


def shapes(item):
    w, d, h = item["widthM"], item["depthM"], item["heightM"]
    oak, dark, linen, pale, metal, leaf = "#A57950", "#654832", "#CFCCC4", "#E7DFD2", "#454D50", "#55755B"
    ident = item["id"]
    if ident == "linen-sofa":
        return legs(w - .12, d - .10, .12, .09, dark) + [
            box(0, .36, .04, w - .05, .42, d - .06, linen),
            box(0, .64, -d / 2 + .12, w, .40, .24, pale),
            box(-w / 2 + .11, .51, 0, .22, .55, d, pale),
            box(w / 2 - .11, .51, 0, .22, .55, d, pale),
            box(-.55, .59, .10, .85, .11, .54, "#DDD9D0"),
            box(.55, .59, .10, .85, .11, .54, "#DDD9D0"),
        ]
    if ident == "lounge-chair":
        return legs(w - .12, d - .12, .12, .07, dark) + [
            box(0, .34, .04, w - .08, .38, d - .10, linen),
            box(0, .61, -d / 2 + .11, w - .04, .42, .22, pale),
            box(-w / 2 + .09, .45, 0, .18, .45, d - .05, pale),
            box(w / 2 - .09, .45, 0, .18, .45, d - .05, pale),
        ]
    if ident == "dining-chair":
        return legs(w - .04, d - .05, .45, .045, dark) + [
            box(0, .47, 0, w, .07, d, oak),
            box(0, .68, -d / 2 + .035, w, .36, .07, oak),
        ]
    if ident in ("dining-table", "coffee-table", "desk"):
        top = .09 if ident == "dining-table" else .075
        color = oak if ident != "coffee-table" else "#B78A62"
        parts = legs(w - .12, d - .12, h - top, .075 if ident == "dining-table" else .055, dark)
        parts.append(box(0, h - top / 2, 0, w, top, d, color))
        if ident == "coffee-table":
            parts.append(box(0, .16, 0, w - .13, .045, d - .12, oak))
        if ident == "desk":
            parts.extend([box(w / 2 - .21, h - .20, 0, .35, .26, d - .06, dark),
                          box(w / 2 - .21, h - .20, d / 2 + .002, .29, .025, .012, metal)])
        return parts
    if ident == "side-table":
        return [cylinder(0, .025, 0, .32, .05, .32, dark),
                cylinder(0, h / 2, 0, .075, h - .07, .075, dark),
                cylinder(0, h - .03, 0, w, .06, d, oak)]
    if ident == "bed":
        return legs(w - .13, d - .13, .16, .08, dark) + [
            box(0, .25, 0, w, .22, d, oak),
            box(0, .45, .05, w - .08, .23, d - .13, pale),
            box(0, .60, -d / 2 + .08, w, .90, .16, linen),
            box(-w / 4, .59, -d / 2 + .38, w * .39, .10, .42, "#F5F1E9"),
            box(w / 4, .59, -d / 2 + .38, w * .39, .10, .42, "#F5F1E9"),
            box(0, .60, .38, w - .13, .045, d * .53, "#D3C7BA"),
        ]
    if ident == "wardrobe":
        return [box(0, h / 2, 0, w, h, d, oak),
                box(-w / 4, h / 2, d / 2 + .004, w / 2 - .015, h - .08, .012, "#BD956D"),
                box(w / 4, h / 2, d / 2 + .004, w / 2 - .015, h - .08, .012, "#BD956D"),
                box(-.035, h / 2, d / 2 + .018, .018, .24, .018, metal),
                box(.035, h / 2, d / 2 + .018, .018, .24, .018, metal)]
    if ident == "tv-console":
        return legs(w - .10, d - .08, .12, .055, dark) + [
            box(0, .34, 0, w, .38, d, oak),
            box(-w / 4, .34, d / 2 + .005, w / 2 - .02, .30, .012, "#BD956D"),
            box(w / 4, .34, d / 2 + .005, w / 2 - .02, .30, .012, "#BD956D"),
            box(0, .56, 0, w, .045, d, dark),
        ]
    if ident == "reading-lamp":
        return [cylinder(0, .025, 0, .32, .05, .32, metal),
                cylinder(0, .70, 0, .035, 1.35, .035, metal),
                cylinder(0, 1.40, 0, w, .24, d, "#E7D9B7"),
                cylinder(0, 1.515, 0, .13, .01, .13, dark)]
    if ident == "tall-plant":
        return [cylinder(0, .18, 0, .34, .36, .34, "#B07D59"),
                cylinder(0, .66, 0, .055, .66, .055, dark),
                cylinder(-.12, 1.04, 0, .35, .58, .35, leaf),
                cylinder(.13, 1.17, .02, .40, .60, .40, "#658963"),
                cylinder(0, 1.40, -.07, .37, .44, .37, "#769871")]
    raise ValueError(ident)


def mesh_for_shape(shape):
    kind, cx, cy, cz, w, h, d, _ = shape
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    z0, z1 = cz - d / 2, cz + d / 2
    positions, normals, indices = [], [], []

    def quad(points, normal):
        start = len(positions) // 3
        for point in points:
            positions.extend(point)
            normals.extend(normal)
        indices.extend((start, start + 1, start + 2, start, start + 2, start + 3))

    if kind == "box":
        quad([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))
        quad([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], (0, 0, -1))
        quad([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], (1, 0, 0))
        quad([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0))
        quad([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], (0, 1, 0))
        quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0))
    else:
        count = 10
        for index in range(count):
            a, b = (index / count) * math.tau, ((index + 1) / count) * math.tau
            ax, az = cx + math.cos(a) * w / 2, cz + math.sin(a) * d / 2
            bx, bz = cx + math.cos(b) * w / 2, cz + math.sin(b) * d / 2
            normal = (math.cos((a + b) / 2), 0, math.sin((a + b) / 2))
            quad([(ax, y0, az), (bx, y0, bz), (bx, y1, bz), (ax, y1, az)], normal)
            start = len(positions) // 3
            positions.extend((cx, y1, cz, ax, y1, az, bx, y1, bz))
            normals.extend((0, 1, 0) * 3)
            indices.extend((start, start + 1, start + 2))
            start = len(positions) // 3
            positions.extend((cx, y0, cz, bx, y0, bz, ax, y0, az))
            normals.extend((0, -1, 0) * 3)
            indices.extend((start, start + 1, start + 2))
    return positions, normals, indices


def rgb(color):
    return [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]


def write_glb(item, parts):
    binary = bytearray()
    views, accessors, materials, primitives = [], [], [], []
    material_ids = {}

    def accessor(values, fmt, component_type, shape, target, include_bounds=False):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack('<' + fmt * len(values), *values))
        view_index = len(views)
        views.append(dict(buffer=0, byteOffset=offset, byteLength=len(binary) - offset, target=target))
        width = {"SCALAR": 1, "VEC3": 3}[shape]
        entry = dict(bufferView=view_index, componentType=component_type, count=len(values) // width, type=shape)
        if include_bounds:
            entry["min"] = [min(values[index::3]) for index in range(3)]
            entry["max"] = [max(values[index::3]) for index in range(3)]
        accessors.append(entry)
        return len(accessors) - 1

    for part in parts:
        positions, normals, indices = mesh_for_shape(part)
        color = part[-1]
        if color not in material_ids:
            material_ids[color] = len(materials)
            materials.append(dict(name=color, pbrMetallicRoughness=dict(baseColorFactor=rgb(color) + [1], metallicFactor=0, roughnessFactor=.82), doubleSided=True))
        position_index = accessor(positions, 'f', 5126, 'VEC3', 34962, True)
        normal_index = accessor(normals, 'f', 5126, 'VEC3', 34962)
        indices_index = accessor(indices, 'H', 5123, 'SCALAR', 34963)
        primitives.append(dict(attributes=dict(POSITION=position_index, NORMAL=normal_index), indices=indices_index, material=material_ids[color]))

    data = dict(asset=dict(version="2.0", generator="Sketch2Spec original furniture prefabs"),
                scenes=[dict(nodes=[0])], scene=0, nodes=[dict(mesh=0, name=item["name"])],
                meshes=[dict(name=item["id"], primitives=primitives)],
                accessors=accessors, bufferViews=views, buffers=[dict(byteLength=len(binary))], materials=materials)
    content = json.dumps(data, separators=(',', ':')).encode()
    content += b' ' * (-len(content) % 4)
    binary.extend(b'\0' * (-len(binary) % 4))
    payload = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(content) + 8 + len(binary))
    payload += struct.pack('<I4s', len(content), b'JSON') + content
    payload += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    (MODELS / f'{item["id"]}.glb').write_bytes(payload)


def write_thumbnail(item, parts):
    w, d, h = item["widthM"], item["depthM"], item["heightM"]
    scale = min(125 / (w + d), 92 / h)

    def project(x, y, z):
        return (120 + (x - z) * scale * .75, 137 + (x + z) * scale * .35 - y * scale)

    def polygon(points, color):
        coords = ' '.join(f'{x:.1f},{y:.1f}' for x, y in points)
        return f'<polygon points="{coords}" fill="{color}" stroke="#51463D" stroke-opacity=".13" stroke-width="1"/>'

    elements = []
    for part in sorted(parts, key=lambda shape: shape[1] + shape[3]):
        _, cx, cy, cz, width, height, depth, color = part
        x0, x1 = cx - width / 2, cx + width / 2
        y0, y1 = cy - height / 2, cy + height / 2
        z0, z1 = cz - depth / 2, cz + depth / 2
        left = [project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)]
        right = [project(x1, y0, z0), project(x1, y0, z1), project(x1, y1, z1), project(x1, y1, z0)]
        top = [project(x0, y1, z0), project(x1, y1, z0), project(x1, y1, z1), project(x0, y1, z1)]
        elements.extend((polygon(left, color), polygon(right, color), polygon(top, color)))
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170" role="img">'
    svg += '<rect width="240" height="170" rx="18" fill="#F6F4F0"/><ellipse cx="120" cy="143" rx="76" ry="14" fill="#DCD8D0" opacity=".55"/>'
    svg += ''.join(elements) + '</svg>'
    (THUMBS / f'{item["id"]}.svg').write_text(svg)


def main():
    MODELS.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    for item in CATALOG:
        parts = shapes(item)
        write_glb(item, parts)
        write_thumbnail(item, parts)
        print(item['id'], len(parts))


if __name__ == '__main__':
    main()
