import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  confirmSignUp as amplifyConfirmSignUp,
  fetchUserAttributes,
  getCurrentUser,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  signUp as amplifySignUp,
} from 'aws-amplify/auth'
import { Hub } from 'aws-amplify/utils'

export type AuthUser = {
  /** Cognito sub — primary multi-tenant isolation key */
  userId: string
  username: string
  email?: string
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  signUp: (email: string, password: string) => Promise<void>
  confirmSignUp: (email: string, code: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function loadUser(): Promise<AuthUser | null> {
  try {
    const current = await getCurrentUser()
    const attributes = await fetchUserAttributes()
    return {
      userId: current.userId,
      username: current.username,
      email: attributes.email,
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const next = await loadUser()
    setUser(next)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      const next = await loadUser()
      if (active) {
        setUser(next)
        setIsLoading(false)
      }
    })()

    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signedIn':
        case 'signInWithRedirect':
          void refreshUser()
          break
        case 'signedOut':
          setUser(null)
          break
        default:
          break
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [refreshUser])

  const signUp = useCallback(async (email: string, password: string) => {
    await amplifySignUp({
      username: email,
      password,
      options: {
        userAttributes: { email },
      },
    })
  }, [])

  const confirmSignUp = useCallback(async (email: string, code: string) => {
    await amplifyConfirmSignUp({
      username: email,
      confirmationCode: code,
    })
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await amplifySignIn({
        username: email,
        password,
      })
      if (result.nextStep.signInStep !== 'DONE') {
        throw new Error(
          `Additional sign-in step required: ${result.nextStep.signInStep}`,
        )
      }
      await refreshUser()
    },
    [refreshUser],
  )

  const signOut = useCallback(async () => {
    await amplifySignOut()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      signUp,
      confirmSignUp,
      signIn,
      signOut,
      refreshUser,
    }),
    [user, isLoading, signUp, confirmSignUp, signIn, signOut, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
