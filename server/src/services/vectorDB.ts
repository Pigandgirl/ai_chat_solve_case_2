import fs from 'fs';
import path from 'path';

export interface VectorChunk {
  _id: string;
  caseId: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
  createdAt: string;
}

export interface VectorCollection {
  [caseId: string]: VectorChunk[];
}

const VECTOR_DIR = path.join(__dirname, '../../data');
const VECTOR_FILE = path.join(VECTOR_DIR, 'vectors.json');

if (!fs.existsSync(VECTOR_DIR)) {
  fs.mkdirSync(VECTOR_DIR, { recursive: true });
}

let vectors: VectorCollection = {};

try {
  if (fs.existsSync(VECTOR_FILE)) {
    const data = fs.readFileSync(VECTOR_FILE, 'utf-8');
    vectors = JSON.parse(data);
  }
} catch (err) {
  console.log('[VectorDB] initialize new');
}

function persist() {
  try {
    fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectors, null, 2), 'utf-8');
  } catch (e) {
    console.error('[VectorDB] persist error');
  }
}

export const vectorDB = {
  addVectors(caseId: string, documentId: string, chunks: string[], embeddings: number[][]) {
    if (!vectors[caseId]) {
      vectors[caseId] = [];
    }
    for (let i = 0; i < chunks.length && i < embeddings.length; i++) {
      vectors[caseId].push({
        _id: `vec_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 8)}`,
        caseId,
        documentId,
        chunkIndex: vectors[caseId].length,
        text: chunks[i],
        embedding: embeddings[i],
        createdAt: new Date().toISOString()
      });
    }
    persist();
  },

  getCaseVectors(caseId: string): VectorChunk[] {
    return vectors[caseId] || [];
  },

  similarity(v1: number[], v2: number[]): number {
    let dot = 0, mag1 = 0, mag2 = 0;
    for (let i = 0; i < v1.length && i < v2.length; i++) {
      dot += v1[i] * v2[i];
      mag1 += v1[i] * v1[i];
      mag2 += v2[i] * v2[i];
    }
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    if (!mag1 || !mag2) return 0;
    return dot / (mag1 * mag2);
  },

  search(caseId: string, queryEmbedding: number[], topN: number = 8): { chunk: VectorChunk; score: number }[] {
    const all = this.getCaseVectors(caseId);
    const results = all.map(v => ({
      chunk: v,
      score: this.similarity(queryEmbedding, v.embedding)
    }));
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
  },

  deleteCaseVectors(caseId: string) {
    delete vectors[caseId];
    persist();
  }
};
