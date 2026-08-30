import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureCommitteeSyncHistoryTables } from '@/lib/committeeSyncHistory';
import { extractAttachmentsFromHtml, extractPdfTextFromUrl, cleanHtmlText } from '@/lib/committeePdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

  // <li> 블록 단위로 분할하여 각 게시물의 메타데이터 파싱
  const liBlocks = html.split(/<li\s+class=["'](?:bbs_list|board_list)?/gi).slice(1);
  const articles = [];

  for (const block of liBlocks) {
    const linkMatch = block.match(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const rawHref = linkMatch[1].replace(/&amp;/g, '&');
    const seqMatch = rawHref.match(/seq=(\d+)/);
    const seq = seqMatch ? seqMatch[1] : null;
    if (!seq) continue;

    const title = cleanText(linkMatch[2]).trim();
    if (!title || (!title.includes('건강기능식품') && !title.includes('심의') && !title.includes('회의') && !title.includes('위원'))) {
      continue;
    }

    const fullHref = rawHref.startsWith('http') ? rawHref : `${BASE_URL}/brd/m_532/${rawHref.replace(/^\.\//, '')}`;

    // 게시물 번호 (예: 359)
    const numMatch = block.match(/<div class=["']num["']>([\s\S]*?)<\/div>/i);
    const postNo = numMatch ? numMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // 담당부서 (예: 영양기능연구과)
    const deptMatch = block.match(/담당부서\s*\|\s*([가-힣]+과|[가-힣]+팀|[가-힣]+부)/i) ||
                      block.match(/담당부서[\s\S]*?\|\s*([가-힣]+과|[가-힣]+팀)/i);
    const department = deptMatch ? deptMatch[1].trim() : '영양기능연구과';

    // 조회수 (예: 2126)
    const viewMatch = block.match(/조회수\s*\|\s*(\d+)/i);
    const viewCount = viewMatch ? parseInt(viewMatch[1], 10) : null;

    // 등록일 (예: 2026-07-07)
    const dateMatch = block.match(/<div class=["']date_column["']>([\s\S]*?)<\/div>/i) ||
                      block.match(/(\d{4}-\d{2}-\d{2})/);
    const postDate = dateMatch ? dateMatch[1].replace(/<[^>]+>/g, '').trim() : null;

    // 첨부파일 (PDF & HWP)
    const listPageBase = `${BASE_URL_SYNC}/brd/m_532/`;
    const attachments = extractAttachmentsFromHtml(block, listPageBase);

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
      rawContent: rawText ? rawText.substring(0, 8000) : null,
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
  try {
    const body = await req.json().catch(() => ({}));
    await ensureCommitteeSyncHistoryTables(prisma);

    const pages = Math.min(parseInt(body.pages || '3'), 10);
    const mode = body.mode || 'full';

    const BASE_URL = 'https://www.mfds.go.kr';
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    const syncRun = await prisma.committee_sync_runs.create({
      data: { mode, pagesRequested: pages, status: 'RUNNING' },
    });

    let pagesFetched = 0;
    let scannedCount = 0;
    let addedMeetings = 0;
    let addedAgendas = 0;
    let updatedMeetings = 0;
    let unchangedMeetings = 0;

    try {
      for (let page = 1; page <= pages; page++) {
        const articles = await fetchArticlesFromPage(page, headers, BASE_URL);
        if (articles.length === 0) break;
        pagesFetched++;

        for (const art of articles) {
          scannedCount++;
          const existing = await prisma.committee_meetings.findUnique({
            where: { seq: art.seq },
            include: { agendas: { select: { id: true }, take: 1 } },
          });

          if (!existing) {
            try {
              const detail = await fetchDetailForArticle(art, headers);
              const { meeting, addedAgendas: agendaCount } = await createMeetingWithAgendas(art, detail);
              addedMeetings++;
              addedAgendas += agendaCount;

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

          const beforeData = pickComparableMeetingFields(existing);
          const afterCandidate = pickComparableMeetingFields({
            ...art,
            sourceUrl: art.href,
            meetingNo: existing.meetingNo || getMeetingNo(art.title),
          });
          const changes = diffObjects(beforeData, afterCandidate);
          const changedFields = Object.keys(changes);
          const needsAgendaBackfill = existing.agendas.length === 0 && existing.rawContent;

          if (changedFields.length === 0 && !needsAgendaBackfill) {
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

          // 만약 PDF 파일 링크가 새로 생겼거나 변경되었고 pdfContent가 없다면 텍스트 추출 시도
          if (updateData.pdfFileUrl && !existing.pdfContent) {
            const pdfText = await extractPdfTextFromUrl(updateData.pdfFileUrl, art.href);
            if (pdfText) updateData.pdfContent = pdfText;
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.committee_meetings.update({
              where: { seq: art.seq },
              data: updateData,
            });
          }

          let backfilledAgendas = 0;
          if (needsAgendaBackfill) {
            const agendas = parseAgendas(existing.rawContent, art.title);
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
          updatedMeetings++;

          await prisma.committee_sync_changes.create({
            data: {
              runId: syncRun.id,
              meetingId: existing.id,
              seq: art.seq,
              changeType: changedFields.length > 0 ? 'UPDATE' : 'AGENDA_BACKFILL',
              title: art.title,
              changedFields: [
                ...changedFields,
                ...(backfilledAgendas > 0 ? ['agendas'] : []),
              ].join(','),
              beforeData: {
                meeting: beforeData,
                agendaCount: existing.agendas.length,
              },
              afterData: {
                meeting: { ...beforeData, ...updateData },
                agendaCount: existing.agendas.length + backfilledAgendas,
                changes,
              },
            },
          });
        }
      }

      const [totalMeetings, totalAgendas, embeddedAgendas] = await Promise.all([
        prisma.committee_meetings.count(),
        prisma.committee_agendas.count(),
        prisma.committee_agendas.count({ where: { NOT: { embedding: null } } }),
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
        message: `전체 비교 동기화 완료: ${scannedCount}건 확인 / 신규 ${addedMeetings}건 / 변경 ${updatedMeetings}건 / 동일 ${unchangedMeetings}건`,
        pagesFetched,
        scannedCount,
        addedMeetings,
        updatedMeetings,
        unchangedMeetings,
        addedAgendas,
        totalMeetings,
        totalAgendas,
        embeddedAgendas,
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
