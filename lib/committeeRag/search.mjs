const MODEL = 'Xenova/multilingual-e5-small-int8';
const SELECT = `SELECT c.id, c."meetingId", c."chunkType", c.content, c."documentId", c."pageStart", c."pageEnd", c.category,
  d."fileName" AS "documentName", d."sourceUrl" AS "documentUrl",
  json_build_object('id', m.id, 'title', m.title, 'meetingNo', m."meetingNo", 'meetingDate', m."meetingDate", 'postDate', m."postDate", 'pdfFileName', m."pdfFileName", 'pdfFileUrl', m."pdfFileUrl", 'sourceUrl', m."sourceUrl") AS meeting
  FROM committee_chunks c JOIN committee_meetings m ON m.id=c."meetingId"
  LEFT JOIN committee_documents d ON d.id=c."documentId"`;
const ACTIVE = `c.active=true AND (c."documentId" IS NULL OR (d.active=true AND d.status='completed'))`;

export function mergeRankings(rankings, limit = 12) {
  const combined = new Map();
  for (const rows of rankings) {
    rows.forEach((row, index) => {
      const value = combined.get(row.id) || { ...row, score: 0 };
      value.score += 1 / (60 + index + 1);
      combined.set(row.id, value);
    });
  }
  return [...combined.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(row => ({ ...row, score: row.score * 30.5 }));
}

export async function searchChunks(db, question, terms = [], vector = [], { meetingId } = {}) {
  const rankings = [];
  const filter = meetingId ? ` AND c."meetingId"=${Number(meetingId)}` : '';
  if (meetingId && (!Number.isInteger(meetingId) || meetingId < 1)) throw new Error('Invalid meeting filter');
  if (vector.length === 384 && vector.every(Number.isFinite)) {
    try {
      rankings.push(await db.$queryRawUnsafe(`${SELECT} WHERE ${ACTIVE}${filter}
        AND c."embeddingStatus"='completed' AND c."embeddingModel"=$2 AND c."embeddingDimensions"=384 AND c."embeddingVector" IS NOT NULL
        ORDER BY c."embeddingVector" <=> $1::extensions.vector(384) LIMIT 60`, `[${vector.join(',')}]`, MODEL));
    } catch (error) { console.warn('Vector search failed; lexical search remains available:', error.code || 'database error'); }
  }
  const keywords = [...new Set(terms.map(t => String(t).trim()).filter(t => t.length > 1))].slice(0, 10);
  if (keywords.length) {
    const conditions = keywords.map((_, i) => `position(lower($${i + 1}) in lower(c.content)) > 0`);
    rankings.push(await db.$queryRawUnsafe(`${SELECT} WHERE ${ACTIVE}${filter} AND (${conditions.join(' OR ')})
      ORDER BY (${conditions.map(c => `CASE WHEN ${c} THEN 1 ELSE 0 END`).join('+')}) DESC, c.id ASC LIMIT 100`, ...keywords));
  }
  return mergeRankings(rankings);
}

export function evidenceReference(chunk) {
  return {
    id: chunk.id, evidenceId: `C${chunk.id}`, documentId: chunk.documentId, pageStart: chunk.pageStart, pageEnd: chunk.pageEnd,
    ingredientName: chunk.documentName || chunk.meeting?.title || '검색 근거', result: null,
    meetingNo: chunk.meeting?.meetingNo, meetingDate: chunk.meeting?.meetingDate || chunk.meeting?.postDate,
    meetingTitle: chunk.meeting?.title, pdfFileName: chunk.documentName || chunk.meeting?.pdfFileName,
    pdfFileUrl: chunk.documentId && chunk.chunkType === 'pdf' ? `/api/committee/documents/${chunk.documentId}/file#page=${chunk.pageStart || 1}` : chunk.documentUrl || chunk.meeting?.sourceUrl,
  };
}
