"""Low-poly models for the 3D view of Field Shift Bajío.

Builds 22 crops plus a farmhouse and a mesquite tree, and exports ONE .glb PER CROP to
client/public/models/<id>.glb (with "<id>" and "<id>_lp" inside) and escenario.glb (house and
tree). One file per crop: the web app downloads only the crops the farmer actually uses.

Run from the repo root (Blender 4.2+ or 5.x, no GUI needed):
    blender --background --factory-startup --python assets/blender/build_models.py

Budget, so hundreds of instances stay smooth on a school laptop or a phone:
  - crops under ~300 triangles each, flat shaded;
  - sizes in real meters (Z up in Blender, Y up in the .glb); the web view scales them.

Two versions of each crop:
  - "<id>" DETAILED, for the 3D diorama: arching ribbon leaves with midrib and wavy edges, stalk
    with nodes and sheaths, maize ear in its husk with silk, branched tassel, brace roots, seed
    heads made of spikelets, trifoliate bean leaves, broccoli florets... (~700-2000 triangles).
  - "<id>_lp" LOW-POLY (the first version), for the satellite map, where a plant is ~25 px tall
    and hundreds of them are drawn: detail there would only cost frames.

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

import bmesh
import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO, "client", "public", "models")

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
    # detailed models: leaf blades with veins ALONG the leaf (they use the LeafUV map)
    "blade": (0.13, 0.36, 0.13),  # the deep, slightly blue green of a healthy maize leaf
    "blade_dark": (0.11, 0.33, 0.09),
    "blade_blue": (0.24, 0.43, 0.36),
    "blade_husk": (0.50, 0.66, 0.28),
    "silk": (0.86, 0.72, 0.44),
    "glass": (0.12, 0.16, 0.18),
    # the 15 crops added later
    "oat": (0.82, 0.78, 0.50),
    "rice": (0.85, 0.72, 0.30),
    "amaranth": (0.62, 0.08, 0.22),
    "petal_yellow": (0.95, 0.74, 0.08),
    "disc": (0.25, 0.15, 0.07),
    "pumpkin": (0.90, 0.45, 0.08),
    "tuber": (0.72, 0.58, 0.36),
    "peanut": (0.75, 0.60, 0.38),
    "bulb": (0.86, 0.78, 0.70),
    "tomato": (0.80, 0.10, 0.06),
    "chile_red": (0.75, 0.08, 0.05),
    "chile_green": (0.15, 0.40, 0.10),
    "berry": (0.82, 0.08, 0.10),
    "flower_white": (0.95, 0.95, 0.90),
    "flower_purple": (0.50, 0.30, 0.70),
    "flower_yellow": (0.95, 0.80, 0.15),
    "agave": (0.33, 0.50, 0.50),
    "nopal": (0.30, 0.50, 0.24),
    "tuna": (0.70, 0.10, 0.30),
    "avocado": (0.10, 0.22, 0.08),
}

# Which procedural pattern each part gets.
KIND = {
    "leaf": "veins", "leaf_dark": "veins", "leaf_blue": "veins", "canopy": "veins",
    "chickpea": "veins", "pod": "veins", "husk": "veins",
    "stalk": "fiber",
    "tassel": "kernels", "wheat": "kernels", "barley": "kernels", "grain_red": "kernels",
    "broccoli": "florets",
    "wall": "plaster", "roof": "tiles", "wood": "woodgrain", "bark": "bark",
    "blade": "leafuv", "blade_dark": "leafuv", "blade_blue": "leafuv", "blade_husk": "leafuv",
    "silk": "fiber", "glass": "plaster",
    "oat": "kernels", "rice": "kernels", "amaranth": "kernels", "disc": "kernels", "berry": "kernels",
    "petal_yellow": "leafuv", "agave": "leafuv",
    "nopal": "florets",
    "pumpkin": "fruit", "tuber": "fruit", "peanut": "fruit", "bulb": "fruit", "tomato": "fruit",
    "chile_red": "fruit", "chile_green": "fruit", "flower_white": "fruit", "flower_purple": "fruit",
    "flower_yellow": "fruit", "tuna": "fruit", "avocado": "fruit",
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


def _mix_color(nodes, links, fac, a, b):
    """Color mix node, wired by socket identifiers (stable across Blender 4.x / 5.x)."""
    m = nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    ins = {sock.identifier: sock for sock in m.inputs}
    outs = {sock.identifier: sock for sock in m.outputs}
    links.new(fac, ins["Factor_Float"])
    links.new(a, ins["A_Color"])
    links.new(b, ins["B_Color"])
    return outs["Result_Color"]


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
    elif kind == "fruit":  # smooth skin with soft blotches
        fac = _mix(nodes, links, noise(18, 3, 0.5), noise(70, 2, 0.5), 0.7)
        color = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.78)), (0.5, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.15))])
    elif kind == "leafuv":
        uv = nodes.new("ShaderNodeUVMap")
        uv.uv_map = "LeafUV"  # u along the blade (0 base, 1 tip), v across (0.5 = midrib)
        sep = nodes.new("ShaderNodeSeparateXYZ")
        links.new(uv.outputs["UV"], sep.inputs[0])
        veins = nodes.new("ShaderNodeTexWave")
        veins.wave_type = "BANDS"
        veins.bands_direction = "Y"
        veins.inputs["Scale"].default_value = 14.0
        veins.inputs["Distortion"].default_value = 0.4
        veins.inputs["Detail"].default_value = 1.0
        links.new(uv.outputs["UV"], veins.inputs["Vector"])
        fac = _mix(nodes, links, veins.outputs["Fac"], noise(22, 3, 0.5), 0.75)
        blade = _ramp(nodes, links, fac, [(0.0, _shade(rgb, 0.68)), (0.5, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.22))])
        # midrib: a pale stripe where v is close to 0.5
        off = nodes.new("ShaderNodeMath")
        off.operation = "SUBTRACT"
        off.inputs[1].default_value = 0.5
        links.new(sep.outputs["Y"], off.inputs[0])
        dist = nodes.new("ShaderNodeMath")
        dist.operation = "ABSOLUTE"
        links.new(off.outputs[0], dist.inputs[0])
        rib = _ramp(nodes, links, dist.outputs[0], [(0.0, (0.82, 0.88, 0.62, 1.0)), (0.06, _shade(rgb, 1.0)), (1.0, _shade(rgb, 1.0))])
        ribmask = nodes.new("ShaderNodeMath")
        ribmask.operation = "LESS_THAN"
        ribmask.inputs[1].default_value = 0.06
        links.new(dist.outputs[0], ribmask.inputs[0])
        with_rib = _mix_color(nodes, links, ribmask.outputs[0], blade, rib)
        # the tip dries a little, as in a real field
        tip = nodes.new("ShaderNodeMath")
        tip.operation = "POWER"
        tip.inputs[1].default_value = 4.0
        links.new(sep.outputs["X"], tip.inputs[0])
        tipk = nodes.new("ShaderNodeMath")
        tipk.operation = "MULTIPLY"
        tipk.inputs[1].default_value = 0.55
        links.new(tip.outputs[0], tipk.inputs[0])
        dry = nodes.new("ShaderNodeRGB")
        dry.outputs[0].default_value = (0.70, 0.66, 0.36, 1.0)
        color = _mix_color(nodes, links, tipk.outputs[0], with_rib, dry.outputs[0])
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
    uv_layers = obj.data.uv_layers
    bake_uv = uv_layers.new(name="BakeUV")
    uv_layers.active = bake_uv
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
    # Keep only the baked UV map: the exported mesh has a single UV set for the texture.
    for layer in [l for l in uv_layers if l.name != "BakeUV"]:
        uv_layers.remove(layer)
    uv_layers["BakeUV"].active = True
    uv_layers["BakeUV"].active_render = True

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


def join(name, parts, smooth=False):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if smooth:
        bpy.ops.object.shade_smooth()
    else:
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



# --- detailed models (bmesh) -----------------------------------------------------------------

class Builder:
    """Collects geometry per color in bmeshes; finish() makes one object per color and joins."""

    def __init__(self):
        self.bms = {}

    def bm(self, color):
        if color not in self.bms:
            b = bmesh.new()
            b.loops.layers.uv.new("LeafUV")
            self.bms[color] = b
        return self.bms[color]

    def finish(self, name, smooth=True):
        objs = []
        for color, b in self.bms.items():
            mesh = bpy.data.meshes.new(f"{name}_{color}")
            b.normal_update()
            b.to_mesh(mesh)
            b.free()
            obj = bpy.data.objects.new(f"{name}_{color}", mesh)
            bpy.context.collection.objects.link(obj)
            obj.data.materials.append(material(color))
            objs.append(obj)
        return join(name, objs, smooth=smooth)


def _frame(t):
    t = t.normalized()
    ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
    a = t.cross(ref).normalized()
    return a, t.cross(a).normalized()


def tube(B, color, points, radii, sides=6):
    """Tube along a polyline with one radius per point (0 at the end = pointed tip)."""
    bm = B.bm(color)
    pts = [Vector(p) for p in points]
    rings = []
    for i, p in enumerate(pts):
        if i == 0:
            t = pts[1] - p
        elif i == len(pts) - 1:
            t = p - pts[i - 1]
        else:
            t = pts[i + 1] - pts[i - 1]
        a, b = _frame(t)
        r = max(radii[i], 0.0004)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))


def curve(start, direction, length, rise, droop, n=6):
    """Points of a branch that leaves `start` toward `direction` (yaw), rises and then bends down."""
    sx, sy, sz = start
    dx, dy = math.cos(direction), math.sin(direction)
    out = []
    for i in range(n + 1):
        t = i / n
        h = length * t
        out.append((sx + dx * h, sy + dy * h, sz + length * (rise * t - droop * t * t)))
    return out


def ribbon(B, color, origin, yaw, length, width, rise=1.2, droop=1.0, segs=10, crease=0.22, wave=0.0,
           width_profile=None, tilt=0.0):
    """A leaf blade: arches out from `origin`, V-shaped across (midrib), tapered, wavy edges.
    LeafUV: u along the blade (0 base, 1 tip), v across (0, 0.5 midrib, 1)."""
    bm = B.bm(color)
    uvl = bm.loops.layers.uv["LeafUV"]
    ox, oy, oz = origin
    d = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    side = Vector((-math.sin(yaw), math.cos(yaw), 0.0))
    if tilt:
        side = (side * math.cos(tilt) + Vector((0, 0, 1)) * math.sin(tilt)).normalized()
    profile = width_profile or (lambda t: math.sin(math.pi * min(1.0, 0.08 + t * 0.95)) ** 0.55)
    rows, uv_of = [], {}
    prev = None
    for i in range(segs + 1):
        t = i / segs
        c = Vector((ox, oy, oz)) + d * (length * t) + Vector((0, 0, length * (rise * t - droop * t * t) * 0.5))
        tangent = (c - prev) if prev is not None else d + Vector((0, 0, rise * 0.5))
        prev = c
        normal = tangent.normalized().cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        w = width * profile(t) * (1.0 if i < segs else 0.04)
        ripple = wave * math.sin(i * 2.3) * w * 4
        left = c - side * (w / 2) + normal * (crease * w + ripple)
        mid = c
        right = c + side * (w / 2) + normal * (crease * w - ripple)
        row = [bm.verts.new(left), bm.verts.new(mid), bm.verts.new(right)]
        for vert, v in zip(row, (0.0, 0.5, 1.0)):
            uv_of[vert] = (t, v)
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for a, b in ((0, 1), (1, 2)):
            face = bm.faces.new((r0[a], r0[b], r1[b], r1[a]))
            for loop in face.loops:
                loop[uvl].uv = uv_of[loop.vert]


def blob_at(B, color, center, radius, scale=(1, 1, 1), subdiv=1, yaw=0.0):
    """Ico sphere, scaled per axis, then turned by `yaw` around Z, at `center`."""
    bm = B.bm(color)
    geom = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    cy, sy = math.cos(yaw), math.sin(yaw)
    for v in geom["verts"]:
        x, y, z = v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]
        v.co = Vector((x * cy - y * sy, x * sy + y * cy, z)) + Vector(center)


def stalk_with_nodes(B, height, r_base, r_top, nodes, sides=8):
    """Stalk that tapers up and bulges a little at each node."""
    zs, rs = [0.0], [r_base * 1.05]
    for z in nodes:
        r = r_base + (r_top - r_base) * (z / height)
        for dz, k in ((-0.025, 1.0), (0.0, 1.12), (0.02, 1.0)):
            zs.append(z + dz)
            rs.append(r * k)
    zs.append(height)
    rs.append(r_top * 0.7)
    tube(B, "stalk", [(0, 0, z) for z in zs], rs, sides)


def maize_detailed():
    B = Builder()
    H = 2.2
    nodes = [0.13, 0.28, 0.43, 0.58, 0.73, 0.88, 1.03, 1.18, 1.33, 1.48, 1.63, 1.78, 1.93]
    stalk_with_nodes(B, H, 0.042, 0.02, nodes)  # thick stalk, like the photo
    # brace roots at the base
    for k in range(7):
        a = k * math.tau / 7 + 0.3
        tube(B, "stalk", [(0, 0, 0.14), (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.065), (math.cos(a) * 0.12, math.sin(a) * 0.12, -0.01)],
             [0.009, 0.008, 0.005], 5)
    # leaves alternate (two ranks): wide, long, they rise steeply and then arch over and droop
    count = len(nodes) - 1
    for i, z in enumerate(nodes[:-1]):
        yaw = (0 if i % 2 == 0 else math.pi) + rng.uniform(-0.5, 0.5)
        t = i / (count - 1)
        length = 0.65 + 0.5 * math.sin(math.pi * (0.2 + t * 0.65))
        r = 0.042 + (0.02 - 0.042) * (z / H)
        # sheath: hugs the stalk from below the node, so the stalk shows green bands, not rings
        tube(B, "blade", [(0, 0, z - 0.14), (0, 0, z - 0.05), (0, 0, z + 0.015)], [r + 0.002, r + 0.003, r + 0.004], 9)
        ribbon(B, "blade", (math.cos(yaw) * r, math.sin(yaw) * r, z + 0.015), yaw, length, 0.11,
               rise=2.1 + rng.uniform(-0.2, 0.4), droop=2.5 + rng.uniform(0, 0.6), segs=14, wave=0.014,
               tilt=rng.uniform(-0.3, 0.3))
    # the ear: shank, a big husk-wrapped spindle, loose husk tips and a tuft of silk
    ez, ea = 1.0, math.radians(24)
    yaw = math.pi / 2
    base = Vector((math.cos(yaw) * 0.034, math.sin(yaw) * 0.034, ez))
    axis = Vector((math.cos(yaw) * math.sin(ea), math.sin(yaw) * math.sin(ea), math.cos(ea)))
    tube(B, "blade_husk", [base, base + axis * 0.05], [0.014, 0.017], 7)
    prof = [0.02, 0.038, 0.046, 0.046, 0.042, 0.034, 0.024, 0.013, 0.005]
    ear = [base + axis * (0.05 + 0.3 * k / (len(prof) - 1)) for k in range(len(prof))]
    tube(B, "blade_husk", ear, prof, 10)
    for k in range(4):
        a = yaw + (k - 1.5) * 0.7
        ribbon(B, "blade_husk", tuple(ear[-3]), a, 0.12, 0.035, rise=2.8, droop=1.6, segs=6, crease=0.3)
    for k in range(26):
        a = yaw + rng.uniform(-1.6, 1.6)
        tip = ear[-1]
        spread = rng.uniform(0.018, 0.03)
        pts = [tip + Vector((math.cos(a) * spread * j, math.sin(a) * spread * j, 0.032 * j - 0.013 * j * j)) for j in range(6)]
        tube(B, "silk", pts, [0.0022, 0.0022, 0.002, 0.0017, 0.0012, 0.0004], 3)
    # tassel: central spike and drooping branches
    tube(B, "tassel", [(0, 0, H - 0.02), (0, 0, H + 0.2), (0.01, 0, H + 0.4)], [0.009, 0.006, 0.001], 6)
    for k in range(8):
        a = k * math.tau / 8 + rng.uniform(-0.2, 0.2)
        z0 = H + 0.03 + k * 0.022
        pts = curve((0, 0, z0), a, 0.24 + rng.uniform(-0.04, 0.05), rise=0.7, droop=1.6, n=5)
        tube(B, "tassel", pts, [0.004, 0.004, 0.0035, 0.003, 0.002, 0.0005], 4)
    return B.finish("maiz")


def sorghum_detailed():
    B = Builder()
    H = 1.5
    nodes = [0.12, 0.3, 0.48, 0.66, 0.84, 1.02, 1.18, 1.32]
    stalk_with_nodes(B, H, 0.024, 0.013, nodes)
    for i, z in enumerate(nodes[:-1]):
        yaw = (0 if i % 2 == 0 else math.pi) + rng.uniform(-0.5, 0.5)
        r = 0.024 - 0.011 * (z / H)
        tube(B, "blade", [(0, 0, z - 0.08), (0, 0, z + 0.01)], [r + 0.005, r + 0.003], 7)
        ribbon(B, "blade", (math.cos(yaw) * r, math.sin(yaw) * r, z + 0.01), yaw, 0.42 + 0.2 * math.sin(math.pi * i / 6), 0.06,
               rise=1.6, droop=2.0 + rng.uniform(0, 0.5), segs=10, wave=0.01, tilt=rng.uniform(-0.2, 0.2))
    # peduncle and a compact panicle of grains
    tube(B, "stalk", [(0, 0, H), (0, 0, H + 0.12)], [0.012, 0.009], 6)
    for k in range(70):
        u = rng.random()
        z = H + 0.12 + u * 0.24
        rad = 0.07 * math.sin(math.pi * (0.15 + u * 0.8))
        a = rng.uniform(0, math.tau)
        rr = rad * math.sqrt(rng.random())
        blob_at(B, "grain_red", (math.cos(a) * rr, math.sin(a) * rr, z), 0.016 + rng.uniform(0, 0.006), subdiv=0)
    return B.finish("sorgo")


def small_grain_detailed(name, head_color, height, culms, awns, nod):
    B = Builder()
    for c in range(culms):
        a = c * math.tau / culms + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.05, 0.16)
        top = (math.cos(a) * height * lean, math.sin(a) * height * lean, height * rng.uniform(0.92, 1.05))
        pts = [(0, 0, 0)] + [(top[0] * t, top[1] * t, top[2] * t) for t in (0.35, 0.7, 1.0)]
        tube(B, "stalk", pts, [0.006, 0.005, 0.004, 0.0035], 5)
        # narrow leaves from the lower culm
        for k in range(2):
            z = 0.12 + k * 0.18
            ribbon(B, "blade", (top[0] * z / top[2], top[1] * z / top[2], z), a + (k - 0.5) * 1.8, 0.28, 0.016,
                   rise=1.4, droop=1.9, segs=7, crease=0.2, wave=0.0)
        # head: two rows of spikelets along a (nodding) rachis
        hx, hy, hz = top
        length = 0.1
        for j in range(12):
            t = j / 11
            bend = nod * t * t
            cx = hx + math.cos(a) * bend * length
            cy = hy + math.sin(a) * bend * length
            cz = hz + length * t * (1 - nod * 0.6 * t)
            side = 1 if j % 2 else -1
            sx, sy = -math.sin(a) * side * 0.006, math.cos(a) * side * 0.006
            blob_at(B, head_color, (cx + sx, cy + sy, cz), 0.0085, scale=(1, 1, 1.6), subdiv=0)
            if awns and j % 2 == 0:
                tip = (cx + sx * 2 + math.cos(a) * nod * 0.05, cy + sy * 2 + math.sin(a) * nod * 0.05, cz + 0.09 * (1 - nod * 0.5))
                tube(B, head_color, [(cx + sx, cy + sy, cz), tip], [0.0012, 0.0003], 3)
    return B.finish(name)


def bean_detailed():
    B = Builder()
    stems = []
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(-0.3, 0.3)
        pts = curve((0, 0, 0.02), a, 0.22, rise=1.8, droop=1.0, n=4)
        tube(B, "stalk", pts, [0.008, 0.007, 0.006, 0.005, 0.004], 5)
        stems.append((a, pts))
    # trifoliate leaves: three ovate leaflets on a petiole
    oval = lambda t: math.sin(math.pi * min(1.0, 0.05 + t)) ** 0.8
    for a, pts in stems:
        for j, p in enumerate(pts[2:]):
            ya = a + (j - 1) * 0.9 + rng.uniform(-0.3, 0.3)
            pet_end = (p[0] + math.cos(ya) * 0.06, p[1] + math.sin(ya) * 0.06, p[2] + 0.05)
            tube(B, "stalk", [p, pet_end], [0.003, 0.0025], 4)
            for leaflet in (-1, 0, 1):
                ribbon(B, "blade_dark", pet_end, ya + leaflet * 1.0, 0.11, 0.075, rise=0.6, droop=1.0, segs=6,
                       crease=0.12, width_profile=oval, tilt=rng.uniform(-0.3, 0.3))
    # hanging pods
    for k in range(7):
        a = rng.uniform(0, math.tau)
        z = rng.uniform(0.12, 0.25)
        start = (math.cos(a) * 0.08, math.sin(a) * 0.08, z)
        pts = [(start[0] + math.cos(a) * 0.02 * j, start[1] + math.sin(a) * 0.02 * j, z - 0.025 * j) for j in range(6)]
        tube(B, "pod", pts, [0.004, 0.007, 0.008, 0.008, 0.006, 0.001], 6)
    return B.finish("frijol")


def chickpea_detailed():
    B = Builder()
    oval = lambda t: math.sin(math.pi * min(1.0, 0.05 + t)) ** 0.7
    for k in range(6):
        a = k * math.tau / 6 + rng.uniform(-0.3, 0.3)
        pts = curve((0, 0, 0.01), a, 0.2, rise=2.0, droop=1.2, n=4)
        tube(B, "stalk", pts, [0.006, 0.005, 0.004, 0.0035, 0.003], 4)
        # pinnate leaves: small leaflets along short branches
        for p in pts[1:]:
            ya = a + rng.uniform(-0.8, 0.8)
            for m in range(5):
                q = (p[0] + math.cos(ya) * 0.012 * m, p[1] + math.sin(ya) * 0.012 * m, p[2] + 0.004 * m)
                for sgn in (-1, 1):
                    ribbon(B, "chickpea", q, ya + sgn * 1.2, 0.028, 0.016, rise=0.5, droop=0.6, segs=3, crease=0.1,
                           width_profile=oval)
    for k in range(9):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.05, 0.13)
        blob_at(B, "pod", (math.cos(a) * rr, math.sin(a) * rr, rng.uniform(0.12, 0.28)), 0.014, scale=(1, 0.8, 1.2), subdiv=1)
    return B.finish("garbanzo")


def broccoli_detailed():
    B = Builder()
    tube(B, "stalk", [(0, 0, 0), (0, 0, 0.25), (0, 0, 0.42)], [0.045, 0.04, 0.035], 10)
    # large blue-green leaves with wavy edges, arching out
    for k in range(9):
        a = k * 2.4
        z = 0.08 + k * 0.03
        ribbon(B, "blade_blue", (math.cos(a) * 0.03, math.sin(a) * 0.03, z), a, 0.42 - k * 0.015, 0.16,
               rise=2.2, droop=2.0, segs=10, crease=0.18, wave=0.035, tilt=rng.uniform(-0.2, 0.2))
    # the head: a dome of florets
    for k in range(48):
        u = rng.random()
        a = rng.uniform(0, math.tau)
        rr = 0.13 * math.sqrt(u)
        z = 0.44 + 0.07 * (1 - u)
        blob_at(B, "broccoli", (math.cos(a) * rr, math.sin(a) * rr, z), 0.03 + rng.uniform(0, 0.012), subdiv=1)
    return B.finish("brocoli")


def mesquite_detailed():
    B = Builder()
    trunk = [(0, 0, 0), (0.08, 0.02, 0.6), (0.05, 0.08, 1.2), (0.18, 0.05, 1.7)]
    tube(B, "bark", trunk, [0.2, 0.15, 0.13, 0.11], 9)
    ends = []
    for k in range(5):
        a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
        pts = curve(trunk[-1], a, 1.4 + rng.uniform(-0.2, 0.3), rise=0.9, droop=0.4, n=4)
        tube(B, "bark", pts, [0.09, 0.07, 0.05, 0.035, 0.02], 6)
        ends.append(pts)
    # feathery canopy: many small flattened clumps around the branch ends
    for pts in ends:
        for p in pts[2:]:
            for m in range(4):
                c = (p[0] + rng.uniform(-0.45, 0.45), p[1] + rng.uniform(-0.45, 0.45), p[2] + rng.uniform(-0.1, 0.35))
                blob_at(B, "canopy", c, rng.uniform(0.32, 0.5), scale=(1, 1, 0.45), subdiv=1)
    return B.finish("arbol")


def farmhouse_detailed():
    w, d, h = 7.0, 5.0, 3.0
    parts = [box("wall", (w, d, h), (0, 0, h / 2))]
    side = d * 0.82
    parts.append(box("roof", (w * 1.12, side, side), (0, 0, h), rot=(math.pi / 4, 0, 0)))  # gabled roof with eaves
    parts.append(box("wood", (w * 1.14, 0.18, 0.18), (0, 0, h + side * 0.7)))  # ridge beam
    parts.append(box("wall", (w * 1.02, d * 1.02, 0.3), (0, 0, 0.15)))  # plinth
    # door with frame and lintel
    parts.append(box("wood", (1.0, 0.08, 2.0), (0.8, -d / 2 - 0.03, 1.0)))
    parts.append(box("wall", (1.25, 0.12, 0.15), (0.8, -d / 2 - 0.05, 2.08)))
    # two windows with frames, dark glass and sills
    for x in (-2.0, 2.4):
        parts.append(box("wood", (0.95, 0.08, 0.9), (x, -d / 2 - 0.03, 1.75)))
        parts.append(box("glass", (0.7, 0.1, 0.65), (x, -d / 2 - 0.05, 1.75)))
        parts.append(box("wall", (1.05, 0.25, 0.08), (x, -d / 2 - 0.1, 1.27)))
    # porch: roof on two posts
    parts.append(box("roof", (3.2, 1.6, 0.12), (0.8, -d / 2 - 0.8, 2.4), rot=(-0.18, 0, 0)))
    for x in (-0.6, 2.2):
        parts.append(box("wood", (0.15, 0.15, 2.3), (x, -d / 2 - 1.45, 1.15)))
    # chimney
    parts.append(box("wall", (0.5, 0.5, 1.4), (-2.4, 0.8, h + 1.1)))
    return join("casa", parts)


# --- the 15 crops added later (same helpers, same level of detail) ---------------------------

OVAL = lambda t: math.sin(math.pi * min(1.0, 0.05 + t)) ** 0.75
SWORD = lambda t: (1 - t) ** 0.6 * 0.9 + 0.05


def leaflets(B, color, at, yaw, pairs, length, width, spacing, terminal=True, wave=0.0):
    """Compound leaf: `pairs` pairs of leaflets along a midrib, plus an optional terminal one."""
    for m in range(pairs):
        q = (at[0] + math.cos(yaw) * spacing * m, at[1] + math.sin(yaw) * spacing * m, at[2] + 0.004 * m)
        for sgn in (-1, 1):
            ribbon(B, color, q, yaw + sgn * 1.15, length, width, rise=0.5, droop=0.8, segs=4, crease=0.12,
                   width_profile=OVAL, wave=wave)
    if terminal:
        q = (at[0] + math.cos(yaw) * spacing * pairs, at[1] + math.sin(yaw) * spacing * pairs, at[2] + 0.004 * pairs)
        ribbon(B, color, q, yaw, length * 1.15, width, rise=0.4, droop=0.8, segs=4, crease=0.12, width_profile=OVAL, wave=wave)


def oat_detailed():
    B = Builder()
    for c in range(8):
        a = c * math.tau / 8 + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.05, 0.15)
        h = rng.uniform(0.9, 1.05)
        top = (math.cos(a) * h * lean, math.sin(a) * h * lean, h)
        tube(B, "stalk", [(0, 0, 0)] + [(top[0] * t, top[1] * t, top[2] * t) for t in (0.4, 0.75, 1.0)], [0.006, 0.005, 0.004, 0.003], 5)
        for k in range(2):
            z = 0.15 + k * 0.22
            ribbon(B, "blade", (top[0] * z / h, top[1] * z / h, z), a + (k - 0.5) * 2.0, 0.3, 0.02, rise=1.5, droop=1.9, segs=7)
        # open panicle: spikelets hanging from thin drooping branches
        for j in range(9):
            z0 = h - 0.02 + j * 0.022
            ba = a + j * 2.4
            pts = curve((top[0], top[1], z0), ba, 0.07 + rng.uniform(0, 0.03), rise=0.6, droop=2.2, n=3)
            tube(B, "oat", pts, [0.0012, 0.001, 0.001, 0.0008], 3)
            blob_at(B, "oat", (pts[-1][0], pts[-1][1], pts[-1][2] - 0.012), 0.007, scale=(1, 1, 2.2), subdiv=0)
        tube(B, "stalk", [top, (top[0], top[1], h + 0.2)], [0.003, 0.001], 4)
    return B.finish("avena")


def rice_detailed():
    B = Builder()
    for c in range(14):
        a = c * math.tau / 14 + rng.uniform(-0.3, 0.3)
        lean = rng.uniform(0.06, 0.22)
        h = rng.uniform(0.75, 0.95)
        top = (math.cos(a) * h * lean, math.sin(a) * h * lean, h)
        tube(B, "stalk", [(0, 0, 0)] + [(top[0] * t, top[1] * t, top[2] * t) for t in (0.5, 1.0)], [0.005, 0.004, 0.003], 4)
        ribbon(B, "blade", (top[0] * 0.3, top[1] * 0.3, h * 0.3), a + rng.uniform(-1, 1), 0.4, 0.014, rise=2.2, droop=1.6, segs=7)
        if c % 2 == 0:  # a heavy, drooping panicle full of grain
            pts = curve(top, a, 0.2, rise=0.9, droop=2.4, n=6)
            tube(B, "rice", pts, [0.0025, 0.0022, 0.002, 0.0018, 0.0015, 0.001, 0.0005], 3)
            for p in pts[1:]:
                for _ in range(2):
                    blob_at(B, "rice", (p[0] + rng.uniform(-0.008, 0.008), p[1] + rng.uniform(-0.008, 0.008), p[2] - 0.006), 0.006,
                            scale=(1, 1, 1.8), subdiv=0)
    return B.finish("arroz")


def amaranth_detailed():
    B = Builder()
    H = 1.5
    tube(B, "stalk", [(0, 0, 0), (0.01, 0, 0.5), (0, 0.01, 1.0), (0, 0, H)], [0.028, 0.024, 0.02, 0.014], 8)
    for i in range(13):
        yaw = i * 2.4
        z = 0.2 + i * 0.085
        pet = (math.cos(yaw) * 0.07, math.sin(yaw) * 0.07, z + 0.04)
        tube(B, "stalk", [(0, 0, z), pet], [0.004, 0.003], 4)
        ribbon(B, "blade", pet, yaw, 0.2 - i * 0.006, 0.1, rise=0.5, droop=1.1, segs=7, crease=0.15, width_profile=OVAL, wave=0.012)
    # the plume: a dense magenta spike with side plumes that hang
    for k in range(46):
        u = k / 45
        rr = 0.055 * (1 - u) ** 0.7 * math.sqrt(rng.random())
        a = rng.uniform(0, math.tau)
        blob_at(B, "amaranth", (math.cos(a) * rr, math.sin(a) * rr, H - 0.05 + u * 0.5), 0.02 + rng.uniform(0, 0.008), scale=(1, 1, 1.5), subdiv=0)
    for k in range(6):
        pts = curve((0, 0, H - 0.05 + k * 0.03), k * 1.9, 0.22, rise=0.8, droop=2.0, n=5)
        for p in pts[1:]:
            blob_at(B, "amaranth", p, 0.017, scale=(1, 1, 1.4), subdiv=0)
    return B.finish("amaranto")


def sunflower_detailed():
    B = Builder()
    H = 1.75
    tube(B, "stalk", [(0, 0, 0), (0, 0.01, 0.7), (0.01, 0, 1.3), (0.03, 0, H)], [0.032, 0.028, 0.022, 0.018], 8)
    for i in range(12):
        yaw = i * 2.4
        z = 0.25 + i * 0.11
        pet = (math.cos(yaw) * 0.1, math.sin(yaw) * 0.1, z + 0.05)
        tube(B, "stalk", [(0, 0, z), pet], [0.005, 0.004], 4)
        ribbon(B, "blade", pet, yaw, 0.26 - i * 0.008, 0.2, rise=0.4, droop=1.2, segs=8, crease=0.14, width_profile=OVAL, wave=0.015)
    body = B.finish("girasol_cuerpo")
    # the head is built facing up, then tilted to face the sun
    F = Builder()
    blob_at(F, "disc", (0, 0, 0), 0.13, scale=(1, 1, 0.22), subdiv=2)
    blob_at(F, "blade", (0, 0, -0.03), 0.15, scale=(1, 1, 0.25), subdiv=1)  # green back
    for k in range(26):
        a = k * math.tau / 26
        ribbon(F, "petal_yellow", (math.cos(a) * 0.11, math.sin(a) * 0.11, 0.0), a, 0.13, 0.04, rise=0.35, droop=0.5, segs=4, crease=0.2,
               width_profile=OVAL)
    head = F.finish("girasol_cabeza")
    head.rotation_euler = (0, math.radians(62), 0)
    head.location = (0.07, 0, H + 0.02)
    return join("girasol", [body, head], smooth=True)


def peanut_detailed():
    B = Builder()
    for k in range(7):
        a = k * math.tau / 7 + rng.uniform(-0.3, 0.3)
        pts = curve((0, 0, 0.02), a, 0.24, rise=1.2, droop=1.1, n=4)
        tube(B, "stalk", pts, [0.005, 0.0045, 0.004, 0.003, 0.002], 4)
        for p in pts[1:]:
            ya = a + rng.uniform(-1, 1)
            pet = (p[0] + math.cos(ya) * 0.04, p[1] + math.sin(ya) * 0.04, p[2] + 0.03)
            tube(B, "stalk", [p, pet], [0.002, 0.0015], 3)
            leaflets(B, "blade_dark", pet, ya, 2, 0.04, 0.026, 0.022, terminal=False)
        blob_at(B, "flower_yellow", (pts[2][0], pts[2][1], pts[2][2] + 0.015), 0.008, subdiv=0)
    # pods at ground level, where the pegs go into the soil
    for k in range(6):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.05, 0.12)
        c = (math.cos(a) * rr, math.sin(a) * rr, 0.012)
        tube(B, "stalk", [(c[0] * 0.5, c[1] * 0.5, 0.06), c], [0.0015, 0.0015], 3)
        blob_at(B, "peanut", c, 0.014, scale=(1, 1, 0.9), subdiv=1, yaw=a)
        blob_at(B, "peanut", (c[0] + math.cos(a) * 0.02, c[1] + math.sin(a) * 0.02, 0.012), 0.013, subdiv=1)
    return B.finish("cacahuate")


def squash_detailed():
    B = Builder()
    for k in range(4):
        a = k * math.tau / 4 + rng.uniform(-0.4, 0.4)
        pts = curve((0, 0, 0.03), a, 1.0, rise=0.12, droop=0.1, n=7)
        pts = [(p[0] + math.sin(i * 1.3) * 0.05, p[1] + math.cos(i * 1.1) * 0.05, max(0.02, p[2])) for i, p in enumerate(pts)]
        tube(B, "stalk", pts, [0.012, 0.011, 0.01, 0.009, 0.008, 0.007, 0.006, 0.004], 6)
        for i, p in enumerate(pts[1:]):
            ya = a + (1 if i % 2 else -1) * 1.2 + rng.uniform(-0.3, 0.3)
            top = (p[0] + math.cos(ya) * 0.05, p[1] + math.sin(ya) * 0.05, 0.2 + rng.uniform(-0.04, 0.05))
            tube(B, "stalk", [p, top], [0.006, 0.005], 5)
            ribbon(B, "blade_dark", top, ya, 0.2, 0.24, rise=0.3, droop=0.9, segs=7, crease=0.16, width_profile=OVAL, wave=0.03)
    for c, r, col in (((0.35, 0.25, 0.1), 0.14, "pumpkin"), ((-0.4, -0.2, 0.09), 0.12, "pumpkin"), ((0.1, -0.5, 0.06), 0.08, "chile_green")):
        blob_at(B, col, c, r, scale=(1, 1, 0.72), subdiv=2)
        tube(B, "stalk", [(c[0], c[1], c[2] + r * 0.7), (c[0] + 0.02, c[1], c[2] + r * 0.7 + 0.04)], [0.012, 0.008], 5)
    for c in ((0.2, 0.55, 0.16), (-0.55, 0.3, 0.14)):  # big yellow flowers
        for k in range(5):
            ribbon(B, "petal_yellow", c, k * math.tau / 5, 0.07, 0.05, rise=1.6, droop=1.2, segs=4, crease=0.2, width_profile=OVAL)
    return B.finish("calabaza")


def potato_detailed():
    B = Builder()
    for k in range(5):
        a = k * math.tau / 5 + rng.uniform(-0.3, 0.3)
        pts = curve((0, 0, 0.02), a, 0.5, rise=2.2, droop=0.9, n=5)
        tube(B, "stalk", pts, [0.009, 0.008, 0.007, 0.006, 0.005, 0.003], 5)
        for i, p in enumerate(pts[1:]):
            ya = a + (1 if i % 2 else -1) * 1.0 + rng.uniform(-0.3, 0.3)
            leaflets(B, "blade_dark", p, ya, 2, 0.065, 0.042, 0.04, wave=0.01)
        tip = pts[-1]
        for f in range(4):
            fa = f * math.tau / 4
            blob_at(B, "flower_white", (tip[0] + math.cos(fa) * 0.02, tip[1] + math.sin(fa) * 0.02, tip[2] + 0.03), 0.012, scale=(1, 1, 0.5), subdiv=0)
        blob_at(B, "flower_yellow", (tip[0], tip[1], tip[2] + 0.035), 0.006, subdiv=0)
    for k in range(5):  # tubers, half out of the hill
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.04, 0.12)
        blob_at(B, "tuber", (math.cos(a) * rr, math.sin(a) * rr, 0.012), 0.04, scale=(1.3, 0.9, 0.8), subdiv=1, yaw=a)
    return B.finish("papa")


def onion_detailed():
    B = Builder()
    blob_at(B, "bulb", (0, 0, 0.04), 0.05, scale=(1, 1, 0.95), subdiv=2)
    tube(B, "bulb", [(0, 0, 0.07), (0, 0, 0.13)], [0.022, 0.014], 7)  # neck
    for k in range(9):  # hollow tubular leaves
        a = k * math.tau / 9 + rng.uniform(-0.2, 0.2)
        pts = curve((0, 0, 0.11), a, 0.2 + rng.uniform(0, 0.06), rise=4.0 + rng.uniform(0, 1.5), droop=1.5 + rng.uniform(0, 1.5), n=6)
        tube(B, "blade_blue", pts, [0.009, 0.0085, 0.008, 0.007, 0.0055, 0.004, 0.0008], 6)
    for k in range(8):  # roots
        a = k * math.tau / 8
        tube(B, "silk", [(0, 0, 0.01), (math.cos(a) * 0.04, math.sin(a) * 0.04, -0.005)], [0.0015, 0.0006], 3)
    return B.finish("cebolla")


def tomato_detailed():
    B = Builder()
    tube(B, "wood", [(0.04, 0, 0), (0.04, 0, 1.35)], [0.012, 0.011], 5)  # stake
    stem = [(0, 0, 0), (0.02, 0.02, 0.35), (-0.01, 0.01, 0.7), (0.01, -0.01, 1.0), (0, 0, 1.2)]
    tube(B, "stalk", stem, [0.012, 0.011, 0.009, 0.007, 0.005], 6)
    for i in range(9):
        t = (i + 1) / 10
        z = 0.15 + t * 1.0
        ya = i * 2.4
        pet = (math.cos(ya) * 0.07, math.sin(ya) * 0.07, z + 0.03)
        tube(B, "stalk", [(0, 0, z), pet], [0.004, 0.003], 4)
        leaflets(B, "blade_dark", pet, ya, 2, 0.085, 0.05, 0.05, wave=0.03)
    for z, ya in ((0.4, 0.5), (0.7, 2.8), (0.95, 4.6)):  # trusses of fruit
        hub = (math.cos(ya) * 0.08, math.sin(ya) * 0.08, z - 0.03)
        tube(B, "stalk", [(0, 0, z), hub], [0.003, 0.0025], 4)
        for k in range(4):
            c = (hub[0] + math.cos(ya + k * 1.6) * 0.035, hub[1] + math.sin(ya + k * 1.6) * 0.035, hub[2] - 0.03 - k * 0.012)
            blob_at(B, "tomato" if (k or z < 0.9) else "chile_green", c, 0.03 - k * 0.002, scale=(1, 1, 0.9), subdiv=1)
    return B.finish("jitomate")


def chile_detailed():
    B = Builder()
    tube(B, "stalk", [(0, 0, 0), (0, 0, 0.25)], [0.011, 0.009], 6)
    tips = []
    for k in range(4):
        a = k * math.tau / 4 + 0.4
        pts = curve((0, 0, 0.25), a, 0.3, rise=1.6, droop=0.6, n=4)
        tube(B, "stalk", pts, [0.007, 0.006, 0.005, 0.004, 0.003], 5)
        for i, p in enumerate(pts[1:]):
            for sgn in (-1, 1):
                ribbon(B, "blade_dark", p, a + sgn * 1.2 + rng.uniform(-0.3, 0.3), 0.085, 0.036, rise=0.5, droop=1.0, segs=5,
                       crease=0.14, width_profile=OVAL)
            tips.append(p)
    for i, p in enumerate(tips[::2]):  # chiles hang down, some already red
        a = rng.uniform(0, math.tau)
        pts = [(p[0] + math.cos(a) * 0.006 * j, p[1] + math.sin(a) * 0.006 * j, p[2] - 0.022 * j) for j in range(6)]
        tube(B, "chile_red" if i % 3 else "chile_green", pts, [0.004, 0.009, 0.0085, 0.007, 0.004, 0.0008], 6)
    return B.finish("chile")


def strawberry_detailed():
    B = Builder()
    for k in range(10):  # rosette of trifoliate leaves
        a = k * math.tau / 10 + rng.uniform(-0.2, 0.2)
        pts = curve((0, 0, 0.02), a, 0.1 + rng.uniform(0, 0.04), rise=1.8, droop=1.3, n=3)
        tube(B, "stalk", pts, [0.003, 0.0028, 0.0025, 0.002], 4)
        for lf in (-1, 0, 1):
            ribbon(B, "blade_dark", pts[-1], a + lf * 1.1, 0.055, 0.052, rise=0.5, droop=0.8, segs=5, crease=0.14, width_profile=OVAL, wave=0.025)
    for k in range(7):  # berries rest near the ground
        a = k * 0.9 + 0.3
        rr = 0.1 + rng.uniform(0, 0.04)
        c = (math.cos(a) * rr, math.sin(a) * rr, 0.03)
        tube(B, "stalk", [(0, 0, 0.05), (c[0] * 0.6, c[1] * 0.6, 0.08), (c[0], c[1], 0.05)], [0.002, 0.002, 0.0015], 3)
        blob_at(B, "berry", c, 0.017, scale=(1, 1, 1.25), subdiv=1)
        blob_at(B, "blade_dark", (c[0], c[1], 0.05), 0.011, scale=(1, 1, 0.3), subdiv=0)  # calyx
    for k in range(4):  # flowers
        a = k * 1.7 + 1.0
        c = (math.cos(a) * 0.07, math.sin(a) * 0.07, 0.11)
        tube(B, "stalk", [(0, 0, 0.04), c], [0.002, 0.0015], 3)
        blob_at(B, "flower_white", c, 0.014, scale=(1, 1, 0.35), subdiv=0)
        blob_at(B, "flower_yellow", (c[0], c[1], c[2] + 0.004), 0.006, subdiv=0)
    return B.finish("fresa")


def alfalfa_detailed():
    B = Builder()
    for k in range(11):
        a = k * math.tau / 11 + rng.uniform(-0.3, 0.3)
        pts = curve((0, 0, 0.01), a, 0.12 + rng.uniform(0, 0.08), rise=4.5, droop=1.0, n=5)
        tube(B, "stalk", pts, [0.004, 0.0038, 0.0035, 0.003, 0.0025, 0.002], 4)
        for i, p in enumerate(pts[1:]):
            ya = a + i * 2.1
            for lf in (-1, 0, 1):
                ribbon(B, "blade", p, ya + lf * 0.9, 0.032, 0.016, rise=0.8, droop=0.8, segs=3, crease=0.1, width_profile=OVAL)
        tip = pts[-1]
        for f in range(5):  # purple flower cluster
            blob_at(B, "flower_purple", (tip[0] + rng.uniform(-0.01, 0.01), tip[1] + rng.uniform(-0.01, 0.01), tip[2] + 0.008 * f), 0.008, subdiv=0)
    return B.finish("alfalfa")


def agave_detailed():
    B = Builder()
    blob_at(B, "agave", (0, 0, 0.12), 0.16, scale=(1, 1, 0.9), subdiv=1)  # the heart (piña)
    for k in range(26):
        ring = k / 25  # 0 = innermost and upright, 1 = outermost and spreading
        a = k * 2.4
        ribbon(B, "agave", (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.14 + (1 - ring) * 0.12), a,
               0.55 + ring * 0.35, 0.14, rise=3.2 - ring * 2.6, droop=0.5 + ring * 0.5, segs=6, crease=0.38, width_profile=SWORD)
    return B.finish("agave")


def nopal_detailed():
    B = Builder()
    pads = [((0, 0, 0.26), 0.2, 0.3), ((0.13, 0.05, 0.66), 0.17, 1.1), ((-0.14, -0.03, 0.62), 0.15, 2.4),
            ((0.2, 0.12, 1.02), 0.14, 0.2), ((0.03, 0.02, 1.05), 0.13, 1.9), ((-0.22, -0.08, 0.95), 0.13, 2.9),
            ((0.26, 0.15, 1.33), 0.11, 1.3)]
    for c, r, yaw in pads:
        blob_at(B, "nopal", c, r, scale=(1, 0.17, 1.4), subdiv=2, yaw=yaw)
    for c, r, yaw in pads[3:]:  # tunas along the top edge of the upper pads
        for k in (-1, 0, 1):
            off = k * r * 0.5
            blob_at(B, "tuna", (c[0] + math.cos(yaw) * off, c[1] + math.sin(yaw) * off, c[2] + r * 1.35 - abs(k) * 0.03), 0.032,
                    scale=(1, 1, 1.3), subdiv=1)
    return B.finish("nopal")


def avocado_detailed():
    B = Builder()
    trunk = [(0, 0, 0), (0.05, 0.03, 0.8), (0.0, 0.06, 1.6), (0.06, 0.0, 2.2)]
    tube(B, "bark", trunk, [0.17, 0.14, 0.12, 0.1], 9)
    ends = []
    for k in range(6):
        a = k * math.tau / 6 + rng.uniform(-0.3, 0.3)
        pts = curve(trunk[-1], a, 1.3 + rng.uniform(-0.2, 0.3), rise=1.3, droop=0.5, n=4)
        tube(B, "bark", pts, [0.08, 0.06, 0.045, 0.03, 0.02], 6)
        ends.append(pts)
    for pts in ends:  # dense, dark, rounded canopy
        for p in pts[1:]:
            for _ in range(3):
                c = (p[0] + rng.uniform(-0.5, 0.5), p[1] + rng.uniform(-0.5, 0.5), p[2] + rng.uniform(0.0, 0.6))
                blob_at(B, "leaf_dark", c, rng.uniform(0.4, 0.6), scale=(1, 1, 0.75), subdiv=1)
    for k in range(10):  # avocados hang under the canopy
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(0.5, 1.3)
        c = (math.cos(a) * rr, math.sin(a) * rr, rng.uniform(1.9, 2.4))
        tube(B, "stalk", [(c[0], c[1], c[2] + 0.22), (c[0], c[1], c[2] + 0.1)], [0.006, 0.005], 3)
        blob_at(B, "avocado", c, 0.07, scale=(1, 1, 1.45), subdiv=1)
    return B.finish("aguacate")


def lowpoly_copy(obj, target=240):
    """A light copy for the far view of the map: the detailed model, decimated."""
    lp = obj.copy()
    lp.data = obj.data.copy()
    lp.name = lp.data.name = obj.name + "_lp"
    bpy.context.collection.objects.link(lp)
    tris = sum(len(p.vertices) - 2 for p in lp.data.polygons)
    mod = lp.modifiers.new("decimar", "DECIMATE")
    mod.ratio = min(1.0, target / max(tris, 1))
    bpy.ops.object.select_all(action="DESELECT")
    lp.select_set(True)
    bpy.context.view_layer.objects.active = lp
    bpy.ops.object.modifier_apply(modifier="decimar")
    return lp


def export_glb(objects, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    options = dict(filepath=os.path.join(OUT_DIR, filename), export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
    try:  # JPEG keeps the textures small (the option names changed across Blender versions)
        bpy.ops.export_scene.gltf(**options, export_image_format="JPEG", export_jpeg_quality=82)
    except TypeError:
        bpy.ops.export_scene.gltf(**options, export_image_format="JPEG")


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    os.makedirs(OUT_DIR, exist_ok=True)

    # The first 7 crops keep their hand-made low-poly versions ("<id>_lp").
    handmade_lp = [
        tall_grass("maiz_lp", 2.0, 7, maize_head),
        tall_grass("sorgo_lp", 1.4, 6, sorghum_head),
        small_grain("trigo_lp", "wheat", 0.85, 7, nod=0.15),
        small_grain("cebada_lp", "barley", 0.75, 7, nod=0.9),
        bush("frijol_lp", "leaf_dark", 0.28, 0.5, bean_pods),
        bush("garbanzo_lp", "chickpea", 0.22, 0.45, chickpea_pods),
        broccoli(),
    ]
    handmade_lp[-1].name = handmade_lp[-1].data.name = "brocoli_lp"
    lowpoly = {obj.name[:-3]: obj for obj in handmade_lp}

    detailed = [
        maize_detailed(),
        sorghum_detailed(),
        small_grain_detailed("trigo", "wheat", 0.85, 9, awns=False, nod=0.12),
        small_grain_detailed("cebada", "barley", 0.75, 9, awns=True, nod=0.7),
        bean_detailed(),
        chickpea_detailed(),
        broccoli_detailed(),
        oat_detailed(),
        amaranth_detailed(),
        sunflower_detailed(),
        peanut_detailed(),
        squash_detailed(),
        potato_detailed(),
        onion_detailed(),
        tomato_detailed(),
        chile_detailed(),
        strawberry_detailed(),
        rice_detailed(),
        alfalfa_detailed(),
        agave_detailed(),
        nopal_detailed(),
        avocado_detailed(),
    ]
    # The 15 newer crops get their low-poly version by decimating the detailed one.
    for obj in detailed:
        if obj.name not in lowpoly:
            lowpoly[obj.name] = lowpoly_copy(obj)
    scenery = [farmhouse_detailed(), mesquite_detailed()]

    # Maize keeps 1024 px so the veins along each blade stay visible; the rest use 512.
    for obj in detailed:
        bake_texture(obj, 1024 if obj.name == "maiz" else TEXTURE_SIZE)
    for obj in lowpoly.values():
        bake_texture(obj, 256)
    for obj in scenery:
        bake_texture(obj, TEXTURE_SIZE)

    for obj in detailed:
        export_glb([obj, lowpoly[obj.name]], f"{obj.name}.glb")
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        lp = sum(len(p.vertices) - 2 for p in lowpoly[obj.name].data.polygons)
        size = os.path.getsize(os.path.join(OUT_DIR, f"{obj.name}.glb")) // 1024
        print(f"  {obj.name:<10} {tris:>6} triangles, low-poly {lp:>4}, {size:>4} KB")
    export_glb(scenery, "escenario.glb")
    print(f"OK {OUT_DIR}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # make the failure visible in --background mode
        print(f"FAIL {exc}", file=sys.stderr)
        raise
