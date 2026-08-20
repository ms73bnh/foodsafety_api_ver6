import Navbar from '@/components/Navbar';
import AlertSidebar from '@/components/AlertSidebar';
import NoticePopup from '@/components/NoticePopup';
import PendingApprovalBadge from '@/components/PendingApprovalBadge';
import FloatingClock from '@/components/FloatingClock';
import { ToastProvider } from '@/components/ToastProvider';
import './globals.css';

export const metadata = {
  title: '데이터 인사이트 | 건강기능식품 품목제조신고',
  description: '현대적인 UI를 갖춘 건강기능식품 데이터 인사이트 대시보드',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ToastProvider>
          <Navbar />
          {children}
          <AlertSidebar />
          <NoticePopup />
          <PendingApprovalBadge />
          <FloatingClock />
        </ToastProvider>
      </body>
    </html>
  );
}
