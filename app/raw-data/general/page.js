"use client";

import RawPageGuard from '@/components/raw/RawPageGuard';
import RawGeneralTable from '@/components/raw/RawGeneralTable';

export default function Page() {
  return (
    <RawPageGuard menuKey="raw-general">
      <RawGeneralTable />
    </RawPageGuard>
  );
}
