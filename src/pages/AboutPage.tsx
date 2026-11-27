import { Link } from 'react-router-dom'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Instant digital storefronts first — paperback/Amazon print require shipment. */
const DIGITAL_NOW = [
  {
    label: 'MedMaster eBook (publisher) — buy on site, read in My Bookshelf or MedMaster app',
    href: 'https://medmaster.net/products/clinical-pharmacology-made-ridiculously-simple',
    note: 'Instant · ~$27.95 · 24‑month access · offline on up to 2 devices · printing not allowed',
  },
  {
    label: 'VitalSource eTextbook — 1‑year or lifetime license',
    href: 'https://www.vitalsource.com/products/clinical-pharmacology-made-ridiculously-simple-james-olson-m-d-ph-d-v9781935660712',
    note: 'Instant fixed-layout · from ~$29.95 · Bookshelf browser/app',
  },
] as const

const PRINT_SLOWER = [
  {
    label: 'Amazon paperback (shipment required)',
    href: 'https://www.amazon.com/Clinical-Pharmacology-Made-Ridiculously-Simple/dp/1935660705',
  },
] as const

export function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">About</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Paramedic Study Buddy is a private study aid for enrolled classmates.
          It is not a substitute for official course materials, protocols, or
          certification exams.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Copyright commitment</CardTitle>
          <CardDescription>
            We use copyrighted material only in an approved manner and do not
            infringe authors’ or publishers’ rights.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-3 text-sm">
          <p>
            Study Buddy does{' '}
            <span className="text-foreground font-medium">not</span> host pirate
            copies, scrape paywalled textbooks, bypass eBook DRM, or redistribute
            commercial eBooks. Materials in the app come from:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Course / academy files students are authorized to use for private
              study (for example, Cycle 17 program materials).
            </li>
            <li>
              Titles each student has{' '}
              <span className="text-foreground font-medium">
                legitimately purchased or licensed
              </span>
              , used only within that license’s terms.
            </li>
            <li>
              Your preferred name and study check-ins (Settings) — owner-private
              in AWS; a short summary may go to xAI only for that Tutor reply.
            </li>
          </ul>
          <p>
            Generated practice questions and AI feedback are study aids only—not
            official NREMT, MedMaster, Ascend Learning, or academy exam content.
            Full policy:{' '}
            <a
              className="text-foreground underline underline-offset-2"
              href="https://github.com/Bigessfour/Paramedic_Study_Buddy/blob/main/COPYRIGHT.md"
              target="_blank"
              rel="noreferrer"
            >
              COPYRIGHT.md
            </a>{' '}
            in the project repo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Clinical Pharmacology Made Ridiculously Simple
          </CardTitle>
          <CardDescription>
            Edition 6 (Color) — James Olson, M.D., Ph.D. · MedMaster, Inc. ·
            eISBN 978-1-935660-71-2
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-foreground font-medium">
              Need it today (digital — no shipment)
            </p>
            <p className="text-muted-foreground">
              Buy a licensed eBook and read it immediately in the seller’s
              reader. Do not use unauthorized “free PDF” sites.
            </p>
            <ul className="space-y-3">
              {DIGITAL_NOW.map((item) => (
                <li key={item.href} className="space-y-0.5">
                  <a
                    className="text-foreground underline underline-offset-2"
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.label}
                  </a>
                  <p className="text-muted-foreground text-xs">{item.note}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-foreground font-medium">
              Paperback (wait for shipment)
            </p>
            <ul className="space-y-2">
              {PRINT_SLOWER.map((item) => (
                <li key={item.href}>
                  <a
                    className="text-foreground underline underline-offset-2"
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-border bg-muted/40 space-y-2 rounded-md border p-3">
            <p className="text-foreground font-medium">
              Embedding into Study Buddy RAG
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              A consumer eBook purchase is for reading in MedMaster / VitalSource
              / Kindle apps—not a dumpable PDF. MedMaster’s terms forbid
              systematic retrieval into a database without prior written
              permission, and their FAQ says eBooks cannot be printed. Study
              Buddy will not ingest Olson until MedMaster grants that permission
              (or another license that explicitly allows it). Until then: read
              the eBook in their app, and keep practice/RAG on academy materials
              you are already authorized to use.
            </p>
            <p className="text-muted-foreground text-xs">
              Permissions:{' '}
              <a
                className="text-foreground underline underline-offset-2"
                href="https://medmaster.net/pages/faq"
                target="_blank"
                rel="noreferrer"
              >
                MedMaster FAQ
              </a>
              {' · '}
              <a
                className="text-foreground underline underline-offset-2"
                href="https://medmaster.net/pages/terms-and-conditions"
                target="_blank"
                rel="noreferrer"
              >
                Terms
              </a>
              {' · '}
              contact MedMaster sales/support for written educational RAG
              authorization.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Software acknowledgments</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            Syncfusion Community License (charts/grids), AWS Amplify (auth,
            data, storage), and xAI (server-side study generation). See the
            project README for env and license notes.
          </p>
          <Link
            to="/dashboard"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
