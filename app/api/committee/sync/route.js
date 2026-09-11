import { enqueueMeeting } from '@/lib/committeeRag/pipeline.mjs';
import { getCurrentUser } from '@/lib/auth';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureCommitteeSyncHistoryTables } from '@/lib/committeeSyncHistory';
import { extractAttachmentsFromHtml, extractPdfTextFromUrl, cleanHtmlText } from '@/lib/committeePdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BASE_URL_SYNC = 'https://www.mfds.go.kr';

function cleanText(text = '') {
  return cleanHtmlText(text);
}

function parseAgendas(rawContent = '', meetingTitle = '') {
  const lines = rawContent.split('\n').map(l => l.trim()).filter(Boolean);
  const agendas = [];
  let inResultSection = false;
  let order = 1;

  for (const line of lines) {
    if (line.includes('○ 결과') || line.includes('○ 심의결과') || line.includes('○ 의결사항') || line.includes('심의 결과') || line.includes('○ 안건')) {
      inResultSection = true;
      continue;
    }
    if (inResultSection && line.startsWith('○') && !line.includes('인정') && !line.includes('보완')) {
      if (line.includes('일시') || line.includes('참석') || line.includes('붙임') || line.includes('기타')) {
        inResultSection = false;
      }
    }

    const isAgendaLine = line.startsWith('-') || line.startsWith('•') || /^[0-9]+\.\s*/.test(line) ||
      (inResultSection && (line.includes('인정') || line.includes('보완')));

    if (isAgendaLine) {
      const parts = line.replace(/^[-•0-9.\s]+/, '').split(/[:：]/);
      if (parts.length >= 2) {
        const rawName = parts[0].trim();
        const resPart = parts.slice(1).join(':').trim();

        let result = '기타';
        if (resPart.includes('불인정') || resPart.includes('미인정')) result = '불인정';
        else if (resPart.includes('보완')) result = '보완';
        else if (resPart.includes('인정')) result = '인정';

        let agendaType = '신규인정';
        if (rawName.includes('기능성 추가') || rawName.includes('기능성추가')) agendaType = '기능성추가';
        else if (rawName.includes('기준') || rawName.includes('규격')) agendaType = '기준규격';
        else if (rawName.includes('재심의') || rawName.includes('재신청')) agendaType = '재심의';

        let ingredientName = rawName
          .replace(/^기능성\s*원료\s*/i, '')
          .replace(/^['"‘“\s]+|['"’”\s]+$/g, '')
          .replace(/\s*\(기능성\s*추가\)\s*$/i, '')
          .replace(/^['"‘“\s]+|['"’”\s]+$/g, '')
          .trim();

        agendas.push({ orderIndex: order++, rawName: line, ingredientName, result, agendaType, details: `${meetingTitle} > ${line}` });
      }
    }
  }
  return agendas;
}

export async function fetchArticlesFromPage(pageNum, headers, BASE_URL) {
  const url = `${BASE_URL}/brd/m_532/list.do?page=${pageNum}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) return [];
  const html = await resp.text();

  // <div class="num"> 기준으로 각 게시글 청크 분할 (가장 정확한 파싱 방식)
  const chunks = html.split(/<div\s+class=["']num["']\s*>/i);
  if (chunks.length <= 1) return [];

  const articles = [];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];

    const linkMatch = chunk.match(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].replace(/&amp;/g, '&');
    const seqMatch = rawHref.match(/seq=(\d+)/);
    const seq = seqMatch ? seqMatch[1] : null;
    if (!seq) continue;

    const title = cleanText(linkMatch[2]).trim();
    if (!title || (!title.includes('건강기능식품') && !title.includes('심의') && !title.includes('회의') && !title.includes('위원') && !title.includes('재평가'))) {
      continue;
    }

    const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;

    const numMatch = chunk.match(/^\s*(\d+)\s*<\/div>/i);
    const postNo = numMatch ? numMatch[1].trim() : null;

    const deptMatch = chunk.match(/담당부서\s*\|\s*([가-힣]+과|[가-힣]+팀|[가-힣]+부)/i) ||
                      chunk.match(/담당부서[\s\S]*?\|\s*([가-힣]+과|[가-힣]+팀)/i);
    const department = deptMatch ? deptMatch[1].trim() : '영양기능연구과';

    const viewMatch = chunk.match(/조회수\s*\|\s*(\d+)/i);
    const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

    const dateMatch = chunk.match(/<div class=["']date_column["']>([\s\S]*?)<\/div>/i) ||
                      chunk.match(/(\d{4}-\d{2}-\d{2})/);
    const postDate = dateMatch ? (dateMatch[1] || dateMatch[0]).replace(/<[^>]+>/g, '').trim() : null;

    const listPageBase = `${BASE_URL_SYNC}/brd/m_532/`;
    const attachments = extractAttachmentsFromHtml(chunk, listPageBase);

    articles.push({
      seq,
      postNo,
      title,
      href: fullHref,
      department,
      viewCount,
      postDate,
      pdfFileName: attachments.pdfFileName,
      pdfFileUrl: attachments.pdfFileUrl,
      hwpFileName: attachments.hwpFileName,
      hwpFileUrl: attachments.hwpFileUrl,
    });
  }

  return articles;
}

function pickComparableMeetingFields(record = {}) {
  return {
    seq: record.seq || null,
    postNo: record.postNo || null,
    title: record.title || null,
    meetingNo: record.meetingNo || null,
    department: record.department || null,
    viewCount: record.viewCount ?? null,
    postDate: record.postDate || null,
    sourceUrl: record.sourceUrl || record.href || null,
    pdfFileName: record.pdfFileName || null,
    pdfFileUrl: record.pdfFileUrl || null,
    hwpFileName: record.hwpFileName || null,
    hwpFileUrl: record.hwpFileUrl || null,
  };
}

function diffObjects(beforeData, afterData) {
  const changed = {};
  const fields = new Set([...Object.keys(beforeData || {}), ...Object.keys(afterData || {})]);
  for (const field of fields) {
    const beforeValue = beforeData?.[field] ?? null;
    const afterValue = afterData?.[field] ?? null;
    if (beforeValue !== afterValue) {
      changed[field] = { before: beforeValue, after: afterValue };
    }
  }
  return changed;
}

function getMeetingNo(title = '') {
  const mMeetingNo = title.match(/제?\s*(\d+)\s*차/);
  return mMeetingNo ? `제${mMeetingNo[1]}차` : null;
}

async function fetchDetailForArticle(art, headers) {
  const detailResp = await fetch(art.href, { headers });
  if (!detailResp.ok) return null;

  const detailHtml = await detailResp.text();
  const rawText = cleanText(detailHtml);
  const meetingDateMatch = rawText.match(/일시\s*[:：]\s*([^\n]+)/);
  const attendeesMatch = rawText.match(/참석자?\s*[:：]\s*([^\n]+)/);

  let pdfFileName = art.pdfFileName;
  let pdfFileUrl = art.pdfFileUrl;
  let hwpFileName = art.hwpFileName;
  let hwpFileUrl = art.hwpFileUrl;

  const detailBase = art.href.substring(0, art.href.lastIndexOf('/') + 1);
  const detailAttachments = extractAttachmentsFromHtml(detailHtml, detailBase);
  if (!pdfFileUrl && detailAttachments.pdfFileUrl) {
    pdfFileUrl = detailAttachments.pdfFileUrl;
    pdfFileName = detailAttachments.pdfFileName;
  }
  if (!hwpFileUrl && detailAttachments.hwpFileUrl) {
    hwpFileUrl = detailAttachments.hwpFileUrl;
    hwpFileName = detailAttachments.hwpFileName;
  }

  let pdfContent = null;
  if (pdfFileUrl) {
    pdfContent = await extractPdfTextFromUrl(pdfFileUrl, art.href);
  }

  return {
    rawText,
    pdfContent,
    meetingDate: meetingDateMatch ? meetingDateMatch[1].trim() : art.postDate,
    attendees: attendeesMatch ? attendeesMatch[1].trim() : null,
    pdfFileName,
    pdfFileUrl,
    hwpFileName,
    hwpFileUrl,
  };
}

async function createMeetingWithAgendas(art, detail) {
  const rawText = detail?.rawText || '';
  const meetingDate = detail?.meetingDate || art.postDate;
  const createdMeeting = await prisma.committee_meetings.create({
    data: {
      seq: art.seq,
      postNo: art.postNo,
      title: art.title,
      meetingNo: getMeetingNo(art.title),
      meetingDate,
      department: art.department,
      viewCount: art.viewCount,
      postDate: art.postDate,
      attendees: detail?.attendees || null,
      rawContent: rawText ? rawText : null,
      pdfContent: detail?.pdfContent || null,
      sourceUrl: art.href,
      pdfFileName: detail?.pdfFileName || art.pdfFileName,
      pdfFileUrl: detail?.pdfFileUrl || art.pdfFileUrl,
      hwpFileName: detail?.hwpFileName || art.hwpFileName,
      hwpFileUrl: detail?.hwpFileUrl || art.hwpFileUrl,
    }
  });

  let addedAgendas = 0;
  const agendas = parseAgendas(rawText, art.title);
  for (const ag of agendas) {
    await prisma.committee_agendas.create({
      data: {
        meetingId: createdMeeting.id,
        orderIndex: ag.orderIndex,
        rawName: ag.rawName,
        ingredientName: ag.ingredientName,
        result: ag.result,
        agendaType: ag.agendaType,
        details: ag.details,
        embedding: null
      }
    });
    addedAgendas++;
  }

  return { meeting: createdMeeting, addedAgendas };
}

export async function POST(req) {
  if (getCurrentUser(req)?.role !== 'ADMIN') return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    await ensureCommitteeSyncHistoryTables(prisma);

    // 전체 페이지 스캔: 기본 40페이지 (전체 회의록 전수 검사)
    const maxPages = Math.min(Math.max(parseInt(body.pages || '40'), 1), 50);
    const mode = body.mode || 'full';

    const BASE_URL = 'https://www.mfds.go.kr';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    const syncRun = await prisma.committee_sync_runs.create({
      data: { mode, pagesRequested: maxPages, status: 'RUNNING' },
    });

    let pagesFetched = 0;
    let scannedCount = 0;
    let addedMeetings = 0;
    let addedAgendas = 0;
    let updatedMeetings = 0;
    let unchangedMeetings = 0;
    let pdfExtractedCount = 0;

    try {
      for (let page = 1; page <= maxPages; page++) {
        const articles = await fetchArticlesFromPage(page, headers, BASE_URL);
        if (!articles || articles.length === 0) {
          break; // 더 이상 게시물이 없으면 종료
        }
        pagesFetched++;

        for (const art of articles) {
          scannedCount++;
          const existing = await prisma.committee_meetings.findUnique({
            where: { seq: art.seq },
            include: { agendas: { select: { id: true }, take: 1 } },
          });

          // 1. 신규 게시글인 경우 -> 상세 정보 + PDF 본문 + 안건 일괄 생성
          if (!existing) {
            try {
              const detail = await fetchDetailForArticle(art, headers);
              const { meeting, addedAgendas: agendaCount } = await createMeetingWithAgendas(art, detail);
              await enqueueMeeting(prisma, meeting.id);
              addedMeetings++;
              addedAgendas += agendaCount;
              if (detail?.pdfContent) pdfExtractedCount++;

              await prisma.committee_sync_changes.create({
                data: {
                  runId: syncRun.id,
                  meetingId: meeting.id,
                  seq: art.seq,
                  changeType: 'CREATE',
                  title: art.title,
                  changedFields: Object.keys(pickComparableMeetingFields({ ...art, sourceUrl: art.href })).join(','),
                  beforeData: null,
                  afterData: {
                    meeting: pickComparableMeetingFields({ ...art, sourceUrl: art.href }),
                    agendaCount,
                    hasPdfContent: Boolean(detail?.pdfContent),
                  },
                },
              });
            } catch (err) {
              console.error(`Error creating ${art.seq}:`, err.message);
              await prisma.committee_sync_changes.create({
                data: {
                  runId: syncRun.id,
                  seq: art.seq,
                  changeType: 'ERROR',
                  title: art.title,
                  afterData: { message: err.message },
                },
              });
            }
            continue;
          }

          // 2. 기존 게시글인 경우 -> 변경사항 대조 + 누락 데이터(PDF/안건/본문) 백필
          const beforeData = pickComparableMeetingFields(existing);
          const afterCandidate = pickComparableMeetingFields({
            ...art,
            sourceUrl: art.href,
            meetingNo: existing.meetingNo || getMeetingNo(art.title),
          });

          // 상세 페이지 조회 여부 판단 (본문이 없거나, PDF URL이 비어있는 경우)
          let detail = null;
          if (!existing.rawContent || (!existing.pdfFileUrl && !art.pdfFileUrl)) {
            detail = await fetchDetailForArticle(art, headers);
            if (detail?.pdfFileUrl) {
              afterCandidate.pdfFileName = detail.pdfFileName;
              afterCandidate.pdfFileUrl = detail.pdfFileUrl;
            }
            if (detail?.hwpFileUrl) {
              afterCandidate.hwpFileName = detail.hwpFileName;
              afterCandidate.hwpFileUrl = detail.hwpFileUrl;
            }
          }

          const changes = diffObjects(beforeData, afterCandidate);
          const changedFields = Object.keys(changes);
          const needsAgendaBackfill = existing.agendas.length === 0 && (existing.rawContent || detail?.rawText);
          const needsPdfContentBackfill = !existing.pdfContent && (afterCandidate.pdfFileUrl || existing.pdfFileUrl);
          const needsRawContentBackfill = !existing.rawContent && detail?.rawText;

          if (changedFields.length === 0 && !needsAgendaBackfill && !needsPdfContentBackfill && !needsRawContentBackfill) {
            await enqueueMeeting(prisma, existing.id);
            unchangedMeetings++;
            continue;
          }

          const updateData = {};
          for (const field of changedFields) {
            if (field === 'seq') continue;
            if (field === 'sourceUrl') updateData.sourceUrl = afterCandidate.sourceUrl;
            else updateData[field] = afterCandidate[field];
          }
          if (!existing.meetingNo && afterCandidate.meetingNo) updateData.meetingNo = afterCandidate.meetingNo;
          if (needsRawContentBackfill && detail?.rawText) updateData.rawContent = detail.rawText;

          // PDF 본문 텍스트 백필
          if (needsPdfContentBackfill) {
            const targetPdfUrl = afterCandidate.pdfFileUrl || existing.pdfFileUrl;
            const pdfText = detail?.pdfContent || await extractPdfTextFromUrl(targetPdfUrl, art.href);
            if (pdfText) {
              updateData.pdfContent = pdfText;
              pdfExtractedCount++;
            }
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.committee_meetings.update({
              where: { seq: art.seq },
              data: updateData,
            });
          }

          // 안건 백필
          let backfilledAgendas = 0;
          if (needsAgendaBackfill) {
            const sourceText = existing.rawContent || detail?.rawText || '';
            const agendas = parseAgendas(sourceText, art.title);
            for (const ag of agendas) {
              await prisma.committee_agendas.create({
                data: {
                  meetingId: existing.id,
                  orderIndex: ag.orderIndex,
                  rawName: ag.rawName,
                  ingredientName: ag.ingredientName,
                  result: ag.result,
                  agendaType: ag.agendaType,
                  details: ag.details,
                }
              });
              backfilledAgendas++;
            }
          }
          addedAgendas += backfilledAgendas;
          await enqueueMeeting(prisma, existing.id);
          updatedMeetings++;

          await prisma.committee_sync_changes.create({
            data: {
              runId: syncRun.id,
              meetingId: existing.id,
              seq: art.seq,
              changeType: changedFields.length > 0 ? 'UPDATE' : (needsPdfContentBackfill ? 'PDF_BACKFILL' : 'AGENDA_BACKFILL'),
              title: art.title,
              changedFields: [
                ...changedFields,
                ...(backfilledAgendas > 0 ? ['agendas'] : []),
                ...(updateData.pdfContent ? ['pdfContent'] : []),
              ].join(','),
              beforeData: {
                meeting: beforeData,
                agendaCount: existing.agendas.length,
                hasPdfContent: Boolean(existing.pdfContent),
              },
              afterData: {
                meeting: { ...beforeData, ...updateData },
                agendaCount: existing.agendas.length + backfilledAgendas,
                hasPdfContent: Boolean(existing.pdfContent || updateData.pdfContent),
                changes,
              },
            },
          });
        }
      }

      const [totalMeetings, totalAgendas, pdfMeetings, pdfContentMeetings] = await Promise.all([
        prisma.committee_meetings.count(),
        prisma.committee_agendas.count(),
        prisma.committee_meetings.count({ where: { pdfFileUrl: { not: null } } }),
        prisma.committee_meetings.count({ where: { pdfContent: { not: null } } }),
      ]);

      await prisma.committee_sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: 'SUCCESS',
          pagesFetched,
          scannedCount,
          createdCount: addedMeetings,
          updatedCount: updatedMeetings,
          unchangedCount: unchangedMeetings,
          agendaCreatedCount: addedAgendas,
          finishedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        runId: syncRun.id,
        message: `전체 전수 비교 동기화 완료: ${scannedCount}건 확인 (${pagesFetched}페이지) / 신규 ${addedMeetings}건 / 갱신 및 백필 ${updatedMeetings}건 / 동일 ${unchangedMeetings}건 (PDF 텍스트 추출: ${pdfExtractedCount}건)`,
        pagesFetched,
        scannedCount,
        addedMeetings,
        updatedMeetings,
        unchangedMeetings,
        addedAgendas,
        totalMeetings,
        totalAgendas,
        pdfMeetings,
        pdfContentMeetings,
      });
    } catch (runError) {
      await prisma.committee_sync_runs.update({
        where: { id: syncRun.id },
        data: {
          status: 'FAILED',
          pagesFetched,
          scannedCount,
          createdCount: addedMeetings,
          updatedCount: updatedMeetings,
          unchangedCount: unchangedMeetings,
          agendaCreatedCount: addedAgendas,
          errorMessage: runError.message,
          finishedAt: new Date(),
        },
      });
      throw runError;
    }
  } catch (error) {
    console.error('Committee Sync Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
