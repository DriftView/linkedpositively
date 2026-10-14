import {
  AlwaysStencilFunc,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  EqualStencilFunc,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  type MeshPhysicalMaterialParameters,
  NeutralToneMapping,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  QuadraticBezierCurve3,
  RepeatWrapping,
  ReplaceStencilOp,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { AiCoachAppearance } from "@/server/db/schema/ai";
import { coachEyeColor, HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from "../coach-design";
import type { CoachPose, CoachState } from "./coach-motion";

/**
 * The AI Coach in 3D: the same character as the SVG avatar, modeled in code
 * from the member's design (every hair style, facial hair, glasses, earrings
 * and outfit), so there are no model files to download or license. It's lit
 * like a studio portrait (soft key, gentle fill, rim highlights and a dim
 * room for reflections), and skin, hair and fabric each have their own
 * surface, with slight variation, so they read as rounded forms rather than
 * plastic. Positions come from the SVG drawing:
 * one SVG unit is S scene units, the head is centered on SVG (100, 92), and
 * the scene's +y is up, +z toward the viewer.
 *
 * Loaded on demand (three.js is only fetched where a 3D coach is shown).
 */

const S = 0.02;
/** Head ellipsoid radii: SVG rx 44, ry 50. */
const HEAD = { a: 0.88, b: 1, c: 0.86 };
/** Where the head turns: the neck (SVG y 140). */
const NECK_Y = (92 - 140) * S;
const MOUTH_Y = (92 - 118) * S;
/** Where the upper lid's edge rests (radians down from the top of the eyeball), and how far it rolls to close. */
const LID_OPEN = 0.85;
const LID_CLOSE = 1.4;

const sx = (x: number) => (x - 100) * S;
const sy = (y: number) => (92 - y) * S;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The jaw narrows below the eyes. */
const taper = (y: number) => (y < 0 ? 1 - 0.2 * y * y : 1);

const bump = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);

/**
 * The face's modeling on top of the ellipsoid (head units, toward the viewer):
 * cheekbones, a brow ridge and the chin come forward; the eye sockets and
 * temples sit back. (Nothing bulges at the mouth, whose opening is flat.)
 */
function relief(x: number, y: number) {
  const ax = Math.abs(x);
  return (
    0.035 * bump(ax, y, 0.48, -0.2, 0.2, 0.17) +
    0.022 * bump(x, y, 0, 0.27, 0.45, 0.09) +
    0.045 * bump(x, y, 0, -0.84, 0.2, 0.12) -
    0.04 * bump(ax, y, 0.34, 0.03, 0.14, 0.1) -
    0.03 * bump(ax, y, 0.72, 0.3, 0.14, 0.25)
  );
}

/** How much of the relief applies at a direction on the unit sphere (the front only). */
const front = (uz: number) => smoothstep(0.15, 0.65, uz);

/** Depth of the face's surface at (x, y), for features that sit on it. */
function surfaceZ(x: number, y: number, scale = 1) {
  const q = 1 - (x / (HEAD.a * scale * taper(y))) ** 2 - (y / (HEAD.b * scale)) ** 2;
  const z = HEAD.c * scale * Math.sqrt(Math.max(0, q));
  return z + relief(x, y) * front(z / (HEAD.c * scale));
}

/** Moves a flat geometry (built around (x0, y0)) onto the face. */
function conform<T extends BufferGeometry>(geometry: T, x0: number, y0: number, lift: number): T {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, pos.getZ(i) + surfaceZ(x0 + pos.getX(i), y0 + pos.getY(i)) + lift);
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where a shell ends: positive inside the part that's kept, negative outside, ~distance in head units. */
type Edge = (x: number, y: number, z: number) => number;

/**
 * An ellipsoid shell: the head, hair, a hijab or a beard. Where it ends is
 * given by an edge, in head space:
 * - `cut` drops what's outside (hard edge, for shapes away from the skin);
 * - `tuck` pulls what's outside under the skin, so the shell meets it along a
 *   smooth line (hairlines, the hijab's opening, a beard);
 * - `fade` makes what's outside transparent, with a soft edge (stubble).
 * `ripple` adds texture (waves, rows) from the unit direction, `taper`
 * follows the jaw and the face's relief, and `shade` darkens it per vertex
 * (soft occlusion: hair darker underneath and toward the nape).
 */
function shell({
  r,
  center = [0, 0, 0],
  cut,
  tuck,
  fade,
  ripple,
  taper: tapered = false,
  shade,
  segments = [128, 96],
}: {
  r: [number, number, number];
  center?: [number, number, number];
  cut?: Edge;
  tuck?: Edge;
  fade?: Edge;
  ripple?: (x: number, y: number, z: number) => number;
  taper?: boolean;
  shade?: (x: number, y: number, z: number) => number | [number, number, number];
  segments?: [number, number];
}) {
  const geometry = new SphereGeometry(1, segments[0], segments[1]);
  geometry.rotateY(-Math.PI / 2); // seam at the back
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = fade || shade ? new Float32Array(pos.count * 4) : null;
  const v = new Vector3();
  const n = new Vector3();
  const e = 0.01;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (ripple ? ripple(v.x, v.y, v.z) : 0);
    let y = v.y * r[1] * k + center[1];
    let x = v.x * r[0] * k * (tapered ? taper(y) : 1) + center[0];
    let z = v.z * r[2] * k + center[2];
    n.set(v.x / r[0], v.y / r[1], v.z / r[2]).normalize();
    if (tapered) {
      // The relief, and its slope tilting the normal.
      const w = front(v.z);
      z += relief(x, y) * w;
      const gx = (relief(x + e, y) - relief(x - e, y)) / (2 * e);
      const gy = (relief(x, y + e) - relief(x, y - e)) / (2 * e);
      n.set(n.x - n.z * gx * w, n.y - n.z * gy * w, n.z).normalize();
    }
    if (tuck) {
      // Blend toward a point just under the skin across a narrow band.
      const t = smoothstep(-0.04, 0.04, tuck(x, y, z));
      const ty = v.y * HEAD.b * 0.92;
      x = v.x * HEAD.a * 0.92 * taper(ty) + (x - v.x * HEAD.a * 0.92 * taper(ty)) * t;
      y = ty + (y - ty) * t;
      z = v.z * HEAD.c * 0.92 + (z - v.z * HEAD.c * 0.92) * t;
    }
    pos.setXYZ(i, x, y, z);
    if (colors) {
      const c = shade ? shade(x, y, z) : 1;
      const [cr, cg, cb] = typeof c === "number" ? [c, c, c] : c;
      colors.set([cr, cg, cb, fade ? smoothstep(0, 0.14, fade(x, y, z)) : 1], i * 4);
    }
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  if (colors) geometry.setAttribute("color", new BufferAttribute(colors, 4));
  if (cut && geometry.index) {
    const index = geometry.index.array;
    const kept: number[] = [];
    for (let i = 0; i < index.length; i += 3) {
      const [a, b, c] = [index[i], index[i + 1], index[i + 2]];
      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (cut(cx, cy, cz) > 0) kept.push(a, b, c);
    }
    geometry.setIndex(kept);
  }
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Hair that starts at a hairline: high at the forehead, lower over the ears,
 * lowest at the nape. Heights are on the unit head (−1 chin, 1 crown).
 */
function hairline(front: number, side: number, back: number): Edge {
  return (x, y, z) => {
    const len = Math.hypot(x / HEAD.a, y / HEAD.b, z / HEAD.c) || 1;
    const [uy, uz] = [y / HEAD.b / len, z / HEAD.c / len];
    const h = uz > 0 ? side + (front - side) * uz ** 1.4 : side + (back - side) * -uz;
    return uy - h;
  };
}

/**
 * Splits each triangle of a flat geometry into four, `times` times, so it can
 * bend over a curved surface without its flat middles sinking behind it.
 */
function subdivide(geometry: BufferGeometry, times: number): BufferGeometry {
  let flat = geometry.index ? geometry.toNonIndexed() : geometry;
  for (let n = 0; n < times; n++) {
    const pos = flat.attributes.position;
    const out: number[] = [];
    const p = [new Vector3(), new Vector3(), new Vector3()];
    for (let i = 0; i < pos.count; i += 3) {
      for (let k = 0; k < 3; k++) p[k].fromBufferAttribute(pos, i + k);
      const [a, b, c] = p;
      const [ab, bc, ca] = [a.clone().lerp(b, 0.5), b.clone().lerp(c, 0.5), c.clone().lerp(a, 0.5)];
      for (const t of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ]) {
        for (const v of t) out.push(v.x, v.y, v.z);
      }
    }
    if (flat !== geometry) flat.dispose();
    flat = new BufferGeometry();
    flat.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
  }
  if (geometry !== flat) geometry.dispose();
  return flat;
}

function tube(points: Vector3[], radius: number, closed = false) {
  const curve =
    points.length === 3 && !closed
      ? new QuadraticBezierCurve3(points[0], points[1], points[2])
      : new CatmullRomCurve3(points, closed);
  return new TubeGeometry(curve, closed ? 48 : 20, radius, 8, closed);
}

/** A mouth-shaped outline (SVG units around the mouth's center; +y up). */
function mouthShape(w: number, up: number, down: number) {
  const shape = new Shape();
  shape.moveTo(-w * S, 0);
  shape.bezierCurveTo(-w * 0.6 * S, up * S, w * 0.6 * S, up * S, w * S, 0);
  shape.bezierCurveTo(w * 0.6 * S, -down * S, -w * 0.6 * S, -down * S, -w * S, 0);
  return shape;
}

/**
 * Surface detail, painted once on a canvas and tiled: values around light
 * gray nudge color, roughness or bumps a little so no surface is uniform.
 * `make` draws on a square canvas of `size` pixels.
 */
function canvasTexture(size: number, make: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) make(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** A deterministic random sequence, so a coach looks the same on every load. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Draws at (x, y) and at its wrapped copies, so the texture tiles. */
function tiled(size: number, x: number, y: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
}

type Surfaces = ReturnType<typeof createSurfaces>;

function createSurfaces() {
  // Skin: soft, low-contrast mottling.
  const skin = canvasTexture(128, (ctx, size) => {
    const rand = seeded(7);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, size, size);
    ctx.filter = "blur(3px)";
    for (let i = 0; i < 260; i++) {
      const g = 230 + Math.floor(rand() * 25);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      const r = 2 + rand() * 6;
      tiled(size, rand() * size, rand() * size, (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
  // Hair: strands along the texture's v (the shells' meridians, from the crown down).
  const hair = canvasTexture(256, (ctx, size) => {
    const rand = seeded(11);
    ctx.fillStyle = "#c8c8c8";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      const g = 140 + Math.floor(rand() * 115);
      ctx.strokeStyle = `rgba(${g},${g},${g},0.55)`;
      ctx.lineWidth = 0.6 + rand() * 1.4;
      const length = size * (0.25 + rand() * 0.5);
      const bend = rand() * 2;
      tiled(size, rand() * size, rand() * size, (x, y) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 2, y + length / 3, x - 2, y + (2 * length) / 3, x + bend, y + length);
        ctx.stroke();
      });
    }
  });
  // Fabric: a fine twill with a little irregularity.
  const fabric = canvasTexture(64, (ctx, size) => {
    const rand = seeded(5);
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const weave = (x + y) % 4 < 2 ? 1 : 0.84;
        const g = Math.round(255 * weave * (0.9 + rand() * 0.1));
        image.data.set([g, g, g, 255], (y * size + x) * 4);
      }
    }
    ctx.putImageData(image, 0, 0);
  });
  // A soft round spot, as an alpha map: blush, the lower lip's sheen.
  const spot = canvasTexture(64, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.45, "#9a9a9a");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
  // The iris, in grays that the eye color tints: a dark pupil, fibers, and a
  // darker rim that fades out.
  const iris = canvasTexture(128, (ctx, size) => {
    const rand = seeded(3);
    const c = size / 2;
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c);
    gradient.addColorStop(0, "#080808");
    gradient.addColorStop(0.36, "#080808");
    gradient.addColorStop(0.44, "#a6a6a6");
    gradient.addColorStop(0.72, "#ffffff");
    gradient.addColorStop(0.88, "#3a3a3a");
    gradient.addColorStop(1, "rgba(40, 40, 40, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 90; i++) {
      const a = rand() * Math.PI * 2;
      ctx.strokeStyle = rand() < 0.5 ? "#ffffff" : "#404040";
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * c * 0.42, c + Math.sin(a) * c * 0.42);
      ctx.lineTo(c + Math.cos(a) * c * 0.84, c + Math.sin(a) * c * 0.84);
      ctx.stroke();
    }
  });
  iris.colorSpace = SRGBColorSpace;
  iris.wrapS = iris.wrapT = spot.wrapS = spot.wrapT = ClampToEdgeWrapping;
  skin.repeat.set(5, 4);
  hair.repeat.set(6, 1);
  fabric.repeat.set(48, 10);
  return {
    skin,
    hair,
    fabric,
    spot,
    iris,
    dispose() {
      for (const texture of [skin, hair, fabric, spot, iris]) texture.dispose();
    },
  };
}

/**
 * Resolves any CSS color (hex, oklch(), var(--brand-sky)) to sRGB by painting
 * it, since three.js only parses a few formats.
 */
function cssColor(value: string, ctx: CanvasRenderingContext2D | null): Color {
  const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
  );
  if (!ctx) return new Color().setStyle(resolved.startsWith("#") ? resolved : "#888888");
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#888888";
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
}

type Rig = {
  root: Group;
  body: Group;
  head: Group;
  lids: Mesh[];
  pupils: Group[];
  brows: Group;
  mouth: {
    group: Group;
    lips: Mesh;
    inside: Mesh;
    teeth: Mesh;
    tongue: Mesh;
    smile: Mesh;
    lowerLip: Mesh;
    lift: number;
    shape: string;
  };
};

export type CoachScene = {
  setAppearance(appearance: AiCoachAppearance): void;
  /** Re-reads theme colors (light/dark). */
  refreshColors(): void;
  render(pose: CoachPose, state: CoachState): void;
  setSize(px: number): void;
  dispose(): void;
};

/** Throws when WebGL isn't available; the caller falls back to the SVG coach. */
export function createCoachScene(canvas: HTMLCanvasElement, initial: AiCoachAppearance): CoachScene {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    stencil: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  // A portrait: head and shoulders, a little closer than the SVG's framing,
  // from slightly above and to the side.
  const camera = new PerspectiveCamera(24, 1, 1, 30);
  const frameY = sy(101);
  const distance = (84 * S) / Math.tan((12 * Math.PI) / 180);
  const azimuth = 0.26;
  camera.position.set(Math.sin(azimuth) * distance, frameY + 0.45, Math.cos(azimuth) * distance);
  camera.lookAt(0, frameY, 0);

  // A dim studio for soft reflections and fill, then the lights.
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.35;

  scene.add(new HemisphereLight(0xfff8f0, 0x6a5a58, 0.5));
  // Key: soft, warm, above and to the coach's right; it casts the only shadows.
  const key = new DirectionalLight(0xfff0e0, 3.4);
  key.position.set(-2.4, 2.8, 4.2);
  key.target.position.set(0, -0.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 1, far: 12 });
  scene.add(key, key.target);
  // Fill: gentle and slightly cool, from the other side, so shadows stay open.
  const fill = new DirectionalLight(0xe4ecff, 1.1);
  fill.position.set(3.2, 0.4, 3);
  scene.add(fill);
  // Rims from behind: thin highlights along the hair, cheek and shoulders.
  const rim = new DirectionalLight(0xfff4ec, 2.2);
  rim.position.set(2.6, 2.2, -3);
  scene.add(rim);
  const kicker = new DirectionalLight(0xffeef4, 1.2);
  kicker.position.set(-3, 1, -2.5);
  scene.add(kicker);

  const surfaces = createSurfaces();
  const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  let appearance = initial;
  let rig: Rig | null = null;
  let last: number[] = [];

  const build = () => {
    if (rig) {
      scene.remove(rig.root);
      disposeTree(rig.root);
    }
    rig = buildCoach(appearance, surfaces, (value) => cssColor(value, paint));
    scene.add(rig.root);
    last = [];
  };
  build();

  return {
    setAppearance(next) {
      appearance = next;
      build();
    },
    refreshColors: build,
    setSize(px) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(px, px, false);
      last = [];
    },
    render(pose, state) {
      if (!rig) return;
      const { w, up, down } = pose.mouth;
      // Skip the frame when nothing moved (idle under reduced motion).
      const now = [
        ...[w, up, down, pose.lid, pose.eyes.x, pose.eyes.y],
        ...[pose.roll, pose.nod, pose.brow, pose.turn, pose.bob, pose.t],
      ];
      if (now.length === last.length && now.every((value, i) => Math.abs(value - last[i]) < 0.002)) return;
      last = now;
      applyPose(rig, pose, state);
      renderer.render(scene, camera);
    },
    dispose() {
      if (rig) disposeTree(rig.root);
      surfaces.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function disposeTree(root: Object3D) {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      for (const material of [object.material].flat() as Material[]) material.dispose();
    }
  });
}

function applyPose(rig: Rig, pose: CoachPose, state: CoachState) {
  const { mouth } = rig;
  const { w, up, down } = pose.mouth;
  const openness = up + down;

  // Mouth: the opening is rebuilt from the voice's shape; teeth and tongue are clipped to it.
  const key = `${w.toFixed(2)}:${up.toFixed(2)}:${down.toFixed(2)}`;
  if (key !== mouth.shape) {
    mouth.shape = key;
    const lips = conform(new ShapeGeometry(mouthShape(w + 1, up + 1, down + 1), 12), 0, MOUTH_Y, mouth.lift);
    const inside = conform(new ShapeGeometry(mouthShape(w, up, down), 12), 0, MOUTH_Y, mouth.lift + 0.002);
    mouth.lips.geometry.dispose();
    mouth.inside.geometry.dispose();
    mouth.lips.geometry = lips;
    mouth.inside.geometry = inside;
    const teethY = (up + 0.5 - 2) * S;
    mouth.teeth.position.set(0, teethY, surfaceZ(0, MOUTH_Y + teethY) + mouth.lift + 0.006);
    const tongueY = -down * 0.75 * S;
    mouth.tongue.position.set(0, tongueY, surfaceZ(0, MOUTH_Y + tongueY) + mouth.lift + 0.004);
  }
  const open = openness > 0.8;
  mouth.lips.visible = mouth.inside.visible = mouth.teeth.visible = mouth.tongue.visible = open;
  const smile = Math.max(0, 1 - openness / 4);
  mouth.smile.visible = mouth.lowerLip.visible = smile > 0.01;
  (mouth.smile.material as MeshPhysicalMaterial).opacity = smile;
  (mouth.lowerLip.material as MeshPhysicalMaterial).opacity = 0.3 * smile;

  // The upper lids roll down over the eyeballs to blink, and follow the gaze up a little.
  const blink = (1 - pose.lid) / 0.9;
  for (const lid of rig.lids) lid.rotation.x = Math.max(-0.2, blink * LID_CLOSE + pose.eyes.y * 0.04);
  // The irises turn with the eyeballs (+x right, +y down).
  for (const pupil of rig.pupils) pupil.rotation.set(pose.eyes.y * 0.07, pose.eyes.x * 0.07, 0);
  rig.brows.position.y = -pose.brow * S;

  // Head: the 2D roll and nod, plus what 3D adds: small turns that follow the
  // eyes. The body sits a little turned from the camera; the head turns back
  // toward it, as in a portrait.
  const { head } = rig;
  head.rotation.z = (-pose.roll * Math.PI) / 180;
  head.rotation.y =
    0.16 + (pose.turn * Math.PI) / 180 + Math.sin(pose.t * 0.37) * 0.035 + (state === "listening" ? -0.04 : 0);
  head.rotation.x = pose.eyes.y * 0.025 + pose.nod * 0.035;
  head.position.y = NECK_Y - pose.nod * 0.6 * S;
  rig.body.position.y = -pose.bob * S;
  rig.body.rotation.y = -0.08 + Math.sin(pose.t * 0.37 - 0.6) * 0.025;
  rig.body.rotation.z = -0.015;
}

function buildCoach(appearance: AiCoachAppearance, surfaces: Surfaces, color: (value: string) => Color): Rig {
  const mix = (a: Color, b: Color | string, t: number) => a.clone().lerp(typeof b === "string" ? color(b) : b, t);
  const toColor = (value: Color | string) => (typeof value === "string" ? color(value) : value);
  /** A matte surface; the presets below add each material's character. */
  const matte = (value: Color | string, params: MeshPhysicalMaterialParameters = {}) =>
    new MeshPhysicalMaterial({ color: toColor(value), roughness: 0.75, specularIntensity: 0.4, ...params });
  // Skin: soft and slightly mottled, with a faint warm sheen at grazing angles.
  const skinned = (value: Color | string, params: MeshPhysicalMaterialParameters = {}) =>
    matte(value, {
      roughness: 0.6,
      roughnessMap: surfaces.skin,
      map: surfaces.skin,
      sheen: 0.3,
      sheenRoughness: 0.6,
      sheenColor: mix(toColor(value), "#ffb39a", 0.5),
      specularIntensity: 0.35,
      ...params,
    });
  // Fabric: a fine weave, velvety at the edges, no shine.
  const cloth = (value: Color | string, params: MeshPhysicalMaterialParameters = {}) =>
    matte(value, {
      roughness: 0.9,
      roughnessMap: surfaces.fabric,
      bumpMap: surfaces.fabric,
      bumpScale: 0.6,
      sheen: 0.7,
      sheenRoughness: 0.5,
      sheenColor: mix(toColor(value), "#ffffff", 0.35),
      specularIntensity: 0.2,
      ...params,
    });
  // Hair: strands, with a soft sheen along them.
  const strands = (value: Color | string, params: MeshPhysicalMaterialParameters = {}) =>
    matte(value, {
      roughness: 0.5,
      map: surfaces.hair,
      bumpMap: surfaces.hair,
      bumpScale: 0.8,
      sheen: 0.6,
      sheenRoughness: 0.35,
      sheenColor: mix(toColor(value), "#ffffff", 0.4),
      specularIntensity: 0.45,
      side: DoubleSide,
      ...params,
    });

  const skinTone = SKIN_TONES[appearance.skin];
  const skin = color(skinTone.base);
  const shade = color(skinTone.shade);
  const lip = color(skinTone.lip);
  const hairColor = color(HAIR_COLORS[appearance.hairColor].color);
  const outfitColor = color(OUTFIT_COLORS[appearance.outfitColor].color);
  const hijab = appearance.hair === "hijab";

  const root = new Group();
  const body = new Group();
  root.add(body);
  const head = new Group();
  head.position.y = NECK_Y;
  body.add(head);
  // Everything on the head is placed in head space (origin at the face's center).
  const face = new Group();
  face.position.y = -NECK_Y;
  head.add(face);

  const add = (parent: Object3D, geometry: BufferGeometry, material: Material, at?: [number, number, number]) => {
    const mesh = new Mesh(geometry, material);
    if (at) mesh.position.set(...at);
    parent.add(mesh);
    return mesh;
  };

  // --- Body and outfit ---------------------------------------------------
  const torsoProfile: [number, number][] = [
    [0.001, -1.02],
    [0.42, -1.05],
    [0.8, -1.17],
    [1.14, -1.34],
    [1.38, -1.56],
    [1.52, -1.86],
    [1.6, -2.6],
  ];
  const TORSO_DEPTH = 0.55;
  const torsoR = (y: number) => {
    for (let i = 1; i < torsoProfile.length; i++) {
      const [r1, y1] = torsoProfile[i];
      const [r0, y0] = torsoProfile[i - 1];
      if (y >= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
    return torsoProfile[torsoProfile.length - 1][0];
  };
  const torsoZ = (x: number, y: number) => {
    const r = torsoR(y);
    return TORSO_DEPTH * r * Math.sqrt(Math.max(0, 1 - (x / r) ** 2));
  };
  const outfit = cloth(outfitColor);
  const torso = add(body, new LatheGeometry(torsoProfile.map(([r, y]) => new Vector2(r, y)).reverse(), 64), outfit);
  torso.scale.z = TORSO_DEPTH;

  if (!hijab) add(body, new CylinderGeometry(0.27, 0.31, 0.75, 32), skinned(mix(skin, shade, 0.6)), [0, -1.0, -0.06]);

  if (appearance.outfit === "hoodie") {
    const hood = add(
      body,
      new TorusGeometry(0.48, 0.17, 16, 48),
      cloth(mix(outfitColor, "#000000", 0.25)),
      [0, -1.12, -0.12],
    );
    hood.rotation.x = Math.PI / 2.6;
    hood.scale.set(1.15, 1, 1);
    const string = cloth(mix(outfitColor, "#ffffff", 0.7));
    for (const x of [-0.16, 0.16]) {
      add(body, new CapsuleGeometry(0.022, 0.32, 4, 8), string, [x, -1.42, torsoZ(x, -1.42) + 0.02]);
    }
  } else if (appearance.outfit === "collar") {
    const white = matte("#f4f1ec", { roughness: 0.35, clearcoat: 0.6 });
    const flapMaterial = cloth("#f4f1ec", { side: DoubleSide });
    for (const side of [-1, 1]) {
      const flap = new Shape();
      flap.moveTo(side * 0.36, -1.08);
      flap.lineTo(0, -1.44);
      flap.lineTo(side * 0.2, -1.6);
      flap.lineTo(side * 0.52, -1.18);
      flap.closePath();
      const geometry = subdivide(new ShapeGeometry(flap, 4), 3);
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, torsoZ(pos.getX(i), pos.getY(i)) + 0.06);
      geometry.computeVertexNormals();
      add(body, geometry, flapMaterial);
    }
    for (const y of [-1.68, -1.95]) add(body, new SphereGeometry(0.035, 12, 8), white, [0, y, torsoZ(0, y) + 0.02]);
  } else {
    const neckline = add(
      body,
      new TorusGeometry(0.34, 0.045, 10, 48),
      cloth(mix(outfitColor, "#ffffff", 0.3)),
      [0, -1.08, -0.04],
    );
    neckline.rotation.x = Math.PI / 2;
  }

  // --- Head ----------------------------------------------------------------
  // Skin color varies a little: warmer cheeks, nose and chin; a touch darker toward the jaw.
  const flush = (x: number, y: number, z: number): [number, number, number] => {
    const warm = 0.5 * bump(Math.abs(x), y, 0.5, -0.3, 0.2, 0.15) + 0.35 * bump(x, y, 0, -0.84, 0.18, 0.1);
    const jaw = smoothstep(-0.55, -0.95, y) * smoothstep(0.6, 0.1, z) * 0.12;
    return [1 - jaw, (1 - jaw) * (1 - warm * 0.1), (1 - jaw) * (1 - warm * 0.12)];
  };
  add(
    face,
    shell({ r: [HEAD.a, HEAD.b, HEAD.c], taper: true, shade: flush, segments: [96, 72] }),
    skinned(skin, { vertexColors: true }),
  );
  const skinPlain = skinned(skin);

  if (!hijab) {
    const ear = skinned(mix(skin, shade, 0.45));
    for (const side of [-1, 1]) {
      const mesh = add(face, new SphereGeometry(0.16, 20, 16), ear, [side * 0.86, sy(96), -0.06]);
      mesh.scale.set(0.55, 1.1, 0.85);
    }
    const gold = matte("#e8c35a", { metalness: 1, roughness: 0.28 });
    if (appearance.earrings === "studs") {
      for (const side of [-1, 1]) add(face, new SphereGeometry(0.045, 12, 8), gold, [side * 0.89, sy(106), 0]);
    } else if (appearance.earrings === "hoops") {
      for (const side of [-1, 1]) {
        const hoop = add(face, new TorusGeometry(0.1, 0.017, 8, 32), gold, [side * 0.9, sy(111), 0.01]);
        hoop.rotation.y = side * 0.9;
      }
    }
  }

  // Nose: a soft bridge, a rounded tip with a little warmth, the wings and
  // the shadows of the nostrils.
  const ellipsoid = (
    material: Material,
    [x, y, lift]: [number, number, number],
    [rx, ry, rz]: [number, number, number],
  ) => {
    const mesh = add(face, new SphereGeometry(1, 24, 18), material, [x, y, surfaceZ(x, y) + lift]);
    mesh.scale.set(rx, ry, rz);
    return mesh;
  };
  ellipsoid(skinPlain, [0, sy(94), -0.035], [0.05, 0.17, 0.055]);
  ellipsoid(skinned(mix(skin, lip, 0.05)), [0, sy(104), -0.03], [0.075, 0.07, 0.085]);
  for (const side of [-1, 1]) {
    const wing = ellipsoid(skinPlain, [side * 0.072, sy(106), -0.035], [0.05, 0.04, 0.05]);
    wing.rotation.z = side * 0.3;
    const nostril = add(face, new CircleGeometry(1, 16), matte(mix(shade, "#000000", 0.45), { roughness: 0.9 }), [
      side * 0.034,
      sy(107.6),
      surfaceZ(side * 0.034, sy(107.6)) + 0.022,
    ]);
    nostril.scale.set(0.022, 0.012, 1);
    nostril.rotation.set(-1.15, 0, side * 0.35);
  }

  // Cheeks: a soft flush.
  const blush = matte("var(--brand-pink)", {
    alphaMap: surfaces.spot,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    roughness: 0.65,
  });
  for (const side of [-1, 1]) {
    const geometry = new CircleGeometry(9 * S, 24);
    add(face, conform(geometry, side * 0.56, sy(108), 0.006), blush, [side * 0.56, sy(108), 0]);
  }

  // Eyes: eyeballs set into the sockets. A glossy white with soft shading
  // toward its edges; an iris in the chosen color that turns to glance; catchlights from the
  // key light, which stay put as the iris moves; and skin lids, the upper one
  // with a lash line that flicks out at the outer corner and rolls down to
  // blink. A soft crease sits above each.
  //
  // Each eye is built on a unit sphere and scaled to an ellipsoid, so parts
  // that rotate on it (the iris, the lid) stay on its surface.
  const lids: Mesh[] = [];
  const pupils: Group[] = [];
  const EYE = { rx: 0.12, ry: 0.14, rz: 0.08 };
  /** The iris's angular radius on the eyeball. */
  const IRIS = 0.7;
  const LOWER_LID = 0.95;
  const onBall = (polar: number, around: number, r: number) =>
    new Vector3(r * Math.sin(polar) * Math.cos(around), r * Math.cos(polar), r * Math.sin(polar) * Math.sin(around));

  const scleraGeometry = new SphereGeometry(1, 40, 28);
  const spos = scleraGeometry.attributes.position;
  const shading = new Float32Array(spos.count * 3);
  for (let i = 0; i < spos.count; i++) {
    const g = 0.7 + 0.3 * smoothstep(0.1, 0.85, spos.getZ(i));
    shading.set([g, g * 0.96, g * 0.95], i * 3);
  }
  scleraGeometry.setAttribute("color", new BufferAttribute(shading, 3));
  const sclera = matte("#f6f0ea", { vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });

  // The iris: a cap around +z, mapped flat so the round texture sits on it.
  const R_IRIS = 1.02;
  const irisGeometry = new SphereGeometry(R_IRIS, 40, 12, 0, Math.PI * 2, 0, IRIS);
  irisGeometry.rotateX(Math.PI / 2);
  const ipos = irisGeometry.attributes.position;
  const iuv = irisGeometry.attributes.uv;
  const span = 2 * R_IRIS * Math.sin(IRIS);
  for (let i = 0; i < ipos.count; i++) iuv.setXY(i, 0.5 + ipos.getX(i) / span, 0.5 + ipos.getY(i) / span);
  const irisMaterial = matte(coachEyeColor(appearance), {
    map: surfaces.iris,
    transparent: true,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  });

  const shine = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const lidSkin = skinned(mix(skin, shade, 0.2));
  const lash = matte("#1a100c", { roughness: 0.8 });
  const lowerLash = matte(mix(shade, "#000000", 0.35), { roughness: 0.9 });
  const crease = matte(mix(shade, "#000000", 0.2), { transparent: true, opacity: 0.55, depthWrite: false });
  const forward = new Vector3(0, 0, 1);
  for (const side of [-1, 1]) {
    const x = side * 0.34;
    const eye = new Group();
    eye.position.set(x, 0, surfaceZ(x, 0) - 0.03);
    eye.scale.set(EYE.rx, EYE.ry, EYE.rz);
    // A slight lift at the outer corners.
    eye.rotation.z = side * 0.08;
    add(eye, scleraGeometry, sclera);

    const pupil = new Group();
    eye.add(pupil);
    add(pupil, irisGeometry, irisMaterial);

    for (const [polar, around, r, opacity] of [
      [1.3, 2.0, 0.16, 0.95],
      [1.82, 1.15, 0.08, 0.6],
    ]) {
      const at = onBall(polar, around, 1.04);
      const dot = add(eye, new CircleGeometry(r, 16), opacity < 0.9 ? shine.clone() : shine, [at.x, at.y, at.z]);
      dot.quaternion.setFromUnitVectors(forward, at.clone().normalize());
      (dot.material as MeshBasicMaterial).opacity = opacity;
    }

    // Upper lid: a cap over the top of the eyeball, its edge just over the iris.
    const lid = add(eye, new SphereGeometry(1.08, 40, 14, 0, Math.PI * 2, 0, LID_OPEN), lidSkin);
    // The lash line along its edge, thickest toward the outer corner.
    const arc = Array.from({ length: 11 }, (_, i) => onBall(LID_OPEN, Math.PI * (0.06 + (0.88 * i) / 10), 1.1));
    const outer = new Vector3(side * 1.3, 0.82, 0.42);
    if (side > 0) arc.unshift(outer);
    else arc.push(outer);
    add(lid, tube(arc, 0.1), lash);

    // Lower lid: a smaller cap under the eyeball, with a faint lash line.
    add(eye, new SphereGeometry(1.05, 40, 10, 0, Math.PI * 2, Math.PI - LOWER_LID, LOWER_LID), lidSkin);
    const lower = Array.from({ length: 9 }, (_, i) =>
      onBall(Math.PI - LOWER_LID, Math.PI * (0.12 + (0.76 * i) / 8), 1.06),
    );
    add(eye, tube(lower, 0.035), lowerLash);

    face.add(eye);
    lids.push(lid);
    pupils.push(pupil);
    const fold = Array.from({ length: 7 }, (_, i) => {
      const a = Math.PI * (0.16 + (0.68 * i) / 6);
      const px = x + Math.cos(a) * EYE.rx * 1.2;
      const py = Math.sin(a) * EYE.ry * 1.4;
      return new Vector3(px, py, surfaceZ(px, py) + 0.004);
    });
    add(face, tube(fold, 0.005), crease);
  }

  // Brows (they rise while listening and on emphasis).
  const brows = new Group();
  face.add(brows);
  const browMaterial = matte(hijab || appearance.hair === "bald" ? color("#2a1a18") : hairColor, { roughness: 0.7 });
  const onFace = (x: number, y: number, lift: number) => new Vector3(sx(x), sy(y), surfaceZ(sx(x), sy(y)) + lift);
  for (const [a, b, c] of [
    [
      [74, 76],
      [83, 70],
      [92, 75],
    ],
    [
      [108, 75],
      [117, 70],
      [126, 76],
    ],
  ]) {
    const points = [onFace(a[0], a[1], 0.03), onFace(b[0], b[1], 0.03), onFace(c[0], c[1], 0.03)];
    add(brows, tube(points, 2 * S), browMaterial);
    for (const p of [points[0], points[2]]) add(brows, new SphereGeometry(2 * S, 10, 8), browMaterial, [p.x, p.y, p.z]);
  }

  // Glasses.
  if (appearance.glasses !== "none") {
    const frame = matte("#2a2a2a", { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    const lens = matte("#ffffff", { roughness: 0.04, transparent: true, opacity: 0.12, depthWrite: false });
    const z = surfaceZ(0.34, 0) + 0.11;
    for (const side of [-1, 1]) {
      const outline = new Shape();
      if (appearance.glasses === "round") {
        outline.absarc(0, 0, 11 * S, 0, Math.PI * 2, false);
      } else {
        const [w, h, r] = [13 * S, 9 * S, 4 * S];
        outline.moveTo(-w + r, -h);
        outline.lineTo(w - r, -h);
        outline.quadraticCurveTo(w, -h, w, -h + r);
        outline.lineTo(w, h - r);
        outline.quadraticCurveTo(w, h, w - r, h);
        outline.lineTo(-w + r, h);
        outline.quadraticCurveTo(-w, h, -w, h - r);
        outline.lineTo(-w, -h + r);
        outline.quadraticCurveTo(-w, -h, -w + r, -h);
      }
      const points = outline.getSpacedPoints(48).slice(0, -1);
      const cx = side * 0.34;
      add(
        face,
        tube(
          points.map((p) => new Vector3(cx + p.x, p.y, z)),
          0.022,
          true,
        ),
        frame,
      );
      add(face, new ShapeGeometry(outline, 16), lens, [cx, 0, z - 0.005]);
      const edge = appearance.glasses === "round" ? 11 * S : 13 * S;
      add(face, tube([new Vector3(cx + side * edge, 0.04, z), new Vector3(side * 0.88, 0.06, -0.05)], 0.018), frame);
    }
    const inner = appearance.glasses === "round" ? 0.34 - 11 * S : 0.34 - 13 * S;
    add(
      face,
      tube([new Vector3(-inner, 0.02, z), new Vector3(0, 0.09, z + 0.03), new Vector3(inner, 0.02, z)], 0.02),
      frame,
    );
  }

  // --- Hair, hijab and facial hair -------------------------------------------
  const hair = strands(hairColor);
  // Hair close to the head is a little darker underneath, at the nape and near the face.
  const hairShaded = strands(hairColor, { vertexColors: true });
  const occlusion = (x: number, y: number, z: number) =>
    0.7 + 0.3 * smoothstep(-0.7, 0.75, y) * (0.85 + 0.15 * smoothstep(0.9, 0.3, Math.abs(x) + Math.max(0, z)));
  const cap = (
    scale: number,
    line: Edge,
    material: Material = hairShaded,
    ripple?: (x: number, y: number, z: number) => number,
  ) =>
    add(
      face,
      shell({ r: [HEAD.a * scale, HEAD.b * scale, HEAD.c * scale], tuck: line, ripple, shade: occlusion }),
      material,
    );

  switch (appearance.hair) {
    case "fade":
      cap(1.045, hairline(0.62, 0.2, -0.3));
      cap(1.02, hairline(0.7, -0.1, -0.6), strands(mix(hairColor, skin, 0.45), { vertexColors: true }));
      break;
    case "buzz":
      cap(1.025, hairline(0.64, 0.05, -0.55), strands(mix(hairColor, skin, 0.3), { vertexColors: true }));
      break;
    case "waves":
      cap(1.07, hairline(0.58, 0.05, -0.5), hairShaded, (x, y, z) => 0.012 * Math.sin(Math.atan2(z, x) * 9 + y * 10));
      break;
    case "curls":
    case "afro": {
      cap(1.05, hairline(0.58, 0.02, -0.5));
      if (appearance.hair === "afro") {
        add(
          face,
          shell({
            r: [1.3, 1.18, 1.12],
            center: [0, 0.36, -0.42],
            cut: (x, y, z) => (z < 0 ? 1 : hairline(0.5, 0.0, -0.6)(x, y, z)),
            ripple: (x, y, z) => 0.03 * Math.sin(x * 11) * Math.sin(y * 9 + z * 7),
          }),
          hair,
        );
      }
      // Curls: puffs over the crown and sides, kept above the hairline.
      const count = appearance.hair === "afro" ? 34 : 46;
      const curlLine = hairline(0.7, 0.12, -0.45);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count * 2; i++) {
        const y = 1 - (i / (count * 2 - 1)) * 2;
        const ring = Math.sqrt(1 - y * y);
        const p = new Vector3(Math.cos(golden * i) * ring * HEAD.a, y * HEAD.b, Math.sin(golden * i) * ring * HEAD.c);
        if (curlLine(p.x, p.y, p.z) < 0) continue;
        const puff = appearance.hair === "afro" ? 1.22 : 1.1;
        const size = appearance.hair === "afro" ? 0.3 : 0.2 + ((i * 7) % 5) * 0.02;
        add(face, new SphereGeometry(size, 14, 10), hair, [
          p.x * puff,
          p.y * puff + (appearance.hair === "afro" ? 0.1 : 0),
          p.z * puff - (appearance.hair === "afro" ? 0.3 : 0),
        ]);
      }
      break;
    }
    case "long": {
      cap(1.06, hairline(0.56, 0.08, -0.55), hairShaded, (x, y, z) => 0.008 * Math.sin(Math.atan2(z, x) * 14));
      add(face, shell({ r: [0.9, 1.1, 0.45], center: [0, -0.55, -0.45] }), hair);
      for (const side of [-1, 1]) {
        const strand = add(face, new CapsuleGeometry(0.15, 1.3, 6, 12), hair, [side * 0.84, -0.55, 0.06]);
        strand.scale.z = 0.7;
        strand.rotation.z = side * 0.06;
      }
      break;
    }
    case "locs": {
      cap(1.05, hairline(0.6, 0.06, -0.5), hairShaded, (x, y, z) => 0.01 * Math.sin(Math.atan2(z, x) * 16));
      for (let i = 0; i < 26; i++) {
        // Around the back and sides, leaving the face open.
        const angle = Math.PI * (-0.14 + (1.28 * i) / 25);
        const x = Math.cos(angle) * HEAD.a * 1.02;
        const z = -Math.sin(angle) * HEAD.c * 1.02 + 0.05;
        const length = 1.1 + ((i * 5) % 4) * 0.08;
        const loc = add(face, new CapsuleGeometry(0.075, length, 4, 8), hair, [x * 1.05, 0.15 - length / 2, z]);
        loc.rotation.z = -x * 0.08;
      }
      // A few in front of the shoulders, framing the face.
      for (const side of [-1, 1]) {
        for (const [dx, z, length] of [
          [0.8, 0.32, 1.25],
          [0.9, 0.18, 1.4],
        ]) {
          add(face, new CapsuleGeometry(0.075, length, 4, 8), hair, [side * dx, 0.3 - length / 2, z]);
        }
      }
      break;
    }
    case "bun": {
      cap(1.04, hairline(0.64, 0.1, -0.4), hairShaded, (x, y, z) => 0.006 * Math.sin(Math.atan2(z, x) * 18));
      add(face, new SphereGeometry(0.32, 24, 16), hair, [0, 1.0, -0.28]);
      const band = add(
        face,
        new TorusGeometry(0.22, 0.04, 8, 24),
        cloth(mix(hairColor, "#ffffff", 0.25)),
        [0, 0.86, -0.22],
      );
      band.rotation.x = Math.PI / 2 - 0.4;
      break;
    }
    case "braids": {
      // Rows (cornrows) on the scalp and two braids falling behind the ears.
      cap(1.04, hairline(0.62, 0.1, -0.45), hairShaded, (x) => 0.014 * Math.abs(Math.sin(x * 22)));
      for (const side of [-1, 1]) {
        for (const z of [-0.1, -0.42]) {
          for (let i = 0; i < 7; i++) {
            const plait = add(face, new SphereGeometry(1, 14, 10), hair, [
              side * (0.84 + i * 0.012),
              sy(104) - i * 0.21,
              z,
            ]);
            plait.scale.set(0.12, 0.14, 0.12);
          }
        }
      }
      break;
    }
    case "hijab": {
      const fabric = cloth(hairColor, { side: DoubleSide });
      add(
        face,
        shell({
          r: [HEAD.a * 1.14, HEAD.b * 1.1, HEAD.c * 1.14],
          // The face opening.
          tuck: (x, y, z) => ((x / 0.6) ** 2 + ((y + 0.05) / 0.86) ** 2 - 1) * 0.4 + Math.max(0, -z) * 2,
        }),
        fabric,
      );
      // The drape over the shoulders stays with the body.
      const drape = add(
        body,
        new LatheGeometry(
          [
            [0.86, -0.55],
            [0.92, -1.0],
            [1.15, -1.35],
            [1.62, -1.7],
            [1.88, -2.2],
            [1.98, -2.7],
          ]
            .map(([r, y]) => new Vector2(r, y))
            .reverse(),
          64,
        ),
        fabric,
      );
      drape.scale.z = 0.72;
      const fold = add(
        body,
        new TorusGeometry(0.74, 0.07, 10, 48, Math.PI),
        cloth(mix(hairColor, "#ffffff", 0.15)),
        [0, -0.66, 0.06],
      );
      fold.rotation.z = Math.PI;
      fold.scale.set(0.95, 0.55, 1);
      break;
    }
    default:
      break;
  }

  const beard = appearance.facialHair === "beard";
  if (appearance.facialHair === "stubble") {
    add(
      face,
      shell({
        r: [HEAD.a * 1.012, HEAD.b * 1.012, HEAD.c * 1.012],
        taper: true,
        fade: (x, y, z) =>
          Math.min(
            -0.3 + 0.3 * (x / HEAD.a) ** 2 - y,
            z + 0.1,
            ((x / 0.22) ** 2 + ((y - MOUTH_Y) / 0.1) ** 2 - 1) * 0.1,
          ),
      }),
      matte(hairColor, { transparent: true, opacity: 0.3, vertexColors: true, depthWrite: false, roughness: 0.9 }),
    );
  } else if (beard) {
    const geometry = shell({
      r: [HEAD.a * 1.07, HEAD.b * 1.07, HEAD.c * 1.07],
      taper: true,
      tuck: (x, y, z) =>
        Math.min(
          -0.3 + 0.32 * (x / HEAD.a) ** 2 - y,
          z + 0.25,
          ((x / 0.3) ** 2 + ((y - MOUTH_Y) / 0.15) ** 2 - 1) * 0.15,
        ),
    });
    // A fuller chin.
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.5) pos.setY(i, y - (y + 0.5) ** 2 * 0.5);
    }
    add(face, geometry, strands(hairColor, { bumpScale: 1.4 }));
  }
  const mouthLift = beard ? 0.075 : 0.022;
  if (beard || appearance.facialHair === "mustache") {
    const mustache = new Shape();
    const m = (x: number, y: number) => [(x - 100) * S, (112 - y) * S] as const;
    mustache.moveTo(...m(85, 112));
    mustache.bezierCurveTo(...m(91, 107), ...m(98, 109), ...m(100, 111));
    mustache.bezierCurveTo(...m(102, 109), ...m(109, 107), ...m(115, 112));
    mustache.bezierCurveTo(...m(109, 114.5), ...m(104, 113.5), ...m(100, 113.5));
    mustache.bezierCurveTo(...m(96, 113.5), ...m(91, 114.5), ...m(85, 112));
    const geometry = new ExtrudeGeometry(mustache, {
      depth: 0.03,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.01,
      curveSegments: 10,
    });
    add(face, conform(geometry, 0, sy(112), mouthLift - 0.005), strands(hairColor), [0, sy(112), 0]);
  }

  // --- Mouth ------------------------------------------------------------------
  const mouthGroup = new Group();
  mouthGroup.position.y = MOUTH_Y;
  face.add(mouthGroup);
  const inside = new MeshBasicMaterial({
    color: color("#4a1525"),
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: AlwaysStencilFunc,
    stencilZPass: ReplaceStencilOp,
  });
  const clipped = (value: string) =>
    new MeshBasicMaterial({ color: color(value), stencilWrite: true, stencilRef: 1, stencilFunc: EqualStencilFunc });
  const lips = add(
    mouthGroup,
    new BufferGeometry(),
    matte(lip, { roughness: 0.45, sheen: 0.4, sheenColor: mix(lip, "#ffffff", 0.4) }),
  );
  const insideMesh = add(mouthGroup, new BufferGeometry(), inside);
  insideMesh.renderOrder = 1;
  const tongue = add(mouthGroup, new CircleGeometry(1, 24), clipped("#c0506a"));
  tongue.scale.set(7 * S, 3.5 * S, 1);
  tongue.renderOrder = 2;
  const teeth = add(mouthGroup, new PlaneGeometry(28 * S, 4 * S), clipped("#fbf7f2"));
  teeth.renderOrder = 3;
  const smileCurve = [new Vector3(-15 * S, S, 0), new Vector3(0, -10 * S, 0), new Vector3(15 * S, S, 0)];
  const smileGeometry = tube(smileCurve, 1.75 * S);
  const smileMaterial = matte(mix(lip, "#000000", 0.1), { transparent: true, roughness: 0.5 });
  const smile = add(mouthGroup, conform(smileGeometry, 0, MOUTH_Y, mouthLift), smileMaterial);
  // A soft fullness under the smile: the lower lip, catching a little light.
  const lowerLipGeometry = new CircleGeometry(1, 24);
  lowerLipGeometry.scale(9 * S, 3.2 * S, 1).translate(0, -8.5 * S, 0);
  const lowerLip = add(
    mouthGroup,
    conform(lowerLipGeometry, 0, MOUTH_Y, mouthLift - 0.006),
    matte(mix(lip, skin, 0.5), {
      alphaMap: surfaces.spot,
      transparent: true,
      depthWrite: false,
      roughness: 0.4,
      sheen: 0.5,
      sheenColor: mix(lip, "#ffffff", 0.5),
    }),
  );

  // Everything opaque casts the key light's soft shadows; one-sided surfaces
  // catch them (two-sided ones would shadow themselves).
  root.traverse((object) => {
    const material = object instanceof Mesh ? (object.material as Material) : null;
    if (!material || material.transparent || material instanceof MeshBasicMaterial) return;
    object.castShadow = true;
    object.receiveShadow = material.side !== DoubleSide;
  });

  return {
    root,
    body,
    head,
    lids,
    pupils,
    brows,
    mouth: { group: mouthGroup, lips, inside: insideMesh, teeth, tongue, smile, lowerLip, lift: mouthLift, shape: "" },
  };
}
