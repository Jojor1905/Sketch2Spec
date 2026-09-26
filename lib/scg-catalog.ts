/** Offline, manually verified reference records. No SCG request runs in the editor. */
export type ScgProduct = {
  id: string
  source: "SCG_HOME" | "SCG_CATALOG"
  brand: string
  productName: string
  sku?: string
  target: "floor" | "wall" | "door" | "window" | "ceiling"
  category: string
  dimensions?: { widthMm?: number; lengthMm?: number; thicknessMm?: number }
  sellUnit: "piece" | "box" | "m2" | "set"
  piecesPerPackage?: number
  coveragePerPackageM2?: number
  referencePrice?: number
  priceMin?: number
  priceMax?: number
  currency: "THB"
  sourceUrl: string
  lastCheckedAt: string
  /** Approximate local rendering hint; this is not a manufacturer texture. */
  preview: { color: string; style: "paint" | "concrete" | "wood-panel" | "tile-light" | "tile-dark" | "door-white" | "door-oak" | "glass-clear" | "glass-black" | "ceiling-plaster" | "ceiling-grid" }
}

const floorCatalog = "https://dam-production.scghome.com/%2Ffiles%2Fassets%2FProduct%20Application%20Media%2FBrochure%2FRT20250612-01%2FUNIX%20-%20Catalog%20UNIX%20Floorin%20Ver.2025%20minisize.pdf"
const wallCatalog = "https://dam-production.scghome.com/%2Ffiles%2Fassets%2FProduct%20Application%20Media%2FBrochure%2FRT20241207-04%2FCatalog-WallTile.pdf"
const doorCatalog = "https://dam-production.scghome.com/%2Ffiles%2Fassets%2FProduct%20Application%20Media%2FBrochure%2FBR20250730-01%2FUNIX%20-%20Door%20Catalog%202024.pdf"
const smartboardArticle = "https://www.scghome.com/living-ideas/articles/smartboard_scg_fiber_cement_price_update"
const paverPromotion = "https://www.scghome.com/promotions/Fastwork"
const windowsCatalog = "https://www.windsor.co.th/uploads/Aw_Windsor_Catalog_2023.pdf"
const checked = "2026-09-24"

export const SCG_PRODUCTS: ScgProduct[] = [
  { id:"scg-unix-sp106", source:"SCG_CATALOG", brand:"UNIX", productName:"UNIX SPC Light Oak", sku:"SP106", target:"floor", category:"SPC flooring", sellUnit:"box", currency:"THB", sourceUrl:floorCatalog, lastCheckedAt:checked, preview:{color:"#b99369",style:"wood-panel"} },
  { id:"scg-unix-spix111", source:"SCG_CATALOG", brand:"UNIX", productName:"UNIX SPC IXPE Amber 2.0", sku:"SPIX111", target:"floor", category:"SPC flooring", dimensions:{widthMm:183,lengthMm:1220,thicknessMm:5}, sellUnit:"box", piecesPerPackage:10, coveragePerPackageM2:2.2326, currency:"THB", sourceUrl:floorCatalog, lastCheckedAt:checked, preview:{color:"#a9784c",style:"wood-panel"} },
  { id:"scg-uvt-grey-cob9", source:"SCG_HOME", brand:"SCG", productName:"UVT Grey Marble COB-9", target:"floor", category:"Outdoor concrete paver", dimensions:{widthMm:400,lengthMm:400,thicknessMm:35}, sellUnit:"piece", priceMin:108, priceMax:118, currency:"THB", sourceUrl:paverPromotion, lastCheckedAt:checked, preview:{color:"#92969a",style:"tile-light"} },
  { id:"scg-uvt-brown-cob9", source:"SCG_HOME", brand:"SCG", productName:"UVT Brown Marble COB-9", target:"floor", category:"Outdoor concrete paver", dimensions:{widthMm:400,lengthMm:400,thicknessMm:35}, sellUnit:"piece", priceMin:97, priceMax:113, currency:"THB", sourceUrl:paverPromotion, lastCheckedAt:checked, preview:{color:"#8c7561",style:"tile-dark"} },
  { id:"scg-grit-charcoal", source:"SCG_CATALOG", brand:"SCG", productName:"True Sensation GRIT Charcoal Black", target:"wall", category:"Decorative wall tile", dimensions:{widthMm:62.5,lengthMm:200,thicknessMm:15}, sellUnit:"box", piecesPerPackage:40, coveragePerPackageM2:0.5, currency:"THB", sourceUrl:wallCatalog, lastCheckedAt:checked, preview:{color:"#42464a",style:"concrete"} },
  { id:"scg-grit-honey", source:"SCG_CATALOG", brand:"SCG", productName:"True Sensation GRIT Honey Brown", target:"wall", category:"Decorative wall tile", dimensions:{widthMm:62.5,lengthMm:200,thicknessMm:15}, sellUnit:"box", piecesPerPackage:40, coveragePerPackageM2:0.5, currency:"THB", sourceUrl:wallCatalog, lastCheckedAt:checked, preview:{color:"#9a7154",style:"concrete"} },
  { id:"scg-unix-p03c", source:"SCG_CATALOG", brand:"UNIX", productName:"UNIX HDF Super Ratchaphruek", sku:"P03C", target:"door", category:"HDF interior door", sellUnit:"piece", currency:"THB", sourceUrl:doorCatalog, lastCheckedAt:checked, preview:{color:"#e6e2d9",style:"door-white"} },
  { id:"scg-unix-p02c", source:"SCG_CATALOG", brand:"UNIX", productName:"UNIX HDF Extra Phet Phailin", sku:"P02C", target:"door", category:"HDF interior door", sellUnit:"piece", currency:"THB", sourceUrl:doorCatalog, lastCheckedAt:checked, preview:{color:"#d5b48c",style:"door-oak"} },
  { id:"scg-windsor-signature-sliding", source:"SCG_CATALOG", brand:"WINDSOR", productName:"WINDSOR Signature two-panel sliding window", target:"window", category:"Vinyl sliding window", sellUnit:"set", currency:"THB", sourceUrl:windowsCatalog, lastCheckedAt:checked, preview:{color:"#c7d4d8",style:"glass-clear"} },
  { id:"scg-windsor-signature-casement", source:"SCG_CATALOG", brand:"WINDSOR", productName:"WINDSOR Signature single casement window", target:"window", category:"Vinyl casement window", sellUnit:"set", currency:"THB", sourceUrl:windowsCatalog, lastCheckedAt:checked, preview:{color:"#a9bdc5",style:"glass-black"} },
  { id:"scg-smartboard-groove3", source:"SCG_HOME", brand:"SCG", productName:"Smartboard 3-inch groove cement ceiling", target:"ceiling", category:"Smartboard ceiling", dimensions:{widthMm:600,lengthMm:1200,thicknessMm:4}, sellUnit:"piece", priceMin:52, priceMax:69.5, currency:"THB", sourceUrl:smartboardArticle, lastCheckedAt:checked, preview:{color:"#d8d5ce",style:"ceiling-grid"} },
  { id:"scg-smartboard-wood-vent", source:"SCG_HOME", brand:"SCG", productName:"Smartboard wood-grain ventilated Protection ceiling", target:"ceiling", category:"Smartboard ceiling", sellUnit:"piece", priceMin:79, priceMax:98, currency:"THB", sourceUrl:smartboardArticle, lastCheckedAt:checked, preview:{color:"#b4936e",style:"ceiling-plaster"} },
]
