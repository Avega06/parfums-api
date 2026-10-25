import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const PERFUMES_FILE = path.join(ROOT, "datasets", "perfumes.jsonl")
const PARFUM_FILE = path.join(ROOT, "datasets", "parfum.json")
const OUT_FILE = path.join(ROOT, "datasets", "parfum-matched.json")

const STOP = new Set(
  `perfume perfumes parfum parfums eau de edp edt extrait set tester testers decant ml mils milliliters
   hombre mujer unisex men women man woman homme femme body mist spray lotion deo recargable refill
   nuevo formato sin tapa edicion especial special edition collection coleccion limited vintage
   original intense extreme por pour for with the and of a an & x s y e el la los las en mas plus no n
   by volume des les aux du et sur le is in on to at new
   2026 2025 2024 2023 2022 2021 2020 2019 2018 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008
   2007 2006 2005 2004 2003 2002 2001 2000 1999 1998 1997 1996 1995 1994`.split(/\s+/),
)

const CATALOG_CODE = /^[a-z]+[0-9]{2,}$/

type AnyRec = Record<string, unknown> & { [k: string]: any }

interface FragRec {
  id: unknown
  brand: string
  name: string
  nameNorm: string
  nameTokenSet: Set<string>
  rawTokenCount: number
  year: unknown
  gender: unknown
  longevity: unknown
  sillage: unknown
  notes: unknown
}

interface BrandIndex {
  key: string
  tokens: string[]
  display: string
  displayNorm: string
  displayNormSpace: string
  displayNoSpace: string
  recs: FragRec[]
}

function norm(s: unknown): string {
  if (s === null || s === undefined) return ""
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()
}

function rawTokens(s: unknown): string[] {
  return norm(s).split(/\s+/).filter(Boolean)
}

function tokens(s: string, stripStop = true): string[] {
  const out: string[] = []
  for (const t of rawTokens(s)) {
    if (CATALOG_CODE.test(t)) continue
    if (stripStop && (STOP.has(t) || t.length < 2 || /^\d+$/.test(t))) continue
    out.push(t)
  }
  return out
}

function normSpaced(s: unknown): string {
  return norm(s).replaceAll("&", " ").split(/\s+/).filter(Boolean).join(" ")
}

function pickNote(n: any): { name: string | null; name_es: string | null; image_id: string | null } {
  return {
    name: n?.name ?? null,
    name_es: n?.name_es ?? null,
    image_id: n?.image_id ?? null,
  }
}

function mapNotes(notes: any): any {
  if (!notes || typeof notes !== "object") return null
  const tiered = notes.tiered
  return {
    tiered: tiered
      ? {
          top: Array.isArray(tiered.top) ? tiered.top.map(pickNote) : [],
          middle: Array.isArray(tiered.middle) ? tiered.middle.map(pickNote) : [],
          base: Array.isArray(tiered.base) ? tiered.base.map(pickNote) : [],
        }
      : null,
    flat: Array.isArray(notes.flat) ? notes.flat.map(pickNote) : [],
  }
}

async function indexPerfumes(): Promise<{
  index: Map<string, BrandIndex>
  wordToBrand: Map<string, Set<string>>
  aliases: Map<string, string>
  aliasLen: Map<string, number>
  brandKeys: string[]
  fallback: Record<string, string>
}> {
  const index = new Map<string, BrandIndex>()
  const wordToBrand = new Map<string, Set<string>>()
  const rl = createInterface({
    input: createReadStream(PERFUMES_FILE, { encoding: "utf8" }),
    crlfDelay: Infinity,
  })

  let count = 0
  for await (const line of rl) {
    if (!line.trim()) continue
    let rec: AnyRec
    try {
      rec = JSON.parse(line) as AnyRec
    } catch {
      continue
    }
    const brandToks = tokens(normSpaced(rec.brand))
    if (brandToks.length === 0) continue
    const key = brandToks.join("\u0001")
    const frag: FragRec = {
      id: rec.id ?? null,
      brand: rec.brand ?? "",
      name: rec.name ?? "",
      nameNorm: norm(rec.name),
      nameTokenSet: new Set(tokens(rec.name)),
      rawTokenCount: rawTokens(rec.name).length,
      year: rec.year ?? null,
      gender: rec.gender ?? null,
      longevity: rec.longevity ?? null,
      sillage: rec.sillage ?? null,
      notes: rec.notes ?? null,
    }
    let b = index.get(key)
    if (!b) {
      const disp = String(rec.brand ?? "")
      const dispNorm = norm(disp)
      b = {
        key,
        tokens: brandToks,
        display: disp,
        displayNorm: dispNorm,
        displayNormSpace: normSpaced(disp),
        displayNoSpace: normSpaced(disp).replace(/ /g, ""),
        recs: [],
      }
      index.set(key, b)
      for (const w of brandToks) {
        let s = wordToBrand.get(w)
        if (!s) {
          s = new Set()
          wordToBrand.set(w, s)
        }
        s.add(key)
      }
    }
    b.recs.push(frag)
    count++
  }
  console.log(`indexed ${count} perfume records, ${index.size} brands`)

  const brandDrop = new Set([
    "perfumes", "parfums", "parfum", "perfume", "international", "fragrances",
    "fragrance", "the", "co", "laboratories", "collection", "company", "designer", "house",
  ])
  const aliases = new Map<string, string>()
  const aliasLen = new Map<string, number>()
  for (const b of index.values()) {
    const minimal = b.tokens.filter((t) => !brandDrop.has(t)).sort()
    if (minimal.length === 1) {
      const t = minimal[0]
      if (t.length >= 4 && (!aliases.has(t) || b.displayNorm.length > (aliasLen.get(t) ?? 0))) {
        aliases.set(t, b.key)
        aliasLen.set(t, b.displayNorm.length)
      }
    }
  }

  const fallback: Record<string, string> = {}
  const candidates: Array<[string, string]> = [
    ["ysl", "yves saint laurent"],
    ["lhomme", "yves saint laurent"],
    ["amor", "cacharel"],
    ["rasasi", "rasasi"],
    ["rassasi", "rasasi"],
  ]
  for (const [token, phrase] of candidates) {
    const k = phrase.split(" ").join("\u0001")
    if (index.has(k)) fallback[token] = k
  }

  const brandKeys = [...index.keys()]
  return { index, wordToBrand, aliases, aliasLen, brandKeys, fallback: fallback as Record<string, string> }
}

interface DetectCtx {
  index: Map<string, BrandIndex>
  wordToBrand: Map<string, Set<string>>
  aliases: Map<string, string>
  aliasLen: Map<string, number>
  brandKeys: string[]
  fallback: Record<string, string>
}

function detectBrand(pname: string, ctx: Awaited<DetectCtx>): string | null {
  const { index, wordToBrand, aliases, aliasLen, brandKeys, fallback } = ctx
  const pstr = ` ${norm(pname)} `
  const pstrNoSpace = normSpaced(pname).replace(/ /g, "")
  const pt = tokens(pname)
  const ptSet = new Set(pt)

  let bestConcat: string | null = null
  let bestConcatLen = 0
  for (const key of brandKeys) {
    const b = index.get(key)!
    const dno = b.displayNoSpace
    if (dno.length < 5) continue
    if (pstrNoSpace.includes(dno) && dno.length > bestConcatLen) {
      bestConcat = key
      bestConcatLen = dno.length
    }
  }
  if (bestConcat) return bestConcat

  let phrase: string | null = null
  let phraseLen = 0
  for (const key of brandKeys) {
    const b = index.get(key)!
    if (b.tokens.length < 2) continue
    const dstr = b.displayNormSpace
    if (dstr && pstr.includes(` ${dstr} `) && dstr.length > phraseLen) {
      phrase = key
      phraseLen = dstr.length
    }
  }
  if (phrase) return phrase

  let alias: string | null = null
  let aliasScore = -1
  for (let i = 0; i < pt.length; i++) {
    const t = pt[i]
    const k = aliases.get(t)
    if (k) {
      const score = (aliasLen.get(t) ?? 0) - i * 4
      if (score > aliasScore) {
        alias = k
        aliasScore = score
      }
    }
  }
  if (alias) return alias

  const base = new Set<string>()
  for (const t of pt) {
    const s = wordToBrand.get(t)
    if (s) for (const k of s) base.add(k)
  }

  const singleOk = (b: BrandIndex) => b.tokens.length > 1 || b.tokens[0].length >= 4

  let best: string | null = null
  let bestScore = -1
  let bestNegLen = 0
  for (const key of base) {
    const b = index.get(key)!
    if (!singleOk(b)) continue
    const bw = new Set(b.tokens)
    let covered = true
    for (const t of bw) if (!ptSet.has(t)) { covered = false; break }
    if (!covered) continue
    const sc = b.tokens.length
    const negLen = -b.displayNorm.length
    if (sc > bestScore || (sc === bestScore && negLen < bestNegLen)) {
      best = key
      bestScore = sc
      bestNegLen = negLen
    }
  }
  if (best) return best

  best = null
  bestScore = -1
  let bestFrac = 0
  for (const key of base) {
    const b = index.get(key)!
    if (!singleOk(b)) continue
    const present: string[] = []
    for (const t of b.tokens) if (ptSet.has(t)) present.push(t)
    if (present.length === 0) continue
    const frac = present.length / b.tokens.length
    const need = b.tokens.length <= 2 ? 0.5 : 0.67
    if (frac < need) continue
    const sc = present.reduce((a, t) => a + t.length, 0)
    const negLen = -b.displayNorm.length
    if (sc > bestScore || (sc === bestScore && (negLen < bestNegLen || (negLen === bestNegLen && frac > bestFrac)))) {
      best = key
      bestScore = sc
      bestNegLen = negLen
      bestFrac = frac
    }
  }
  if (best) return best

  for (const t of pt) if (fallback[t]) return fallback[t]
  return null
}

function productNorm(pname: string, key: string, ctx: Awaited<DetectCtx>): string {
  const b = ctx.index.get(key)!
  const p2 = normSpaced(pname)
  const d2 = b.displayNormSpace
  const i = d2 ? p2.indexOf(d2) : -1
  if (i >= 0) {
    return `${p2.slice(0, i)} ${p2.slice(i + d2.length)}`.split(/\s+/).filter(Boolean).join(" ")
  }
  const bw = new Set(b.tokens)
  return p2.split(/\s+/).filter((w) => !bw.has(w)).join(" ")
}

function scoreRec(pt: string[], ptSet: Set<string>, frag: FragRec, brandWords: Set<string>, nprod: string) {
  if (frag.nameTokenSet.size === 0) return null
  let inter = 0
  let weight = 0
  let hasProduct = 0
  for (const t of pt) {
    if (frag.nameTokenSet.has(t)) {
      inter++
      weight += t.length
      if (!brandWords.has(t)) hasProduct = 1
    }
  }
  if (inter === 0) return null
  const cp = inter / pt.length
  const cn = inter / frag.nameTokenSet.size
  let raw = 0
  if (frag.nameNorm && frag.nameNorm === nprod) raw = 2
  else if (frag.nameNorm && nprod && nprod.includes(frag.nameNorm)) raw = 1.2
  const score = cp + cn + 0.8 * hasProduct + raw
  return { cp, cn, weight, hasProduct, raw, score }
}

function confFor(cp: number, cn: number): "high" | "medium" | "low" | null {
  if (cp < 0.25 || cn < 0.35) return null
  if (cp >= 0.4 && cn >= 0.5) return "high"
  if (cp >= 0.3 && cn >= 0.45) return "medium"
  return "low"
}

function enrich(b: BrandIndex, frag: FragRec): any {
  return {
    id: frag.id,
    brand: frag.brand,
    name: frag.name,
    year: frag.year,
    gender: frag.gender,
    longevity: frag.longevity,
    sillage: frag.sillage,
    notes: mapNotes(frag.notes),
  }
}

async function main() {
  const t0 = performance.now()
  const ctx = await indexPerfumes()
  const raw = await readFile(PARFUM_FILE, "utf8")
  const parfums = JSON.parse(raw) as AnyRec[]
  console.log(`parfums: ${parfums.length}`)

  const out: AnyRec[] = []
  let matched = 0
  const confCounts = { high: 0, medium: 0, low: 0 } as Record<string, number>
  const unmatchedReasons: Record<"noBrand" | "noOverlap" | "weak", number> = { noBrand: 0, noOverlap: 0, weak: 0 }
  const samples: AnyRec[] = []
  const nulls: AnyRec[] = []

  for (const p of parfums) {
    const pname = String(p.name ?? "")
    const pt = tokens(pname)
    const ptSet = new Set(pt)
    const key = detectBrand(pname, ctx)
    const b = key ? ctx.index.get(key) : undefined
    let fragrantica: any = null
    let confidence: string | null = null
    let reason = "noBrand"

    if (key && b) {
      const nprod = productNorm(pname, key, ctx)
      const brandWords = new Set(b.tokens)
      let best: FragRec | null = null
      let bestKey: [number, number, number, number] | null = null
      for (const frag of b.recs) {
        const r = scoreRec(pt, ptSet, frag, brandWords, nprod)
        if (!r) continue
        const s: [number, number, number, number] = [
          r.score,
          r.cn,
          -frag.rawTokenCount,
          r.weight,
        ]
        if (
          bestKey === null ||
          s[0] > bestKey[0] ||
          (s[0] === bestKey[0] && s[1] > bestKey[1]) ||
          (s[0] === bestKey[0] && s[1] === bestKey[1] && s[2] > bestKey[2])
        ) {
          bestKey = s
          best = frag
        }
      }
      if (!best) {
        reason = "noOverlap"
      } else {
        const r = scoreRec(pt, ptSet, best, brandWords, nprod)!
        const conf = confFor(r.cp, r.cn)
        if (!conf) {
          reason = "weak"
        } else {
          reason = "ok"
          confidence = conf
          fragrantica = enrich(b, best)
          matched++
          confCounts[conf]++
          if (samples.length < 15) samples.push({ name: pname, brand: b.display, match: `${fragrantica.brand} / ${fragrantica.name}`, conf })
        }
      }
    }

    if (!fragrantica) {
      if (reason === "noBrand") unmatchedReasons.noBrand++
      else if (reason === "noOverlap") unmatchedReasons.noOverlap++
      else unmatchedReasons.weak++
      if (nulls.length < 15) nulls.push({ name: pname, brand: b?.display ?? null, reason })
    }

    out.push({
      ...p,
      fragrantica,
      confidence,
    })
  }

  await writeFile(OUT_FILE, JSON.stringify(out, null, 2))
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1)
  console.log(`\nwrote ${OUT_FILE} (${out.length} rows) in ${elapsed}s`)
  console.log(`matched: ${matched}  (high ${confCounts.high}, medium ${confCounts.medium}, low ${confCounts.low})`)
  console.log(`unmatched: ${parfums.length - matched}  (noBrand ${unmatchedReasons.noBrand}, noOverlap ${unmatchedReasons.noOverlap}, weak ${unmatchedReasons.weak})`)
  console.log("\n--- matched samples ---")
  for (const s of samples) console.log(`  [${s.conf}] ${s.name}  =>  ${s.match}`)
  console.log("\n--- unmatched samples ---")
  for (const s of nulls) console.log(`  [${s.reason}] ${s.name}  (brand: ${s.brand ?? "-"})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})