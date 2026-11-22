import { Button } from '@/components/ui/button'

function App() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">
        Paramedic Study Buddy
      </h1>
      <p className="text-muted-foreground max-w-md text-center text-sm">
        Practice-test scaffold. Auth, materials, and generation land in later
        phases.
      </p>
      <Button type="button">Get started</Button>
    </main>
  )
}

export default App
