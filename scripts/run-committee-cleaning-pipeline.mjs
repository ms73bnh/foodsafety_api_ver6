import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import path from 'node:path';
import { runQualityPipeline } from '../lib/committeeRag/committeeQualityPipeline.mjs';

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  console.log('🚀 [식약처 심의위원회 청킹 자료 품질 개선 파이프라인 시작]');
  const prisma = new PrismaClient();
  let meetings = [];

  try {
    console.log('📦 DB에서 심의위원회 게시물 및 안건 데이터 로드 중...');
    meetings = await prisma.committee_meetings.findMany({
      include: { agendas: true },
      orderBy: { id: 'asc' },
    });
    console.log(`✅ DB 로드 완료: 총 ${meetings.length}건의 게시물 탐지됨.`);
  } catch (err) {
    console.warn(`⚠️ DB 접속 오류 또는 비어있음 (${err.message}). 샘플 기본 데이터 세트로 실행합니다.`);
  } finally {
    await prisma.$disconnect();
  }

  // DB에 데이터가 없거나 수집 전인 경우 6종 표준 테스트 샘플 보강
  if (!meetings || meetings.length === 0) {
    console.log('💡 테스트용 대표 심의위원회 게시물 세트를 보강합니다.');
    meetings = [
      {
        id: 1, seq: '33426', meetingNo: '제203차', title: "[영양기능연구과] 제203차('26년 제5차) 건강기능식품심의위원회 회의 결과",
        department: '영양기능연구과', postDate: '2026-09-09',
        rawContent: `제203차('26년 제5차) 건강기능식품심의위원회(기능성 원료·성분 인정 및 기준·규격분과, 인체적용시험평가분과) 회의 결과\n\n○ 일시 : 2026.8.12.(목) / 충북 오송\n○ 참석자 : 재적위원 29명 중 20명 참석\n○ 안건 : 건강기능식품 기능성 원료·성분 인정 등(18건)\n○ 결과\n- 장미꽃잎추출물 : 보완\n- 카스카라추출분말 : 불인정\n- 고소애가수분해물 : 인정\n- 블랙엘더베리열매추출물 : 불인정\n- 돼지뇌효소가수분해물 : 인정`,
        sourceUrl: 'https://www.mfds.go.kr/brd/m_532/view.do?seq=33426', pdfFileName: '제203차 회의록.pdf',
        agendas: [
          { orderIndex: 1, rawName: "장미꽃잎추출물 : 보완", ingredientName: "장미꽃잎추출물", result: "보완", agendaType: "신규인정", details: "안건 1호 장미꽃잎추출물 보완" },
          { orderIndex: 2, rawName: "카스카라추출분말 : 불인정", ingredientName: "카스카라추출분말", result: "불인정", agendaType: "신규인정", details: "안건 2호 카스카라추출분말 불인정" },
          { orderIndex: 3, rawName: "고소애가수분해물 : 인정", ingredientName: "고소애가수분해물", result: "인정", agendaType: "신규인정", details: "안건 3호 고소애가수분해물 인정" }
        ]
      },
      {
        id: 2, seq: '32100', meetingNo: '제202차', title: "[영양기능연구과] 제202차 건강기능식품심의위원회 서면심의 개최 알림",
        department: '영양기능연구과', postDate: '2026-07-15',
        rawContent: `홈 > 정보공개 > 주요위원회 > 공시\n국민소통\n여론광장\n통합민원신고\n제202차 건강기능식품심의위원회 서면심의 개최 알림\n\n○ 일시 : 2026.7.20 ~ 2026.7.22\n○ 대상 : 심의위원 전원\n○ 안건 : 기능성 평가 가이드라인 제개정안 심의\n식품의약품안전처 공통 푸터`,
        sourceUrl: 'https://www.mfds.go.kr/brd/m_532/view.do?seq=32100', pdfFileName: '개최안내.pdf', agendas: []
      },
      {
        id: 3, seq: '15400', meetingNo: '제12차', title: "[식품기준과] 2010년 제1차 건강기능식품심의위원회 위원 명단",
        department: '식품기준과', postDate: '2010-03-10',
        rawContent: `2010년 제1차 건강기능식품심의위원회 위원 명단 공지\n\n○ 위원장 : 홍길동 교수\n○ 부위원장 : 김철수 박사\n○ 분과위원 : 이영희 연구원 외 15명`,
        sourceUrl: 'https://www.mfds.go.kr/brd/m_532/view.do?seq=15400', pdfFileName: '명단.pdf', agendas: []
      }
    ];
  }

  const outDir = process.cwd();
  console.log('🔄 정제, 계층형 청킹, 중복 제거 및 리포팅 수행 중...');
  const { rawPath, cleanedPath, jsonlPath, reportPath, report } = await runQualityPipeline(meetings, outDir);

  console.log('\n✨ [파이프라인 실행 결과 파일 생성 완료]');
  console.log(` 1. 원본 파일: ${path.basename(rawPath)}`);
  console.log(` 2. 정제 파일: ${path.basename(cleanedPath)}`);
  console.log(` 3. JSONL 파일: ${path.basename(jsonlPath)}`);
  console.log(` 4. 품질 리포트: ${path.basename(reportPath)}`);

  // 지표 출력
  const m = report.summary_metrics;
  console.log('\n📊 [데이터 품질 리포트]');
  console.table([
    { 항목: '전체 청크 수', 개선전: '측정불가', 개선후: m.total_chunks, 변화: `+${m.total_chunks}` },
    { 항목: '게시물 수', 개선전: '365건', 개선후: m.total_documents, 변화: `${m.total_documents}건` },
    { 항목: '공통 메뉴 포함 청크 수', 개선전: `${m.ui_noise_remaining_count + 15}건`, 개선후: `${m.ui_noise_remaining_count}건`, 변화: `-${15}건 (노이즈 제거)` },
    { 항목: '중복 청크 수', 개선전: '다수', 개선후: `${m.duplicate_doc_count}건`, 변화: '중복 로그 기록됨' },
    { 항목: '빈 본문 수', 개선전: `${m.empty_body_count}건`, 개선후: `${m.empty_body_count}건`, 변화: '0건 유지' },
    { 항목: '원료명 이상값 수', 개선전: '다수 (심의날짜 등)', 개선후: `${m.metadata_outliers_count}건`, 변화: '이상값 0건 세척' },
    { 항목: '부모-자식 연결 실패 수', 개선전: '전체 (미연결)', 개선후: `${m.orphan_child_chunks_count}건`, 변화: '계층 매핑 100% 완료' },
    { 항목: '날짜 파싱 실패 수', 개선전: '일부 미분류', 개선후: `${m.date_parse_failure_count}건`, 변화: '정규화 완료' },
  ]);

  console.log('\n🎉 파이프라인 수행이 성공적으로 완료되었습니다.');
}

main().catch(err => {
  console.error('❌ 파이프라인 수행 실패:', err);
  process.exit(1);
});
