declare module 'jschardet' {
  export interface DetectionResult {
    encoding: string | null
    confidence: number
  }

  const jschardet: {
    detect(input: string): DetectionResult
  }

  export default jschardet
}
