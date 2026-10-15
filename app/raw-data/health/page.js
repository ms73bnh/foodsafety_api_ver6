"use client";

import RawPageGuard from '@/components/raw/RawPageGuard';
import RawDbTable from '@/components/raw/RawDbTable';

export default function Page() {
  return (
    <RawPageGuard menuKey="raw-health">
      <RawDbTable kind="declarations" />
    </RawPageGuard>
  );
}
