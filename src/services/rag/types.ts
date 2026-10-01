export interface RetrievedChunk {
  parentId: string;
  text: string;
  sourceFile: string;
  score: number;
}
export interface ChildRecord {
  id: string;
  parentId: string;
  vector: number[];
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
  retrieve(query: string): Promise<string>;
  sync(): Promise<{ indexed: number; removed: number }>;
  isEnabled(): boolean;
}
