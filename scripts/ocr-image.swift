import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
  fputs("usage: ocr-image.swift <image-path>\n", stderr)
  exit(2)
}

let path = CommandLine.arguments[1]
guard let image = NSImage(contentsOfFile: path),
      let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let cgImage = rep.cgImage else {
  fputs("failed to load image\n", stderr)
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

let observations = request.results ?? []
let lines = observations.compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: "\n"))
