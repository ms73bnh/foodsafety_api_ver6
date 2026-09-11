// Read-only counts. JSON access also works before the additive V3 migration.
export async function auditCommittee(db) {
  const [tables] = await db.$queryRawUnsafe(`SELECT
    to_regclass('committee_meetings')::text AS meetings,
    to_regclass('committee_chunks')::text AS chunks,
    to_regclass('committee_documents')::text AS documents,
    to_regclass('committee_document_pages')::text AS pages,
    to_regclass('committee_ingestion_jobs')::text AS jobs`);
  const report = { checkedAt: new Date().toISOString(), tables, meetings: null, chunks: [], documents: [], pages: [], jobs: [] };
  if (tables.meetings) report.meetings = (await db.$queryRawUnsafe('SELECT count(*)::int AS total FROM committee_meetings'))[0].total;
  if (tables.chunks) report.chunks = await db.$queryRawUnsafe(`WITH source AS (
      SELECT to_jsonb(c) AS j FROM committee_chunks c
    ) SELECT j->>'chunkType' AS type, j->>'embeddingModel' AS model,
      j->>'embeddingStatus' AS status, count(*)::int AS total,
      count(DISTINCT j->>'meetingId')::int AS meetings,
      count(*) FILTER (WHERE j->>'embeddingVector' IS NOT NULL)::int AS "storedVectors",
      count(*) FILTER (WHERE j->>'embeddingStatus'='completed'
        AND j->>'embeddingModel'='Xenova/multilingual-e5-small-int8'
        AND j->>'embeddingDimensions'='384'
        AND cardinality(string_to_array(trim(both '[]' from j->>'embeddingVector'), ','))=384
        AND j->>'active' IS DISTINCT FROM 'false')::int AS "activeE5Vectors"
    FROM source GROUP BY 1,2,3 ORDER BY 1,2,3`);
  if (tables.documents) report.documents = await db.$queryRawUnsafe(`SELECT "fileType", status, active, count(*)::int AS total FROM committee_documents GROUP BY 1,2,3 ORDER BY 1,2,3`);
  if (tables.pages) report.pages = await db.$queryRawUnsafe(`SELECT status, "extractionMethod", count(*)::int AS total FROM committee_document_pages GROUP BY 1,2 ORDER BY 1,2`);
  if (tables.jobs) report.jobs = await db.$queryRawUnsafe(`SELECT stage, status, count(*)::int AS total FROM committee_ingestion_jobs GROUP BY 1,2 ORDER BY 1,2`);
  report.migrationRequired = !tables.documents || !tables.pages || !tables.jobs;
  report.note = '게시물 수는 청킹·임베딩 완료 수가 아닙니다. storedVectors는 실제 벡터가 있는 행 수이며 activeE5Vectors는 모델·384차원·완료·활성 조건을 만족하는 행 수입니다. 문서 활성 상태와 OCR 검토 상태도 별도로 확인해야 합니다.';
  return report;
}
