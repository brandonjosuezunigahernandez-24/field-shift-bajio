"""Low-poly models for the 3D view of Field Shift Bajío.

Builds the 7 crops of server/data/cultivos.json plus a farmhouse and a mesquite tree, and
exports them as ONE .glb (one named mesh per model) to client/public/models/bajio.glb.

Run from the repo root (Blender 4.2+ or 5.x, no GUI needed):
    blender --background --factory-startup --python assets/blender/build_models.py

Budget, so hundreds of instances stay smooth on a school laptop or a phone:
  - crops under ~300 triangles each, flat shaded;
  - sizes in real meters (Z up in Blender, Y up in the .glb); the web view scales them.

Textures: every part gets a procedural material (leaf veins, stalk fibers, kernels, florets,
bark, adobe plaster, clay roof tiles, wood grain). Each finished model is then UV-unwrapped and
its colors are BAKED (Cycles) into ONE image, exported as JPEG inside the .glb. One texture per
model keeps the client fast: every crop type is still one InstancedMesh, one draw call, whatever
the number of plants. Nothing is downloaded: the textures are made here, so no license to check.
"""

import math
import os
import random
import sys

import bpy

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "client", "public", "models", "bajio.glb")

rng = random.Random(2026)  # fixed seed: the same script always gives the same file

# --- palette (linear-ish sRGB, kept muted so the terrain colors read first) ---
C = {
    "stalk": (0.30, 0.55, 0.18),
    "leaf": (0.22, 0.50, 0.15),
    "leaf_dark": (0.12, 0.35, 0.10),
    "leaf_blue": (0.25, 0.45, 0.38),
    "tassel": (0.85, 0.75, 0.40),
    "husk": (0.55, 0.70, 0.30),
    "grain_red": (0.55, 0.22, 0.10),
    "wheat": (0.85, 0.70, 0.30),
    "barley": (0.80, 0.75, 0.45),
    "pod": (0.60, 0.70, 0.25),
    "chickpea": (0.40, 0.55, 0.25),
    "broccoli": (0.10, 0.32, 0.12),
    "wall": (0.90, 0.82, 0.68),
    "roof": (0.70, 0.30, 0.18),
    "wood": (0.40, 0.25, 0.12),
    "canopy": (0.33, 0.45, 0.20),
    "bark": (0.34, 0.23, 0.14),
}

# Which procedural pattern each part gets.
KIND = {
    "leaf": "veins", "leaf_dark": "veins", "leaf_blue": "veins", "canopy": "veins",
    "chickpea": "veins", "pod": "veins", "husk": "veins",
    "stalk": "fiber",
    "tassel": "kernels", "wheat": "kernels", "barley": "kernels", "grain_red": "kernels",
    "broccoli": "florets",
    "wall": "plaster", "roof": "tiles", "wood": "woodgrain", "bark": "bark",
}
TEXTURE_SIZE = 512
_materials = {}


def _shade(rgb, k):
    return tuple(min(1.0, c * k) for c in rgb) + (1.0,)


def _ramp(nodes, links, fac_socket, stops):
    """ColorRamp from a 0..1 factor; stops = [(position, rgba), ...]."""
    ramp = nodes.new("ShaderNodeValToRGB")
    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for element, (pos, color) in zip(elements, stops):
        element.position = pos
        element.color = color
    links.new(fac_socket, ramp.inputs["Fac"])
    return ramp.outputs["Color"]


def _mix(nodes, links, a, b, wa=0.5):
    """a * wa + b * (1 - wa), with Math nodes (stable across Blender versions)."""
    m1 = nodes.new("ShaderNodeMath")
    m1.operation = "MULTIPLY"
    m1.inputs[1].default_value = wa
    links.new(a, m1.inputs[0])
    m2 = nodes.new("ShaderNodeMath")
    m2.operation = "MULTIPLY_ADD"
    m2.inputs[1].default_value = 1 - wa
    links.new(b, m2.inputs[0])
    links.new(m1.outputs[0], m2.inputs[2])
    return m2.outputs[0]


def material(name):
    """Procedural material for one part. It only lives until the model is baked."""
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    rgb = C[name]
    mat.diffuse_color = (*rgb, 1.0)
    try:
        mat.use_nodes = True  # always on (and deprecated) in Blender 5
    except AttributeError:
        pass
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85
    coord = nodes.new("ShaderNodeTexCoord").outputs["Object"]
    kind = KIND[name]

    def noise(scale, detail=4.0, rough=0.6):
        n = nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        links.new(coord, n.inputs["Vector"])
        return n.outputs["Fac"]

    def wave(scale, distortion, kind_="BANDS", direction="X"):
        w = nodes.new("ShaderNodeTexWave")
        w.wave_type = kind_
        if kind_ == "BANDS":
            w.bands_direction = direction
        else:
            w.rings_direction = "Z"
        w.inputs["Scale"].default_value = scale
        w.inputs["Distortion"].default_value = distortion
        w.inputs["Detail"].default_value = 3.0
        links.new(coord, w.inputs["Vector"])
        return w.outputs["Fac"]

    def voronoi(scale):
        v = nodes.new("ShaderNodeTexVoronoi")
        v.inputs["Scale"].default_value = scale
        links.new(coord, v.inputs["Vector"])
        return v.outputs["Distance"]

    if kind == "veins":  # fine parallel veins and soft mottling on leaves
        fac = _mix(nodes, links, wave(55, 2.5), noise(14), 0.55)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.62)), (0.5, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.3))])
    elif kind == "fiber":  # vertical fibers along stalks and stems
        fac = _mix(nodes, links, wave(70, 1.5, direction="Z"), noise(30), 0.6)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.7)), (0.6, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.2))])
    elif kind == "kernels":  # packed grains: bright kernels, dark gaps
        fac = voronoi(110)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 1.3)), (0.35, _shade(rgb, 1.0)), (0.75, _shade(rgb, 0.55))])
    elif kind == "florets":  # broccoli head: small bumps
        fac = _mix(nodes, links, voronoi(70), noise(40), 0.7)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 1.6)), (0.4, _shade(rgb, 1.0)), (0.9, _shade(rgb, 0.5))])
    elif kind == "plaster":  # hand-applied adobe plaster with speckles
        fac = _mix(nodes, links, noise(4, 8, 0.7), noise(80, 2, 0.5), 0.7)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.82)), (0.5, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.08))])
    elif kind == "tiles":  # clay roof tiles in rows
        brick = nodes.new("ShaderNodeTexBrick")
        brick.inputs["Color1"].default_value = _shade(rgb, 1.0)
        brick.inputs["Color2"].default_value = _shade(rgb, 0.78)
        brick.inputs["Mortar"].default_value = _shade(rgb, 0.45)
        brick.inputs["Scale"].default_value = 6.0
        brick.inputs["Mortar Size"].default_value = 0.015
        brick.inputs["Brick Width"].default_value = 0.35
        brick.inputs["Row Height"].default_value = 0.18
        links.new(coord, brick.inputs["Vector"])
        color = brick.outputs["Color"]
    elif kind == "woodgrain":  # planks of the door and windows
        fac = _mix(nodes, links, wave(6, 8, "RINGS"), noise(40), 0.75)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.7)), (0.5, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.25))])
    else:  # bark: deep vertical cracks
        fac = _mix(nodes, links, wave(18, 10, direction="Z"), noise(10, 8, 0.7), 0.5)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.45)), (0.45, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.25))])

    links.new(color, bsdf.inputs["Base Color"])
    _materials[name] = mat
    return mat


def bake_texture(obj, size=TEXTURE_SIZE):
    """UV-unwrap the model and bake all its procedural colors into one image and one material."""
    scene = bpy.context.scene
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")

    image = bpy.data.images.new(f"{obj.name}_textura", size, size)
    added = []
    for slot in obj.material_slots:
        tree = slot.material.node_tree
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        tree.nodes.active = node  # Cycles bakes into the active image node of each material
        added.append((tree, node))

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 1  # a color pass has no noise to clean up
    scene.render.bake.margin = 6
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_clear=True)
    for tree, node in added:
        tree.nodes.remove(node)
    image.pack()  # embedded in the .glb

    baked = bpy.data.materials.new(f"{obj.name}_material")
    try:
        baked.use_nodes = True
    except AttributeError:
        pass
    tree = baked.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(baked)
    for poly in obj.data.polygons:
        poly.material_index = 0


def finish(obj, color):
    obj.data.materials.clear()
    obj.data.materials.append(material(color))
    return obj


def cylinder(color, radius, depth, loc, rot=(0, 0, 0), verts=6, radius_top=None):
    if radius_top is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(
            vertices=verts, radius1=radius, radius2=radius_top, depth=depth, location=loc, rotation=rot
        )
    return finish(bpy.context.active_object, color)


def cone(color, radius, depth, loc, rot=(0, 0, 0), verts=6):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, radius2=0, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.active_object, color)


def blob(color, radius, loc, scale=(1, 1, 1), subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.scale = scale
    return finish(obj, color)


def box(color, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.scale = size
    return finish(obj, color)


def leaf(color, length, width, height, yaw, droop=0.45):
    """A flat blade that starts at the stalk and leans out and down."""
    cx = math.cos(yaw) * length * 0.45
    cy = math.sin(yaw) * length * 0.45
    return box(color, (length, width, 0.006), (cx, cy, height), rot=(0, droop, yaw))


def join(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.shade_flat()
    return obj


# --- crops ---------------------------------------------------------------------------------

def tall_grass(name, height, leaves, head):
    """Maize and sorghum: one stalk, alternating leaves, something on top."""
    parts = [cylinder("stalk", 0.04, height, (0, 0, height / 2), radius_top=0.025)]
    for i in range(leaves):
        z = height * (0.18 + 0.62 * i / max(leaves - 1, 1))
        yaw = i * math.radians(180 + rng.uniform(-25, 25))
        parts.append(leaf("leaf", 0.6 * (1.1 - i / (leaves * 1.6)), 0.12, z, yaw, droop=0.35))
    parts += head(height)
    return join(name, parts)


def maize_head(h):
    return [
        cone("tassel", 0.06, 0.35, (0, 0, h + 0.15), verts=5),
        # one ear on the side, wrapped in husk
        cylinder("husk", 0.045, 0.22, (0.06, 0, h * 0.55), rot=(0, 0.35, 0), radius_top=0.02),
    ]


def sorghum_head(h):
    return [blob("grain_red", 0.09, (0, 0, h + 0.1), scale=(0.8, 0.8, 1.6))]


def small_grain(name, color, height, stems, nod):
    """Wheat and barley: a tuft of thin stems with spikes; barley spikes nod over."""
    parts = []
    for i in range(stems):
        a = 2 * math.pi * i / stems + rng.uniform(-0.3, 0.3)
        r = 0.05 + rng.uniform(0, 0.03)
        lean = rng.uniform(0.05, 0.15)
        x, y = math.cos(a) * r, math.sin(a) * r
        parts.append(cylinder("stalk", 0.006, height, (x, y, height / 2), rot=(lean * math.sin(a), lean * math.cos(a), 0), verts=4))
        tip = (x * 1.6, y * 1.6, height + 0.04)
        spike_rot = (nod * math.sin(a), nod * math.cos(a), 0)
        parts.append(cylinder(color, 0.022, 0.12, tip, rot=spike_rot, verts=5, radius_top=0.005))
    for i in range(3):
        parts.append(leaf("leaf", 0.3, 0.02, 0.12 + 0.08 * i, i * 2.1, droop=0.7))
    return join(name, parts)


def bush(name, leaf_color, radius, height, extras):
    """Bean and chickpea: a low rounded bush, plus pods."""
    parts = [cylinder("stalk", 0.015, height * 0.5, (0, 0, height * 0.25), verts=5)]
    for i in range(4):
        a = i * 1.7
        parts.append(
            blob(
                leaf_color,
                radius * rng.uniform(0.55, 0.75),
                (math.cos(a) * radius * 0.45, math.sin(a) * radius * 0.45, height * rng.uniform(0.55, 0.8)),
                scale=(1, 1, 0.7),
            )
        )
    parts += extras(radius, height)
    return join(name, parts)


def bean_pods(radius, height):
    return [
        cylinder("pod", 0.012, 0.12, (math.cos(a) * radius * 0.8, math.sin(a) * radius * 0.8, height * 0.45), rot=(0.3, 0.6, a), verts=4)
        for a in (0.4, 2.3, 4.4)
    ]


def chickpea_pods(radius, height):
    return [
        blob("pod", 0.025, (math.cos(a) * radius * 0.85, math.sin(a) * radius * 0.85, height * 0.6), subdiv=1)
        for a in (0.9, 3.0, 5.0)
    ]


def broccoli():
    h = 0.45
    parts = [cylinder("stalk", 0.04, h, (0, 0, h / 2), radius_top=0.03)]
    for i in range(5):
        parts.append(box("leaf_blue", (0.4, 0.14, 0.008), (math.cos(i * 1.26) * 0.18, math.sin(i * 1.26) * 0.18, 0.18 + 0.03 * i), rot=(0, -0.5, i * 1.26)))
    parts.append(blob("broccoli", 0.13, (0, 0, h + 0.05), scale=(1, 1, 0.75)))
    return join("brocoli", parts)


# --- scenery -------------------------------------------------------------------------------

def farmhouse():
    w, d, h = 7.0, 5.0, 3.0
    parts = [box("wall", (w, d, h), (0, 0, h / 2))]
    # gabled roof: a long box turned 45 degrees on X; its lower half hides inside the walls
    side = d * 0.78
    parts.append(box("roof", (w * 1.08, side, side), (0, 0, h), rot=(math.pi / 4, 0, 0)))
    parts.append(box("wood", (1.0, 0.1, 2.0), (0.8, -d / 2 - 0.02, 1.0)))
    parts.append(box("wood", (0.9, 0.1, 0.8), (-2.0, -d / 2 - 0.02, 1.7)))
    return join("casa", parts)


def mesquite():
    parts = [cylinder("bark", 0.18, 2.2, (0, 0, 1.1), rot=(0.12, 0.05, 0), radius_top=0.1)]
    for loc, s in (((0.4, 0, 2.6), 1.6), ((-0.8, 0.4, 2.3), 1.3), ((0.2, -0.9, 2.4), 1.2)):
        parts.append(blob("canopy", s, loc, scale=(1, 1, 0.45)))
    return join("arbol", parts)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    models = [
        tall_grass("maiz", 2.0, 7, maize_head),
        tall_grass("sorgo", 1.4, 6, sorghum_head),
        small_grain("trigo", "wheat", 0.85, 7, nod=0.15),
        small_grain("cebada", "barley", 0.75, 7, nod=0.9),
        bush("frijol", "leaf_dark", 0.28, 0.5, bean_pods),
        bush("garbanzo", "chickpea", 0.22, 0.45, chickpea_pods),
        broccoli(),
        farmhouse(),
        mesquite(),
    ]

    # Spread them on X so the .blend/.glb is easy to inspect; the web view only reads geometry.
    for obj in models:
        bake_texture(obj)
    for i, obj in enumerate(models):
        obj.location = (i * 3.0 if obj.name not in ("casa", "arbol") else 30 + i * 6.0, 0, 0)
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        print(f"  {obj.name:<9} {tris:>5} triangles, textura {TEXTURE_SIZE} px")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    options = dict(filepath=OUT, export_format="GLB", use_selection=False, export_apply=True, export_yup=True)
    try:  # JPEG keeps 9 textures small (the option names changed across Blender versions)
        bpy.ops.export_scene.gltf(**options, export_image_format="JPEG", export_jpeg_quality=85)
    except TypeError:
        bpy.ops.export_scene.gltf(**options, export_image_format="JPEG")
    print(f"OK {OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # make the failure visible in --background mode
        print(f"FAIL {exc}", file=sys.stderr)
        raise
