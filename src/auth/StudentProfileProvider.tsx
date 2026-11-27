import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/auth/AuthProvider'
import {
  displayName,
  loadStudentProfile,
  listStudyCheckIns,
  type StudentProfile,
  type StudyCheckIn,
  type TextScale,
} from '@/lib/studentProfile'

type StudentProfileContextValue = {
  profile: StudentProfile | null
  checkIns: StudyCheckIn[]
  preferredName: string
  textScale: TextScale
  isLoading: boolean
  refreshProfile: () => Promise<void>
}

const StudentProfileContext = createContext<StudentProfileContextValue | null>(
  null,
)

export function StudentProfileProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth()
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [checkIns, setCheckIns] = useState<StudyCheckIn[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refreshProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null)
      setCheckIns([])
      return
    }
    setIsLoading(true)
    try {
      const [nextProfile, nextCheckIns] = await Promise.all([
        loadStudentProfile(),
        listStudyCheckIns(20),
      ])
      setProfile(nextProfile)
      setCheckIns(nextCheckIns)
    } catch {
      // Keep last-known profile; Settings page surfaces errors on save/load
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile, user?.userId])

  const textScale: TextScale =
    profile?.textScale === 'large' || profile?.textScale === 'xl'
      ? profile.textScale
      : 'normal'

  const value = useMemo<StudentProfileContextValue>(
    () => ({
      profile,
      checkIns,
      preferredName: displayName(user, profile),
      textScale,
      isLoading,
      refreshProfile,
    }),
    [profile, checkIns, user, textScale, isLoading, refreshProfile],
  )

  return (
    <StudentProfileContext.Provider value={value}>
      {children}
    </StudentProfileContext.Provider>
  )
}

export function useStudentProfile() {
  const ctx = useContext(StudentProfileContext)
  if (!ctx) {
    throw new Error(
      'useStudentProfile must be used within StudentProfileProvider',
    )
  }
  return ctx
}
