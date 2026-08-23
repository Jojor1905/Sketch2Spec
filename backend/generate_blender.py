import bpy
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
JSON_PATH = BASE_DIR / "plan_result.json"
EXPORT_PATH = BASE_DIR.parent / "public" / "house.glb"


def create_material(name, color):
    mat = bpy.data.materials.get(name)

    if mat is None:
        mat = bpy.data.materials.new(name=name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs[0].default_value = color

    return mat


def apply_boolean(target_obj, cutter_obj):
    bpy.context.view_layer.objects.active = target_obj

    bool_mod = target_obj.modifiers.new(
        type="BOOLEAN",
        name="Cutter"
    )

    bool_mod.object = cutter_obj
    bool_mod.operation = "DIFFERENCE"
    bool_mod.solver = "EXACT"

    bpy.ops.object.modifier_apply(
        modifier=bool_mod.name
    )


def create_3d_layout(json_path):
    with open(str(json_path), "r", encoding="utf-8") as f:
        data = json.load(f)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    wall_mat = create_material(
        "WallColor",
        (0.15, 0.15, 0.15, 1)
    )

    window_mat = create_material(
        "WindowColor",
        (0.5, 0.8, 1.0, 0.5)
    )

    floor_mat = create_material(
        "FloorColor",
        (0.75, 0.75, 0.75, 1)
    )

    walls_objs = []

    # =========================
    # WALLS
    # =========================
    for i, wall in enumerate(data.get("walls", [])):
        x1, y1, x2, y2 = wall["bbox"]

        width = abs(x2 - x1) / 100
        depth = abs(y2 - y1) / 100

        width = max(width, 0.08)
        depth = max(depth, 0.08)

        cx = (x1 + x2) / 200
        cy = -(y1 + y2) / 200

        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(cx, cy, 1.35)
        )

        wall_obj = bpy.context.active_object

        wall_thickness = 0.06

        if width > depth:
            wall_obj.scale = (
                width,
                wall_thickness,
                1.5
            )
        else:
            wall_obj.scale = (
                wall_thickness,
                depth,
                1.5
            )

        wall_obj.name = f"Wall_{i}"
        wall_obj.active_material = wall_mat

        bpy.ops.object.modifier_add(type="BEVEL")
        bevel = wall_obj.modifiers["Bevel"]
        bevel.width = 0.01
        bevel.segments = 2

        walls_objs.append(wall_obj)

    # =========================
    # DOORS / WINDOWS CUTTERS
    # =========================
    all_openings = []

    for window in data.get("windows", []):
        window["type"] = "window"
        all_openings.append(window)

    for door in data.get("doors", []):
        door["type"] = "door"
        all_openings.append(door)

    for i, item in enumerate(all_openings):
        x1, y1, x2, y2 = item["bbox"]

        width = abs(x2 - x1) / 100
        depth = abs(y2 - y1) / 100

        cx = (x1 + x2) / 200
        cy = -(y1 + y2) / 200

        if item["type"] == "window":
            if width > depth:
                width *= 0.5
            else:
                depth *= 0.5

            h_val = 1.2
            z_pos = 1.5
        else:
            h_val = 2.1
            z_pos = 1.05

        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(cx, cy, z_pos)
        )

        cutter = bpy.context.active_object

        cutter.scale = (
            max(width, 0.08),
            max(depth, 0.08),
            h_val * 0.5
        )

        cutter.name = f"Cutter_{i}"

        if item["type"] == "window":
            cutter.active_material = window_mat

        for wall in walls_objs:
            wall_x = wall.location.x
            wall_y = wall.location.y

            wall_w = wall.dimensions.x
            wall_d = wall.dimensions.y

            cutter_w = cutter.dimensions.x
            cutter_d = cutter.dimensions.y

            overlap_x = abs(wall_x - cx) < (
                (wall_w + cutter_w) / 2
            )

            overlap_y = abs(wall_y - cy) < (
                (wall_d + cutter_d) / 2
            )

            if overlap_x and overlap_y:
                apply_boolean(wall, cutter)

        bpy.data.objects.remove(
            cutter,
            do_unlink=True
        )

    # =========================
    # CENTER WALLS TO ORIGIN
    # =========================
    min_x = 999999
    max_x = -999999
    min_y = 999999
    max_y = -999999

    for obj in walls_objs:
        obj_min_x = obj.location.x - (obj.dimensions.x / 2)
        obj_max_x = obj.location.x + (obj.dimensions.x / 2)

        obj_min_y = obj.location.y - (obj.dimensions.y / 2)
        obj_max_y = obj.location.y + (obj.dimensions.y / 2)

        min_x = min(min_x, obj_min_x)
        max_x = max(max_x, obj_max_x)

        min_y = min(min_y, obj_min_y)
        max_y = max(max_y, obj_max_y)

    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2

    for obj in walls_objs:
        obj.location.x -= center_x
        obj.location.y -= center_y

    # =========================
    # FLOOR AFTER CENTERING
    # =========================
    bpy.ops.mesh.primitive_plane_add(
        size=3.2,
        location=(0, 0, -0.01)
    )

    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.active_material = floor_mat

    # =========================
    # LIGHT
    # =========================
    bpy.ops.object.light_add(
        type="SUN",
        location=(10, 10, 15)
    )

    light = bpy.context.active_object
    light.data.energy = 4

    # =========================
    # CAMERA
    # =========================
    bpy.ops.object.camera_add(
        location=(0, -6, 7),
        rotation=(1.2, 0, 0)
    )

    bpy.ops.export_scene.gltf(
        filepath=str(EXPORT_PATH),
        export_format="GLB"
    )

    print("✅ house.glb exported!")


create_3d_layout(JSON_PATH)