import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAuth } from '@/auth/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { ConfirmSignUpPage } from '@/pages/ConfirmSignUpPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
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
              <Route
                path="/materials"
                element={
                  <PlaceholderPage
                    title="Materials"
                    description="Upload course PDFs and DOCX files (Phase 2)."
                  />
                }
              />
              <Route
                path="/practice"
                element={
                  <PlaceholderPage
                    title="Practice Test"
                    description="Generate and take AI practice tests (Phase 3)."
                  />
                }
              />
              <Route
                path="/history"
                element={
                  <PlaceholderPage
                    title="History"
                    description="Review past attempts and scores (Phase 4)."
                  />
                }
              />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
