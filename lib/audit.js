import prisma from './prisma';
import { getCurrentUser } from './auth';

/**
 * 시스템 내 사용자 활동을 audit_log 테이블에 기록합니다.
 * @param {Request} req Next.js API Request 객체
 * @param {object} param1 로그 세부 정보
 * @param {string} param1.action 수행한 행동 (예: LOGIN_SUCCESS, BANNER_ADD 등)
 * @param {string} param1.page 작업이 발생한 페이지 또는 API 경로 (예: '/login', '/api/sync')
 * @param {string|object} [param1.details] 상세 설명 또는 변경 사항 데이터
 * @param {string} [param1.overrideUsername] 강제 지정할 사용자 이름 (비로그인 상태나 회원가입 시 사용)
 * @param {string} [param1.overrideRole] 강제 지정할 사용자 역할
 */
export async function writeAuditLog(req, { action, page, details, overrideUsername, overrideRole }) {
  try {
    let username = 'GUEST';
    let role = 'GUEST';
    
    // 현재 세션 확인
    if (req) {
      const user = getCurrentUser(req);
      if (user) {
        username = user.username;
        role = user.role;
      }
    }
    
    // 강제 오버라이드가 있으면 우선 적용 (예: 로그인 직전, 가입 신청 시)
    if (overrideUsername) username = overrideUsername;
    if (overrideRole) role = overrideRole;
    
    // IP 추출
    let ipAddress = 'unknown';
    if (req && req.headers) {
      ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
      if (ipAddress.includes(',')) {
        ipAddress = ipAddress.split(',')[0].trim();
      }
    }
    
    // 상세 내역을 문자열로 변환
    let detailsString = '';
    if (details) {
      detailsString = typeof details === 'object' ? JSON.stringify(details) : String(details);
    }
    
    await prisma.audit_log.create({
      data: {
        username,
        role,
        page,
        action,
        details: detailsString,
        ipAddress
      }
    });
  } catch (error) {
    console.error('[AUDIT LOG ERROR] Failed to write audit log:', error);
  }
}
