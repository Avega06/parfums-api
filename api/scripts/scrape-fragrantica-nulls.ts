import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"

const ROOT = path.resolve(import.meta.dir, "..")
const PERFUMES_FILE = path.join(ROOT, "datasets", "perfumes.jsonl")
const PARFUM_FILE = path.join(ROOT, "datasets", "parfum-matched.json")
const RESULTS_FILE = path.join(ROOT, "datasets", "parfum-nulls-results.json")
const REPORT_FILE = path.join(ROOT, "datasets", "parfum-matched.report.json")

const STATE_FILE = process.env.PLAYWRIGHT_STATE ?? "/tmp/opencode/pw-state.json"
const APP_ID = "FGVI612DFZ"
const INDEX = "fragrantica_perfumes"
const DSN = `https://${APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const BATCH = 20
const DELAY_MS = 350
const HITS = 50

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const val = (f: string) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const APPLY = has("--apply")
const LIMIT = val("--limit") ? Number(val("--limit")) : Infinity

const STOP = new Set(
  `perfume perfumes parfum parfums eau de edp edt extrait set tester testers decant ml mils milliliters
   hombre mujer unisex men women man woman homme femme body mist spray lotion deo recargable refill
   nuevo formato sin tapa edicion especial special edition collection coleccion limited vintage
   original intense extreme por pour for with the and of a an & x s y e el la los las en mas plus no n
   by volume des les aux du et sur le is in on to at new
   2026 2025 2024 2023 2022 2021 2020 2019 2018 2017 2016 2015 2014 2013 2012 2011 2010 2009 2008
   2007 2006 2005 2004 2003 2002 2001 2000 1999 1998 1997 1996 1995 1994`.split(/\s+/),
)

// palabras que describen el formato fisico del producto: si el candidato tiene
// una y el nombre de la tienda no, son productos distintos
const FORMAT_WORDS = new Set(
  `body mist spray sprays splash decant decanted decants tester testers refill refillable lotion deo deodorant
   mini travel gift aftershave shower rollon discovery`.split(/\s+/),
)

// conectores que se ignoran al detectar la marca: "dolce and gabbana" ~ "Dolce&Gabbana"
const CONNECTORS = new Set(
  `and y the of de la le du des e a et les`.split(/\s+/),
)

function collapseConnectors(toks: string[]): string[] {
  return toks.filter((t) => !CONNECTORS.has(t))
}

const NOISE = new Set(
  `edicion especial edicion limitada edition special limited coleccion collection
   hombre mujer hombres mujeres unisex para for tester demo original nuevo
   men women man woman homme femme dame ladies gents gentleman`.split(/\s+/),
)

const CLONE_RE =
  /\b(inspiracion|inspirada en|inspirado en|inspired by|similar a|imitacion|duplicado de|equivalente a|replica|clon|clone)\b/i
const BUNDLE_RE = /(\+)|(\b\d+(?:[.,]\d+)?\s*(?:ml|oz|cl)\b.*\b\d+(?:[.,]\d+)?\s*(?:ml|oz|cl)\b)/i
const CATALOG_CODE = /^[a-z]+[0-9]{2,}$/

type AnyRec = Record<string, unknown> & { [k: string]: any }

interface Hit {
  id: number
  naslov: string
  dizajner: string
  godina: number | null
}

interface Verdict {
  parfum_id: string
  shop_name: string
  shop_brand: string | null
  shop_product: string
  query: string
  round: number
  reason: string
  score: number
  confidence: "high" | "medium" | "low" | null
  hit: { id: number; name: string; brand: string; year: number | null } | null
  alternates: Array<{
    id: number
    name: string
    brand: string
    score: number
    cp?: number
    cn?: number
    brandFrac?: number
    matched?: number
    lead?: number
    extra?: number
    order?: number
    conf?: string | null
  }>
}

interface BrandEntry {
  display: string
  tokens: string[]
  count: number
  prefix: boolean
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

function normSpaced(s: unknown): string {
  return norm(s)
    .replaceAll("&", " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
}

function rawTokens(s: unknown): string[] {
  return normSpaced(s).split(/\s+/).filter(Boolean)
}

function tokens(s: string): string[] {
  const out: string[] = []
  for (const t of rawTokens(s)) {
    if (CATALOG_CODE.test(t)) continue
    if (t.length < 2) continue
    if (STOP.has(t) || /^\d+$/.test(t)) continue
    out.push(t)
  }
  return out
}

function hasSequence(phrase: string[], seq: string[]): boolean {
  if (phrase.length === 0 || phrase.length > seq.length) return false
  outer: for (let i = 0; i + phrase.length <= seq.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (seq[i + j] !== phrase[j]) continue outer
    }
    return true
  }
  return false
}

function buildNoteEs(products: AnyRec[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>()
  for (const p of products) {
    const n = p.fragrantica?.notes
    if (!n) continue
    for (const note of [
      ...(n.tiered?.top ?? []),
      ...(n.tiered?.middle ?? []),
      ...(n.tiered?.base ?? []),
      ...(n.flat ?? []),
    ]) {
      if (!note?.name || !note?.name_es) continue
      const key = norm(note.name)
      if (!key) continue
      let m = votes.get(key)
      if (!m) {
        m = new Map()
        votes.set(key, m)
      }
      m.set(note.name_es, (m.get(note.name_es) ?? 0) + 1)
    }
  }
  const out = new Map<string, string>()
  for (const [key, m] of votes) {
    let best: string | null = null
    let bestN = -1
    for (const [es, n] of m) {
      if (n > bestN || (n === bestN && best !== null && es.length < best.length)) {
        best = es
        bestN = n
      }
    }
    if (best) out.set(key, best)
  }
  return out
}

async function* streamJsonl() {
  const rl = createInterface({
    input: createReadStream(PERFUMES_FILE, { encoding: "utf8" }),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line) as AnyRec
    } catch {}
  }
}

async function scanCatalog(
  needed: Set<number>,
  keepFull: boolean
): Promise<{ brands: Map<string, BrandEntry>; full: Map<number, AnyRec> }> {
  const brands = new Map<string, BrandEntry>()
  const full = new Map<number, AnyRec>()
  let seen = 0
  for await (const rec of streamJsonl()) {
    seen++
    const brand = String(rec.brand ?? "")
    if (brand) {
      const key = normSpaced(brand)
      let b = brands.get(key)
      if (!b) {
        b = { display: brand, tokens: rawTokens(brand), count: 0, prefix: key === normSpaced(brand) }
        brands.set(key, b)
      }
      b.count++
    }
    if (needed.size === 0) continue
    const id = Number(rec.id)
    if (!Number.isFinite(id) || !needed.has(id)) continue
    if (!rec.notes?.tiered || !Array.isArray(rec.notes?.flat) || !rec.longevity || !rec.sillage) continue
    if (keepFull) full.set(id, rec)
  }
  console.log(
    `catalog: scanned ${seen} rows | ${brands.size} brands${needed.size ? ` | hydrated ${full.size}/${needed.size} ids` : ""}`
  )
  return { brands, full }
}

function detectShopBrand(name: string, brands: Map<string, BrandEntry>): BrandEntry | null {
  const seq = collapseConnectors(rawTokens(name))
  let best: BrandEntry | null = null
  const better = (b: BrandEntry) => {
    if (best === null) return true
    if (b.prefix !== best.prefix) return b.prefix
    if (b.tokens.length !== best.tokens.length) return b.tokens.length > best.tokens.length
    if (b.count !== best.count) return b.count > best.count
    return b.display.length > best.display.length
  }
  for (const b of brands.values()) {
    if (b.tokens.length === 0) continue
    const bt = collapseConnectors(b.tokens)
    if (bt.length === 0) continue
    const isPrefix = hasSequence(bt, seq.slice(0, bt.length))
    if (!isPrefix && !hasSequence(bt, seq)) continue
    const entry: BrandEntry = { ...b, tokens: bt, prefix: isPrefix }
    if (better(entry)) best = entry
  }
  return best
}

function cleanShopName(shopName: string, brand: BrandEntry | null): string {
  let s = shopName
  s = s.replace(/\([^)]*\)/g, " ")
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|oz|cl|g|gr)\b\.?/gi, " ")
  s = s.replace(
    /\b(edicion|especial|limitada|edition|special|limited|hombre|mujer|unisex|para|tester|demo|perfume|original)\b/gi,
    " "
  )
  let toks = rawTokens(s)
  if (brand) {
    // la marca puede venir como "Dolce And Gabbana", "Dolce&Gabbana" o "Dolce Gabbana"
    const bt = collapseConnectors(brand.tokens)
    const map: number[] = []
    const seq: string[] = []
    for (let i = 0; i < toks.length; i++) {
      if (CONNECTORS.has(toks[i])) continue
      seq.push(toks[i])
      map.push(i)
    }
    for (let i = 0; i + bt.length <= seq.length; i++) {
      let ok = true
      for (let j = 0; j < bt.length; j++) {
        if (seq[i + j] !== bt[j]) {
          ok = false
          break
        }
      }
      if (ok) {
        const drop = new Set(map.slice(i, i + bt.length))
        toks = toks.filter((_, k) => !drop.has(k))
        break
      }
    }
  }
  // los conectores no aportan nada al nombre del producto
  return toks.filter((t) => !CONNECTORS.has(t)).join(" ")
}

function stripBrandGroups(toks: string[], groups: string[][]): string[] {
  // quita cualquier nombre de marca completo ("risala elite" aunque venga como
  // "elite risala") que contamine el nombre del producto; solo grupos >=2 tokens
  // para no borrar palabras comunes de una sola letra ("royal", "gold"...)
  let out = toks
  for (const g of groups) {
    if (g.length < 2 || g.length > out.length) continue
    const need = new Map<string, number>()
    for (const t of g) need.set(t, (need.get(t) ?? 0) + 1)
    const have = new Map<string, number>()
    for (const t of out) have.set(t, (have.get(t) ?? 0) + 1)
    let ok = true
    for (const [t, c] of need) if ((have.get(t) ?? 0) < c) {
      ok = false
      break
    }
    if (!ok) continue
    let r = out
    for (const t of g) {
      const idx = r.indexOf(t)
      if (idx >= 0) r = r.slice(0, idx).concat(r.slice(idx + 1))
    }
    out = r
  }
  return out
}

function productTokens(shopProduct: string, brand: BrandEntry | null, brandGroups: string[][]): string[] {
  const bt = new Set(brand ? brand.tokens : [])
  const seeded = []
  for (const t of tokens(shopProduct)) {
    if (bt.has(t)) continue
    if (NOISE.has(t)) continue
    seeded.push(t)
  }
  return stripBrandGroups(seeded, brandGroups)
}

function formatMismatch(shopName: string, candName: string): boolean {
  const s = new Set(rawTokens(shopName))
  for (const t of rawTokens(candName)) if (FORMAT_WORDS.has(t) && !s.has(t)) return true
  return false
}

interface Scored {
  hit: Hit
  rank: number
  cp: number
  cn: number
  brandFrac: number
  matched: number
  lead: number
  extra: number
  orderBonus: number
}

function scoreCandidate(
  shopName: string,
  shopProduct: string,
  prodToks: string[],
  hit: Hit,
  brand: BrandEntry | null
): Scored | null {
  if (formatMismatch(shopName, hit.naslov)) return null
  const ct = tokens(hit.naslov)
  const ctSet = new Set(ct)
  if (ctSet.size === 0) return null
  let inter = 0
  for (const t of prodToks) if (ctSet.has(t)) inter++
  if (inter === 0) return null
  const cp = inter / prodToks.length
  const cn = inter / ctSet.size

  const base = brand ? brand.tokens : []
  const candBrand = new Set(rawTokens(hit.dizajner))
  let bMatch = 0
  for (const t of base) if (candBrand.has(t)) bMatch++
  const brandFrac = base.length === 0 ? 0 : bMatch / base.length
  const brandBonus = brandFrac >= 0.999 ? 1.2 : brandFrac >= 0.5 ? 0.5 : 0

  const pFull = normSpaced(shopProduct)
  const cFull = normSpaced(hit.naslov)
  const pToks = tokens(pFull).filter((t) => !FORMAT_WORDS.has(t))
  const cToks = tokens(cFull).filter((t) => !FORMAT_WORDS.has(t))
  const pSet = new Set(pToks)
  let union = 0
  let both = 0
  for (const t of new Set([...pToks, ...cToks])) {
    union++
    if (pSet.has(t) && cToks.includes(t)) both++
  }
  const jaccard = union === 0 ? 0 : both / union
  let shapeBonus = 0
  if (cFull === pFull) shapeBonus += 1.2
  else if (pFull.length > 3 && pFull.includes(cFull)) shapeBonus += 0.6
  else if (cFull.length > 3 && cFull.includes(pFull)) shapeBonus += 0.4
  shapeBonus += 0.8 * jaccard

  // tokens propios del candidato que aparecen antes de cualquier token comun:
  // "rose seduction vip pour femme" frente a "vip pour femme" son productos distintos
  let lead = 0
  for (const t of cToks) {
    if (pSet.has(t)) break
    lead++
  }
  // contenido distintivo del candidato que el nombre de la tienda nunca menciona
  // ("DKNY Be Delicious Latte Matcha Body Mist" vs "DKNY Be Delicious Body Mist")
  let extra = 0
  for (const t of cToks) if (!pSet.has(t)) extra++

  // "light blue capri in love" y "light blue love in capri" tienen los mismos
  // tokens: el orden de la secuencia es lo que los distingue
  let orderBonus = 0
  {
    let k = 0
    let ordered = true
    for (const t of pToks) {
      if (k < cToks.length && t === cToks[k]) k++
    }
    if (k === cToks.length) orderBonus = 0.7
  }

  return {
    hit,
    rank: cp + cn + brandBonus + shapeBonus + orderBonus,
    cp,
    cn,
    brandFrac,
    matched: inter,
    lead,
    extra,
    orderBonus,
  }
}

function classify(s: Scored, prodToks: string[]): "high" | "medium" | "low" | null {
  if (prodToks.length === 0) return null
  if (s.lead >= 2) return null
  if (s.extra >= 2) return null
  // mismos tokens pero con el orden roto: "le male ultra intense" vs "ultra
  // male" (intense cae en STOP) o "sun soaked"/"soaked sun" son productos
  // distintos aunque la marca coincida
  if (s.cp >= 0.99 && s.cn >= 0.99 && s.orderBonus === 0) return null
  const brandEvidence = s.brandFrac >= 0.5
  if (!brandEvidence) {
    // sin coincidencia de marca exigimos nombres casi identicos en ambos
    // sentidos: al menos 2 tokens de contenido y cn alto
    if (s.matched < 2) return null
    if (s.cp >= 0.6 && s.cn >= 0.8) return "medium"
    if (s.cp >= 0.6 && s.cn >= 0.7) return "low"
    return null
  }
  if (s.brandFrac >= 0.999 && s.cp >= 0.9) return "high"
  if (s.brandFrac >= 0.999 && s.cp >= 0.8) return "medium"
  if (s.rank >= 3.0 && s.cp >= 0.6) return "high"
  if (s.rank >= 2.4 && s.cp >= 0.6) return "medium"
  if (s.rank >= 1.9 && s.cp >= 0.6) return "low"
  return null
}

interface Session {
  browser: any
  page: any
  key: string
}

async function openSession(): Promise<Session> {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  })
  const page = await ctx.newPage()
  const r = await page.goto("https://www.fragrantica.com/", { waitUntil: "networkidle", timeout: 60000 })
  const title = await page.title()
  if (r?.status() !== 200 || !title.includes("Magazine")) {
    await browser.close()
    throw new Error(`Cloudflare blocked: status=${r?.status()} title=${title}`)
  }
  const key = await captureKey(page)
  return { browser, page, key }
}

async function captureKey(page: any): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    const timer = setTimeout(() => {
      page.off("request", onReq)
      reject(new Error("could not capture algolia api key"))
    }, 30000)
    const onReq = (req: any) => {
      if (!req.url().includes("/1/indexes")) return
      try {
        const k = new URL(req.url()).searchParams.get("x-algolia-api-key")
        if (k) {
          clearTimeout(timer)
          page.off("request", onReq)
          resolve(decodeURIComponent(k))
        }
      } catch {}
    }
    page.on("request", onReq)
    await page.waitForTimeout(800)
    page.keyboard.press("Control+k")
    await page
      .locator("input.aa-Input")
      .first()
      .waitFor({ state: "attached", timeout: 15000 })
      .catch(() => {})
    await page
      .locator("input.aa-Input")
      .first()
      .fill("Ody")
      .catch(() => {})
  })
}

async function searchBatch(session: Session, queries: string[], hitsPerPage: number, label: string): Promise<Hit[][]> {
  const { page, key } = session
  const out: Hit[][] = []
  const batches = Math.ceil(queries.length / BATCH)
  for (let i = 0; i < queries.length; i += BATCH) {
    const chunk = queries.slice(i, i + BATCH)
    const body = { requests: chunk.map((q) => ({ indexName: INDEX, query: q, params: `hitsPerPage=${hitsPerPage}` })) }
    const res: any = await page.evaluate(
      async ({ url, key, body, app }: { url: string; key: string; body: unknown; app: string }) => {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 30000)
        try {
          const r = await fetch(
            `${url}?x-algolia-api-key=${encodeURIComponent(key)}&x-algolia-application-id=${app}`,
            { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }
          )
          if (!r.ok) throw new Error(`algolia http ${r.status}`)
          return r.json()
        } finally {
          clearTimeout(t)
        }
      },
      { url: DSN, key, body, app: APP_ID }
    )
    for (let j = 0; j < chunk.length; j++) {
      const hits = res?.results?.[j]?.hits ?? []
      if (hits.length === 0) console.log(`\n  [empty] ${label} q="${chunk[j]}"`)
      out.push(
        hits.map((h: any) => ({
          id: Number(h.id),
          naslov: String(h.naslov ?? ""),
          dizajner: String(h.dizajner ?? ""),
          godina: h.godina == null ? null : Number(h.godina),
        }))
      )
    }
    process.stdout.write(`\r  ${label} batch ${Math.floor(i / BATCH) + 1}/${batches}`)
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
  if (batches > 0) process.stdout.write("\n")
  return out
}

function pickNote(n: any, noteEs: Map<string, string>) {
  return { name: n?.name ?? null, name_es: noteEs.get(norm(n?.name)) ?? null, image_id: n?.image_id ?? null }
}

function mapNotes(notes: any, noteEs: Map<string, string>) {
  const t = notes?.tiered
  return {
    tiered: t
      ? {
          top: (Array.isArray(t.top) ? t.top : []).map((n: any) => pickNote(n, noteEs)),
          middle: (Array.isArray(t.middle) ? t.middle : []).map((n: any) => pickNote(n, noteEs)),
          base: (Array.isArray(t.base) ? t.base : []).map((n: any) => pickNote(n, noteEs)),
        }
      : null,
    flat: (Array.isArray(notes?.flat) ? notes.flat : []).map((n: any) => pickNote(n, noteEs)),
  }
}

function buildFragrantica(rec: AnyRec, noteEs: Map<string, string>) {
  return {
    id: rec.id,
    brand: rec.brand ?? "",
    name: rec.name ?? "",
    year: rec.year ?? null,
    gender: rec.gender ?? null,
    longevity: rec.longevity ?? null,
    sillage: rec.sillage ?? null,
    notes: mapNotes(rec.notes, noteEs),
  }
}

interface Target {
  row: AnyRec
  pid: string
  shopName: string
  brand: BrandEntry | null
  shopProduct: string
  prodToks: string[]
}

function prepare(targets: AnyRec[], brands: Map<string, BrandEntry>, brandGroups: string[][]) {
  const prepared: Target[] = []
  const rejected = new Map<string, string>()
  for (const row of targets) {
    const pid = String(row.parfum_id)
    const shopName = String(row.name ?? "")
    if (CLONE_RE.test(shopName)) {
      rejected.set(pid, "clone")
      continue
    }
    if (BUNDLE_RE.test(shopName)) {
      rejected.set(pid, "bundle")
      continue
    }
    const brand = detectShopBrand(shopName, brands)
    const shopProduct = cleanShopName(shopName, brand)
    const prodToks = productTokens(shopProduct, brand, brandGroups)
    if (prodToks.length === 0) {
      rejected.set(pid, "noProductTokens")
      continue
    }
    prepared.push({ row, pid, shopName, brand, shopProduct, prodToks })
  }
  return { prepared, rejected }
}

function queryFor(t: Target, withBrand: boolean): string {
  const product = t.shopProduct.slice(0, 70)
  if (!withBrand || !t.brand) return product
  return `${t.brand.display} ${product}`.slice(0, 90)
}

function scoreHits(t: Target, hits: Hit[]): Scored[] {
  const scored: Scored[] = []
  for (const h of hits) {
    if (!Number.isFinite(h.id)) continue
    const s = scoreCandidate(t.shopName, t.shopProduct, t.prodToks, h, t.brand)
    if (s) scored.push(s)
  }
  scored.sort((a, b) => b.rank - a.rank || b.cn - a.cn || a.hit.naslov.length - b.hit.naslov.length)
  return scored
}

function bestFor(t: Target, hits: Hit[]): { best: Scored; conf: "high" | "medium" | "low" } | null {
  const scored = scoreHits(t, hits)
  if (scored.length === 0) return null
  const best = scored[0]
  const conf = classify(best, t.prodToks)
  if (!conf) return null
  return { best, conf }
}

function formatScored(t: Target, scored: Scored[], keep: number) {
  return scored.slice(0, keep).map((s) => ({
    id: s.hit.id,
    name: s.hit.naslov,
    brand: s.hit.dizajner,
    score: Number(s.rank.toFixed(3)),
    cp: Number(s.cp.toFixed(3)),
    cn: Number(s.cn.toFixed(3)),
    brandFrac: s.brandFrac,
    matched: s.matched,
    lead: s.lead,
    extra: s.extra,
    order: s.orderBonus,
    conf: classify(s, t.prodToks),
  }))
}

function alternatesOf(t: Target, hits: Hit[], keep: number) {
  return formatScored(t, scoreHits(t, hits), keep)
}

async function main() {
  const t0 = performance.now()
  const products = JSON.parse((await readFile(PARFUM_FILE)).toString()) as AnyRec[]
  const nulls = products.filter((p) => !p.fragrantica)
  console.log(`products ${products.length} | nulls ${nulls.length}`)

  const noteEs = buildNoteEs(products.filter((p) => p.fragrantica))
  console.log(`note dictionary ${noteEs.size} entries`)

  const { brands } = await scanCatalog(new Set(), false)
  const brandGroups = [...new Set([...brands.values()].map((b) => collapseConnectors(b.tokens).join("\u0001")))]
    .map((s) => s.split("\u0001").filter(Boolean))
    .filter((g) => g.length > 0 && g.length <= 8)
  const { prepared, rejected } = prepare(nulls.slice(0, LIMIT), brands, brandGroups)
  const rejReasons: Record<string, number> = {}
  for (const r of rejected.values()) rejReasons[r] = (rejReasons[r] ?? 0) + 1
  console.log(`prepared ${prepared.length} | pre-rejected ${JSON.stringify(rejReasons)}`)

  const chosen = new Map<string, { best: Scored; conf: "high" | "medium" | "low"; round: number; hits: Hit[] }>()
  const picks = new Map<string, Scored[]>()
  const session = await openSession()
  try {
    const r1 = await searchBatch(
      session,
      prepared.map((t) => queryFor(t, true)),
      HITS,
      "round1"
    )
    for (const [i, t] of prepared.entries()) {
      picks.set(t.pid, scoreHits(t, r1[i] ?? []).slice(0, 5))
      const found = bestFor(t, r1[i] ?? [])
      if (found) chosen.set(t.pid, { ...found, round: 1, hits: r1[i] ?? [] })
    }
    console.log(`round1 accepted ${chosen.size}/${prepared.length}`)

    const retry = prepared.filter((t) => !chosen.has(t.pid))
    if (retry.length) {
      const before = chosen.size
      const r2 = await searchBatch(
        session,
        retry.map((t) => queryFor(t, false)),
        HITS,
        "round2"
      )
      for (const [i, t] of retry.entries()) {
        picks.set(t.pid, scoreHits(t, r2[i] ?? []).slice(0, 5).concat(picks.get(t.pid) ?? []).sort((a, b) => b.rank - a.rank).slice(0, 5))
        const found = bestFor(t, r2[i] ?? [])
        if (found) chosen.set(t.pid, { ...found, round: 2, hits: r2[i] ?? [] })
      }
      console.log(`round2 accepted ${chosen.size - before}/${retry.length}`)
    }
  } finally {
    await session.browser.close()
  }

  const needed = new Set<number>()
  for (const c of chosen.values()) needed.add(c.best.hit.id)
  const { full } = await scanCatalog(needed, true)

  const byPidTarget = new Map(prepared.map((t) => [t.pid, t]))
  const verdicts: Verdict[] = []
  for (const row of nulls.slice(0, LIMIT)) {
    const pid = String(row.parfum_id)
    const shopName = String(row.name ?? "")
    if (rejected.has(pid)) {
      verdicts.push({
        parfum_id: pid,
        shop_name: shopName,
        shop_brand: null,
        shop_product: "",
        query: "",
        round: 0,
        reason: rejected.get(pid)!,
        score: 0,
        confidence: null,
        hit: null,
        alternates: [],
      })
      continue
    }
    const t = byPidTarget.get(pid)!
    const c = chosen.get(pid)
    let reason = "noCandidate"
    if (c) reason = full.has(c.best.hit.id) ? "candidate" : "notInCatalog"
    verdicts.push({
      parfum_id: pid,
      shop_name: shopName,
      shop_brand: t.brand ? t.brand.display : null,
      shop_product: t.shopProduct,
      query: queryFor(t, c ? c.round === 2 ? false : true : true),
      round: c?.round ?? 0,
      reason,
      score: c ? Number(c.best.rank.toFixed(4)) : 0,
      confidence: reason === "candidate" ? c!.conf : null,
      hit: c ? { id: c.best.hit.id, name: c.best.hit.naslov, brand: c.best.hit.dizajner, year: c.best.hit.godina } : null,
      alternates: c ? alternatesOf(t, c.hits, 5) : formatScored(t, picks.get(pid) ?? [], 5),
    })
  }

  // el dataset existente ya repite un mismo fragrantica id entre variantes de
  // tamano (513 de 1354 ids), asi que NO descartamos filas que comparten id
  const shared = new Map<number, string[]>()
  for (const v of verdicts) {
    if (v.reason !== "candidate" || !v.hit) continue
    const l = shared.get(v.hit.id) ?? []
    l.push(v.shop_name)
    shared.set(v.hit.id, l)
  }
  for (const [id, list] of shared) {
    if (list.length > 1) console.log(`  shared id ${id} -> ${list.length} shop rows (sizes/variants)`)
  }

  const byReason: Record<string, number> = {}
  for (const v of verdicts) byReason[v.reason] = (byReason[v.reason] ?? 0) + 1
  const byConf: Record<string, number> = {}
  for (const v of verdicts) if (v.confidence) byConf[v.confidence] = (byConf[v.confidence] ?? 0) + 1
  console.log("reasons:", byReason)
  console.log("confidence:", byConf)

  await writeFile(RESULTS_FILE, JSON.stringify(verdicts, null, 2))

  let applied = 0
  let notesNullEs = 0
  if (APPLY) {
    const byPid = new Map(products.map((p) => [String(p.parfum_id), p]))
    const changes: AnyRec[] = []
    for (const v of verdicts) {
      if (v.reason !== "candidate" || !v.hit) continue
      const rec = full.get(v.hit.id)
      const target = byPid.get(v.parfum_id)
      if (!rec || !target) continue
      const frag = buildFragrantica(rec, noteEs)
      for (const arr of [frag.notes.tiered?.top, frag.notes.tiered?.middle, frag.notes.tiered?.base, frag.notes.flat]) {
        for (const n of arr ?? []) if (n.name && !n.name_es) notesNullEs++
      }
      target.fragrantica = frag
      target.confidence = v.confidence
      applied++
      changes.push({
        parfum_id: v.parfum_id,
        shop_name: v.shop_name,
        shop_brand: v.shop_brand,
        shop_product: v.shop_product,
        query: v.query,
        round: v.round,
        matched_brand: frag.brand,
        matched_name: frag.name,
        fragrantica_id: frag.id,
        confidence: v.confidence,
      })
    }
    await writeFile(PARFUM_FILE, JSON.stringify(products, null, 2))
    const report = {
      generated_at: new Date().toISOString(),
      state_file: STATE_FILE,
      totals: {
        products: products.length,
        previously_matched: products.length - nulls.length,
        previously_null: nulls.length,
        newly_matched: applied,
        still_null: nulls.length - applied,
      },
      confidence: byConf,
      reasons: byReason,
      notes_without_name_es: notesNullEs,
      changes,
    }
    await writeFile(REPORT_FILE, JSON.stringify(report, null, 2))
    console.log(`\napplied ${applied} rows (notes without name_es: ${notesNullEs})`)
    console.log(`wrote ${PARFUM_FILE} and ${REPORT_FILE}`)
  } else {
    console.log(`\nwrote ${RESULTS_FILE} (dry run; add --apply to write the dataset)`)
  }

  console.log(`elapsed ${((performance.now() - t0) / 1000).toFixed(1)}s`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
