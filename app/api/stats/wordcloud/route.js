import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isNutrient } from '@/lib/nutrients';

export async function GET() {
  try {
    // 최근 3개월 날짜 계산
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() - 3);
    const startDate = targetDate.toISOString().split('T')[0].replace(/-/g, '');

    const recentDocs = await prisma.declarations.findMany({
      where: {
        prmsDt: { gte: startDate }
      },
      orderBy: { prmsDt: 'desc' },
      select: { normalizedFunctionality: true, rawmtrlNm: true }
    });

    const counts = {};

    recentDocs.forEach(doc => {
      // 1. Process functionality 
      if (doc.normalizedFunctionality) {
          doc.normalizedFunctionality.split(',').forEach(term => {
             const clean = term.trim().replace(/^[-*]+|[-*]+$/g, '').replace(/\[.*\]|\(.*?\)/g,'');
             if (clean.length > 2 && !isNutrient(clean)) {
                 counts[clean] = (counts[clean] || 0) + 1;
             }
          });
      }
    });

    // Remove generics
    delete counts['도움을줄수있음'];
    delete counts['기능성'];
    delete counts['원료'];
    delete counts['의'];
    
    // Convert to entries and calculate normalized fontsize
    const validEntries = Object.entries(counts)
       .map(([text, value]) => ({ text, value: Math.floor(value) }))
       .filter(e => e.value > 1);

    validEntries.sort((a, b) => b.value - a.value);
    
    const top50 = validEntries.slice(0, 50);

    return NextResponse.json({ success: true, data: top50 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
