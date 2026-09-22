import { floorAreaPx } from "./rooms";
import type { Detection, ImageSize } from "./floor-plan";
import { labelKind } from "./floor-plan";

export type MaterialTarget =
  "wall" | "door" | "window" | "floor" | "ceiling" | "furniture";

export type MaterialCategory =
  | "floor-tile"
  | "wall-paint"
  | "wallpaper"
  | "woodwork"
  | "door"
  | "window"
  | "ceiling"
  | "furniture"
  | "glass-metal";

export type MaterialTextureStyle =
  | "paint"
  | "concrete"
  | "brick"
  | "wood-panel"
  | "stone"
  | "door-white"
  | "door-oak"
  | "door-metal"
  | "glass-clear"
  | "glass-black"
  | "glass-wood"
  | "tile-light"
  | "tile-dark"
  | "floor-oak"
  | "floor-concrete"
  | "wallpaper-linen"
  | "wallpaper-geometric"
  | "wallpaper-botanical"
  | "ceiling-plaster"
  | "ceiling-grid"
  | "fabric"
  | "leather";

export type MaterialDefinition = {
  id: string;
  target: MaterialTarget;
  category: MaterialCategory;
  name: string;
  description: string;
  color: string;
  textureStyle: MaterialTextureStyle;
  textureScale: number;
  bumpScale?: number;
  clearcoat?: number;
  roughness: number;
  metalness: number;
  opacity?: number;
  textureMaps?: {
    color: string;
    normal?: string;
    roughness?: string;
    ao?: string;
  };
  previewImage?: string;
  textureRotation?: number;
  normalStrength?: number;
  price: number;
  unit: "m²" | "ชิ้น";
};

export const MATERIALS: MaterialDefinition[] = [
  {
    id: "wall-paint-white",
    target: "wall",
    category: "wall-paint",
    name: "สีขาวด้าน",
    description: "สีทาภายในโทนอุ่น",
    color: "#F3F0E8",
    textureStyle: "paint",
    textureScale: 1.9,
    bumpScale: 0.012,
    clearcoat: 0.02,
    roughness: 0.88,
    metalness: 0,
    price: 180,
    unit: "m²",
  },
  {
    id: "wall-concrete",
    target: "wall",
    category: "wall-paint",
    name: "คอนกรีตเปลือย",
    description: "ผิวเทาโมเดิร์น",
    color: "#9CA3A8",
    textureStyle: "concrete",
    textureScale: 1.3,
    bumpScale: 0.02,
    clearcoat: 0.03,
    roughness: 0.82,
    metalness: 0.02,
    price: 520,
    unit: "m²",
  },
  {
    id: "wall-brick",
    target: "wall",
    category: "wall-paint",
    name: "อิฐแดง",
    description: "ผิวอิฐตกแต่ง",
    color: "#A85E44",
    textureStyle: "brick",
    textureScale: 0.9,
    bumpScale: 0.028,
    clearcoat: 0.01,
    roughness: 0.9,
    metalness: 0,
    price: 780,
    unit: "m²",
  },
  {
    id: "wall-wood-panel",
    target: "wall",
    category: "woodwork",
    name: "ไม้กรุผนัง",
    description: "โทนไม้ธรรมชาติ",
    color: "#A9784C",
    textureStyle: "wood-panel",
    textureScale: 1.2,
    bumpScale: 0.018,
    clearcoat: 0.08,
    roughness: 0.62,
    metalness: 0.01,
    price: 1250,
    unit: "m²",
  },
  {
    id: "wall-walnut-real",
    target: "wall",
    category: "woodwork",
    name: "ไม้กรุวอลนัตจริง",
    description: "ลายไม้จากภาพจริง พร้อม Normal และ Roughness",
    color: "#FFFFFF",
    textureStyle: "wood-panel",
    textureScale: 1.45,
    bumpScale: 0.012,
    clearcoat: 0.1,
    roughness: 0.58,
    metalness: 0,
    textureMaps: {
      color: "/materials/real-wood/walnut_basecolor.jpg",
      normal: "/materials/real-wood/walnut_normal.jpg",
      roughness: "/materials/real-wood/walnut_roughness.jpg",
      ao: "/materials/real-wood/walnut_ao.jpg",
    },
    previewImage: "/materials/real-wood/walnut_basecolor.jpg",
    normalStrength: 0.65,
    price: 1650,
    unit: "m²",
  },
  {
    id: "wall-stone",
    target: "wall",
    category: "wall-paint",
    name: "หินตกแต่ง",
    description: "ผิวหินพรีเมียม",
    color: "#7C756C",
    textureStyle: "stone",
    textureScale: 0.9,
    bumpScale: 0.03,
    clearcoat: 0.01,
    roughness: 0.92,
    metalness: 0,
    price: 1850,
    unit: "m²",
  },
  {
    id: "door-white",
    target: "door",
    category: "door",
    name: "ประตูไม้สีขาว",
    description: "บานเรียบใช้งานทั่วไป",
    color: "#EEECE5",
    textureStyle: "door-white",
    textureScale: 1.1,
    bumpScale: 0.012,
    clearcoat: 0.12,
    roughness: 0.72,
    metalness: 0,
    price: 5200,
    unit: "ชิ้น",
  },
  {
    id: "door-oak",
    target: "door",
    category: "door",
    name: "ประตูไม้โอ๊ก",
    description: "ลายไม้ธรรมชาติ",
    color: "#A87543",
    textureStyle: "door-oak",
    textureScale: 1.1,
    bumpScale: 0.016,
    clearcoat: 0.14,
    roughness: 0.58,
    metalness: 0.01,
    price: 8500,
    unit: "ชิ้น",
  },
  {
    id: "door-walnut-real",
    target: "door",
    category: "door",
    name: "ประตูวอลนัตลายจริง",
    description: "ลายไม้จริงพร้อมผิวกึ่งด้าน",
    color: "#FFFFFF",
    textureStyle: "door-oak",
    textureScale: 1.25,
    bumpScale: 0.01,
    clearcoat: 0.16,
    roughness: 0.52,
    metalness: 0,
    textureMaps: {
      color: "/materials/real-wood/walnut_basecolor.jpg",
      normal: "/materials/real-wood/walnut_normal.jpg",
      roughness: "/materials/real-wood/walnut_roughness.jpg",
      ao: "/materials/real-wood/walnut_ao.jpg",
    },
    previewImage: "/materials/real-wood/walnut_basecolor.jpg",
    textureRotation: Math.PI / 2,
    normalStrength: 0.55,
    price: 11200,
    unit: "ชิ้น",
  },
  {
    id: "door-black-metal",
    target: "door",
    category: "door",
    name: "ประตูกรอบดำ",
    description: "สไตล์โมเดิร์น",
    color: "#2E3136",
    textureStyle: "door-metal",
    textureScale: 1.2,
    bumpScale: 0.01,
    clearcoat: 0.22,
    roughness: 0.42,
    metalness: 0.38,
    price: 9800,
    unit: "ชิ้น",
  },
  {
    id: "window-clear",
    target: "window",
    category: "window",
    name: "กระจกใสกรอบอลูมิเนียม",
    description: "กรอบสีเงินมาตรฐาน",
    color: "#8ED7E8",
    textureStyle: "glass-clear",
    textureScale: 1.8,
    bumpScale: 0.004,
    clearcoat: 0.42,
    roughness: 0.14,
    metalness: 0.08,
    opacity: 0.56,
    price: 4500,
    unit: "m²",
  },
  {
    id: "window-black",
    target: "window",
    category: "window",
    name: "กระจกกรอบดำ",
    description: "กรอบดำโมเดิร์น",
    color: "#5DB7CB",
    textureStyle: "glass-black",
    textureScale: 1.8,
    bumpScale: 0.004,
    clearcoat: 0.44,
    roughness: 0.12,
    metalness: 0.16,
    opacity: 0.52,
    price: 6200,
    unit: "m²",
  },
  {
    id: "window-wood",
    target: "window",
    category: "window",
    name: "หน้าต่างกรอบไม้",
    description: "โทนอบอุ่นธรรมชาติ",
    color: "#72BCCD",
    textureStyle: "glass-wood",
    textureScale: 1.8,
    bumpScale: 0.004,
    clearcoat: 0.42,
    roughness: 0.2,
    metalness: 0.04,
    opacity: 0.55,
    price: 7800,
    unit: "m²",
  },
  {
    id: "floor-light-tile",
    target: "floor",
    category: "floor-tile",
    name: "กระเบื้องสีอ่อน",
    description: "พื้นสว่าง ดูสะอาด",
    color: "#E8E3D8",
    textureStyle: "tile-light",
    textureScale: 0.8,
    bumpScale: 0.01,
    clearcoat: 0.16,
    roughness: 0.72,
    metalness: 0,
    price: 690,
    unit: "m²",
  },
  {
    id: "floor-oak",
    target: "floor",
    category: "woodwork",
    name: "พื้นไม้โอ๊ก",
    description: "ลายไม้โทนอุ่น",
    color: "#B88A5C",
    textureStyle: "floor-oak",
    textureScale: 1.05,
    bumpScale: 0.016,
    clearcoat: 0.1,
    roughness: 0.58,
    metalness: 0.01,
    price: 1450,
    unit: "m²",
  },
  {
    id: "floor-walnut-real",
    target: "floor",
    category: "woodwork",
    name: "พื้นไม้วอลนัตจริง",
    description: "ลายไม้จริงคมชัด พร้อมแสงเงาแบบ PBR",
    color: "#FFFFFF",
    textureStyle: "floor-oak",
    textureScale: 1.35,
    bumpScale: 0.012,
    clearcoat: 0.12,
    roughness: 0.54,
    metalness: 0,
    textureMaps: {
      color: "/materials/real-wood/walnut_basecolor.jpg",
      normal: "/materials/real-wood/walnut_normal.jpg",
      roughness: "/materials/real-wood/walnut_roughness.jpg",
      ao: "/materials/real-wood/walnut_ao.jpg",
    },
    previewImage: "/materials/real-wood/walnut_basecolor.jpg",
    normalStrength: 0.7,
    price: 1890,
    unit: "m²",
  },
  {
    id: "floor-concrete",
    target: "floor",
    category: "floor-tile",
    name: "พื้นปูนขัดมัน",
    description: "ผิวเทาเรียบโมเดิร์น",
    color: "#A5A8AA",
    textureStyle: "floor-concrete",
    textureScale: 1.1,
    bumpScale: 0.018,
    clearcoat: 0.03,
    roughness: 0.46,
    metalness: 0.04,
    price: 980,
    unit: "m²",
  },
  {
    id: "floor-dark-tile",
    target: "floor",
    category: "floor-tile",
    name: "กระเบื้องสีเข้ม",
    description: "พื้นเทาเข้มร่วมสมัย",
    color: "#60656B",
    textureStyle: "tile-dark",
    textureScale: 0.8,
    bumpScale: 0.012,
    clearcoat: 0.14,
    roughness: 0.66,
    metalness: 0.01,
    price: 890,
    unit: "m²",
  },
  {
    id: "wallpaper-linen-beige",
    target: "wall",
    category: "wallpaper",
    name: "วอลเปเปอร์ลินินสีเบจ",
    description: "ลายผ้าละเอียด โทนอุ่น",
    color: "#D8C7AE",
    textureStyle: "wallpaper-linen",
    textureScale: 1.1,
    bumpScale: 0.008,
    clearcoat: 0,
    roughness: 0.82,
    metalness: 0,
    price: 620,
    unit: "m²",
  },
  {
    id: "wallpaper-geometric-blue",
    target: "wall",
    category: "wallpaper",
    name: "วอลเปเปอร์เรขาคณิต",
    description: "ลายโมเดิร์นสีฟ้าเทา",
    color: "#8FA8B7",
    textureStyle: "wallpaper-geometric",
    textureScale: 0.95,
    bumpScale: 0.006,
    clearcoat: 0.01,
    roughness: 0.78,
    metalness: 0,
    price: 790,
    unit: "m²",
  },
  {
    id: "wallpaper-botanical-green",
    target: "wall",
    category: "wallpaper",
    name: "วอลเปเปอร์ใบไม้",
    description: "ลายธรรมชาติสำหรับผนังตกแต่ง",
    color: "#98A98F",
    textureStyle: "wallpaper-botanical",
    textureScale: 1.15,
    bumpScale: 0.006,
    clearcoat: 0,
    roughness: 0.8,
    metalness: 0,
    price: 920,
    unit: "m²",
  },
  {
    id: "ceiling-gypsum-white",
    target: "ceiling",
    category: "ceiling",
    name: "ฝ้ายิปซัมเรียบ",
    description: "ฝ้าสีขาวด้านมาตรฐาน",
    color: "#F7F5EF",
    textureStyle: "ceiling-plaster",
    textureScale: 1.8,
    bumpScale: 0.006,
    clearcoat: 0,
    roughness: 0.9,
    metalness: 0,
    price: 480,
    unit: "m²",
  },
  {
    id: "ceiling-acoustic-grid",
    target: "ceiling",
    category: "ceiling",
    name: "ฝ้าอะคูสติก",
    description: "แผ่นฝ้าตารางช่วยซับเสียง",
    color: "#E6E4DC",
    textureStyle: "ceiling-grid",
    textureScale: 0.9,
    bumpScale: 0.01,
    clearcoat: 0,
    roughness: 0.88,
    metalness: 0,
    price: 850,
    unit: "m²",
  },
  {
    id: "ceiling-wood-slat",
    target: "ceiling",
    category: "ceiling",
    name: "ฝ้าระแนงไม้",
    description: "ฝ้าไม้โทนอุ่นแบบระแนง",
    color: "#A8794E",
    textureStyle: "wood-panel",
    textureScale: 1.2,
    bumpScale: 0.014,
    clearcoat: 0.06,
    roughness: 0.64,
    metalness: 0,
    price: 1650,
    unit: "m²",
  },
  {
    id: "furniture-oak",
    target: "furniture",
    category: "furniture",
    name: "เฟอร์นิเจอร์ไม้โอ๊ก",
    description: "ผิวไม้ธรรมชาติสำหรับโต๊ะและตู้",
    color: "#B88352",
    textureStyle: "door-oak",
    textureScale: 1.0,
    bumpScale: 0.014,
    clearcoat: 0.12,
    roughness: 0.58,
    metalness: 0,
    price: 6500,
    unit: "ชิ้น",
  },
  {
    id: "furniture-fabric-gray",
    target: "furniture",
    category: "furniture",
    name: "ผ้าบุสีเทา",
    description: "ผิวผ้าสำหรับโซฟาและเก้าอี้",
    color: "#8B8F94",
    textureStyle: "fabric",
    textureScale: 0.75,
    bumpScale: 0.016,
    clearcoat: 0,
    roughness: 0.92,
    metalness: 0,
    price: 8200,
    unit: "ชิ้น",
  },
  {
    id: "furniture-leather-brown",
    target: "furniture",
    category: "furniture",
    name: "หนังสีน้ำตาล",
    description: "ผิวหนังกึ่งด้านสำหรับโซฟา",
    color: "#7A4D32",
    textureStyle: "leather",
    textureScale: 0.9,
    bumpScale: 0.012,
    clearcoat: 0.18,
    roughness: 0.55,
    metalness: 0,
    price: 12800,
    unit: "ชิ้น",
  },
];

export const DEFAULT_MATERIAL: Record<MaterialTarget, string> = {
  wall: "wall-paint-white",
  door: "door-oak",
  window: "window-clear",
  floor: "floor-light-tile",
  ceiling: "ceiling-gypsum-white",
  furniture: "furniture-oak",
};

export function materialsFor(target: MaterialTarget) {
  return MATERIALS.filter((material) => material.target === target);
}

export function materialsForCategory(category: MaterialCategory) {
  return MATERIALS.filter((material) => material.category === category);
}

export function categoryForMaterial(
  id: string | null | undefined,
): MaterialCategory {
  return (
    MATERIALS.find((material) => material.id === id)?.category ?? "wall-paint"
  );
}

export function materialById(
  id: string | null | undefined,
  target?: MaterialTarget,
) {
  const match = id
    ? MATERIALS.find((material) => material.id === id)
    : undefined;
  if (match && (!target || match.target === target)) return match;
  if (!target) return MATERIALS[0];
  return MATERIALS.find(
    (material) => material.id === DEFAULT_MATERIAL[target],
  )!;
}

export function targetForDetection(
  detection: Detection,
): MaterialTarget | null {
  const kind = labelKind(detection.label);
  return kind === "wall" ||
    kind === "door" ||
    kind === "window" ||
    kind === "floor" ||
    kind === "ceiling" ||
    kind === "furniture"
    ? kind
    : null;
}

export type BudgetLine = {
  materialId: string;
  name: string;
  target: MaterialTarget;
  category: MaterialCategory;
  quantity: number;
  unit: "m²" | "ชิ้น";
  unitPrice: number;
  total: number;
};

function wallLengthPx(detection: Detection) {
  return Math.max(detection.box.width, detection.box.height);
}

function wallHeightM(detection: Detection) {
  const value = Number(detection.wallHeightM ?? 2.8);
  return Number.isFinite(value) ? Math.min(4.5, Math.max(2.2, value)) : 2.8;
}

function openingAreaM2(detection: Detection, metersPerPixel: number) {
  const kind = labelKind(detection.label);
  const widthPx = Math.max(detection.box.width, detection.box.height);
  const widthM = widthPx * metersPerPixel;
  const heightM = kind === "window" ? 1.2 : 2.1;
  return Math.max(0, widthM * heightM);
}

function manualFloorAreaM2(detections: Detection[], metersPerPixel: number) {
  return detections
    .filter((detection) => labelKind(detection.label) === "floor")
    .reduce(
      (sum, floor) =>
        sum +
        floorAreaPx(floor) * metersPerPixel * metersPerPixel,
      0,
    );
}

export function calculateBudget(
  detections: Detection[],
  _imageSize: ImageSize,
  metersPerPixel: number | null,
  _floorMaterialId: string,
) {
  if (!metersPerPixel) {
    return {
      lines: [] as BudgetLine[],
      subtotal: 0,
      hasScale: false,
      floorAreaM2: 0,
    };
  }

  const grouped = new Map<string, BudgetLine>();
  const add = (material: MaterialDefinition, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const existing = grouped.get(material.id);
    if (existing) {
      existing.quantity += quantity;
      existing.total = existing.quantity * existing.unitPrice;
      return;
    }
    grouped.set(material.id, {
      materialId: material.id,
      name: material.name,
      target: material.target,
      category: material.category,
      quantity,
      unit: material.unit,
      unitPrice: material.price,
      total: quantity * material.price,
    });
  };

  detections.forEach((detection) => {
    const target = targetForDetection(detection);
    if (!target) return;
    if (target === "wall") {
      const oneSideArea = wallLengthPx(detection) * metersPerPixel * wallHeightM(detection);
      const covered = (detection.wallFinishes ?? []).reduce((sum, finish) => {
        const fraction = Math.max(0, finish.end - finish.start);
        add(materialById(finish.materialId, "wall"), oneSideArea * fraction);
        return sum + fraction;
      }, 0);
      if (detection.materialApplied && detection.materialId) add(materialById(detection.materialId, "wall"), oneSideArea * Math.max(0, 2 - covered));
      return;
    }
    if (target === "floor" && detection.floorTiles?.some(tile => tile.pieceId)) {
      detection.floorTiles.forEach(tile => {
        const materialId = tile.pieceId ? tile.materialId : detection.materialId;
        const applied = tile.pieceId ? tile.materialApplied : detection.materialApplied;
        if (applied && materialId) add(materialById(materialId, "floor"),
          (tile.x2-tile.x1) * (tile.y2-tile.y1) * detection.box.width * detection.box.height * metersPerPixel * metersPerPixel);
      });
      return;
    }
    // The initial generated model uses preview materials only. Add a BOQ line
    // after the user explicitly applies a finish to the object.
    if (detection.materialApplied !== true || !detection.materialId) return;
    const material = materialById(detection.materialId, target);
    if (target === "door") {
      add(material, 1);
    } else if (target === "window") {
      add(material, openingAreaM2(detection, metersPerPixel));
    } else if (target === "furniture") {
      add(material, 1);
    } else {
      const area =
        (target === "floor" ? floorAreaPx(detection) : detection.box.width * detection.box.height) *
        metersPerPixel * metersPerPixel;
      add(material, area);
    }
  });

  const floorAreaM2 = manualFloorAreaM2(detections, metersPerPixel);

  const lines = Array.from(grouped.values()).map((line) => ({
    ...line,
    quantity: Number(line.quantity.toFixed(2)),
    total: Math.round(line.total),
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  return { lines, subtotal, hasScale: true, floorAreaM2 };
}
