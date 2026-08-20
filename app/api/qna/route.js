import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET: Q&A 목록 조회 (페이징, 검색, 카테고리, 답변상태)
export async function GET(req) {
  try {
    const user = getCurrentUser(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const search = (searchParams.get('search') || '').trim();
    const category = (searchParams.get('category') || '').trim();
    const status = searchParams.get('status') || ''; // 'answered', 'pending', ''

    const where = {};

    if (category && category !== '전체') {
      where.category = category;
    }

    if (status === 'answered') {
      where.isAnswered = true;
    } else if (status === 'pending') {
      where.isAnswered = false;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { authorName: { contains: search, mode: 'insensitive' } },
        { authorCompany: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, posts] = await Promise.all([
      prisma.qna_post.count({ where }),
      prisma.qna_post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          category: true,
          authorName: true,
          authorCompany: true,
          authorId: true,
          isSecret: true,
          isAnswered: true,
          answeredAt: true,
          answeredBy: true,
          createdAt: true,
          updatedAt: true
        }
      })
    ]);

    // 비밀글 마스킹 처리: 관리자나 본인이 아니면 제목 마스킹
    const sanitizedPosts = posts.map(post => {
      const isOwner = user && user.id === post.authorId;
      const isAdmin = user && user.role === 'ADMIN';
      if (post.isSecret && !isOwner && !isAdmin) {
        return {
          ...post,
          title: '🔒 비밀글입니다.',
          isMasked: true
        };
      }
      return { ...post, isMasked: false };
    });

    return NextResponse.json({
      success: true,
      data: sanitizedPosts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Q&A GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 새 Q&A 등록
export async function POST(req) {
  try {
    const user = getCurrentUser(req);
    const body = await req.json();
    const { title, content, category, authorName, authorCompany, isSecret, password } = body;

    if (!title || !content) {
      return NextResponse.json({ success: false, error: '제목과 내용을 모두 입력해주세요.' }, { status: 400 });
    }

    const newPost = await prisma.qna_post.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        category: category || '일반문의',
        authorName: user?.name || authorName || '익명',
        authorCompany: user?.companyNm || authorCompany || null,
        authorId: user?.id || null,
        isSecret: !!isSecret,
        password: password || null,
        isAnswered: false
      }
    });

    if (user) {
      await writeAuditLog(req, {
        action: 'QNA_CREATE',
        page: '/qna',
        details: `Q&A 질문 등록 (#${newPost.id}: ${newPost.title})`
      });
    }

    return NextResponse.json({ success: true, data: newPost });
  } catch (error) {
    console.error('Q&A POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
