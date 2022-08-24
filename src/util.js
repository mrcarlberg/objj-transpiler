export function wordsRegexp (words) {
  return new RegExp('^(?:' + words.replace(/ /g, '|') + ')$')
}
