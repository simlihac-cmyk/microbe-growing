export type Mode = "easy" | "hard";

export type MaterialId =
  | "simpleSaccharide"
  | "angryGlucose"
  | "unknownGene"
  | "lpxO"
  | "cellWall"
  | "adaptiveGene"
  | "mitochondria"
  | "hostNutrients"
  | "unidentifiedMatter";

export type StoredOrganismLevel = 19 | 21 | 22;

export type EnhanceCost =
  | { kind: "atp"; amount: number }
  | { kind: "material"; material: MaterialId; amount: number }
  | { kind: "storedOrganism"; level: StoredOrganismLevel; amount: number }
  | { kind: "free" }
  | { kind: "none" };

export interface OrganismStage {
  level: number;
  name: string;
  cost: EnhanceCost;
  successRate: number | null;
  salePrice: number | null;
  protectCost: number | null;
  drop: MaterialId | null;
  storable?: boolean;
}

export interface CombineRecipe {
  id: string;
  label: string;
  material: MaterialId;
  hardAmount: number;
  easyAmount: number;
  reward:
    | { kind: "protect"; amount: number; easyAmount?: number; hardAmount?: number }
    | { kind: "organism"; level: number };
}

export interface ShopItem {
  id: string;
  label: string;
  description: string;
  prices: Record<Mode, number>;
  reward:
    | { kind: "protect"; amount: number }
    | { kind: "jump"; level: number; successRates: Record<Mode, number> };
}

export const INITIAL_ATP: Record<Mode, number> = {
  easy: 2_000,
  hard: 1_000,
};

export const MODE_LABEL: Record<Mode, string> = {
  easy: "easy",
  hard: "hard",
};

export const MATERIAL_LABEL: Record<MaterialId, string> = {
  simpleSaccharide: "하찮은 단당류",
  angryGlucose: "잔뜩화난 포도당",
  unknownGene: "알수없는 유전자",
  lpxO: "lpxO",
  cellWall: "세포벽",
  adaptiveGene: "적응유전자",
  mitochondria: "미토콘드리아",
  hostNutrients: "숙주의 영양분",
  unidentifiedMatter: "미확인 물질",
};

export const MATERIAL_ICON: Record<MaterialId, string> = {
  simpleSaccharide: "/materials/simple-saccharide.svg",
  angryGlucose: "/materials/angry-glucose.svg",
  unknownGene: "/materials/unknown-gene.svg",
  lpxO: "/materials/lpxo.svg",
  cellWall: "/materials/cell-wall.svg",
  adaptiveGene: "/materials/adaptive-gene.svg",
  mitochondria: "/materials/mitochondria.svg",
  hostNutrients: "/materials/host-nutrients.svg",
  unidentifiedMatter: "/materials/unidentified-matter.svg",
};

export const STORED_ORGANISM_LABEL: Record<StoredOrganismLevel, string> = {
  19: "고속증식 세균",
  21: "강독성 세균",
  22: "돌연변이 세균",
};

const atp = (amount: number): EnhanceCost => ({ kind: "atp", amount });
const material = (materialId: MaterialId, amount: number): EnhanceCost => ({
  kind: "material",
  material: materialId,
  amount,
});
const storedOrganism = (level: StoredOrganismLevel, amount: number): EnhanceCost => ({
  kind: "storedOrganism",
  level,
  amount,
});

export const HARD_STAGES: OrganismStage[] = [
  { level: 0, name: "미약한 미생물", cost: atp(0), successRate: 100, salePrice: null, protectCost: null, drop: null },
  { level: 1, name: "작은 미생물", cost: atp(1), successRate: 98, salePrice: null, protectCost: null, drop: null },
  { level: 2, name: "단순한 미생물", cost: atp(2), successRate: 95, salePrice: 1, protectCost: null, drop: null },
  { level: 3, name: "복잡한 미생물", cost: atp(4), successRate: 98, salePrice: 2, protectCost: null, drop: null },
  { level: 4, name: "귀여운 미생물", cost: atp(8), successRate: 95, salePrice: 4, protectCost: 1, drop: null },
  { level: 5, name: "기쁜 미생물", cost: atp(14), successRate: 91, salePrice: 12, protectCost: 1, drop: null },
  { level: 6, name: "슬픈 미생물", cost: atp(20), successRate: 86, salePrice: 30, protectCost: 1, drop: "simpleSaccharide" },
  { level: 7, name: "적응한 미생물", cost: atp(30), successRate: 80, salePrice: 50, protectCost: 1, drop: "simpleSaccharide" },
  { level: 8, name: "화난 미생물", cost: atp(44), successRate: 75, salePrice: 100, protectCost: 1, drop: "angryGlucose" },
  { level: 9, name: "극대노 미생물", cost: atp(60), successRate: 71, salePrice: 180, protectCost: 1, drop: "unknownGene" },
  { level: 10, name: "변이 미생물", cost: atp(60), successRate: 67, salePrice: 360, protectCost: 1, drop: "lpxO" },
  { level: 11, name: "악독한 세균", cost: atp(102), successRate: 66, salePrice: 1_000, protectCost: 1, drop: "lpxO" },
  { level: 12, name: "안정된 세균", cost: atp(140), successRate: 59, salePrice: 2_000, protectCost: 1, drop: "cellWall" },
  { level: 13, name: "강화된 세균", cost: atp(160), successRate: 55, salePrice: 4_000, protectCost: 2, drop: "adaptiveGene" },
  { level: 14, name: "환경적응 세균", cost: atp(200), successRate: 54, salePrice: 10_000, protectCost: 3, drop: "mitochondria" },
  { level: 15, name: "공생 세균", cost: atp(260), successRate: 51, salePrice: 20_000, protectCost: 4, drop: "mitochondria" },
  { level: 16, name: "기생 세균", cost: atp(340), successRate: 49, salePrice: 40_000, protectCost: 7, drop: "hostNutrients" },
  { level: 17, name: "공격형 세균", cost: atp(440), successRate: 45, salePrice: 89_000, protectCost: 9, drop: "unidentifiedMatter" },
  { level: 18, name: "내성 세균", cost: atp(600), successRate: 43, salePrice: 144_000, protectCost: 10, drop: null },
  { level: 19, name: "고속증식 세균", cost: atp(800), successRate: 40, salePrice: 240_000, protectCost: 12, drop: null, storable: true },
  { level: 20, name: "특이변종 세균", cost: atp(1_300), successRate: 38, salePrice: 480_000, protectCost: 15, drop: null },
  { level: 21, name: "강독성 세균", cost: storedOrganism(19, 1), successRate: 40, salePrice: 600_000, protectCost: 17, drop: null, storable: true },
  { level: 22, name: "돌연변이 세균", cost: storedOrganism(21, 2), successRate: 37, salePrice: 800_000, protectCost: 20, drop: null, storable: true },
  { level: 23, name: "폭주 세균", cost: material("mitochondria", 12), successRate: 37, salePrice: 1_100_000, protectCost: 22, drop: null },
  { level: 24, name: "방사능 세균", cost: storedOrganism(22, 1), successRate: 35, salePrice: 1_500_000, protectCost: 23, drop: null },
  { level: 25, name: "코로나", cost: material("hostNutrients", 15), successRate: 45, salePrice: 800_000, protectCost: 23, drop: null },
  { level: 26, name: "살모넬라", cost: atp(1_000), successRate: 60, salePrice: 3_600_000, protectCost: 50, drop: null },
  { level: 27, name: "비행 세균", cost: material("unidentifiedMatter", 2), successRate: 50, salePrice: 5_000_000, protectCost: 60, drop: null },
  { level: 28, name: "우주로간 세균", cost: { kind: "free" }, successRate: 25, salePrice: null, protectCost: 100, drop: null },
  { level: 29, name: "아스트로파지", cost: { kind: "none" }, successRate: null, salePrice: null, protectCost: null, drop: null },
];

export const EASY_STAGES: OrganismStage[] = [
  { level: 0, name: "미약한 미생물", cost: atp(1), successRate: 100, salePrice: 1, protectCost: null, drop: null },
  { level: 1, name: "작은 미생물", cost: atp(1), successRate: 100, salePrice: 1, protectCost: null, drop: null },
  { level: 2, name: "단순한 미생물", cost: atp(1), successRate: 100, salePrice: 1, protectCost: null, drop: null },
  { level: 3, name: "복잡한 미생물", cost: atp(1), successRate: 95, salePrice: 1, protectCost: null, drop: null },
  { level: 4, name: "귀여운 미생물", cost: atp(2), successRate: 95, salePrice: 2, protectCost: 1, drop: null },
  { level: 5, name: "기쁜 미생물", cost: atp(3), successRate: 95, salePrice: 4, protectCost: 1, drop: null },
  { level: 6, name: "슬픈 미생물", cost: atp(4), successRate: 95, salePrice: 7, protectCost: 1, drop: "simpleSaccharide" },
  { level: 7, name: "적응한 미생물", cost: atp(4), successRate: 95, salePrice: 12, protectCost: 1, drop: "simpleSaccharide" },
  { level: 8, name: "화난 미생물", cost: atp(6), successRate: 90, salePrice: 20, protectCost: 1, drop: "angryGlucose" },
  { level: 9, name: "극대노 미생물", cost: atp(10), successRate: 85, salePrice: 40, protectCost: 1, drop: "unknownGene" },
  { level: 10, name: "변이 미생물", cost: atp(22), successRate: 85, salePrice: 70, protectCost: 1, drop: "lpxO" },
  { level: 11, name: "악독한 세균", cost: atp(40), successRate: 80, salePrice: 320, protectCost: 1, drop: "lpxO" },
  { level: 12, name: "안정된 세균", cost: atp(70), successRate: 75, salePrice: 700, protectCost: 1, drop: "cellWall" },
  { level: 13, name: "강화된 세균", cost: atp(110), successRate: 75, salePrice: 2_000, protectCost: 2, drop: "adaptiveGene" },
  { level: 14, name: "환경적응 세균", cost: atp(200), successRate: 70, salePrice: 6_000, protectCost: 3, drop: "mitochondria" },
  { level: 15, name: "공생 세균", cost: atp(360), successRate: 65, salePrice: 15_000, protectCost: 4, drop: "mitochondria" },
  { level: 16, name: "기생 세균", cost: atp(600), successRate: 65, salePrice: 28_400, protectCost: 7, drop: "hostNutrients" },
  { level: 17, name: "공격형 세균", cost: atp(600), successRate: 60, salePrice: 40_000, protectCost: 9, drop: "unidentifiedMatter" },
  { level: 18, name: "내성 세균", cost: atp(1_000), successRate: 55, salePrice: 60_000, protectCost: 10, drop: null },
  { level: 19, name: "고속증식 세균", cost: atp(1_600), successRate: 55, salePrice: 95_000, protectCost: 12, drop: null, storable: true },
  { level: 20, name: "특이변종 세균", cost: atp(3_000), successRate: 50, salePrice: 136_600, protectCost: 15, drop: null },
  { level: 21, name: "강독성 세균", cost: storedOrganism(19, 1), successRate: 50, salePrice: 202_000, protectCost: 17, drop: null, storable: true },
  { level: 22, name: "돌연변이 세균", cost: storedOrganism(21, 2), successRate: 50, salePrice: 320_000, protectCost: 20, drop: null, storable: true },
  { level: 23, name: "폭주 세균", cost: material("mitochondria", 8), successRate: 50, salePrice: 460_000, protectCost: 22, drop: null },
  { level: 24, name: "방사능 세균", cost: storedOrganism(22, 1), successRate: 50, salePrice: 600_000, protectCost: 23, drop: null },
  { level: 25, name: "코로나", cost: material("hostNutrients", 15), successRate: 45, salePrice: 800_000, protectCost: 23, drop: null },
  { level: 26, name: "살모넬라", cost: atp(10_000), successRate: 60, salePrice: 3_600_000, protectCost: 50, drop: null },
  { level: 27, name: "비행 세균", cost: material("unidentifiedMatter", 2), successRate: 50, salePrice: 5_000_000, protectCost: 60, drop: null },
  { level: 28, name: "우주로간 세균", cost: { kind: "free" }, successRate: 25, salePrice: null, protectCost: 100, drop: null },
  { level: 29, name: "아스트로파지", cost: { kind: "none" }, successRate: null, salePrice: null, protectCost: null, drop: null },
];

export const STAGES: Record<Mode, OrganismStage[]> = {
  easy: EASY_STAGES,
  hard: HARD_STAGES,
};

export const MATERIAL_IDS: MaterialId[] = [
  "simpleSaccharide",
  "angryGlucose",
  "unknownGene",
  "lpxO",
  "cellWall",
  "adaptiveGene",
  "mitochondria",
  "hostNutrients",
  "unidentifiedMatter",
];

export const STORED_ORGANISM_LEVELS: StoredOrganismLevel[] = [19, 21, 22];

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "protect-1",
    label: "방지권 1개",
    description: "실패한 미생물을 되살림",
    prices: { hard: 4_200, easy: 2_000 },
    reward: { kind: "protect", amount: 1 },
  },
  {
    id: "protect-3",
    label: "방지권 3개",
    description: "실패한 미생물을 되살림",
    prices: { hard: 12_000, easy: 5_000 },
    reward: { kind: "protect", amount: 3 },
  },
  {
    id: "protect-30",
    label: "방지권 30개",
    description: "실패한 미생물을 되살림",
    prices: { hard: 45_000, easy: 45_000 },
    reward: { kind: "protect", amount: 30 },
  },
  {
    id: "protect-300",
    label: "방지권 300개",
    description: "실패한 미생물을 되살림",
    prices: { hard: 430_000, easy: 430_000 },
    reward: { kind: "protect", amount: 300 },
  },
  {
    id: "jump-9",
    label: "+9단계 배양 시작권",
    description: "극대노 미생물 상태로 시작",
    prices: { hard: 1_600, easy: 2_000 },
    reward: { kind: "jump", level: 9, successRates: { hard: 71, easy: 85 } },
  },
  {
    id: "jump-13",
    label: "+13단계 배양 시작권",
    description: "강화된 세균 상태로 시작",
    prices: { hard: 10_000, easy: 14_000 },
    reward: { kind: "jump", level: 13, successRates: { hard: 55, easy: 75 } },
  },
  {
    id: "jump-14",
    label: "+14단계 배양 시작권",
    description: "환경적응 세균 상태로 시작",
    prices: { hard: 15_000, easy: 20_000 },
    reward: { kind: "jump", level: 14, successRates: { hard: 54, easy: 70 } },
  },
  {
    id: "jump-15",
    label: "+15단계 배양 시작권",
    description: "공생 세균 상태로 시작",
    prices: { hard: 20_000, easy: 30_000 },
    reward: { kind: "jump", level: 15, successRates: { hard: 51, easy: 65 } },
  },
];

export const COMBINE_RECIPES: CombineRecipe[] = [
  {
    id: "saccharide-to-protect",
    label: "단당류로 방지권",
    material: "simpleSaccharide",
    hardAmount: 8,
    easyAmount: 5,
    reward: { kind: "protect", amount: 1 },
  },
  {
    id: "glucose-to-protect",
    label: "포도당으로 방지권",
    material: "angryGlucose",
    hardAmount: 5,
    easyAmount: 3,
    reward: { kind: "protect", amount: 1 },
  },
  {
    id: "gene-to-organism",
    label: "유전자로 +13 강화된 세균",
    material: "unknownGene",
    hardAmount: 3,
    easyAmount: 2,
    reward: { kind: "organism", level: 13 },
  },
  {
    id: "lpxo-to-protect",
    label: "lpxO로 방지권",
    material: "lpxO",
    hardAmount: 5,
    easyAmount: 3,
    reward: { kind: "protect", amount: 2 },
  },
  {
    id: "cellwall-to-organism",
    label: "세포벽으로 +16 기생 세균",
    material: "cellWall",
    hardAmount: 2,
    easyAmount: 2,
    reward: { kind: "organism", level: 16 },
  },
  {
    id: "adaptive-to-protect",
    label: "적응유전자로 방지권",
    material: "adaptiveGene",
    hardAmount: 4,
    easyAmount: 4,
    reward: { kind: "protect", amount: 4 },
  },
  {
    id: "mitochondria-to-organism",
    label: "미토콘드리아로 +19 고속증식 세균",
    material: "mitochondria",
    hardAmount: 4,
    easyAmount: 6,
    reward: { kind: "organism", level: 19 },
  },
];
