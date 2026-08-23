export const CHAPTER_HEADING_SOURCE = '^(第[一二三四五六七八九十百千零〇两0-9０-９]+[章节回卷部篇集][^\\n]*|(?:序章|楔子|引子|前言|序言|番外|后记|尾声|终章)(?:[ \\t：:].*)?|Chapter\\s+[0-9IVXLCDM]+[^\\n]*)$'

export function isChapterHeading(value: string) {
  return new RegExp(CHAPTER_HEADING_SOURCE, 'i').test(value)
}
