# Uro — RAG (Retrieval-Augmented Generation) Design

- **Tanggal:** 2026-09-26
- **Status:** Disetujui untuk implementasi (Fase RAG-1)
- **Prasyarat:** Refactor multi-platform (core + adapter) sudah selesai & di-merge ke `main`. RAG dicolok ke titik hook `conversationEngine` yang sudah disiapkan.
- **Tujuan utama:** Bot menjawab dari **dokumen privat milik pengguna** (bukan mengubah knowledge cutoff model). RAG bersifat *additive* — kegagalannya tidak boleh menjatuhkan balasan bot.

---

## 1. Konteks & Keputusan Kunci

Uro sudah punya dua jalur informasi non-training: **Google Search grounding** (fakta publik terkini) dan **history channel** (konteks percakapan). RAG adalah lapisan **ketiga**: pengetahuan privat/domain-spesifik dari dokumen yang diunggah pengguna.

**Kendala penentu:** VPS produksi **≤1 GB RAM** dan tuntutan **balasan responsif**. Ini menggugurkan rencana awal (embedder + reranker ONNX lokal) karena beban RAM (~1.2-1.8 GB puncak) dan latensi CPU (1-4 dtk). Konsekuensi: **komputasi berat pindah ke API; VPS tetap ringan.**

**Stack final:**
| Komponen | Pilihan | Alasan |
|---|---|---|
| Embedding | **Gemini Embedding API** (`gemini-embedding-001`) via `@google/genai` + `keyRotator` yang sudah ada | Nol beban RAM, multilingual (ID+Inggris) bagus, tanpa dependency/kunci baru |
| Vector store | **LanceDB** (`@lancedb/lancedb`, embedded) | TS-native, tanpa server terpisah (ChromaDB butuh server Python — tak cocok Bun/VPS ramping), muat di ≤1 GB |
| docStore (parent) | **bun:sqlite** (file terpisah dari DB history) | Lookup key-value murah, konsisten dgn Uro |
| Chunking | **Small-to-Big** (parent 2000/overlap 200 + child berbasis aturan) | Meniru pola stabil chatbot-api; child aturan (bukan SemanticChunker) agar embed API dipanggil sekali per child, bukan saat memecah |
| Reranker | **Slot API (no-op sekarang)** | VPS kecil + tuntutan cepat + baseline chatbot-api juga tanpa reranker; siap colok API nanti |
| Generasi | **Gemini** via `googleAi.ts` | Sudah ada |

Referensi pola: `chatbot-api` (Geenius, Python) — `rag_service.py` (small-to-big, hash-based sync) & `text_handler.py` (augmentation, greeting-skip, mode hybrid). Catatan: chatbot-api **tidak** punya reranker; "reranking" di sana sebenarnya tahap child→parent.

**Kriteria keberhasilan Fase RAG-1:**
1. Taruh dokumen di `documents/`, bot menjawab pertanyaan dari isinya dengan menyebut sumber.
2. RAG bisa dimatikan total via config (`enabled: false`) → engine berperilaku persis seperti sekarang.
3. Kegagalan embed API / store → `retrieve()` mengembalikan `""`, bot tetap menjawab tanpa konteks dokumen (graceful degradation).
4. VPS ≤1 GB tidak menanggung model lokal; beban tambahan hanya index LanceDB di disk + memori kerja query.
5. Nol panggilan embed untuk pesan yang tidak dibalas (retrieve dijalankan setelah gate `shouldRespond`).

---

## 2. Arsitektur & Struktur File

Prinsip decoupling dipertahankan: core hanya tahu satu fungsi `retrieveContext(query) → string`. RAG = service baru yang di-inject.

```
src/
├── services/
│   ├── rag/                        # [BARU]
│   │   ├── index.ts                #   fasad RagService
│   │   ├── types.ts                #   RetrievedChunk, ChildRecord, ParentRecord, interface2
│   │   ├── embedder.ts             #   Gemini Embedding API (via keyRotator)
│   │   ├── vectorStore.ts          #   LanceDB: child vectors + metadata
│   │   ├── docStore.ts             #   parent chunks (bun:sqlite, file terpisah)
│   │   ├── chunker.ts              #   makeParents / makeChildren (aturan)
│   │   ├── extractor.ts            #   file → teks (txt/md fase-1; pdf/docx fase lanjut)
│   │   ├── ingestion.ts            #   folder-sync hash-based
│   │   └── reranker.ts             #   slot: passthroughReranker (no-op)
│   └── googleAi.ts                 # [UBAH kecil] tambah embed()/embedBatch()
├── config/
│   └── rag.ts                      # [BARU] ragConfig
├── core/
│   └── conversationEngine.ts       # [UBAH kecil] EngineDeps.retrieveContext? + panggil di hook
├── bot.ts                          # [UBAH kecil] wire ragService + sync saat start
├── helpers/util.ts                 # [UBAH kecil] isGreeting() (atau di rag/)
├── documents/                      # [BARU] git-ignored
└── rag_data/                       # [BARU] git-ignored (lancedb/ + parents.sqlite)
```

**Ketergantungan (satu arah):** `rag/* → googleAi/keyRotator/config`; `core → hanya interface retrieveContext`. Core tidak import LanceDB/embedding.

---

## 3. Tipe Data & Interface (`src/services/rag/types.ts`)

```typescript
export interface RetrievedChunk {
  parentId: string;
  text: string;        // isi parent chunk (konteks kaya)
  sourceFile: string;
  score: number;       // skor child terbaik yang menunjuk parent ini
}

export interface ChildRecord {
  id: string;          // uuid child
  parentId: string;
  vector: number[];    // embedding (dim tetap dari model)
  sourceFile: string;
  sourceHash: string;
}

export interface ParentRecord {
  parentId: string;
  text: string;
  sourceFile: string;
  sourceHash: string;
}

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface VectorStore {
  init(): Promise<void>;
  upsertChildren(records: ChildRecord[]): Promise<void>;
  search(vector: number[], k: number): Promise<{ parentId: string; sourceFile: string; score: number }[]>;
  deleteBySourceFile(sourceFile: string): Promise<void>;
  listIndexedFiles(): Promise<{ sourceFile: string; sourceHash: string }[]>;
}

export interface DocStore {
  init(): void;
  putParents(records: ParentRecord[]): void;
  getParents(parentIds: string[]): ParentRecord[];
  deleteBySourceFile(sourceFile: string): void;
}

export interface Reranker {
  rerank(query: string, candidates: RetrievedChunk[]): Promise<RetrievedChunk[]>;
}

export interface RagService {
  retrieve(query: string): Promise<string>;   // "" bila kosong/nonaktif/gagal
  sync(): Promise<{ indexed: number; removed: number }>;
  isEnabled(): boolean;
}
```

---

## 4. Konfigurasi (`src/config/rag.ts`)

```typescript
export const ragConfig = {
  enabled: false,                 // DEFAULT OFF — saklar keselamatan; nyalakan saat siap
  documentsPath: "documents",
  dataPath: "rag_data",
  embedModel: "gemini-embedding-001",
  childTopK: 10,                  // kandidat dari vector search
  maxParentsInContext: 4,         // batasi konteks (hemat token & cepat)
  greetingSkip: true,             // lewati RAG utk sapaan pendek
  syncOnStartBlocking: true,      // true: index sebelum bot online; false: background
};
```

---

## 5. Chunking (Small-to-Big)

- `makeParents(fullText)`: potong ~2000 char, overlap 200 (tiru RecursiveCharacterTextSplitter chatbot-api).
- `makeChildren(parentText)`: pecah berbasis aturan (batas kalimat/paragraf) jadi potongan ~300-500 char, overlap kecil. **Tanpa SemanticChunker** (yang butuh embedding saat memecah) — supaya embed API hanya dipanggil sekali per child final.
- Tiap parent → 1 `ParentRecord` (docStore). Tiap child → 1 `ChildRecord` dengan `parentId` menunjuk parentnya (LanceDB).

---

## 6. Embedding (Gemini API)

- `embed(text)` untuk query dengan `taskType: RETRIEVAL_QUERY`.
- `embedBatch(texts)` untuk child saat ingest dengan `taskType: RETRIEVAL_DOCUMENT` (Gemini membedakan keduanya untuk kualitas retrieval).
- Semua lewat `keyRotator` (rate-limit handling gratis). Batch saat ingest untuk hemat panggilan.
- Dimensi vektor mengikuti model; disimpan konsisten di LanceDB.

---

## 7. Alur Retrieval (`ragService.retrieve(query)`)

```
1. embedder.embed(query)                       → vektor query (Gemini API)
2. vectorStore.search(vektor, childTopK=10)    → child chunks (parentId, sourceFile, score)
3. reranker.rerank(...)                         → passthrough sekarang (no-op)
4. dedup parentId (ambil skor terbaik per parent), batasi maxParentsInContext=4
5. docStore.getParents(parentIds)              → parent chunks (teks kaya)
6. format konteks berlabel sumber              → "Kutipan dari '<file>':\n<isi>" digabung "\n\n---\n\n"
7. return string (atau "" bila tak ada hasil)
```

---

## 8. Alur Ingestion (`ragService.sync()`)

Meniru `load_and_index_documents` chatbot-api:
```
1. scan documents/ (rekursif) → hash SHA-256 tiap file
2. ambil daftar terindex dari vectorStore.listIndexedFiles() → {sourceFile: sourceHash}
3. file terindex yg tak ada lagi di folder → deleteBySourceFile (vectorStore + docStore)
4. file baru / hash berubah:
   a. deleteBySourceFile (bersihkan versi lama)
   b. extractor: file → teks
   c. makeParents → putParents (docStore)
   d. tiap parent: makeChildren → embedBatch → upsertChildren (LanceDB)
5. return { indexed, removed }
```
Satu file gagal (extract/embed) → log, lewati, lanjut file lain.

---

## 9. Integrasi ke Core

`EngineDeps` + field opsional:
```typescript
retrieveContext?: (query: string) => Promise<string>;
```

Di `process()`, **setelah gate `shouldRespond` lolos**, sebelum membangun prompt Gemini:
```
let docContext = "";
if (deps.retrieveContext && !isGreeting(primary.text)) {
  docContext = await deps.retrieveContext(primary.text); // "" bila kosong/gagal
}
```
Retrieve **setelah** gate = nol embed untuk pesan yang tak dibalas.

**Prompt augmentation** (mengikuti pola text_handler chatbot-api, mode hybrid):
```
[Channel History Context] ...
[Konteks Dokumen]
<docContext, atau blok ini dihilangkan bila kosong>
[User Prompt] <pesan user>
```
**System prompt** diberi satu aturan: jika ada Konteks Dokumen relevan, utamakan; jika tidak, jawab normal (hybrid: dokumen + pengetahuan umum + Google Search). Tidak memaksa RAG-only.

---

## 10. Lifecycle (`bot.ts`)

```
if (ragConfig.enabled) {
  ragService = buildRagService();          // embedder + vectorStore + docStore + chunker
  if (ragConfig.syncOnStartBlocking) await ragService.sync();
  else ragService.sync().catch(log);       // background utk basis besar
  engineDeps.retrieveContext = ragService.retrieve;
}
// enabled=false → engineDeps tanpa retrieveContext → perilaku persis sekarang
registry.startAll();
```
Re-index berkala / command manual = fase lanjutan.

---

## 11. Error Handling (kritis untuk VPS/API)

- **embed API gagal / rate-limit habis** → `retrieve()` return `""` (tak melempar). Bot menjawab tanpa konteks dokumen.
- **LanceDB / docStore error saat query** → log + `""`.
- **Ingest gagal satu file** → log, lewati, lanjut.
- **`enabled: false`** → `retrieve()` langsung `""`, tak ada init model/DB.
- Prinsip: RAG **memperkaya**; kegagalannya tak boleh menjatuhkan balasan dasar (Gemini + Google Search + history tetap jalan).

---

## 12. Testing

- **Unit (tanpa API/DB nyata):** chunker (parent/child + overlap), `isGreeting`, format konteks berlabel sumber, ingestion hash-diff (baru/berubah/hilang) dgn embedder & store di-mock.
- **Integrasi ringan:** vectorStore(LanceDB) + docStore(SQLite) di folder temp, embedder di-stub (vektor palsu) → buktikan retrieve mengembalikan parent yang benar.
- **Spike LanceDB di Bun (langkah 0):** install + init + insert + search — verifikasi native binding jalan di Bun SEBELUM membangun di atasnya. Fallback bila gagal: sqlite-vec.
- **Verifikasi manual:** taruh dokumen contoh, tanya, pastikan bot menjawab dari dokumen dgn sumber.

---

## 13. Dependency, Repo, Keamanan

- Tambah dependency: `@lancedb/lancedb` (+ transitive). Embedding pakai `@google/genai` yang sudah ada.
- `.gitignore`: `documents/`, `rag_data/`.
- `config/rag.ts` `enabled: false` default → merge RAG tak mengubah perilaku produksi sampai sengaja dinyalakan.
- Commit langsung ke `main` (konvensi repo). Hook global menghapus trailer atribusi AI — jangan tambahkan.
- Dokumen pengguna dikirim ke Gemini Embedding API (Google) saat ingest & query — pertimbangan privasi yang sama seperti pemakaian Gemini untuk teks (sudah diterima pengguna).

---

## 14. Di Luar Cakupan (fase berikutnya)

- Reranker nyata (via API) — slot sudah ada.
- Upload/list/delete dokumen via command Discord (fase-1 pakai folder-sync).
- Extractor PDF/DOCX/XLSX (fase-1: txt/md dulu).
- Re-index berkala / manual trigger.
- Integrasi `laya` sebagai gerbang keputusan (perlu-RAG? / sapaan? / jailbreak) — proyek terpisah, service Python.
- Adapter Telegram/WhatsApp (RAG otomatis ikut karena di core, tapi belum ada adapternya).
