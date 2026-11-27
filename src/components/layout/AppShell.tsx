import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BookOpen,
  CalendarCheck,
  ChartColumn,
  ClipboardList,
  History,
  Info,
  LayoutDashboard,
  Layers,
  Lightbulb,
  LogOut,
  Mail,
  Menu,
  MessagesSquare,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useStudentProfile } from '@/auth/StudentProfileProvider'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { pushBreadcrumb } from '@/lib/feedbackTrail'
import { textScaleClass } from '@/lib/studentProfile'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/materials', label: 'Materials', icon: BookOpen },
  { to: '/practice', label: 'Practice Test', icon: ClipboardList },
  { to: '/review', label: 'Review today', icon: CalendarCheck },
  { to: '/progress', label: 'Progress', icon: ChartColumn },
  { to: '/tutor', label: 'AI Tutor', icon: MessagesSquare },
  { to: '/flashcards', label: 'Flashcards', icon: Layers },
  { to: '/requests', label: 'Requests', icon: Lightbulb },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/contact', label: 'Contact', icon: Mail },
  { to: '/about', label: 'About', icon: Info },
] as const

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

export function AppShell() {
  const { user, signOut } = useAuth()
  const { preferredName, textScale } = useStudentProfile()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const initials = (preferredName?.[0] ?? user?.email?.[0] ?? 'U').toUpperCase()

  useEffect(() => {
    const match = [...navItems]
      .reverse()
      .find(
        ({ to }) =>
          location.pathname === to || location.pathname.startsWith(`${to}/`),
      )
    pushBreadcrumb(
      match ? `Opened ${match.label}` : `Opened ${location.pathname}`,
    )
  }, [location.pathname])

  return (
    <div className="bg-background flex min-h-svh">
      <aside className="border-border hidden w-56 shrink-0 border-r md:flex md:flex-col">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold tracking-tight">
            Paramedic Study Buddy
          </p>
          <p className="text-muted-foreground text-xs">Practice & progress</p>
        </div>
        <Separator />
        <div className="flex-1 p-3">
          <NavItems />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-14 items-center justify-between gap-3 border-b px-4">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                className="border-border inline-flex size-8 items-center justify-center rounded-md border"
                aria-label="Open navigation"
              >
                <Menu className="size-4" />
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="px-4 py-4 text-left">
                  <SheetTitle>Paramedic Study Buddy</SheetTitle>
                </SheetHeader>
                <Separator />
                <div className="p-3">
                  <NavItems onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium">Menu</span>
          </div>

          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger className="hover:bg-muted inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <Avatar className="size-7">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[12rem] truncate sm:inline">
                  {preferredName}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{preferredName}</span>
                    <span className="text-muted-foreground text-xs truncate">
                      {user?.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    navigate('/settings')
                  }}
                >
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate('/contact')
                  }}
                >
                  <Mail className="size-4" />
                  Contact
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void signOut()
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main
          className={cn(
            'flex-1 overflow-auto p-4 md:p-6',
            textScaleClass(textScale),
          )}
        >
          <Outlet />
        </main>
        <footer className="border-border text-muted-foreground border-t px-4 py-3 text-xs">
          Study aid only — not a substitute for official course materials,
          protocols, or certification exams.{' '}
          <NavLink
            to="/about"
            className="text-foreground underline underline-offset-2"
          >
            About & copyright
          </NavLink>
        </footer>
      </div>
    </div>
  )
}
