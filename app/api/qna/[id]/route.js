import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET: Q&A 상세 조회 (비밀글 권한 검증)
export async function GET(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 });

    const post = await prisma.qna_post.findUnique({ where: { id } });
    if (!post) return NextResponse.json({ success: false, error: '게시글을 찾을 수 없습니다.' }, { status: 404 });

    const user = getCurrentUser(req);
    const isAdmin = user && user.role === 'ADMIN';
    const isOwner = user && user.id === post.authorId;

    // 비밀글인 경우 권한 검사 (비회원 비밀번호 쿼리 확인)
    if (post.isSecret && !isAdmin && !isOwner) {
      const { searchParams } = new URL(req.url);
      const inputPw = searchParams.get('password');
      if (!inputPw || inputPw !== post.password) {
        return NextResponse.json({
          success: false,
          error: '비밀글입니다. 비밀번호를 입력하거나 작성자 계정으로 로그인해주세요.',
          isSecret: true
        }, { status: 403 });
      }
    }

    // 비밀번호 필드는 제외하고 반환
    const { password, ...safePost } = post;
    return NextResponse.json({
      success: true,
      data: safePost,
      canEdit: isOwner || isAdmin,
      canAnswer: isAdmin
    });
  } catch (error) {
    console.error('Q&A Detail GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH: 답변 등록/수정 (관리자) 또는 질문 수정 (작성자)
export async function PATCH(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 });

    const post = await prisma.qna_post.findUnique({ where: { id } });
    if (!post) return NextResponse.json({ success: false, error: '게시글을 찾을 수 없습니다.' }, { status: 404 });

    const user = getCurrentUser(req);
    const body = await req.json();
    const { mode, answer, title, content, category, isSecret, password } = body;

    const isAdmin = user && user.role === 'ADMIN';
    const isOwner = user && user.id === post.authorId;

    if (mode === 'answer') {
      // 답변 등록 (관리자 전용)
      if (!isAdmin) {
        return NextResponse.json({ success: false, error: '관리자만 답변을 등록할 수 있습니다.' }, { status: 403 });
      }

      const updated = await prisma.qna_post.update({
        where: { id },
        data: {
          answer: answer?.trim() || null,
          isAnswered: !!(answer && answer.trim().length > 0),
          answeredAt: answer && answer.trim().length > 0 ? new Date() : null,
          answeredBy: answer && answer.trim().length > 0 ? user.name : null
        }
      });

      await writeAuditLog(req, {
        action: 'QNA_ANSWER',
        page: `/qna/${id}`,
        details: `Q&A 답변 작성/수정 (#${id}: ${post.title})`
      });

      return NextResponse.json({ success: true, data: updated });
    } else {
      // 질문 수정
      if (!isAdmin && !isOwner) {
        if (!password || password !== post.password) {
          return NextResponse.json({ success: false, error: '수정 권한이 없습니다.' }, { status: 403 });
        }
      }

      const updated = await prisma.qna_post.update({
        where: { id },
        data: {
          title: title ? title.trim() : post.title,
          content: content ? content.trim() : post.content,
          category: category || post.category,
          isSecret: isSecret !== undefined ? !!isSecret : post.isSecret
        }
      });

      return NextResponse.json({ success: true, data: updated });
    }
  } catch (error) {
    console.error('Q&A PATCH Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 게시글 삭제
export async function DELETE(req, { params }) {
  try {
    const { id: rawId } = await params;
    const id = parseInt(rawId, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: '유효하지 않은 ID입니다.' }, { status: 400 });

    const post = await prisma.qna_post.findUnique({ where: { id } });
    if (!post) return NextResponse.json({ success: false, error: '게시글을 찾을 수 없습니다.' }, { status: 404 });

    const user = getCurrentUser(req);
    const isAdmin = user && user.role === 'ADMIN';
    const isOwner = user && user.id === post.authorId;

    if (!isAdmin && !isOwner) {
      const { searchParams } = new URL(req.url);
      const inputPw = searchParams.get('password');
      if (!inputPw || inputPw !== post.password) {
        return NextResponse.json({ success: false, error: '삭제 권한이 없습니다.' }, { status: 403 });
      }
    }

    await prisma.qna_post.delete({ where: { id } });

    if (user) {
      await writeAuditLog(req, {
        action: 'QNA_DELETE',
        page: `/qna`,
        details: `Q&A 게시글 삭제 (#${id}: ${post.title})`
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Q&A DELETE Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
