import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchAuthSession } from 'aws-amplify/auth'
import { remove, uploadData } from 'aws-amplify/storage'
import { FileUp, Loader2, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { dataClient } from '@/lib/amplifyData'
import { extractTextFromFile, isSupportedMaterial } from '@/lib/extractText'
import { listAllMaterials, listClassMaterials } from '@/lib/listAll'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']
type ClassMaterial = Schema['ClassMaterial']['type']

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function MaterialsPage() {
  const [searchParams] = useSearchParams()
  const highlightFile = (searchParams.get('file') ?? '').trim().toLowerCase()
  const [materials, setMaterials] = useState<Material[]>([])
  const [classMaterials, setClassMaterials] = useState<ClassMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const sortedPersonal = useMemo(() => {
    const rows = [...materials]
    if (!highlightFile) return rows
    return rows.sort((a, b) => {
      const aHit = (a.filename ?? '').toLowerCase().includes(highlightFile) ? 0 : 1
      const bHit = (b.filename ?? '').toLowerCase().includes(highlightFile) ? 0 : 1
      return aHit - bHit
    })
  }, [materials, highlightFile])

  const sortedClass = useMemo(() => {
    const rows = [...classMaterials]
    if (!highlightFile) return rows
    return rows.sort((a, b) => {
      const aHit = (a.filename ?? '').toLowerCase().includes(highlightFile) ? 0 : 1
      const bHit = (b.filename ?? '').toLowerCase().includes(highlightFile) ? 0 : 1
      return aHit - bHit
    })
  }, [classMaterials, highlightFile])

  const loadMaterials = useCallback(async () => {
    setError(null)
    try {
      const [personal, shared] = await Promise.all([
        listAllMaterials(),
        listClassMaterials(),
      ])
      setMaterials(
        [...personal].sort((a, b) =>
          (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''),
        ),
      )
      setClassMaterials(
        [...shared].sort((a, b) =>
          (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''),
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load materials')
      setMaterials([])
      setClassMaterials([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadMaterials()
  }, [loadMaterials])

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setSuccess(null)
    setError(null)

    if (!isSupportedMaterial(file)) {
      setError('Only PDF and DOCX files are supported.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('File is too large (max 15 MB for v1).')
      return
    }

    setUploading(true)
    try {
      const session = await fetchAuthSession()
      const identityId = session.identityId
      if (!identityId) {
        throw new Error('Missing identity. Sign out and sign in again.')
      }

      const safeName = file.name.replace(/[^\w.\- ()]+/g, '_')
      const objectKey = `private/materials/${identityId}/${crypto.randomUUID()}-${safeName}`

      await uploadData({
        path: objectKey,
        data: file,
        options: {
          contentType: file.type || 'application/octet-stream',
        },
      }).result

      let extractedText: string | undefined
      let extractStatus: 'ready' | 'failed' = 'ready'
      let extractError: string | undefined
      try {
        extractedText = await extractTextFromFile(file)
        if (!extractedText.trim()) {
          extractStatus = 'failed'
          extractError = 'No extractable text found (scanned PDF?).'
          extractedText = undefined
        }
      } catch (extractErr) {
        extractStatus = 'failed'
        extractError =
          extractErr instanceof Error
            ? extractErr.message
            : 'Text extraction failed'
      }

      const { errors } = await dataClient.models.Material.create({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        s3Key: objectKey,
        extractedText,
        extractStatus,
        extractError,
        uploadedAt: new Date().toISOString(),
      })

      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join('; '))
      }

      setSuccess(
        extractStatus === 'ready'
          ? `Uploaded “${file.name}” and extracted text for study context.`
          : `Uploaded “${file.name}”, but text extraction failed. You can still keep the file.`,
      )
      await loadMaterials()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(material: Material) {
    setError(null)
    setSuccess(null)
    try {
      if (material.s3Key) {
        try {
          await remove({ path: material.s3Key })
        } catch {
          // File may already be gone; still remove metadata.
        }
      }
      if (material.id) {
        const { errors } = await dataClient.models.Material.delete({
          id: material.id,
        })
        if (errors?.length) {
          throw new Error(errors.map((e) => e.message).join('; '))
        }
      }
      setSuccess(`Removed “${material.filename}”.`)
      await loadMaterials()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Materials</h1>
        <p className="text-muted-foreground text-sm">
          Class textbook library is shared with signed-in classmates. Your own
          uploads stay private and also feed practice/tutor context.
        </p>
        {highlightFile ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Highlighting Tutor citation match for{' '}
            <span className="text-foreground font-medium">{highlightFile}</span>
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class library</CardTitle>
          <CardDescription>
            Shared course pack (readable by every signed-in classmate). Practice
            tests and Tutor use this automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : classMaterials.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No shared class materials yet. An admin runs{' '}
              <code className="text-xs">npm run upload:course</code> once to
              publish the textbook pack.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Text</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClass.map((material) => {
                  const hit =
                    highlightFile &&
                    (material.filename ?? '')
                      .toLowerCase()
                      .includes(highlightFile)
                  return (
                  <TableRow
                    key={material.id}
                    className={hit ? 'bg-muted/60' : undefined}
                  >
                    <TableCell className="max-w-[14rem] truncate font-medium">
                      {material.filename}
                      {hit ? (
                        <Badge className="ml-2" variant="secondary">
                          Cited
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatBytes(material.sizeBytes ?? 0)}</TableCell>
                    <TableCell>{formatDate(material.uploadedAt)}</TableCell>
                    <TableCell>
                      {material.extractStatus === 'ready' ? (
                        <Badge variant="secondary">Ready</Badge>
                      ) : material.extractStatus === 'failed' ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload</CardTitle>
          <CardDescription>
            PDF or DOCX, up to 15 MB. Text is extracted in the browser (no OCR).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="border-border hover:bg-muted/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
            {uploading ? (
              <Loader2 className="text-muted-foreground size-8 animate-spin" />
            ) : (
              <FileUp className="text-muted-foreground size-8" />
            )}
            <span className="text-sm font-medium">
              {uploading ? 'Uploading…' : 'Choose a PDF or DOCX'}
            </span>
            <span className="text-muted-foreground text-xs">
              Stored under your private S3 prefix
            </span>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                void onFileChange(e)
              }}
            />
          </label>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your materials</CardTitle>
          <CardDescription>
            Only you can see these. Isolation uses Cognito ownership + private
            S3 prefixes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No materials yet. Upload a syllabus or chapter PDF to get
              started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPersonal.map((material) => {
                  const hit =
                    highlightFile &&
                    (material.filename ?? '')
                      .toLowerCase()
                      .includes(highlightFile)
                  return (
                  <TableRow
                    key={material.id}
                    className={hit ? 'bg-muted/60' : undefined}
                  >
                    <TableCell className="max-w-[14rem] truncate font-medium">
                      {material.filename}
                      {hit ? (
                        <Badge className="ml-2" variant="secondary">
                          Cited
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatBytes(material.sizeBytes ?? 0)}</TableCell>
                    <TableCell>{formatDate(material.uploadedAt)}</TableCell>
                    <TableCell>
                      {material.extractStatus === 'ready' ? (
                        <Badge variant="secondary">Ready</Badge>
                      ) : material.extractStatus === 'failed' ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${material.filename}`}
                        onClick={() => {
                          void onDelete(material)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
