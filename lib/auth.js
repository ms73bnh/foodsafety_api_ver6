import crypto from 'crypto';
import prisma from './prisma';

const SECRET_KEY = process.env.JWT_SECRET || 'foodsafety-default-secret-key-super-secure';

/**
 * 비밀번호를 PBKDF2 알고리즘으로 단방향 해싱합니다.
 * @param {string} password 
 * @returns {string} salt:hash 형태의 문자열
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * 입력된 비밀번호가 해싱된 값과 일치하는지 검증합니다.
 * @param {string} password 
 * @param {string} storedPassword salt:hash 형태의 문자열
 * @returns {boolean} 일치 여부
 */
export function verifyPassword(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(':')) return false;
  const [salt, originalHash] = storedPassword.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

/**
 * 사용자 정보 페이로드를 담은 커스텀 JWT 토큰을 서명하여 발행합니다.
 * @param {object} payload 
 * @returns {string} jwt 토큰
 */
export function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  // 토큰 만료 시간: 24시간
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${header}.${body}`)
    .digest('base64url');
    
  return `${header}.${body}.${signature}`;
}

/**
 * 커스텀 JWT 토큰의 서명 및 만료 시간을 검증합니다.
 * @param {string} token 
 * @returns {object|null} 검증 성공 시 페이로드, 실패 시 null
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(`${header}.${body}`)
      .digest('base64url');
      
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    
    // 만료일 검사
    if (payload.exp && payload.exp < Date.now()) {
      return null; // 만료됨
    }
    
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Next.js Request 객체에서 세션 쿠키를 확인하여 사용자 정보를 가져옵니다.
 * @param {Request} req 
 * @returns {object|null} 사용자 정보 페이로드
 */
export function getCurrentUser(req) {
  try {
    // Request의 Cookie 헤더 추출
    const cookieHeader = req.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const parts = c.trim().split('=');
        return [parts[0], decodeURIComponent(parts[1] || '')];
      })
    );
    
    const token = cookies['auth_session'];
    return verifyToken(token);
  } catch (error) {
    return null;
  }
}

/**
 * 요청자가 관리자(ADMIN) 권한인지 체크합니다.
 * @param {Request} req 
 * @returns {boolean} 관리자 여부
 */
export function isAdmin(req) {
  const user = getCurrentUser(req);
  return user && user.role === 'ADMIN';
}

/**
 * 요청자가 영업(SALES) 이상 권한인지 체크합니다. (ADMIN 포함)
 * SALES: USER 권한 + 일반식품 검색 권한
 * @param {Request} req 
 * @returns {boolean} SALES 또는 ADMIN 여부
 */
export function isSalesOrAbove(req) {
  const user = getCurrentUser(req);
  return user && (user.role === 'ADMIN' || user.role === 'SALES');
}
