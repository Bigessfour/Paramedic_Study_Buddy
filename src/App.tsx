import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { AttemptDetailPage } from '@/pages/AttemptDetailPage'
import { ConfirmSignUpPage } from '@/pages/ConfirmSignUpPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { LoginPage } from '@/pages/LoginPage'
import { MaterialsPage } from '@/pages/MaterialsPage'
import { PracticeTestPage } from '@/pages/PracticeTestPage'
import { SignUpPage } from '@/pages/SignUpPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/confirm" element={<ConfirmSignUpPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/practice" element={<PracticeTestPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:attemptId" element={<AttemptDetailPage />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
