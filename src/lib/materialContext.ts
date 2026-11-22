import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']

/** Lightweight fallback so Phase 3 can be exercised before textbooks are uploaded. */
export const SAMPLE_CONTEXT = `SAMPLE PARAMEDIC STUDY NOTES (not an official textbook)

Airway and Ventilation
- Open the airway with head-tilt/chin-lift in non-trauma patients; use jaw-thrust when cervical spine injury is suspected.
- Oropharyngeal airways are for unconscious patients without a gag reflex; nasopharyngeal airways may be used with an intact gag reflex if no basilar skull fracture is suspected.
- Adequate ventilation is assessed by chest rise, oxygen saturation trends, and clinical response.
- Bag-valve-mask ventilation should be performed with a good seal and appropriate rate to avoid hyperventilation.
- Signs of severe respiratory distress include tripoding, accessory muscle use, inability to speak full sentences, and declining mental status.

Shock overview
- Shock is inadequate tissue perfusion. Compensated shock may present with tachycardia and normal blood pressure; decompensated shock includes hypotension and altered mentation.
- Hypovolemic shock is treated with hemorrhage control and fluid resuscitation per protocol.
- Distributive shock (including anaphylaxis and sepsis) requires recognition of mechanism and protocol-directed medications/fluids.

Cardiac basics
- High-quality CPR emphasizes adequate rate and depth with minimal interruptions.
- For witnessed monitored VF/pVT, defibrillation is indicated as soon as a defibrillator is available.
- Aspirin is commonly indicated in suspected ACS when not contraindicated; follow local protocol for nitrates and analgesia.
`

export function selectMaterialContext(
  materials: Material[],
  scope: string,
  maxChars = 20000,
): { context: string; usedSample: boolean; matchedCount: number } {
  const ready = materials.filter(
    (m) => m.extractStatus === 'ready' && (m.extractedText?.trim()?.length ?? 0) > 0,
  )

  if (ready.length === 0) {
    return {
      context: SAMPLE_CONTEXT,
      usedSample: true,
      matchedCount: 0,
    }
  }

  const terms = scope
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)

  const scored = ready
    .map((m) => {
      const text = m.extractedText ?? ''
      const lower = text.toLowerCase()
      const score =
        terms.length === 0
          ? text.length
          : terms.reduce((sum, term) => sum + (lower.includes(term) ? 10 : 0), 0) +
            Math.min(text.length / 1000, 5)
      return { material: m, score, text }
    })
    .sort((a, b) => b.score - a.score)

  const chunks: string[] = []
  let total = 0
  let matchedCount = 0
  for (const item of scored) {
    if (total >= maxChars) break
    const header = `Source: ${item.material.filename}\n`
    const remaining = maxChars - total - header.length
    if (remaining <= 0) break
    chunks.push(header + item.text.slice(0, remaining))
    total += header.length + Math.min(item.text.length, remaining)
    matchedCount += 1
  }

  return {
    context: chunks.join('\n\n---\n\n'),
    usedSample: false,
    matchedCount,
  }
}
