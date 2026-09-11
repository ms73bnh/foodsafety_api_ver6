'use client';
import { useEffect, useState } from 'react';

export default function CommitteePdfPreview({ id, title }) {
  const [state, setState] = useState({ id, url: '', error: '' });
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    async function load() {
      try {
        const response = await fetch(`/api/committee/pdf/${id}`, { signal: controller.signal });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || 'PDF를 불러오지 못했습니다.');
        }
        if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('서버에서 PDF 형식의 파일을 반환하지 않았습니다.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ id, url: objectUrl, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ id, url: '', error: error.message });
      }
    }
    load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (state.id !== id || (!state.url && !state.error)) return <p role="status" style={{ padding: 24 }}>PDF 원본을 확인하고 있습니다…</p>;
  if (state.error) return <p role="alert" style={{ padding: 24, color: '#b91c1c' }}>{state.error}</p>;
  return <iframe src={state.url} title={title} style={{ flex: 1, border: 'none', width: '100%' }} />;
}
