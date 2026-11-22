#!/usr/bin/env swift
import Foundation
import PDFKit
import Vision
import CoreGraphics

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: ocr-pdf.swift <pdf-path> [page,page,...|all] [scale]\n", stderr)
  exit(2)
}

let pdfPath = CommandLine.arguments[1]
let pagesArg = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "all"
let scale = CommandLine.arguments.count > 3
  ? (CGFloat(Double(CommandLine.arguments[3]) ?? 2.0))
  : 2.0

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
  fputs("failed to open pdf\n", stderr)
  exit(1)
}

let pageCount = doc.pageCount
var pageIndexes: [Int] = []
if pagesArg == "all" {
  pageIndexes = Array(0..<pageCount)
} else {
  for part in pagesArg.split(separator: ",") {
    if let n = Int(part), n >= 1, n <= pageCount {
      pageIndexes.append(n - 1)
    }
  }
}

func ocr(cgImage: CGImage) -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["en-US"]
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return ""
  }
  let observations = request.results ?? []
  return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

func renderPage(_ page: PDFPage, scale: CGFloat) -> CGImage? {
  let bounds = page.bounds(for: .mediaBox)
  let size = CGSize(
    width: max(1, (bounds.width * scale).rounded()),
    height: max(1, (bounds.height * scale).rounded())
  )
  // thumbnail() applies page rotation/orientation correctly
  let nsImage = page.thumbnail(of: size, for: .mediaBox)
  var rect = CGRect(origin: .zero, size: nsImage.size)
  return nsImage.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

var parts: [String] = []
for idx in pageIndexes {
  guard let page = doc.page(at: idx),
        let image = renderPage(page, scale: scale) else {
    parts.append("")
    continue
  }
  let text = ocr(cgImage: image)
  parts.append(text)
  fputs("OCR page \(idx + 1)/\(pageCount) chars=\(text.count)\n", stderr)
}

print(parts.joined(separator: "\n\n---PAGE---\n\n"))
