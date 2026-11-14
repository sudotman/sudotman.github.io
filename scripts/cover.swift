import AppKit
// Renders the site's square art: the covers the OS shows while the site plays sound, and the
// favicon. Run from the repository root (macOS; it uses the system Arial):
//   swift scripts/cover.swift
//
// page: the top of the front door in a square. The name, set as the page sets it (Arial at
//       its heaviest, tracked -0.09em, leading 0.68), on paper, with the yellow stripe.
//       It is the cover for [sound], and the favicon.
// reel: the reel's sign-off. The stripe has grown to fill the frame and the name sits on it.

let yellow = NSColor(srgbRed: 1, green: 0xef / 255.0, blue: 0, alpha: 1)   // palette.yellow in content/reel.json

func attr(_ s: String, _ size: CGFloat) -> NSAttributedString {
  NSAttributedString(string: s, attributes: [.font: NSFont(name: "Arial-BoldMT", size: size)!, .foregroundColor: NSColor.black, .kern: -0.09 * size])
}

func render(_ variant: String, _ n: Int, to path: String) {
  let N = CGFloat(n)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: n, pixelsHigh: n, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let left = N * 0.045
  let right: CGFloat
  if variant == "reel" {
    yellow.setFill(); NSRect(x: 0, y: 0, width: N, height: N).fill()
    right = N - left
  } else {
    NSColor.white.setFill(); NSRect(x: 0, y: 0, width: N, height: N).fill()
    let stripeX = N * 0.9
    yellow.setFill(); NSRect(x: stripeX, y: 0, width: N * 0.045, height: N).fill()
    right = stripeX - N * 0.035
  }
  // the longer word fills the room; the pair sits in the middle, cap to descender
  let size = 100 * (right - left) / attr("kashyap", 100).size().width
  let lead = 0.68 * size
  let top = (N + lead) / 2 + size * 0.2 + N * 0.02
  attr("satyam", size).draw(at: NSPoint(x: left, y: top - size * 0.75))
  attr("kashyap", size).draw(at: NSPoint(x: left, y: top - size * 0.75 - lead))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

for n in [96, 256, 512] {
  render("page", n, to: "images/cover/satyam-\(n).png")
  render("reel", n, to: "images/cover/reel-\(n).png")
}
render("page", 32, to: "images/cover/favicon-32.png")
render("page", 180, to: "images/cover/apple-touch-icon.png")
